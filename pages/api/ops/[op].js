import { handler, fail, audit, nextNumber, requireModule, n, r2 } from '../../../lib/api';
import { tx, q, one } from '../../../lib/db';
import { stockIn, stockOut, reverseMovements, cashTx, itemStock, today } from '../../../lib/stock';

async function payDoc(t, user, doc, b) {
  const amount = r2(b.amount);
  if (amount <= 0) fail('Montant invalide');
  const rest = r2(n(doc.total) - n(doc.paid));
  if (amount > rest + 0.01) fail(`Montant supérieur au reste à payer (${rest})`);
  await t.q(
    `INSERT INTO payments (company_id,direction,party_type,party_id,doc_type,doc_id,account_id,amount,date,method,reference,user_id)
     VALUES ($1,'in','customer',$2,'sales_docs',$3,$4,$5,$6,$7,$8,$9)`,
    [user.cid, doc.customer_id, doc.id, b.account_id, amount, b.date || today(), b.method || null, b.reference || null, user.uid]
  );
  await cashTx(t, user, { account_id: b.account_id, amount, category: 'Vente', label: `Encaissement ${doc.number}`, ref_type: 'sales_docs', ref_id: doc.id, date: b.date });
  const paid = r2(n(doc.paid) + amount);
  await t.q('UPDATE sales_docs SET paid=$1, status=$2 WHERE id=$3', [paid, paid >= n(doc.total) - 0.01 ? 'paye' : 'partiel', doc.id]);
}

async function validateSale(t, user, doc) {
  if (doc.status !== 'brouillon') fail('Document déjà validé');
  const lines = await t.q('SELECT * FROM sales_lines WHERE doc_id=$1', [doc.id]);
  if (!lines.length) fail('Ajoutez au moins une ligne');
  let cost = 0;
  if (doc.type === 'facture') {
    for (const l of lines) {
      if (!l.item_id) continue;
      const out = await stockOut(t, user, { item_id: l.item_id, qty: l.qty, type: 'vente', ref_type: 'sales_docs', ref_id: doc.id, note: doc.number });
      const uc = n(l.qty) ? out.cost / n(l.qty) : 0;
      await t.q('UPDATE sales_lines SET unit_cost=$1 WHERE id=$2', [uc, l.id]);
      cost += out.cost;
    }
  }
  const status = doc.type === 'facture' ? (n(doc.total) <= 0 ? 'paye' : 'valide') : 'valide';
  await t.q('UPDATE sales_docs SET status=$1, cost=$2 WHERE id=$3', [status, r2(cost), doc.id]);
  return { ...doc, status, cost };
}

