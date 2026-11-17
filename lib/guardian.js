// LE GARDIEN — surveille les actions sensibles et prévient la direction.
// Appelé APRÈS chaque opération réussie (jamais bloquant : une erreur ici n'empêche rien).
import { q, one } from './db';

const BIG_CASH = 50000;      // sortie de caisse / dépense considérée comme importante (F)
const DISCOUNT_PCT = 10;     // remise à partir de laquelle on alerte en « attention »
const BACKDATE_DAYS = 3;     // date saisie plus ancienne que N jours = antidaté

const n = (v) => Number(v) || 0;
export const F = (v) => `${Math.round(n(v)).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
const N = (v) => (Math.round(n(v) * 1000) / 1000).toLocaleString('fr-FR').replace(/ | /g, ' ');
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d) => Math.floor((Date.parse(todayStr()) - Date.parse(String(d).slice(0, 10))) / 86400000);

export async function alert(user, { kind, level = 'info', title, message = null, mod = null, key = null, cid }) {
  try {
    await q(`INSERT INTO guardian_alerts (company_id,kind,level,title,message,link_mod,actor_id,actor_name,key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (key) DO NOTHING`,
    [cid || user.cid, kind, level, title, message, mod, user?.uid || null, user ? (user.support ? 'Support Angy Company' : user.name) : null, key]);
  } catch (e) { console.error('gardien', e.message); }
}

async function backdated(user, op, d, label, mod) {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return;
  const k = daysAgo(d);
  if (k > BACKDATE_DAYS) {
    await alert(user, { kind: 'antidate', level: 'attention', title: 'Opération enregistrée avec une date ancienne', mod,
      message: `${label} daté du ${String(d).slice(0, 10).split('-').reverse().join('/')} (il y a ${k} jours). Vérifiez que ce n'est pas une correction après coup.` });
  }
}

const OP_LABELS = {
  customer_pay: ['Paiement client', 'ventes'], sale_pay: ['Encaissement de facture', 'ventes'], market_purchase: ['Achat', 'achats'],
  stock_in: ['Entrée en stock', 'stock'], cash_move: ['Mouvement de caisse', 'caisse'], cash_transfer: ['Transfert entre comptes', 'caisse'],
  order_advance: ['Acompte de commande', 'ventes'], consign_settle: ['Retour de vendeur', 'ventes'], consign_out: ['Dépôt chez un vendeur', 'ventes'],
  prod_simple: ['Production', 'production'], pos_sale: ['Vente à la caisse', 'ventes'], supplier_pay: ['Paiement fournisseur', 'achats'],
};

