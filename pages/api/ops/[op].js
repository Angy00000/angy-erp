import { handler, fail, audit, nextNumber, requireModule, n, r2 } from '../../../lib/api';
import { guardOp } from '../../../lib/guardian';
import { tx, q, one } from '../../../lib/db';
import { can } from '../../../lib/perms';
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
  if (!lines.some((l) => n(l.qty) > 0)) fail('Ajoutez au moins une ligne avec une quantité');
  let cost = 0;
  if (doc.type === 'facture') {
    for (const l of lines) {
      if (!l.item_id || n(l.qty) <= 0) continue;
      if (l.lot_id) {
        const lot = await t.one('SELECT lot_number, status FROM lots WHERE id=$1 AND item_id=$2', [l.lot_id, l.item_id]);
        if (!lot) fail('Le lot choisi ne correspond pas au produit');
        if (lot.status !== 'ok') fail(`Le lot ${lot.lot_number} est bloqué (${lot.status}) : il ne peut pas être vendu`);
      }
      const out = await stockOut(t, user, { item_id: l.item_id, lot_id: l.lot_id || undefined, qty: l.qty, type: 'vente', ref_type: 'sales_docs', ref_id: doc.id, note: doc.number });
      const uc = n(l.qty) ? out.cost / n(l.qty) : 0;
      // Traçabilité : on garde le lot vendu sur la ligne (quand un seul lot a servi)
      await t.q('UPDATE sales_lines SET unit_cost=$1, lot_id=COALESCE(lot_id,$3) WHERE id=$2', [uc, l.id, out.consumed.length === 1 ? out.consumed[0].lot_id : null]);
      cost += out.cost;
    }
  }
  const status = doc.type === 'facture' ? (n(doc.total) <= 0 ? 'paye' : 'valide') : 'valide';
  await t.q('UPDATE sales_docs SET status=$1, cost=$2 WHERE id=$3', [status, r2(cost), doc.id]);
  return { ...doc, status, cost };
}