async function getDoc(t, user, id) {
  const d = await t.one('SELECT * FROM sales_docs WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.cid]);
  if (!d) fail('Document introuvable');
  return d;
}

// Calcule les besoins matières d'un ordre de fabrication
async function requirements(t, user, po, qtyOverride) {
  if (!po.recipe_id) return [];
  const rec = await t.one('SELECT * FROM recipes WHERE id=$1', [po.recipe_id]);
  const factor = n(qtyOverride ?? po.planned_qty) / (n(rec.yield_qty) || 1);
  const lines = await t.q('SELECT rl.*, i.name, i.unit, i.cost_price FROM recipe_lines rl JOIN items i ON i.id=rl.item_id WHERE rl.recipe_id=$1', [po.recipe_id]);
  const out = [];
  for (const l of lines) {
    const need = n(l.qty) * factor;
    const avail = await itemStock(t, l.item_id);
    out.push({ item_id: l.item_id, name: l.name, unit: l.unit, required: Math.round(need * 1000) / 1000, available: avail, missing: Math.max(0, Math.round((need - avail) * 1000) / 1000), est_cost: r2(need * n(l.cost_price)) });
  }
  return { lines: out, recipe: rec, factor };
}

const OPS = {
  // ---------- STOCK ----------
  stock_in: ['stock', async (t, user, b) => stockIn(t, user, { ...b, type: 'entree', ref_type: b.ref_type || 'manuel' })],
  stock_out: ['stock', async (t, user, b) => stockOut(t, user, { ...b, type: b.type || 'sortie', ref_type: 'manuel' })],
  inventory: ['stock', async (t, user, b) => {
    const lot = await t.one('SELECT * FROM lots WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.lot_id, user.cid]);
    if (!lot) fail('Lot introuvable');
    const diff = n(b.new_qty) - n(lot.qty);
    if (n(b.new_qty) < 0) fail('Quantité invalide');
    if (Math.abs(diff) < 1e-9) return { diff: 0 };
    await t.q('UPDATE lots SET qty=$1 WHERE id=$2', [n(b.new_qty), lot.id]);
    await t.q(`INSERT INTO stock_movements (company_id,item_id,lot_id,warehouse_id,type,qty,unit_cost,ref_type,note,user_id) VALUES ($1,$2,$3,$4,'inventaire',$5,$6,'inventaire',$7,$8)`,
      [user.cid, lot.item_id, lot.id, lot.warehouse_id, diff, lot.unit_cost, b.note || 'Ajustement d\'inventaire', user.uid]);
    return { diff };
  }],
  transfer: ['stock', async (t, user, b) => {
    const lot = await t.one('SELECT * FROM lots WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.lot_id, user.cid]);
    if (!lot) fail('Lot introuvable');
    const qty = n(b.qty || lot.qty);
    if (qty <= 0 || qty > n(lot.qty) + 1e-9) fail('Quantité invalide');
    if (Math.abs(qty - n(lot.qty)) < 1e-9) {
      await t.q('UPDATE lots SET warehouse_id=$1 WHERE id=$2', [b.warehouse_id, lot.id]);
    } else {
      await t.q('UPDATE lots SET qty=qty-$1 WHERE id=$2', [qty, lot.id]);
      const nl = await t.one(`INSERT INTO lots (company_id,item_id,warehouse_id,lot_number,qty,initial_qty,unit_cost,production_date,expiry_date,supplier_id,status,source_type,source_id)
        VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,'transfert',$11) RETURNING id`,
        [user.cid, lot.item_id, b.warehouse_id, lot.lot_number, qty, lot.unit_cost, lot.production_date, lot.expiry_date, lot.supplier_id, lot.status, lot.id]);
      await t.q(`INSERT INTO stock_movements (company_id,item_id,lot_id,warehouse_id,type,qty,unit_cost,ref_type,ref_id,user_id) VALUES ($1,$2,$3,$4,'transfert',$5,$6,'transfert',$7,$8),($1,$2,$7,$9,'transfert',$10,$6,'transfert',$3,$8)`,
        [user.cid, lot.item_id, lot.id, lot.warehouse_id, -qty, lot.unit_cost, nl.id, user.uid, b.warehouse_id, qty]);
    }
    return { ok: true };
  }],
  lot_status: [['stock', 'qualite'], async (t, user, b) => {
    const allowed = ['ok', 'quarantaine', 'bloque', 'perime'];
    if (!allowed.includes(b.status)) fail('Statut invalide');
    await t.q('UPDATE lots SET status=$1 WHERE id=$2 AND company_id=$3', [b.status, b.lot_id, user.cid]);
    return { ok: true };
  }],

  // ---------- ACHATS ----------
  po_status: ['achats', async (t, user, b) => {
    const po = await t.one('SELECT * FROM purchase_orders WHERE id=$1 AND company_id=$2', [b.id, user.cid]);
    if (!po) fail('Commande introuvable');
    if (b.status === 'annule' && n(po.paid) > 0) fail('Commande déjà payée en partie, annulation impossible');
    if (b.status === 'annule' && ['partiel', 'recu'].includes(po.status)) fail('Commande déjà réceptionnée');
    if (!['envoye', 'annule', 'brouillon'].includes(b.status)) fail('Statut invalide');
    await t.q('UPDATE purchase_orders SET status=$1 WHERE id=$2', [b.status, po.id]);
    return { ok: true };
  }],
  po_receive: [['achats', 'stock'], async (t, user, b) => {
    const po = await t.one('SELECT * FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.id, user.cid]);
    if (!po) fail('Commande introuvable');
    if (['annule', 'recu'].includes(po.status)) fail('Commande clôturée');
    let count = 0;
    for (const r of b.lines || []) {
      const qty = n(r.qty);
      if (qty <= 0) continue;
      const line = await t.one('SELECT * FROM purchase_lines WHERE id=$1 AND po_id=$2', [r.line_id, po.id]);
      if (!line) continue;
      const price = r.unit_price !== undefined && r.unit_price !== '' ? n(r.unit_price) : n(line.unit_price);
      await stockIn(t, user, { item_id: line.item_id, qty, unit_cost: price, lot_number: r.lot_number, expiry_date: r.expiry_date, warehouse_id: b.warehouse_id || r.warehouse_id, supplier_id: po.supplier_id, type: 'achat', ref_type: 'purchase_orders', ref_id: po.id, note: po.number, status: r.quarantine ? 'quarantaine' : 'ok' });
      await t.q('UPDATE purchase_lines SET received_qty=received_qty+$1, unit_price=$2 WHERE id=$3', [qty, price, line.id]);
      count++;
    }
    if (!count) fail('Aucune quantité reçue');
    const lines = await t.q('SELECT * FROM purchase_lines WHERE po_id=$1', [po.id]);
    const complete = lines.every((l) => n(l.received_qty) >= n(l.qty) - 1e-9);
    const total = r2(lines.reduce((s, l) => s + n(l.qty) * n(l.unit_price), 0));
    await t.q('UPDATE purchase_orders SET status=$1, total=$2 WHERE id=$3', [complete ? 'recu' : 'partiel', total, po.id]);
    return { ok: true };
  }],
  supplier_pay: [['achats', 'caisse'], async (t, user, b) => {
    const amount = r2(b.amount);
    if (amount <= 0) fail('Montant invalide');
    let po = null;
    if (b.po_id) {
      po = await t.one('SELECT * FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.po_id, user.cid]);
      if (!po) fail('Commande introuvable');
    }
    const supplierId = po ? po.supplier_id : b.supplier_id;
    if (!supplierId) fail('Fournisseur requis');
    const s = await t.one('SELECT name FROM suppliers WHERE id=$1 AND company_id=$2', [supplierId, user.cid]);
    await t.q(`INSERT INTO payments (company_id,direction,party_type,party_id,doc_type,doc_id,account_id,amount,date,method,reference,user_id)
      VALUES ($1,'out','supplier',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [user.cid, supplierId, po ? 'purchase_orders' : null, po ? po.id : null, b.account_id, amount, b.date || today(), b.method || null, b.reference || null, user.uid]);
    await cashTx(t, user, { account_id: b.account_id, amount: -amount, category: 'Achat fournisseur', label: `Paiement ${s?.name || ''} ${po ? po.number : ''}`.trim(), ref_type: 'purchase_orders', ref_id: po?.id, date: b.date });
    if (po) await t.q('UPDATE purchase_orders SET paid=paid+$1 WHERE id=$2', [amount, po.id]);
    return { ok: true };
  }],

  // ---------- PRODUCTION ----------
  prod_check: ['production', async (t, user, b) => {
    const po = await t.one('SELECT * FROM production_orders WHERE id=$1 AND company_id=$2', [b.id, user.cid]);
    if (!po) fail('Ordre introuvable');
    return requirements(t, user, po, b.qty);
  }],
  prod_start: ['production', async (t, user, b) => {
    const po = await t.one('SELECT * FROM production_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.id, user.cid]);
    if (!po || po.status !== 'planifie') fail('Seul un ordre planifié peut être démarré');
    await t.q("UPDATE production_orders SET status='en_cours', started_at=now() WHERE id=$1", [po.id]);
    return { ok: true };
  }],
  prod_cancel: ['production', async (t, user, b) => {
    const po = await t.one('SELECT * FROM production_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.id, user.cid]);
    if (!po || !['planifie', 'en_cours'].includes(po.status)) fail('Ordre non annulable');
    await t.q("UPDATE production_orders SET status='annule' WHERE id=$1", [po.id]);
    return { ok: true };
  }],
  prod_complete: ['production', async (t, user, b) => {
    const po = await t.one('SELECT * FROM production_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.id, user.cid]);
    if (!po || !['planifie', 'en_cours'].includes(po.status)) fail('Ordre déjà clôturé');
    const produced = n(b.produced_qty);
    const rejected = n(b.rejected_qty);
    if (produced <= 0) fail('Quantité produite invalide');
    // Consommations : saisies réelles ou théoriques selon la recette
    let consumptions = (b.consumptions || []).filter((c) => n(c.qty) > 0);
    let rec = null;
    if (po.recipe_id) rec = await t.one('SELECT * FROM recipes WHERE id=$1', [po.recipe_id]);
    if (!consumptions.length && rec) {
      const req = await requirements(t, user, po, produced + rejected);
      consumptions = req.lines.map((l) => ({ item_id: l.item_id, qty: l.required }));
    }
    let material = 0;
    for (const c of consumptions) {
      const out = await stockOut(t, user, { item_id: c.item_id, qty: c.qty, type: 'production', ref_type: 'production_orders', ref_id: po.id, note: po.number });
      for (const k of out.consumed) {
        await t.q('INSERT INTO production_consumptions (production_id,item_id,lot_id,qty,unit_cost) VALUES ($1,$2,$3,$4,$5)', [po.id, c.item_id, k.lot_id, k.qty, k.unit_cost]);
      }
      material += out.cost;
    }
    const factor = rec ? (produced + rejected) / (n(rec.yield_qty) || 1) : 1;
    const labor = b.labor_cost !== undefined && b.labor_cost !== '' ? n(b.labor_cost) : n(po.labor_cost) || (rec ? n(rec.labor_cost) * factor : 0);
    const overhead = b.overhead_cost !== undefined && b.overhead_cost !== '' ? n(b.overhead_cost) : n(po.overhead_cost) || (rec ? n(rec.overhead_cost) * factor : 0);
    const total = material + labor + overhead;
    const unit = total / produced;
    const lot = await stockIn(t, user, {
      item_id: po.product_id, qty: produced, unit_cost: unit, lot_number: b.lot_number || po.lot_number, expiry_date: b.expiry_date || po.expiry_date,
      production_date: today(), warehouse_id: b.warehouse_id, type: 'production', ref_type: 'production_orders', ref_id: po.id, note: po.number,
      status: b.quarantine ? 'quarantaine' : 'ok',
    });
    await t.q(`UPDATE production_orders SET status='termine', produced_qty=$1, rejected_qty=$2, finished_at=now(), started_at=COALESCE(started_at,now()),
      lot_id=$3, lot_number=$4, expiry_date=$5, material_cost=$6, labor_cost=$7, overhead_cost=$8, total_cost=$9, unit_cost=$10 WHERE id=$11`,
      [produced, rejected, lot.id, lot.lot_number, lot.expiry_date, r2(material), r2(labor), r2(overhead), r2(total), unit, po.id]);
    return { lot_number: lot.lot_number, unit_cost: unit, total_cost: total };
  }],

  // ---------- VENTES ----------
  sale_validate: ['ventes', async (t, user, b) => validateSale(t, user, await getDoc(t, user, b.id))],
  sale_pay: [['ventes', 'caisse'], async (t, user, b) => {
    const doc = await getDoc(t, user, b.id);
    if (doc.type !== 'facture' || !['valide', 'partiel'].includes(doc.status)) fail('Seule une facture validée peut être encaissée');
    await payDoc(t, user, doc, b);
    return { ok: true };
  }],
  sale_cancel: ['ventes', async (t, user, b) => {
    const doc = await getDoc(t, user, b.id);
    if (doc.status === 'annule') fail('Déjà annulé');
    if (n(doc.paid) > 0) fail('Document déjà encaissé : remboursez d\'abord les paiements');
    if (doc.type === 'facture' && doc.status !== 'brouillon') await reverseMovements(t, user, 'sales_docs', doc.id);
    await t.q("UPDATE sales_docs SET status='annule' WHERE id=$1", [doc.id]);
    return { ok: true };
  }],
  sale_reopen: ['ventes', async (t, user, b) => {
    const doc = await getDoc(t, user, b.id);
    if (doc.type === 'facture') fail('Une facture validée ne peut pas être rouverte : annulez-la');
    await t.q("UPDATE sales_docs SET status='brouillon' WHERE id=$1", [doc.id]);
    return { ok: true };
  }],
  sale_refund: [['ventes', 'caisse'], async (t, user, b) => {
    const doc = await getDoc(t, user, b.id);
    const pays = await t.q("SELECT * FROM payments WHERE doc_type='sales_docs' AND doc_id=$1 AND direction='in'", [doc.id]);
    for (const p of pays) {
      await cashTx(t, user, { account_id: p.account_id, amount: -n(p.amount), category: 'Remboursement client', label: `Remboursement ${doc.number}`, ref_type: 'sales_docs', ref_id: doc.id });
    }
    await t.q("DELETE FROM payments WHERE doc_type='sales_docs' AND doc_id=$1", [doc.id]);
    await t.q("UPDATE sales_docs SET paid=0, status=CASE WHEN status IN ('paye','partiel') THEN 'valide' ELSE status END WHERE id=$1", [doc.id]);
    return { ok: true };
  }],
  sale_convert: ['ventes', async (t, user, b) => {
    const doc = await getDoc(t, user, b.id);
    const to = b.to;
    if (!['commande', 'facture'].includes(to)) fail('Conversion invalide');
    if (doc.status === 'annule') fail('Document annulé');
    const number = await nextNumber(t, user.cid, to, to === 'facture' ? 'FAC' : 'CMD');
    const nd = await t.one(`INSERT INTO sales_docs (company_id,number,type,customer_id,date,due_date,status,subtotal,discount,tax,total,channel,parent_id,notes,user_id)
      VALUES ($1,$2,$3,$4,current_date,$5,'brouillon',$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [user.cid, number, to, doc.customer_id, doc.due_date, doc.subtotal, doc.discount, doc.tax, doc.total, doc.channel, doc.id, doc.notes, user.uid]);
    await t.q('INSERT INTO sales_lines (doc_id,item_id,description,qty,unit_price,discount,total) SELECT $1,item_id,description,qty,unit_price,discount,total FROM sales_lines WHERE doc_id=$2', [nd.id, doc.id]);
    await t.q("UPDATE sales_docs SET status='transforme' WHERE id=$1", [doc.id]);
    return nd;
  }],
  // Vente comptoir en une étape : facture + sortie stock + encaissement
  pos_sale: [['ventes', 'caisse'], async (t, user, b) => {
    const lines = (b.lines || []).filter((l) => l.item_id && n(l.qty) > 0);
    if (!lines.length) fail('Panier vide');
    let customer = b.customer_id;
    if (!customer) {
      const c = await t.one("SELECT id FROM customers WHERE company_id=$1 ORDER BY id LIMIT 1", [user.cid]);
      customer = c?.id || null;
    }
    const number = await nextNumber(t, user.cid, 'facture', 'FAC');
    const subtotal = r2(lines.reduce((s, l) => s + n(l.qty) * n(l.unit_price) - n(l.discount), 0));
    const total = r2(subtotal - n(b.discount));
    const doc = await t.one(`INSERT INTO sales_docs (company_id,number,type,customer_id,date,status,subtotal,discount,total,channel,user_id)
      VALUES ($1,$2,'facture',$3,current_date,'brouillon',$4,$5,$6,$7,$8) RETURNING *`,
      [user.cid, number, customer, subtotal, n(b.discount), total, b.channel || 'comptoir', user.uid]);
    for (const l of lines) {
      await t.q('INSERT INTO sales_lines (doc_id,item_id,qty,unit_price,discount,total) VALUES ($1,$2,$3,$4,$5,$6)',
        [doc.id, l.item_id, n(l.qty), n(l.unit_price), n(l.discount), r2(n(l.qty) * n(l.unit_price) - n(l.discount))]);
    }
    const v = await validateSale(t, user, doc);
    const paid = Math.min(r2(b.paid ?? total), total);
    if (paid > 0) await payDoc(t, user, { ...doc, status: v.status, paid: 0 }, { amount: paid, account_id: b.account_id, method: b.method });
    return { id: doc.id, number, total };
  }],

  // ---------- TRÉSORERIE ----------
  cash_move: ['caisse', async (t, user, b) => {
    const amt = r2(b.amount);
    if (!amt) fail('Montant invalide');
    return cashTx(t, user, { account_id: b.account_id, amount: b.direction === 'out' ? -Math.abs(amt) : Math.abs(amt), category: b.category || 'Divers', label: b.label, date: b.date, ref_type: 'manuel' });
  }],
  cash_transfer: ['caisse', async (t, user, b) => {
    const amt = Math.abs(r2(b.amount));
    if (!amt || !b.from || !b.to || b.from === b.to) fail('Transfert invalide');
    await cashTx(t, user, { account_id: b.from, amount: -amt, category: 'Transfert', label: b.label || 'Transfert sortant', date: b.date, ref_type: 'transfert' });
    await cashTx(t, user, { account_id: b.to, amount: amt, category: 'Transfert', label: b.label || 'Transfert entrant', date: b.date, ref_type: 'transfert' });
    return { ok: true };
  }],

  // ---------- RH ----------
  attendance_save: ['rh', async (t, user, b) => {
    for (const e of b.entries || []) {
      await t.q(`INSERT INTO attendance (company_id,employee_id,date,status,hours,note) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (employee_id,date) DO UPDATE SET status=EXCLUDED.status, hours=EXCLUDED.hours, note=EXCLUDED.note`,
        [user.cid, e.employee_id, b.date, e.status || 'present', e.hours === '' || e.hours == null ? null : n(e.hours), e.note || null]);
    }
    return { ok: true };
  }],
  payroll_generate: ['rh', async (t, user, b) => {
    if (!/^\d{4}-\d{2}$/.test(b.period || '')) fail('Période au format AAAA-MM');
    const emps = await t.q('SELECT * FROM employees WHERE company_id=$1 AND active', [user.cid]);
    let created = 0;
    for (const e of emps) {
      const ex = await t.one('SELECT id FROM payrolls WHERE employee_id=$1 AND period=$2', [e.id, b.period]);
      if (ex) continue;
      await t.q('INSERT INTO payrolls (company_id,employee_id,period,base,net) VALUES ($1,$2,$3,$4,$4)', [user.cid, e.id, b.period, n(e.base_salary)]);
      created++;
    }
    return { created };
  }],
  payroll_pay: [['rh', 'caisse'], async (t, user, b) => {
    const p = await t.one('SELECT p.*, e.name FROM payrolls p JOIN employees e ON e.id=p.employee_id WHERE p.id=$1 AND p.company_id=$2 FOR UPDATE', [b.id, user.cid]);
    if (!p || p.status === 'paye') fail('Bulletin introuvable ou déjà payé');
    await cashTx(t, user, { account_id: b.account_id, amount: -n(p.net), category: 'Salaires', label: `Salaire ${p.period} — ${p.name}`, ref_type: 'payrolls', ref_id: p.id, date: b.date });
    await t.q("UPDATE payrolls SET status='paye', account_id=$1, paid_at=$2 WHERE id=$3", [b.account_id, b.date || today(), p.id]);
    return { ok: true };
  }],

  // ---------- ADMIN ----------
  company_update: ['admin', async (t, user, b) => {
    const f = ['name', 'sector', 'currency', 'address', 'phone', 'email', 'ninea', 'rccm', 'tax_rate', 'invoice_footer'];
    const keys = f.filter((k) => k in b);
    if (!keys.length) return {};
    return t.one(`UPDATE companies SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [user.cid, ...keys.map((k) => (b[k] === '' ? null : b[k]))]);
  }],
};

export default handler(async (req, res, user) => {
  if (req.method !== 'POST') fail('Méthode non supportée', 405);
  const op = OPS[req.query.op];
  if (!op) fail('Opération inconnue', 404);
  const [mods, fn] = op;
  const list = Array.isArray(mods) ? mods : [mods];
  if (!list.some((m) => { try { requireModule(user, m); return true; } catch { return false; } })) fail('Accès refusé pour votre rôle', 403);
  const out = await tx((t) => fn(t, user, req.body || {}));
  await audit(user, req.query.op, 'operation', req.body?.id || req.body?.lot_id || req.body?.item_id, req.body);
  return out ?? { ok: true };
});