// ---------- Après une opération métier ----------
export async function guardOp(user, op, b, out) {
  try {
    if (OP_LABELS[op]) await backdated(user, op, b.date, OP_LABELS[op][0], OP_LABELS[op][1]);

    if (op === 'pos_sale' && out?.id) {
      const doc = await one(`SELECT d.number,d.total,d.subtotal,d.discount,d.paid,c.name AS cname FROM sales_docs d LEFT JOIN customers c ON c.id=d.customer_id WHERE d.id=$1`, [out.id]);
      const lines = (b.lines || []).filter((l) => l.item_id && n(l.qty) > 0);
      const disc = n(b.discount) + lines.reduce((s, l) => s + n(l.discount), 0);
      const gross = lines.reduce((s, l) => s + n(l.qty) * n(l.unit_price), 0);
      if (disc > 0) {
        const pct = gross > 0 ? Math.round((disc / gross) * 100) : 0;
        await alert(user, { kind: 'remise', level: pct >= DISCOUNT_PCT ? 'attention' : 'info', mod: 'ventes', title: `Remise de ${F(disc)} accordée (${pct} %)`, message: `Vente ${doc.number} à ${doc.cname || 'un client'} : ${F(gross)} ramenés à ${F(doc.total)}.` });
      }
      const ids = lines.map((l) => Number(l.item_id));
      if (ids.length) {
        const items = await q('SELECT id,name,sale_price,wholesale_price FROM items WHERE id = ANY($1::int[])', [ids]);
        for (const l of lines) {
          const it = items.find((x) => x.id === Number(l.item_id));
          if (!it || !n(it.sale_price)) continue;
          const floor = Math.min(n(it.sale_price), n(it.wholesale_price) || n(it.sale_price));
          if (n(l.unit_price) < floor - 0.5) {
            await alert(user, { kind: 'prix', level: 'attention', mod: 'ventes', title: `Vendu moins cher que le prix : ${it.name}`, message: `${N(l.qty)} vendu(s) à ${F(l.unit_price)} au lieu de ${F(floor)} (vente ${doc.number}).` });
          }
        }
      }
      if (n(doc.paid) + 0.5 < n(doc.total)) {
        await alert(user, { kind: 'credit', level: 'attention', mod: 'ventes', title: `Vente à crédit : ${F(n(doc.total) - n(doc.paid))} non payés`, message: `Vente ${doc.number} à ${doc.cname || 'un client'} — total ${F(doc.total)}, payé ${F(doc.paid)}.` });
      }
      const dup = await one(`SELECT number FROM sales_docs WHERE company_id=$1 AND user_id=$2 AND id<>$3 AND type='facture' AND total=$4 AND status<>'annule' AND created_at > now() - interval '3 minutes' ORDER BY id DESC LIMIT 1`, [user.cid, user.uid, out.id, doc.total]);
      if (dup && n(doc.total) > 0) {
        await alert(user, { kind: 'doublon', level: 'attention', mod: 'ventes', title: 'Même vente enregistrée deux fois ?', message: `${doc.number} et ${dup.number} : même montant (${F(doc.total)}) à moins de 3 minutes d'écart.` });
      }
    }

    if (op === 'sale_cancel') {
      const d = await one('SELECT d.number,d.total,d.type,c.name AS cname FROM sales_docs d LEFT JOIN customers c ON c.id=d.customer_id WHERE d.id=$1', [b.id]);
      if (d) await alert(user, { kind: 'annulation', level: d.type === 'facture' ? 'grave' : 'info', mod: 'ventes', title: `${d.type === 'facture' ? 'Vente annulée' : 'Document annulé'} : ${d.number}`, message: `${F(d.total)} — ${d.cname || 'client inconnu'}${b.reason ? ` — motif : ${b.reason}` : ''}.` });
    }
    if (op === 'sale_refund') {
      const d = await one('SELECT number FROM sales_docs WHERE id=$1', [b.id]);
      const r = await one("SELECT COALESCE(-SUM(amount),0) AS v FROM cash_transactions WHERE ref_type='sales_docs' AND ref_id=$1 AND category='Remboursement client' AND created_at > now() - interval '5 minutes'", [b.id]);
      await alert(user, { kind: 'remboursement', level: 'grave', mod: 'caisse', title: `Argent rendu au client : ${F(r?.v)}`, message: `Les paiements de ${d?.number || 'la facture'} ont été annulés et l'argent est sorti de la caisse.` });
    }
    if (op === 'sale_reopen') {
      const d = await one('SELECT number FROM sales_docs WHERE id=$1', [b.id]);
      await alert(user, { kind: 'modif', level: 'info', mod: 'ventes', title: `Document rouvert pour modification : ${d?.number || ''}` });
    }

    if (op === 'stock_out') {
      const it = await one('SELECT name,unit FROM items WHERE id=$1', [b.item_id]);
      const typ = b.type === 'perte' ? 'Perte' : b.type === 'casse' ? 'Casse' : 'Sortie manuelle';
      await alert(user, { kind: 'stock', level: 'attention', mod: 'stock', title: `${typ} de stock : ${N(b.qty)} ${it?.unit || ''} de ${it?.name || 'article'}`, message: `${out?.cost ? `Valeur ${F(out.cost)}. ` : ''}${b.note ? `Motif : ${b.note}` : 'Aucun motif indiqué.'}` });
    }
    if (op === 'inventory' && n(out?.diff) < 0) {
      const l = await one('SELECT l.lot_number,l.unit_cost,i.name,i.unit FROM lots l JOIN items i ON i.id=l.item_id WHERE l.id=$1', [b.lot_id]);
      await alert(user, { kind: 'stock', level: 'attention', mod: 'stock', title: `Inventaire : il manque ${N(-out.diff)} ${l?.unit || ''} de ${l?.name || 'article'}`, message: `Lot ${l?.lot_number || ''} — valeur ${F(-out.diff * n(l?.unit_cost))}. ${b.note ? `Motif : ${b.note}` : ''}` });
    }
    if (op === 'lot_status' && ['bloque', 'perime'].includes(b.status)) {
      const l = await one('SELECT l.lot_number,l.qty,i.name,i.unit FROM lots l JOIN items i ON i.id=l.item_id WHERE l.id=$1', [b.lot_id]);
      await alert(user, { kind: 'stock', level: 'info', mod: 'stock', title: `Lot ${b.status === 'bloque' ? 'bloqué' : 'déclaré périmé'} : ${l?.name || ''}`, message: `Lot ${l?.lot_number || ''} — ${N(l?.qty)} ${l?.unit || ''} ne peuvent plus être vendus.` });
    }

    if (op === 'consign_settle') {
      const c = await one('SELECT c.number,cu.name FROM consignments c LEFT JOIN customers cu ON cu.id=c.customer_id WHERE c.id=$1', [b.id]);
      const lines = await q('SELECT cl.qty_lost,cl.unit_price,i.name FROM consignment_lines cl JOIN items i ON i.id=cl.item_id WHERE cl.consignment_id=$1 AND cl.qty_lost>0', [b.id]);
      if (lines.length) {
        const val = lines.reduce((s, l) => s + n(l.qty_lost) * n(l.unit_price), 0);
        await alert(user, { kind: 'vendeur', level: 'grave', mod: 'ventes', title: `Produits déclarés perdus par ${c?.name || 'un vendeur'} : ${F(val)}`, message: `${c?.number} — ${lines.map((l) => `${N(l.qty_lost)} ${l.name}`).join(', ')}.` });
      }
      if (out?.sale_id) {
        const d = await one('SELECT total,paid FROM sales_docs WHERE id=$1', [out.sale_id]);
        const rest = n(d?.total) - n(d?.paid);
        if (rest > 0.5) await alert(user, { kind: 'vendeur', level: 'attention', mod: 'ventes', title: `${c?.name || 'Un vendeur'} doit encore ${F(rest)}`, message: `Retour du dépôt ${c?.number} : vendu ${F(d.total)}, versé ${F(d.paid)}.` });
      }
    }
    if (op === 'consign_cancel') {
      const c = await one('SELECT c.number,cu.name FROM consignments c LEFT JOIN customers cu ON cu.id=c.customer_id WHERE c.id=$1', [b.id]);
      await alert(user, { kind: 'vendeur', level: 'info', mod: 'ventes', title: `Dépôt annulé : ${c?.number || ''}`, message: `Les produits confiés à ${c?.name || 'un vendeur'} sont revenus en stock.` });
    }

    if (op === 'cash_move' && b.direction === 'out') {
      const amt = Math.abs(n(b.amount));
      const a = await one('SELECT name FROM accounts WHERE id=$1', [b.account_id]);
      await alert(user, { kind: 'caisse', level: amt >= BIG_CASH ? 'attention' : 'info', mod: 'caisse', title: `Sortie d'argent : ${F(amt)} de ${a?.name || 'la caisse'}`, message: `${b.category || 'Divers'}${b.label ? ` — ${b.label}` : ''}` });
    }
    if (op === 'cash_transfer') {
      const [fa, ta] = await Promise.all([one('SELECT name FROM accounts WHERE id=$1', [b.from]), one('SELECT name FROM accounts WHERE id=$1', [b.to])]);
      await alert(user, { kind: 'caisse', level: 'info', mod: 'caisse', title: `Transfert de ${F(b.amount)}`, message: `De ${fa?.name || '?'} vers ${ta?.name || '?'}${b.label ? ` — ${b.label}` : ''}.` });
    }
    if (op === 'prod_cancel') {
      const p = await one('SELECT number FROM production_orders WHERE id=$1', [b.id]);
      await alert(user, { kind: 'production', level: 'attention', mod: 'production', title: `Production annulée : ${p?.number || ''}` });
    }
    if (op === 'market_purchase' && b.id && out) {
      await alert(user, { kind: 'modif', level: 'attention', mod: 'achats', title: `Achat modifié : ${out.number}`, message: `Nouveau total ${F(out.total)} (${out.count} article(s)). Le stock et la caisse ont été corrigés.` });
    }
    if (op === 'purchase_cancel' && out) {
      await alert(user, { kind: 'annulation', level: 'attention', mod: 'achats', title: `Achat annulé : ${out.number}`, message: 'Les articles sont sortis du stock et l\'argent est revenu dans la caisse.' });
    }
    if (op === 'prod_edit' && out) {
      await alert(user, { kind: 'production', level: 'attention', mod: 'production', title: b.remove ? `Production supprimée : ${out.number}` : `Production modifiée : ${out.number}`,
        message: b.remove ? 'Les jus sont sortis du stock et les matières sont revenues au magasin.' : `${(out.orders || []).map((o) => `${N(o.qty)} ${o.product}`).join(', ')} — stock, caisse et coûts recalculés.` });
    }
    if (op === 'payroll_pay') await alert(user, { kind: 'paie', level: 'info', mod: 'rh', title: 'Salaire payé' });
    if (op === 'sale_edit' && out?.id) {
      const F = (v) => `${Math.round(v).toLocaleString('fr-FR')} F`;
      const bits = [];
      if (Math.abs(out.total - out.old_total) > 0.5) bits.push(`total ${F(out.old_total)} → ${F(out.total)}`);
      if (Math.abs(out.paid - out.old_paid) > 0.5) bits.push(`payé ${F(out.old_paid)} → ${F(out.paid)}`);
      if (String(out.old_date).slice(0, 10) !== String(out.date).slice(0, 10)) bits.push(`date changée`);
      await alert(user, { kind: 'modif', level: out.total < out.old_total - 0.5 || out.paid < out.old_paid - 0.5 ? 'attention' : 'info', mod: 'ventes', title: `Vente ${out.number} corrigée`, message: bits.join(' · ') || 'produits ou client modifiés' });
    }
    if (op === 'payment_date' && out?.ok) {
      const od = out.old_date instanceof Date ? out.old_date.toISOString().slice(0, 10) : String(out.old_date).slice(0, 10);
      if (od !== b.date) await alert(user, { kind: 'caisse', level: 'attention', mod: 'ventes', title: "Date d'encaissement modifiée", message: `${Math.round(out.amount).toLocaleString('fr-FR')} F : du ${od.split('-').reverse().join('/')} au ${String(b.date).split('-').reverse().join('/')}` });
    }
    if (op === 'company_update') await alert(user, { kind: 'acces', level: 'info', mod: 'admin', title: 'Informations de l\'entreprise modifiées' });
  } catch (e) { console.error('gardien op', op, e.message); }
}