// Sortie de produits confiés à un vendeur (dépôt) : utilisé le matin et pour ce que le vendeur garde le soir
async function consignOut(t, user, { customer, date, tier, notes, lines }) {
  if (!customer) fail('Choisissez le vendeur ou le revendeur');
  const cust = await t.one('SELECT id,name FROM customers WHERE id=$1 AND company_id=$2', [customer, user.cid]);
  if (!cust) fail('Vendeur introuvable');
  const agg = new Map();
  for (const l of lines || []) { const q = n(l.qty), id = Number(l.item_id); if (id && q > 0) agg.set(id, { qty: (agg.get(id)?.qty || 0) + q, price: n(l.unit_price) }); }
  if (!agg.size) fail('Ajoutez au moins un produit avec une quantité');
  const number = await nextNumber(t, user.cid, 'depot', 'DEP');
  const c = await t.one('INSERT INTO consignments (company_id,number,customer_id,date,tier,notes,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [user.cid, number, customer, date || today(), tier === 'gros' ? 'gros' : 'detail', notes || null, user.uid]);
  for (const [itemId, v] of agg) {
    const line = await t.one('INSERT INTO consignment_lines (consignment_id,item_id,qty_out,unit_price) VALUES ($1,$2,$3,$4) RETURNING id', [c.id, itemId, v.qty, v.price]);
    const out = await stockOut(t, user, { item_id: itemId, qty: v.qty, type: 'depot', ref_type: 'consignments', ref_id: c.id, note: `${number} — ${cust.name}` });
    for (const k of out.consumed) await t.q('INSERT INTO consignment_lots (consignment_id,line_id,item_id,lot_id,qty,unit_cost) VALUES ($1,$2,$3,$4,$5,$6)', [c.id, line.id, itemId, k.lot_id, k.qty, k.unit_cost]);
  }
  return { id: c.id, number };
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

// Coût moyen d'un article recalculé à partir de ses lots en stock
async function refreshItemCost(t, itemId) {
  await t.q(`UPDATE items SET cost_price = COALESCE((SELECT SUM(qty*unit_cost)/NULLIF(SUM(qty),0) FROM lots WHERE item_id=$1 AND qty>0), cost_price) WHERE id=$1`, [itemId]);
}
// Recalcule le coût d'une production terminée à partir de ce qu'elle a consommé (et la marge des ventes déjà faites)
async function recomputeProd(t, poId) {
  const po = await t.one('SELECT * FROM production_orders WHERE id=$1', [poId]);
  if (!po || po.status !== 'termine' || !(n(po.produced_qty) > 0)) return;
  const m = await t.one('SELECT COALESCE(SUM(qty*unit_cost),0) AS v FROM production_consumptions WHERE production_id=$1', [poId]);
  const total = n(m.v) + n(po.labor_cost) + n(po.expense_cost) + n(po.overhead_cost);
  const unit = total / n(po.produced_qty);
  await t.q('UPDATE production_orders SET material_cost=$1, total_cost=$2, unit_cost=$3 WHERE id=$4', [r2(m.v), r2(total), unit, poId]);
  if (po.lot_id) {
    await t.q('UPDATE lots SET unit_cost=$1 WHERE id=$2', [unit, po.lot_id]);
    await t.q('UPDATE stock_movements SET unit_cost=$1 WHERE lot_id=$2', [unit, po.lot_id]);
    const docs = await t.q('UPDATE sales_lines SET unit_cost=$1 WHERE lot_id=$2 RETURNING doc_id', [unit, po.lot_id]);
    for (const dId of [...new Set(docs.map((x) => x.doc_id))]) await t.q('UPDATE sales_docs SET cost=(SELECT COALESCE(SUM(qty*COALESCE(unit_cost,0)),0) FROM sales_lines WHERE doc_id=$1) WHERE id=$1', [dId]);
    await refreshItemCost(t, po.product_id);
  }
}
// Le prix d'un lot a été corrigé : ce qui en a déjà été utilisé en production est recompté au bon prix
async function repriceLot(t, lotId, unitCost) {
  await t.q('UPDATE stock_movements SET unit_cost=$1 WHERE lot_id=$2 AND qty<0', [unitCost, lotId]);
  const prods = await t.q('UPDATE production_consumptions SET unit_cost=$1 WHERE lot_id=$2 RETURNING production_id', [unitCost, lotId]);
  for (const id of [...new Set(prods.map((x) => x.production_id))]) await recomputeProd(t, id);
}

const num3 = (v) => String(Math.round(n(v) * 1000) / 1000).replace('.', ',');
// Retire une ligne d'achat du stock (seulement si rien n'a encore été utilisé)
async function removePurchaseLine(t, user, pur, o, used, keepLine) {
  if (used > 1e-9) fail(`${String(o.name).trim()} : ${num3(used)} déjà utilisé(s) en production ou vendu(s). Impossible de l'enlever de l'achat.`);
  if (o.lot_id) {
    await t.q('UPDATE lots SET qty=qty-$1 WHERE id=$2', [n(o.qty), o.lot_id]);
    await t.q(`INSERT INTO stock_movements (company_id,item_id,lot_id,type,qty,unit_cost,ref_type,ref_id,note,user_id) VALUES ($1,$2,$3,'annulation',$4,$5,'purchases',$6,$7,$8)`,
      [user.cid, o.item_id, o.lot_id, -n(o.qty), n(o.unit_cost), pur.id, `${pur.number} — retiré de l'achat`, user.uid]);
  }
  if (!keepLine) await t.q('DELETE FROM purchase_items WHERE id=$1', [o.id]);
}

const OPS = {
  // ---------- STOCK ----------
  // Entrée en stock (achat, don, retour…). Si « Payé via » est choisi, l'argent sort du compte.
  stock_in: ['stock', async (t, user, b) => {
    const lot = await stockIn(t, user, { ...b, type: 'entree', ref_type: b.ref_type || 'manuel' });
    const total = r2(n(b.qty) * n(b.unit_cost));
    if (b.account_id && total > 0) {
      const it = await t.one('SELECT name FROM items WHERE id=$1', [b.item_id]);
      await cashTx(t, user, { account_id: b.account_id, amount: -total, category: 'Achat matières', label: `Achat ${it?.name || ''} (${n(b.qty)})`, ref_type: 'lots', ref_id: lot.id, date: b.date });
    }
    return lot;
  }],
  // Nouvel achat (marché, boutique, grossiste…) : plusieurs articles d'un coup, entrés en stock et payés en une fois.
  // Avec b.id : modification d'un achat existant (quantités, prix, articles, caisse, date).
  market_purchase: [['stock', 'achats'], async (t, user, b) => {
    const lines = (b.lines || []).filter((l) => Number(l.item_id) && n(l.qty) > 0);
    if (!lines.length) fail('Ajoutez au moins un article avec une quantité');
    for (const l of lines) if (n(l.unit_cost) < 0) fail('Prix invalide');
    const date = b.date || today();
    const total = r2(lines.reduce((s, l) => s + n(l.qty) * n(l.unit_cost), 0));
    let pur;
    if (b.id) {
      pur = await t.one('SELECT * FROM purchases WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.id, user.cid]);
      if (!pur) fail('Achat introuvable');
      if (pur.status !== 'ok') fail('Cet achat est annulé');
      const old = await t.q('SELECT pl.*, i.name, l.qty AS lot_qty FROM purchase_items pl JOIN items i ON i.id=pl.item_id LEFT JOIN lots l ON l.id=pl.lot_id WHERE pl.purchase_id=$1 ORDER BY pl.id', [pur.id]);
      for (const o of old) {
        const nl = lines.find((l) => Number(l.id) === o.id && Number(l.item_id) === o.item_id);
        const used = o.lot_id ? Math.max(0, n(o.qty) - n(o.lot_qty)) : 0;
        if (nl) {
          nl._kept = true;
          if (n(nl.qty) + 1e-9 < used) fail(`${o.name.trim()} : ${num3(used)} déjà utilisé(s) en production ou vendu(s), la quantité ne peut pas être inférieure`);
          const delta = n(nl.qty) - n(o.qty);
          if (o.lot_id) {
            await t.q('UPDATE lots SET qty=qty+$1, initial_qty=$2, unit_cost=$3, supplier_id=$4, production_date=$5 WHERE id=$6', [delta, n(nl.qty), n(nl.unit_cost), b.supplier_id || null, date, o.lot_id]);
            await t.q("UPDATE stock_movements SET qty=$1, unit_cost=$2 WHERE lot_id=$3 AND ref_type='purchases' AND ref_id=$4 AND type IN ('achat','entree')", [n(nl.qty), n(nl.unit_cost), o.lot_id, pur.id]);
            if (Math.abs(n(nl.unit_cost) - n(o.unit_cost)) > 1e-6) await repriceLot(t, o.lot_id, n(nl.unit_cost));
          }
          await t.q('UPDATE purchase_items SET qty=$1, unit_cost=$2 WHERE id=$3', [n(nl.qty), n(nl.unit_cost), o.id]);
        } else {
          await removePurchaseLine(t, user, pur, o, used);
        }
      }
      await t.q("DELETE FROM cash_transactions WHERE company_id=$1 AND ref_type='purchases' AND ref_id=$2", [user.cid, pur.id]);
      pur = await t.one('UPDATE purchases SET date=$1, supplier_id=$2, account_id=$3, total=$4, note=$5, updated_at=now() WHERE id=$6 RETURNING *',
        [date, b.supplier_id || null, b.account_id || null, total, b.note || null, pur.id]);
    } else {
      const number = await nextNumber(t, user.cid, 'achat', 'ACH');
      pur = await t.one('INSERT INTO purchases (company_id,number,date,supplier_id,account_id,total,note,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [user.cid, number, date, b.supplier_id || null, b.account_id || null, total, b.note || null, user.uid]);
    }
    const names = [];
    for (const l of lines) {
      const it = await t.one('SELECT name FROM items WHERE id=$1 AND company_id=$2', [l.item_id, user.cid]);
      if (!it) fail('Article introuvable');
      names.push(String(it.name).trim());
      if (l._kept) continue;
      const lot = await stockIn(t, user, { item_id: Number(l.item_id), qty: n(l.qty), unit_cost: n(l.unit_cost), supplier_id: b.supplier_id || null, warehouse_id: b.warehouse_id, production_date: date, type: 'achat', ref_type: 'purchases', ref_id: pur.id, note: `${pur.number}${b.note ? ' — ' + b.note : ''}` });
      await t.q('INSERT INTO purchase_items (purchase_id,item_id,qty,unit_cost,lot_id) VALUES ($1,$2,$3,$4,$5)', [pur.id, Number(l.item_id), n(l.qty), n(l.unit_cost), lot.id]);
    }
    if (b.account_id && total > 0) {
      await cashTx(t, user, { account_id: b.account_id, amount: -total, category: 'Achat matières', label: `${pur.number} : ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}`, ref_type: 'purchases', ref_id: pur.id, date });
    }
    const touched = await t.q('SELECT DISTINCT item_id FROM purchase_items WHERE purchase_id=$1', [pur.id]);
    for (const x of touched) await refreshItemCost(t, x.item_id);
    return { id: pur.id, number: pur.number, total, count: lines.length, edited: !!b.id };
  }],
  purchase_cancel: [['stock', 'achats'], async (t, user, b) => {
    const pur = await t.one('SELECT * FROM purchases WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.id, user.cid]);
    if (!pur) fail('Achat introuvable');
    if (pur.status !== 'ok') fail('Déjà annulé');
    const old = await t.q('SELECT pl.*, i.name, l.qty AS lot_qty FROM purchase_items pl JOIN items i ON i.id=pl.item_id LEFT JOIN lots l ON l.id=pl.lot_id WHERE pl.purchase_id=$1', [pur.id]);
    for (const o of old) await removePurchaseLine(t, user, pur, o, o.lot_id ? Math.max(0, n(o.qty) - n(o.lot_qty)) : 0, true);
    await t.q("DELETE FROM cash_transactions WHERE company_id=$1 AND ref_type='purchases' AND ref_id=$2", [user.cid, pur.id]);
    await t.q("UPDATE purchases SET status='annule', updated_at=now() WHERE id=$1", [pur.id]);
    for (const o of old) await refreshItemCost(t, o.item_id);
    return { ok: true, number: pur.number };
  }],
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
    const expense = b.expense_cost !== undefined && b.expense_cost !== '' ? n(b.expense_cost) : n(po.expense_cost);
    const total = material + labor + overhead + expense;
    const unit = total / produced;
    const lot = await stockIn(t, user, {
      item_id: po.product_id, qty: produced, unit_cost: unit, lot_number: b.lot_number || po.lot_number, expiry_date: b.expiry_date || po.expiry_date,
      production_date: today(), warehouse_id: b.warehouse_id, type: 'production', ref_type: 'production_orders', ref_id: po.id, note: po.number,
      status: b.quarantine ? 'quarantaine' : 'ok',
    });
    await t.q(`UPDATE production_orders SET status='termine', produced_qty=$1, rejected_qty=$2, finished_at=now(), started_at=COALESCE(started_at,now()),
      lot_id=$3, lot_number=$4, expiry_date=$5, material_cost=$6, labor_cost=$7, overhead_cost=$8, total_cost=$9, unit_cost=$10, expense_cost=$12 WHERE id=$11`,
      [produced, rejected, lot.id, lot.lot_number, lot.expiry_date, r2(material), r2(labor), r2(overhead), r2(total), unit, po.id, r2(expense)]);
    if (b.account_id && expense > 0) await cashTx(t, user, { account_id: b.account_id, amount: -expense, category: 'Production', label: `Dépenses ${po.number}`, ref_type: 'production_orders', ref_id: po.id });
    return { lot_number: lot.lot_number, unit_cost: unit, total_cost: total };
  }],

  // Production rapide : un jus produit en un ou plusieurs formats (sachets, bouteilles…) + dépenses totales.
  // Les dépenses sont réparties entre les formats au prorata des litres ; un OF terminé et un lot par format.
  prod_simple: ['production', async (t, user, b) => {
    const raw = Array.isArray(b.lines) && b.lines.length ? b.lines : [{ product_id: b.product_id, volume_l: b.volume_l, qty: b.qty }];
    const lines = [];
    for (const l of raw) {
      if (!l.product_id) continue;
      const item = await t.one('SELECT * FROM items WHERE id=$1 AND company_id=$2', [l.product_id, user.cid]);
      if (!item) fail('Produit introuvable');
      const uv = n(item.unit_volume);
      let qty = n(l.qty);
      if (!qty && n(l.volume_l) && uv) qty = Math.round((n(l.volume_l) / uv) * 1000) / 1000;
      if (qty <= 0) continue;
      lines.push({ item, qty, liters: uv ? qty * uv : 0 });
    }
    if (!lines.length) fail('Indiquez au moins un produit avec le volume ou la quantité produite');
    const expense = n(b.expense_cost), labor = n(b.labor_cost);
    // Matières et emballages pris dans le stock : regroupés par article, retirés du stock (FEFO) et comptés au prix d'achat.
    const used = new Map();
    for (const c of Array.isArray(b.consumptions) ? b.consumptions : []) {
      const q = n(c.qty), id = Number(c.item_id);
      if (id && q > 0) used.set(id, (used.get(id) || 0) + q);
    }
    if (expense + labor <= 0 && !used.size) fail('Indiquez ce qui a été utilisé du stock ou les dépenses de la production');
    const totalL = lines.reduce((s, l) => s + l.liters, 0);
    const totalQ = lines.reduce((s, l) => s + l.qty, 0);
    const date = b.date || today();
    const byLiters = totalL > 0 && lines.every((x) => x.liters > 0);
    const note = [b.notes, lines.length > 1 ? `Production de ${Math.round(totalL * 1000) / 1000} L répartie en ${lines.length} formats` : null].filter(Boolean).join(' · ') || null;
    // 1. Un ordre de fabrication par format
    for (const l of lines) {
      l.share = byLiters ? l.liters / totalL : l.qty / totalQ;
      l.number = await nextNumber(t, user.cid, 'OF', 'OF');
      l.po = await t.one(`INSERT INTO production_orders (company_id,number,product_id,planned_qty,produced_qty,status,planned_date,started_at,finished_at,volume_l,team,notes,user_id,batch_id)
        VALUES ($1,$2,$3,$4,$4,'en_cours',$5::date,$5::date,$5::date,$6,$7,$8,$9,$10) RETURNING *`,
        [user.cid, l.number, l.item.id, l.qty, date, l.liters || null, b.team || null, note, user.uid, lines[0].po?.id || null]);
      if (!lines[0].po || l === lines[0]) await t.q('UPDATE production_orders SET batch_id=id WHERE id=$1 AND batch_id IS NULL', [l.po.id]);
    }
    const ref = lines[0].po;
    const refLabel = lines.map((l) => l.number).join(', ');
    // 2. Sortie de stock des matières, emballages… (répartie entre les formats)
    let material = 0;
    for (const [itemId, q] of used) {
      const o = await stockOut(t, user, { item_id: itemId, qty: q, type: 'production', ref_type: 'production_orders', ref_id: ref.id, note: `Utilisé pour ${refLabel}` });
      material += o.cost;
      for (const k of o.consumed) {
        for (const l of lines) {
          await t.q('INSERT INTO production_consumptions (production_id,item_id,lot_id,qty,unit_cost) VALUES ($1,$2,$3,$4,$5)', [l.po.id, itemId, k.lot_id, k.qty * l.share, k.unit_cost]);
        }
      }
    }
    // 3. Coûts par format, entrée en stock des produits finis
    const out = [];
    for (const l of lines) {
      const mat = material * l.share, exp = expense * l.share, lab = labor * l.share, total = mat + exp + lab, unit = total / l.qty;
      const lot = await stockIn(t, user, { item_id: l.item.id, qty: l.qty, unit_cost: unit, lot_number: b.lot_number ? `${b.lot_number}${lines.length > 1 ? '-' + (l.item.code || l.item.id) : ''}` : undefined,
        expiry_date: b.expiry_date, production_date: date, warehouse_id: b.warehouse_id, type: 'production', ref_type: 'production_orders', ref_id: l.po.id, note: l.number });
      await t.q(`UPDATE production_orders SET status='termine', material_cost=$1, labor_cost=$2, overhead_cost=0, expense_cost=$3, total_cost=$4, unit_cost=$5,
        lot_id=$6, lot_number=$7, expiry_date=$8 WHERE id=$9`, [r2(mat), r2(lab), r2(exp), r2(total), unit, lot.id, lot.lot_number, lot.expiry_date, l.po.id]);
      out.push({ id: l.po.id, number: l.number, product: l.item.name, qty: l.qty, unit_cost: unit, lot_number: lot.lot_number });
    }
    if (b.account_id && expense > 0) await cashTx(t, user, { account_id: b.account_id, amount: -expense, category: 'Production', label: `Dépenses production ${out.map((o) => o.number).join(', ')}`, ref_type: 'production_orders', ref_id: out[0].id, date });
    return { id: out[0].id, number: out.map((o) => o.number).join(', '), orders: out };
  }],

  // Modifier (ou supprimer avec b.remove) une production terminée : formats, quantités, ce qui a été pris dans le magasin,
  // dépenses, date. Le stock, la caisse, les coûts et la marge des ventes déjà faites sont recalculés.
  prod_edit: ['production', async (t, user, b) => {
    const cid = user.cid;
    const first = await t.one('SELECT * FROM production_orders WHERE id=$1 AND company_id=$2', [b.id, cid]);
    if (!first) fail('Production introuvable');
    const bid = first.batch_id || first.id;
    const pos = await t.q("SELECT p.*, i.name AS product_name FROM production_orders p LEFT JOIN items i ON i.id=p.product_id WHERE p.company_id=$1 AND (p.id=$2 OR p.batch_id=$2) AND p.status='termine' ORDER BY p.id FOR UPDATE OF p", [cid, bid]);
    if (!pos.length) fail('Seule une production terminée peut être modifiée');
    const ids = pos.map((p) => p.id);
    const date = b.date || String(pos[0].planned_date || today()).slice(0, 10);
    // 1. Rendre au magasin ce qui avait été pris, effacer l'ancienne dépense de caisse
    const moves = await t.q("SELECT * FROM stock_movements WHERE company_id=$1 AND ref_type='production_orders' AND ref_id = ANY($2::int[]) AND type='production' AND qty<0", [cid, ids]);
    for (const m of moves) if (m.lot_id) await t.q('UPDATE lots SET qty=qty-$1 WHERE id=$2', [n(m.qty), m.lot_id]);
    if (moves.length) await t.q('DELETE FROM stock_movements WHERE id = ANY($1::bigint[])', [moves.map((m) => m.id)]);
    await t.q('DELETE FROM production_consumptions WHERE production_id = ANY($1::int[])', [ids]);
    await t.q("DELETE FROM cash_transactions WHERE company_id=$1 AND ref_type='production_orders' AND ref_id = ANY($2::int[]) AND category='Production'", [cid, ids]);
    // 2. Nouveaux formats / quantités
    const lines = [];
    if (!b.remove) {
      for (const l of Array.isArray(b.lines) ? b.lines : []) {
        if (!l.product_id) continue;
        const item = await t.one('SELECT * FROM items WHERE id=$1 AND company_id=$2', [l.product_id, cid]);
        if (!item) fail('Produit introuvable');
        const uv = n(item.unit_volume);
        let qty = n(l.qty);
        if (!qty && n(l.volume_l) && uv) qty = Math.round((n(l.volume_l) / uv) * 1000) / 1000;
        if (qty <= 0) continue;
        lines.push({ item, qty, liters: uv ? qty * uv : 0, po_id: Number(l.po_id) || null });
      }
      if (!lines.length) fail('Indiquez au moins un produit avec le volume ou la quantité produite');
    }
    const totalL = lines.reduce((s, l) => s + l.liters, 0), totalQ = lines.reduce((s, l) => s + l.qty, 0);
    const byLiters = totalL > 0 && lines.every((x) => x.liters > 0);
    const note = [b.notes, lines.length > 1 ? `Production de ${Math.round(totalL * 1000) / 1000} L répartie en ${lines.length} formats` : null].filter(Boolean).join(' · ') || null;
    for (const po of pos) {
      const l = lines.find((x) => x.po_id === po.id && x.item.id === po.product_id && !x.po);
      const lot = po.lot_id ? await t.one('SELECT * FROM lots WHERE id=$1 FOR UPDATE', [po.lot_id]) : null;
      const sold = lot ? Math.max(0, Math.round((n(lot.initial_qty) - n(lot.qty)) * 1000) / 1000) : 0;
      if (l) {
        if (l.qty + 1e-9 < sold) fail(`${String(po.product_name).trim()} : ${sold} déjà vendu(s) ou sorti(s), la quantité ne peut pas être inférieure`);
        if (lot) {
          await t.q('UPDATE lots SET qty=qty+$1, initial_qty=$2, production_date=$3, expiry_date=COALESCE($4::date, expiry_date) WHERE id=$5', [l.qty - n(lot.initial_qty), l.qty, date, b.expiry_date || null, lot.id]);
          await t.q("UPDATE stock_movements SET qty=$1 WHERE lot_id=$2 AND ref_type='production_orders' AND ref_id=$3 AND type='production' AND qty>0", [l.qty, lot.id, po.id]);
        }
        l.po = po; l.lot = lot;
      } else {
        if (sold > 1e-9) fail(`${String(po.product_name).trim()} : ${sold} déjà vendu(s) ou sorti(s), ce format ne peut pas être retiré`);
        if (lot && n(lot.qty) !== 0) {
          await t.q(`INSERT INTO stock_movements (company_id,item_id,lot_id,type,qty,unit_cost,ref_type,ref_id,note,user_id) VALUES ($1,$2,$3,'annulation',$4,$5,'production_orders',$6,$7,$8)`,
            [cid, lot.item_id, lot.id, -n(lot.qty), n(lot.unit_cost), po.id, `${po.number} — production ${b.remove ? 'supprimée' : 'corrigée'}`, user.uid]);
          await t.q('UPDATE lots SET qty=0 WHERE id=$1', [lot.id]);
        }
        await t.q("UPDATE production_orders SET status='annule', notes=COALESCE(notes,'') || $2 WHERE id=$1", [po.id, b.remove ? ' (supprimée)' : ' (format retiré)']);
      }
    }
    if (b.remove) return { removed: ids.length, number: pos.map((p) => p.number).join(', ') };
    for (const l of lines) {
      if (l.po) continue;
      const number = await nextNumber(t, cid, 'OF', 'OF');
      l.po = await t.one(`INSERT INTO production_orders (company_id,number,product_id,planned_qty,produced_qty,status,planned_date,started_at,finished_at,volume_l,team,notes,user_id,batch_id)
        VALUES ($1,$2,$3,$4,$4,'en_cours',$5::date,$5::date,$5::date,$6,$7,$8,$9,$10) RETURNING *`, [cid, number, l.item.id, l.qty, date, l.liters || null, b.team || null, note, user.uid, bid]);
      l.isNew = true;
    }
    // 3. Ce qui a été pris dans le magasin
    const used = new Map();
    for (const c of Array.isArray(b.consumptions) ? b.consumptions : []) { const q = n(c.qty), id = Number(c.item_id); if (id && q > 0) used.set(id, (used.get(id) || 0) + q); }
    const expense = n(b.expense_cost), labor = n(b.labor_cost);
    if (expense + labor <= 0 && !used.size) fail('Indiquez ce qui a été utilisé du stock ou les dépenses de la production');
    for (const l of lines) l.share = byLiters ? l.liters / totalL : l.qty / totalQ;
    const ref = lines[0].po; const refLabel = lines.map((l) => l.po.number).join(', ');
    let material = 0;
    for (const [itemId, q] of used) {
      const o = await stockOut(t, user, { item_id: itemId, qty: q, type: 'production', ref_type: 'production_orders', ref_id: ref.id, note: `Utilisé pour ${refLabel}` });
      material += o.cost;
      for (const k of o.consumed) for (const l of lines) await t.q('INSERT INTO production_consumptions (production_id,item_id,lot_id,qty,unit_cost) VALUES ($1,$2,$3,$4,$5)', [l.po.id, itemId, k.lot_id, k.qty * l.share, k.unit_cost]);
    }
    // 4. Coûts, lots, marge des ventes déjà faites
    const out = [];
    for (const l of lines) {
      const over = n(l.po.overhead_cost);
      const mat = material * l.share, exp = expense * l.share, lab = labor * l.share, total = mat + exp + lab + over, unit = total / l.qty;
      let lot = l.lot;
      if (l.isNew) {
        lot = await stockIn(t, user, { item_id: l.item.id, qty: l.qty, unit_cost: unit, expiry_date: b.expiry_date, production_date: date, type: 'production', ref_type: 'production_orders', ref_id: l.po.id, note: l.po.number });
      } else if (lot) {
        await t.q('UPDATE lots SET unit_cost=$1 WHERE id=$2', [unit, lot.id]);
        await t.q('UPDATE stock_movements SET unit_cost=$1 WHERE lot_id=$2 AND (qty<0 OR (ref_type=$3 AND ref_id=$4))', [unit, lot.id, 'production_orders', l.po.id]);
        const docs = await t.q('UPDATE sales_lines SET unit_cost=$1 WHERE lot_id=$2 RETURNING doc_id', [unit, lot.id]);
        for (const dId of [...new Set(docs.map((x) => x.doc_id))]) await t.q('UPDATE sales_docs SET cost=(SELECT COALESCE(SUM(qty*COALESCE(unit_cost,0)),0) FROM sales_lines WHERE doc_id=$1) WHERE id=$1', [dId]);
        lot = await t.one('SELECT * FROM lots WHERE id=$1', [lot.id]);
      }
      await t.q(`UPDATE production_orders SET status='termine', planned_qty=$1, produced_qty=$1, volume_l=$2, planned_date=$3::date, started_at=$3::date, finished_at=$3::date,
        material_cost=$4, labor_cost=$5, expense_cost=$6, total_cost=$7, unit_cost=$8, lot_id=$9, lot_number=$10, expiry_date=$11, notes=$12, team=COALESCE($13, team) WHERE id=$14`,
        [l.qty, l.liters || null, date, r2(mat), r2(lab), r2(exp), r2(total), unit, lot?.id || null, lot?.lot_number || null, lot?.expiry_date || null, note, b.team || null, l.po.id]);
      out.push({ id: l.po.id, number: l.po.number, product: l.item.name, qty: l.qty, unit_cost: unit });
    }
    if (b.account_id && expense > 0) await cashTx(t, user, { account_id: b.account_id, amount: -expense, category: 'Production', label: `Dépenses production ${out.map((o) => o.number).join(', ')}`, ref_type: 'production_orders', ref_id: out[0].id, date });
    return { id: out[0].id, number: out.map((o) => o.number).join(', '), orders: out, edited: true };
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
  // Rétablir une vente annulée par erreur : les produits ressortent du stock et l'argent rendu revient en caisse
  sale_restore: [['ventes', 'caisse'], async (t, user, b) => {
    const doc = await getDoc(t, user, b.id);
    if (doc.type !== 'facture' || doc.status !== 'annule') fail('Seule une vente annulée peut être rétablie');
    const lastR = await t.one(`SELECT GREATEST(
        (SELECT MAX(created_at) FROM stock_movements WHERE company_id=$1 AND ref_type='sales_docs_annule' AND ref_id=$2 AND type='retablissement'),
        (SELECT MAX(created_at) FROM cash_transactions WHERE company_id=$1 AND ref_type='sales_docs' AND ref_id=$2 AND category='Vente rétablie')) AS at`, [user.cid, doc.id]);
    const since = lastR?.at || '1970-01-01';
    const back = await t.q(`SELECT * FROM stock_movements WHERE company_id=$1 AND ref_type='sales_docs_annule' AND ref_id=$2 AND type='annulation' AND created_at > $3`, [user.cid, doc.id, since]);
    for (const m of back) {
      if (!m.lot_id) continue;
      const lot = await t.one('SELECT l.qty, i.name FROM lots l JOIN items i ON i.id=l.item_id WHERE l.id=$1 FOR UPDATE', [m.lot_id]);
      if (!lot || n(lot.qty) + 1e-9 < n(m.qty)) fail(`Plus assez de « ${lot?.name || 'produit'} » en stock pour rétablir cette vente`);
      await t.q('UPDATE lots SET qty=qty-$1 WHERE id=$2', [n(m.qty), m.lot_id]);
      await t.q(`INSERT INTO stock_movements (company_id,item_id,lot_id,warehouse_id,type,qty,unit_cost,ref_type,ref_id,note,user_id)
        VALUES ($1,$2,$3,$4,'retablissement',$5,$6,'sales_docs_annule',$7,$8,$9)`, [user.cid, m.item_id, m.lot_id, m.warehouse_id, -n(m.qty), n(m.unit_cost), doc.id, `Rétablissement ${doc.number}`, user.uid]);
    }
    const refunds = await t.q(`SELECT * FROM cash_transactions WHERE company_id=$1 AND ref_type='sales_docs' AND ref_id=$2 AND category='Remboursement client' AND created_at > $3`, [user.cid, doc.id, since]);
    let paid = 0;
    for (const r of refunds) {
      const amt = -n(r.amount);
      if (amt <= 0) continue;
      await cashTx(t, user, { account_id: r.account_id, amount: amt, category: 'Vente rétablie', label: `${doc.number} rétablie (annulée par erreur)`, ref_type: 'sales_docs', ref_id: doc.id, date: today() });
      await t.q(`INSERT INTO payments (company_id,direction,party_type,party_id,doc_type,doc_id,account_id,amount,date,reference,user_id)
        VALUES ($1,'in','customer',$2,'sales_docs',$3,$4,$5,$6,'Vente rétablie',$7)`, [user.cid, doc.customer_id, doc.id, r.account_id, amt, doc.date, user.uid]);
      paid += amt;
    }
    paid = Math.min(r2(paid), n(doc.total));
    const status = paid >= n(doc.total) - 0.01 ? 'paye' : paid > 0 ? 'partiel' : 'valide';
    await t.q('UPDATE sales_docs SET status=$1, paid=$2 WHERE id=$3', [status, paid, doc.id]);
    return { ok: true, number: doc.number, total: n(doc.total), paid };
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
    await t.q('INSERT INTO sales_lines (doc_id,item_id,description,qty,unit_price,discount,total,lot_id) SELECT $1,item_id,description,qty,unit_price,discount,total,lot_id FROM sales_lines WHERE doc_id=$2 ORDER BY id', [nd.id, doc.id]);
    await t.q("UPDATE sales_docs SET status='transforme' WHERE id=$1", [doc.id]);
    return nd;
  }],
  // Corriger une vente déjà enregistrée : produits, quantités, prix, client, date, remise et montant reçu.
  // Le stock, la caisse, la créance et le bénéfice sont recalculés.
  sale_edit: [['ventes', 'caisse'], async (t, user, b) => {
    const doc = await getDoc(t, user, b.id);
    if (doc.type !== 'facture') fail('Seule une facture (vente) peut être corrigée ici');
    if (!['valide', 'partiel', 'paye'].includes(doc.status)) fail('Cette vente ne peut pas être corrigée (annulée, transformée ou brouillon)');
    if (doc.channel === 'depot') fail('Vente issue d\'un retour de vendeur : elle ne peut pas être corrigée ici');
    if (doc.parent_id) {
      const par = await t.one('SELECT type FROM sales_docs WHERE id=$1', [doc.parent_id]);
      if (par?.type === 'commande') fail('Facture de livraison d\'une commande : annulez-la puis refaites la livraison');
    }
    const lines = (b.lines || []).filter((l) => Number(l.item_id) && n(l.qty) > 0);
    if (!lines.length) fail('Gardez au moins un produit avec une quantité (sinon annulez la vente)');
    if (lines.some((l) => n(l.unit_price) < 0)) fail('Prix invalide');
    const date = b.date || doc.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) fail('Date invalide');
    if (date > today()) fail('La date ne peut pas être dans le futur');
    const old = { total: n(doc.total), paid: n(doc.paid), date: doc.date };

    // 1. Remettre en stock ce qui était sorti pour cette vente
    const moves = await t.q("SELECT * FROM stock_movements WHERE company_id=$1 AND ref_type='sales_docs' AND ref_id=$2", [user.cid, doc.id]);
    for (const m of moves) {
      if (m.lot_id) await t.q('UPDATE lots SET qty=qty-$1 WHERE id=$2', [n(m.qty), m.lot_id]);
      await t.q(`INSERT INTO stock_movements (company_id,item_id,lot_id,warehouse_id,type,qty,unit_cost,ref_type,ref_id,note,user_id)
        VALUES ($1,$2,$3,$4,'correction',$5,$6,'sales_docs_corrige',$7,$8,$9)`, [user.cid, m.item_id, m.lot_id, m.warehouse_id, -n(m.qty), n(m.unit_cost), doc.id, `Correction ${doc.number}`, user.uid]);
    }
    await t.q("UPDATE stock_movements SET ref_type='sales_docs_corrige' WHERE company_id=$1 AND ref_type='sales_docs' AND ref_id=$2", [user.cid, doc.id]);

    // 2. Nouvelles lignes, puis nouvelle sortie de stock (même logique qu'une vente normale)
    await t.q('DELETE FROM sales_lines WHERE doc_id=$1', [doc.id]);
    for (const l of lines) {
      const it = await t.one('SELECT id FROM items WHERE id=$1 AND company_id=$2', [l.item_id, user.cid]);
      if (!it) fail('Produit introuvable');
      await t.q('INSERT INTO sales_lines (doc_id,item_id,qty,unit_price,discount,total,lot_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [doc.id, it.id, n(l.qty), n(l.unit_price), n(l.discount), r2(n(l.qty) * n(l.unit_price) - n(l.discount)), l.lot_id ? Number(l.lot_id) : null]);
    }
    const subtotal = r2(lines.reduce((s, l) => s + n(l.qty) * n(l.unit_price) - n(l.discount), 0));
    const discount = b.discount === undefined ? n(doc.discount) : n(b.discount);
    const total = r2(subtotal - discount + n(doc.tax));
    if (total < 0) fail('La remise dépasse le montant de la vente');
    const customer = b.customer_id === undefined ? doc.customer_id : (Number(b.customer_id) || doc.customer_id);
    await t.q("UPDATE sales_docs SET customer_id=$1, date=$2, subtotal=$3, discount=$4, total=$5, status='brouillon' WHERE id=$6", [customer, date, subtotal, discount, total, doc.id]);
    await validateSale(t, user, { ...doc, customer_id: customer, total, status: 'brouillon' });

    // 3. Argent reçu : on complète ou on rend la différence
    const newPaid = Math.min(r2(b.paid === undefined || b.paid === '' || b.paid === null ? Math.min(old.paid, total) : n(b.paid)), total);
    if (newPaid < 0) fail('Montant reçu invalide');
    let diff = r2(newPaid - old.paid);
    const pays = await t.q("SELECT * FROM payments WHERE doc_type='sales_docs' AND doc_id=$1 AND direction='in' ORDER BY date DESC, id DESC", [doc.id]);
    if (diff > 0.009) {
      const acc = b.account_id || pays[0]?.account_id;
      if (!acc) fail('Choisissez où l\'argent est reçu');
      await t.q(`INSERT INTO payments (company_id,direction,party_type,party_id,doc_type,doc_id,account_id,amount,date,method,reference,user_id)
        VALUES ($1,'in','customer',$2,'sales_docs',$3,$4,$5,$6,NULL,'Correction de vente',$7)`, [user.cid, customer, doc.id, acc, diff, today(), user.uid]);
      await cashTx(t, user, { account_id: acc, amount: diff, category: 'Vente', label: `Correction ${doc.number} (complément)`, ref_type: 'sales_docs', ref_id: doc.id });
    } else if (diff < -0.009) {
      let back = -diff;
      for (const p of pays) {
        if (back <= 0.009) break;
        const take = Math.min(back, n(p.amount));
        if (take >= n(p.amount) - 0.009) await t.q('DELETE FROM payments WHERE id=$1', [p.id]);
        else await t.q('UPDATE payments SET amount=amount-$1 WHERE id=$2', [take, p.id]);
        await cashTx(t, user, { account_id: p.account_id, amount: -take, category: 'Correction vente', label: `Correction ${doc.number} (rendu au client)`, ref_type: 'sales_docs', ref_id: doc.id });
        back = r2(back - take);
      }
    }
    if (customer !== doc.customer_id) await t.q('UPDATE payments SET party_id=$1 WHERE doc_type=\'sales_docs\' AND doc_id=$2', [customer, doc.id]);
    const status = total <= 0.009 || newPaid >= total - 0.01 ? 'paye' : newPaid > 0 ? 'partiel' : 'valide';
    await t.q('UPDATE sales_docs SET paid=$1, status=$2 WHERE id=$3', [newPaid, status, doc.id]);
    return { id: doc.id, number: doc.number, old_total: old.total, total, old_paid: old.paid, paid: newPaid, old_date: old.date, date };
  }],
  // Changer la date d'un encaissement (et la ligne de trésorerie qui va avec)
  payment_date: [['ventes', 'caisse'], async (t, user, b) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) fail('Date invalide');
    if (b.date > today()) fail('La date ne peut pas être dans le futur');
    const p = await t.one('SELECT * FROM payments WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.id, user.cid]);
    if (!p) fail('Encaissement introuvable');
    const sign = p.direction === 'in' ? 1 : -1;
    const tx = await t.one(`SELECT id FROM cash_transactions WHERE company_id=$1 AND account_id=$2 AND ref_type=$3 AND ref_id=$4 AND amount=$5 AND date=$6 ORDER BY id LIMIT 1`,
      [user.cid, p.account_id, p.doc_type, p.doc_id, sign * n(p.amount), p.date]);
    await t.q('UPDATE payments SET date=$1, reference=$2 WHERE id=$3', [b.date, b.reference === undefined ? p.reference : (b.reference || null), p.id]);
    if (tx) await t.q('UPDATE cash_transactions SET date=$1 WHERE id=$2', [b.date, tx.id]);
    return { ok: true, old_date: p.date, amount: n(p.amount) };
  }],
  // Paiement d'un client qui doit de l'argent : réparti sur ses factures, les plus anciennes d'abord
  customer_pay: [['ventes'], async (t, user, b) => {
    let amount = r2(b.amount);
    if (amount <= 0) fail('Montant invalide');
    if (!b.account_id) fail('Choisissez où l\'argent est reçu');
    const docs = await t.q(`SELECT * FROM sales_docs WHERE company_id=$1 AND customer_id=$2 AND type='facture' AND status IN ('valide','partiel') AND total>paid
      ORDER BY date, id FOR UPDATE`, [user.cid, b.customer_id]);
    const due = r2(docs.reduce((s, d) => s + n(d.total) - n(d.paid), 0));
    if (!docs.length) fail('Ce client ne doit rien');
    if (amount > due + 0.01) fail(`Le montant dépasse ce que le client doit (${due})`);
    const done = [];
    for (const d of docs) {
      if (amount <= 0.009) break;
      const part = Math.min(amount, r2(n(d.total) - n(d.paid)));
      await payDoc(t, user, d, { amount: part, account_id: b.account_id, date: b.date, reference: b.reference });
      done.push({ number: d.number, amount: part });
      amount = r2(amount - part);
    }
    return { invoices: done, rest: r2(due - r2(b.amount)) };
  }],
  // Acompte reçu à la commande : l'argent entre en caisse, il sera déduit des factures de livraison
  order_advance: [['ventes'], async (t, user, b) => {
    const doc = await getDoc(t, user, b.id);
    if (doc.type !== 'commande' || !['brouillon', 'valide'].includes(doc.status)) fail('Acompte possible seulement sur une commande en cours');
    const amount = r2(b.amount);
    if (amount <= 0) fail('Montant invalide');
    if (n(doc.paid) + amount > n(doc.total) + 0.01) fail(`L'acompte dépasse le montant de la commande (${r2(n(doc.total) - n(doc.paid))} restant)`);
    if (!b.account_id) fail('Choisissez où l\'argent est reçu');
    await t.q(`INSERT INTO payments (company_id,direction,party_type,party_id,doc_type,doc_id,account_id,amount,date,method,reference,user_id)
      VALUES ($1,'in','customer',$2,'sales_docs',$3,$4,$5,$6,$7,$8,$9)`, [user.cid, doc.customer_id, doc.id, b.account_id, amount, b.date || today(), b.method || null, 'Acompte', user.uid]);
    await cashTx(t, user, { account_id: b.account_id, amount, category: 'Vente', label: `Acompte commande ${doc.number}`, ref_type: 'sales_docs', ref_id: doc.id, date: b.date });
    await t.q('UPDATE sales_docs SET paid=paid+$1 WHERE id=$2', [amount, doc.id]);
    return { ok: true };
  }],
  // Livrer une commande (en une ou plusieurs fois) : facture des quantités livrées, stock déduit, acompte déduit, encaissement éventuel.
  order_deliver: [['ventes'], async (t, user, b) => {
    const doc = await getDoc(t, user, b.id);
    if (doc.type !== 'commande' || !['brouillon', 'valide'].includes(doc.status)) fail('Seule une commande en cours peut être livrée');
    const lines = await t.q('SELECT * FROM sales_lines WHERE doc_id=$1 ORDER BY id', [doc.id]);
    const qtys = b.qtys || {};
    const lots = b.lots || {};
    const deliver = [];
    for (const l of lines) {
      const rest = Math.round((n(l.qty) - n(l.qty_delivered)) * 1000) / 1000;
      const q = qtys[l.id] === undefined || qtys[l.id] === '' ? rest : n(qtys[l.id]);
      if (q < 0 || q > rest + 1e-9) fail(`Quantité à livrer invalide (reste ${rest})`);
      if (q > 0) deliver.push({ l, q });
    }
    if (!deliver.length) fail('Indiquez au moins une quantité à livrer');
    const sub = r2(deliver.reduce((s, { l, q }) => s + q * n(l.unit_price) - (n(l.qty) ? n(l.discount) * q / n(l.qty) : 0), 0));
    const ratio = n(doc.subtotal) > 0 ? sub / n(doc.subtotal) : 1;
    const disc = r2(n(doc.discount) * ratio), tax = r2(n(doc.tax) * ratio);
    const total = r2(sub - disc + tax);
    const number = await nextNumber(t, user.cid, 'facture', 'FAC');
    const remainingAfter = lines.some((l) => { const d = deliver.find((x) => x.l.id === l.id); return n(l.qty) - n(l.qty_delivered) - (d ? d.q : 0) > 1e-9; });
    const nd = await t.one(`INSERT INTO sales_docs (company_id,number,type,customer_id,date,due_date,status,subtotal,discount,tax,total,channel,parent_id,notes,user_id)
      VALUES ($1,$2,'facture',$3,$4,$5,'brouillon',$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [user.cid, number, doc.customer_id, b.date || today(), doc.due_date, sub, disc, tax, total, doc.channel, doc.id,
        [doc.notes, `${remainingAfter ? 'Livraison partielle' : 'Livraison'} de la commande ${doc.number}`].filter(Boolean).join(' · '), user.uid]);
    for (const { l, q } of deliver) {
      const ld = n(l.qty) ? r2(n(l.discount) * q / n(l.qty)) : 0;
      await t.q('INSERT INTO sales_lines (doc_id,item_id,description,qty,unit_price,discount,total,lot_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [nd.id, l.item_id, l.description, q, n(l.unit_price), ld, r2(q * n(l.unit_price) - ld), lots[l.id] ? Number(lots[l.id]) : l.lot_id]);
      await t.q('UPDATE sales_lines SET qty_delivered=qty_delivered+$1 WHERE id=$2', [q, l.id]);
    }
    const v = await validateSale(t, user, nd);
    // Acompte : déduit de cette facture (l'argent est déjà en caisse)
    const avail = r2(n(doc.paid) - n(doc.advance_used));
    const use = Math.min(avail, total);
    let paidNow = 0;
    if (use > 0.009) {
      paidNow = use;
      await t.q('UPDATE sales_docs SET paid=$1, status=$2, notes=COALESCE(notes,\'\')||$3 WHERE id=$4', [use, use >= total - 0.01 ? 'paye' : 'partiel', ` · Acompte de ${Math.round(use)} déduit`, nd.id]);
      await t.q('UPDATE sales_docs SET advance_used=advance_used+$1 WHERE id=$2', [use, doc.id]);
    }
    const pay = Math.min(r2(n(b.paid)), r2(total - paidNow));
    if (pay > 0) await payDoc(t, user, { ...nd, status: v.status, paid: paidNow }, { amount: pay, account_id: b.account_id, date: b.date });
    if (!remainingAfter) await t.q("UPDATE sales_docs SET status='transforme' WHERE id=$1", [doc.id]);
    else await t.q("UPDATE sales_docs SET status='valide' WHERE id=$1", [doc.id]);
    return { id: nd.id, number, total, advance: paidNow, complete: !remainingAfter };
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
      VALUES ($1,$2,'facture',$3,$4,'brouillon',$5,$6,$7,$8,$9) RETURNING *`,
      [user.cid, number, customer, b.date || today(), subtotal, n(b.discount), total, b.channel || 'comptoir', user.uid]);
    for (const l of lines) {
      await t.q('INSERT INTO sales_lines (doc_id,item_id,qty,unit_price,discount,total,lot_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [doc.id, l.item_id, n(l.qty), n(l.unit_price), n(l.discount), r2(n(l.qty) * n(l.unit_price) - n(l.discount)), l.lot_id ? Number(l.lot_id) : null]);
    }
    const v = await validateSale(t, user, doc);
    const paid = Math.min(r2(b.paid ?? total), total);
    if (paid > 0) await payDoc(t, user, { ...doc, status: v.status, paid: 0 }, { amount: paid, account_id: b.account_id, method: b.method, date: b.date });
    return { id: doc.id, number, total };
  }],

  // ---------- VENDEURS & DÉPÔTS ----------
  // Confier des produits à un vendeur / revendeur : ils sortent du magasin (lots les plus anciens d'abord)
  consign_out: [['ventes', 'stock'], async (t, user, b) => {
    let customer = Number(b.customer_id) || null;
    if (!customer && b.new_customer?.name) {
      customer = (await t.one("INSERT INTO customers (company_id,name,phone,type) VALUES ($1,$2,$3,'vendeur') RETURNING id", [user.cid, String(b.new_customer.name).trim(), b.new_customer.phone || null])).id;
    }
    return consignOut(t, user, { customer, date: b.date, tier: b.tier, notes: b.notes, lines: b.lines });
  }],
  // Retour du soir : ce qui revient retourne en stock, ce qui manque est facturé (vendu) ou déclaré perdu
  consign_settle: [['ventes', 'stock'], async (t, user, b) => {
    const c = await t.one('SELECT * FROM consignments WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.id, user.cid]);
    if (!c) fail('Dépôt introuvable');
    if (c.status !== 'ouvert') fail('Ce dépôt est déjà réglé');
    const lines = await t.q('SELECT cl.*, i.name FROM consignment_lines cl JOIN items i ON i.id=cl.item_id WHERE cl.consignment_id=$1 ORDER BY cl.id', [c.id]);
    const input = new Map((b.lines || []).map((x) => [Number(x.id), x]));
    const date = b.date || today();
    let doc = null; let subtotal = 0;
    const sold = []; const keep = [];
    for (const l of lines) {
      const back0 = n(input.get(l.id)?.returned), lost = n(input.get(l.id)?.lost), kept = n(input.get(l.id)?.kept);
      if (back0 < 0 || lost < 0 || kept < 0) fail('Quantités invalides');
      if (back0 + lost + kept > n(l.qty_out) + 1e-9) fail(`${l.name} : rapporté + perdu + gardé dépasse ce qui a été confié (${n(l.qty_out)})`);
      const ret = back0 + kept; // ce que le vendeur garde repasse par le stock puis repart dans un nouveau dépôt
      const s = Math.round((n(l.qty_out) - ret - lost) * 1000) / 1000;
      sold.push({ l, ret, lost, s, kept, back0 });
      if (kept > 0) keep.push({ item_id: l.item_id, qty: kept, unit_price: n(l.unit_price) });
      subtotal += s * n(l.unit_price);
    }
    if (subtotal > 0 || sold.some((x) => x.s > 0)) {
      const number = await nextNumber(t, user.cid, 'facture', 'FAC');
      doc = await t.one(`INSERT INTO sales_docs (company_id,number,type,customer_id,date,status,subtotal,discount,total,channel,notes,user_id)
        VALUES ($1,$2,'facture',$3,$4,'brouillon',$5,0,$5,'depot',$6,$7) RETURNING *`, [user.cid, number, c.customer_id, date, r2(subtotal), `Ventes du dépôt ${c.number}`, user.uid]);
    }
    let cost = 0;
    for (const { l, ret, lost, s } of sold) {
      // Répartition sur les lots confiés : vendus et pertes sur les plus anciens, retours sur les plus récents
      const lots = await t.q('SELECT * FROM consignment_lots WHERE line_id=$1 ORDER BY id', [l.id]);
      let toSell = s, toLose = lost; const back = []; let lineCost = 0; const soldLots = new Set();
      for (const k of lots) {
        let avail = n(k.qty);
        const a = Math.min(avail, toSell); avail -= a; toSell -= a;
        const p = Math.min(avail, toLose); avail -= p; toLose -= p;
        if (a > 1e-9) {
          await t.q(`INSERT INTO stock_movements (company_id,item_id,lot_id,type,qty,unit_cost,ref_type,ref_id,note,user_id) VALUES ($1,$2,$3,'depot',$4,$5,'consignments',$6,$7,$8),
            ($1,$2,$3,'vente',$9,$5,'sales_docs',$10,$11,$8)`, [user.cid, l.item_id, k.lot_id, a, n(k.unit_cost), c.id, `${c.number} — vendu`, user.uid, -a, doc.id, doc.number]);
          lineCost += a * n(k.unit_cost); soldLots.add(k.lot_id);
        }
        if (p > 1e-9) {
          await t.q(`INSERT INTO stock_movements (company_id,item_id,lot_id,type,qty,unit_cost,ref_type,ref_id,note,user_id) VALUES ($1,$2,$3,'depot',$4,$5,'consignments',$6,$7,$8),
            ($1,$2,$3,'perte',$9,$5,'consignments',$6,$7,$8)`, [user.cid, l.item_id, k.lot_id, p, n(k.unit_cost), c.id, `${c.number} — perdu chez le vendeur`, user.uid, -p]);
        }
        if (avail > 1e-9) back.push({ k, q: avail });
      }
      let toReturn = ret;
      for (const { k, q } of back.reverse()) {
        const r = Math.min(q, toReturn); toReturn -= r;
        if (r > 1e-9) {
          await t.q('UPDATE lots SET qty=qty+$1 WHERE id=$2', [r, k.lot_id]);
          await t.q(`INSERT INTO stock_movements (company_id,item_id,lot_id,type,qty,unit_cost,ref_type,ref_id,note,user_id) VALUES ($1,$2,$3,'retour',$4,$5,'consignments',$6,$7,$8)`,
            [user.cid, l.item_id, k.lot_id, r, n(k.unit_cost), c.id, `${c.number} — retour`, user.uid]);
        }
      }
      await t.q('UPDATE consignment_lines SET qty_returned=$1, qty_lost=$2 WHERE id=$3', [ret, lost, l.id]);
      if (doc && s > 0) {
        await t.q('INSERT INTO sales_lines (doc_id,item_id,qty,unit_price,discount,total,unit_cost,lot_id) VALUES ($1,$2,$3,$4,0,$5,$6,$7)',
          [doc.id, l.item_id, s, n(l.unit_price), r2(s * n(l.unit_price)), lineCost / s, soldLots.size === 1 ? [...soldLots][0] : null]);
        cost += lineCost;
      }
    }
    let status = null;
    if (doc) {
      status = n(doc.total) <= 0 ? 'paye' : 'valide';
      await t.q('UPDATE sales_docs SET status=$1, cost=$2 WHERE id=$3', [status, r2(cost), doc.id]);
      // Sans accès aux ventes ni à la caisse (magasinier) : l'argent sera encaissé plus tard par la caisse
      const canMoney = can(user, 'ventes') || can(user, 'caisse');
      const paid = canMoney ? Math.min(r2(n(b.paid)), n(doc.total)) : 0;
      if (paid > 0) await payDoc(t, user, { ...doc, status, paid: 0 }, { amount: paid, account_id: b.account_id, date });
    }
    await t.q("UPDATE consignments SET status='regle', sale_id=$1, settled_at=now() WHERE id=$2", [doc?.id || null, c.id]);
    let next = null;
    if (keep.length) next = await consignOut(t, user, { customer: c.customer_id, date: b.next_date || date, tier: c.tier, notes: `Reste gardé du dépôt ${c.number}`, lines: keep });
    return { id: c.id, sale_id: doc?.id || null, sale_number: doc?.number || null, total: r2(subtotal), next_number: next?.number || null };
  }],
  consign_cancel: [['ventes', 'stock'], async (t, user, b) => {
    const c = await t.one('SELECT * FROM consignments WHERE id=$1 AND company_id=$2 FOR UPDATE', [b.id, user.cid]);
    if (!c) fail('Dépôt introuvable');
    if (c.status !== 'ouvert') fail('Seul un dépôt non réglé peut être annulé');
    await reverseMovements(t, user, 'consignments', c.id);
    await t.q("UPDATE consignments SET status='annule' WHERE id=$1", [c.id]);
    return { ok: true };
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
    const f = ['name', 'sector', 'currency', 'address', 'phone', 'email', 'ninea', 'rccm', 'tax_rate', 'invoice_footer', 'logo', 'city', 'slogan'];
    if (b.logo && (!/^data:image\/(png|jpeg|webp);base64,/.test(b.logo) || b.logo.length > 400000)) fail('Logo invalide ou trop lourd');
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
  await guardOp(user, req.query.op, req.body || {}, out);
  return out ?? { ok: true };
});