// ---------- Après une création / modification / suppression ----------
const DEL_LEVEL = { sales_docs: 'grave', expenses: 'grave', users: 'grave', payments: 'grave', customers: 'attention', items: 'attention', consignments: 'attention', production_orders: 'attention', employees: 'attention' };
const ENT_LABEL = { sales_docs: ['Vente / facture', 'ventes'], expenses: ['Dépense', 'caisse'], users: ['Utilisateur', 'admin'], payments: ['Paiement', 'caisse'], customers: ['Client', 'ventes'], items: ['Article', 'stock'], lots: ['Lot', 'stock'], production_orders: ['Production', 'production'], employees: ['Employé', 'rh'], suppliers: ['Fournisseur', 'achats'], purchase_orders: ['Bon de commande', 'achats'], accounts: ['Compte de caisse', 'caisse'] };

export async function guardCrud(user, action, entity, row, existing, body = {}) {
  try {
    const [label, mod] = ENT_LABEL[entity] || [entity, null];
    const name = row?.number || row?.name || row?.label || existing?.number || existing?.name || existing?.label || '';
    if (action === 'suppression') {
      const extra = existing?.amount != null ? ` — ${F(existing.amount)}` : existing?.total != null ? ` — ${F(existing.total)}` : '';
      await alert(user, { kind: 'suppression', level: DEL_LEVEL[entity] || 'info', mod, title: `${label} supprimé(e) : ${name}${extra}` });
      return;
    }
    if (entity === 'expenses') {
      if (action === 'création') {
        if (n(row.amount) >= BIG_CASH) await alert(user, { kind: 'caisse', level: 'info', mod, title: `Grosse dépense : ${F(row.amount)}`, message: `${row.category || ''} — ${row.label || ''}` });
        await backdated(user, 'expense', row.date, `Dépense « ${row.label || ''} »`, mod);
      } else if (existing) {
        if (Math.abs(n(existing.amount) - n(row.amount)) > 0.5) {
          await alert(user, { kind: 'modif', level: 'attention', mod, title: `Dépense modifiée : ${F(existing.amount)} → ${F(row.amount)}`, message: `« ${row.label || ''} » du ${String(row.date).slice(0, 10).split('-').reverse().join('/')}.` });
        }
        if (existing.date !== row.date) await backdated(user, 'expense', row.date, `Dépense « ${row.label || ''} »`, mod);
      }
    }
    if (entity === 'items' && action === 'modification' && existing) {
      if (n(existing.sale_price) > 0 && n(row.sale_price) < n(existing.sale_price) - 0.5) {
        await alert(user, { kind: 'prix', level: 'attention', mod, title: `Prix de vente baissé : ${row.name}`, message: `${F(existing.sale_price)} → ${F(row.sale_price)}.` });
      }
    }
    if (entity === 'users') {
      if (action === 'création') {
        await alert(user, { kind: 'acces', level: 'attention', mod, title: `Nouvel utilisateur : ${row.name}`, message: `Rôle : ${row.role}. Il peut maintenant se connecter.` });
      } else if (existing) {
        const ch = [];
        if (existing.role !== row.role) ch.push(`rôle ${existing.role} → ${row.role}`);
        if (existing.active !== row.active) ch.push(row.active ? 'compte réactivé' : 'compte désactivé');
        if (body.password) ch.push('mot de passe réinitialisé');
        if (ch.length) await alert(user, { kind: 'acces', level: 'attention', mod, title: `Accès modifié : ${row.name}`, message: ch.join(', ') + '.' });
      }
    }
  } catch (e) { console.error('gardien crud', entity, e.message); }
}

// ---------- Contrôles réguliers (lancés à l'ouverture du Gardien / de la cloche) ----------
export async function guardChecks(cid) {
  try {
    const day = todayStr();
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    // Résumé de la veille
    const k = `resume-${cid}-${y}`;
    if (!(await one('SELECT 1 FROM guardian_alerts WHERE key=$1', [k]))) {
      const s = await one(`SELECT
          (SELECT COALESCE(SUM(total),0) FROM sales_docs WHERE company_id=$1 AND type='facture' AND date=$2 AND status NOT IN ('brouillon','annule')) AS ventes,
          (SELECT COUNT(*) FROM sales_docs WHERE company_id=$1 AND type='facture' AND date=$2 AND status NOT IN ('brouillon','annule')) AS nb,
          (SELECT COALESCE(SUM(amount),0) FROM payments WHERE company_id=$1 AND direction='in' AND date=$2) AS recu,
          (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE company_id=$1 AND date=$2) AS depenses,
          (SELECT COUNT(*) FROM guardian_alerts WHERE company_id=$1 AND created_at::date=$2 AND level IN ('grave','attention')) AS alertes`, [cid, y]);
      if (n(s.ventes) || n(s.recu) || n(s.depenses) || n(s.alertes)) {
        await alert(null, { cid, kind: 'resume', level: 'info', mod: 'dashboard', key: k, title: `Résumé d'hier : ${F(s.ventes)} de ventes`,
          message: `${s.nb} vente(s) · argent reçu ${F(s.recu)} · dépenses ${F(s.depenses)} · ${s.alertes} alerte(s) importante(s).` });
      }
    }
    // Vendeurs pas encore revenus régler leur dépôt
    const deps = await q(`SELECT c.id,c.number,c.date,cu.name FROM consignments c LEFT JOIN customers cu ON cu.id=c.customer_id
      WHERE c.company_id=$1 AND c.status='ouvert' AND c.date < current_date - 1`, [cid]);
    for (const d of deps) {
      await alert(null, { cid, kind: 'vendeur', level: 'attention', mod: 'ventes', key: `depot-${d.id}`, title: `${d.name || 'Un vendeur'} n'a pas encore réglé son dépôt`,
        message: `Dépôt ${d.number} du ${String(d.date).split('-').reverse().join('/')} : retours et argent pas encore enregistrés.` });
    }
    // Compte de caisse dans le rouge (erreur de saisie ou argent manquant)
    const neg = await q(`SELECT a.id,a.name, a.initial_balance+COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.account_id=a.id),0) AS b
      FROM accounts a WHERE a.company_id=$1 AND a.active`, [cid]);
    for (const a of neg.filter((x) => n(x.b) < -0.5)) {
      await alert(null, { cid, kind: 'caisse', level: 'grave', mod: 'caisse', key: `neg-${a.id}-${day}`, title: `Solde négatif : ${a.name} (${F(a.b)})`,
        message: 'Plus d\'argent est sorti que ce qui est entré : une recette n\'a pas été enregistrée ou une sortie est en trop.' });
    }
  } catch (e) { console.error('gardien checks', e.message); }
}

// Connexions : tentatives échouées et heures inhabituelles
export async function guardLogin(u, ok) {
  try {
    const user = { uid: u.id, cid: u.company_id, name: u.name };
    if (!ok) {
      await q("INSERT INTO audit_logs (company_id,user_id,user_name,action,entity,entity_id) VALUES ($1,$2,$3,'connexion échouée','users',$4)", [u.company_id, u.id, u.name, String(u.id)]);
      const c = await one("SELECT COUNT(*) AS n FROM audit_logs WHERE user_id=$1 AND action='connexion échouée' AND created_at > now() - interval '15 minutes'", [u.id]);
      if (n(c.n) >= 3) {
        const slot = Math.floor(Date.now() / 900000);
        await alert(user, { kind: 'acces', level: 'attention', mod: 'admin', key: `fail-${u.id}-${slot}`, title: `${n(c.n)} mauvais mots de passe pour ${u.name}`, message: 'Quelqu\'un essaie peut-être d\'entrer avec ce compte.' });
      }
      return;
    }
    const h = new Date().getUTCHours(); // Dakar = UTC
    if (h >= 22 || h < 5) await alert(user, { kind: 'acces', level: 'info', mod: 'admin', title: `Connexion la nuit : ${u.name}`, message: `À ${String(h).padStart(2, '0')} h ${String(new Date().getUTCMinutes()).padStart(2, '0')}.` });
  } catch (e) { console.error('gardien login', e.message); }
}
