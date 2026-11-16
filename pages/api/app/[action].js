import { handler, fail, n } from '../../../lib/api';
import { q, one } from '../../../lib/db';
import { can } from '../../../lib/perms';
import { guardChecks } from '../../../lib/guardian';

// Commandes clients en cours + ce qu'il faut produire. Le stock disponible est réservé aux commandes
// dans l'ordre des dates de livraison (la plus proche d'abord).
export async function openOrders(cid) {
  const orders = await q(`SELECT d.id,d.number,d.date,d.due_date,d.total,d.paid,d.advance_used,d.status,d.notes,d.channel,c.name AS customer_name,c.phone AS customer_phone,
      (d.due_date - current_date) AS days
    FROM sales_docs d LEFT JOIN customers c ON c.id=d.customer_id
    WHERE d.company_id=$1 AND d.type='commande' AND d.status IN ('brouillon','valide')
    ORDER BY d.due_date NULLS LAST, d.date, d.id`, [cid]);
  const ids = orders.map((o) => o.id);
  const lines = ids.length ? await q(`SELECT sl.id,sl.doc_id,sl.item_id,sl.description,sl.qty,sl.qty_delivered,sl.unit_price,sl.total,sl.lot_id,i.name,i.unit,i.type,i.unit_volume
    FROM sales_lines sl LEFT JOIN items i ON i.id=sl.item_id WHERE sl.doc_id = ANY($1::int[]) ORDER BY sl.id`, [ids]) : [];
  const itemIds = [...new Set(lines.filter((l) => l.item_id).map((l) => l.item_id))];
  const stocks = itemIds.length ? await q(`SELECT item_id, SUM(qty) AS s FROM lots WHERE status='ok' AND qty>0 AND item_id = ANY($1::int[]) GROUP BY item_id`, [itemIds]) : [];
  const rem = new Map(stocks.map((r) => [r.item_id, n(r.s)]));
  const stockOf = new Map(rem);
  const needs = new Map();
  for (const o of orders) {
    o.lines = lines.filter((l) => l.doc_id === o.id);
    o.delivered_any = o.lines.some((l) => n(l.qty_delivered) > 0);
    o.advance = Math.round((n(o.paid) - n(o.advance_used)) * 100) / 100;
    o.remaining_value = o.lines.reduce((s, l) => s + (n(l.qty) - n(l.qty_delivered)) * n(l.unit_price), 0);
    for (const l of o.lines) {
      l.rest = Math.round((n(l.qty) - n(l.qty_delivered)) * 1000) / 1000;
      if (!l.item_id || l.type === 'service') { l.ready = l.rest; l.missing = 0; continue; }
      const have = rem.get(l.item_id) || 0;
      l.ready = Math.min(have, l.rest);
      l.missing = Math.round((l.rest - l.ready) * 1000) / 1000;
      rem.set(l.item_id, have - l.ready);
      const nd = needs.get(l.item_id) || { item_id: l.item_id, name: l.name, unit: l.unit, unit_volume: n(l.unit_volume), ordered: 0, stock: stockOf.get(l.item_id) || 0, missing: 0, orders: [] };
      nd.ordered += l.rest; nd.missing += l.missing;
      if (l.missing > 0) nd.orders.push(o.number);
      needs.set(l.item_id, nd);
    }
    o.ready = o.lines.every((l) => l.missing <= 0);
    o.can_deliver = o.lines.some((l) => l.ready > 0);
  }
  const list = [...needs.values()].map((x) => ({ ...x, missing: Math.round(x.missing * 1000) / 1000, missing_l: x.unit_volume ? Math.round(x.missing * x.unit_volume * 1000) / 1000 : null }));
  return { orders, needs: list.sort((a, b) => b.missing - a.missing) };
}

// Fonctions transverses de l'application : recherche globale, notifications, annonces, aide
export default handler(async (req, res, user) => {
  const { action } = req.query;
  const cid = user.cid;
  const c = (m) => can(user.role, m);

  if (action === 'search') {
    const s = String(req.query.q || '').trim();
    if (s.length < 2) return [];
    const like = `%${s}%`;
    const out = [];
    const add = (rows, type, mod, label, sub, link) => rows.forEach((r) => out.push({ type, mod, label: label(r), sub: sub(r), link: link ? link(r) : null }));
    if (c('stock') || c('ventes') || c('production') || c('achats')) {
      add(await q('SELECT id,name,code,type,unit FROM items WHERE company_id=$1 AND (name ILIKE $2 OR code ILIKE $2 OR barcode ILIKE $2) ORDER BY name LIMIT 6', [cid, like]),
        'Article', 'stock', (r) => r.name, (r) => [r.code, r.unit].filter(Boolean).join(' · '));
    }
    if (c('ventes')) {
      add(await q('SELECT id,name,phone FROM customers WHERE company_id=$1 AND (name ILIKE $2 OR phone ILIKE $2) ORDER BY name LIMIT 5', [cid, like]), 'Client', 'ventes', (r) => r.name, (r) => r.phone || '');
      add(await q(`SELECT d.id,d.number,d.type,d.total,c.name AS cust FROM sales_docs d LEFT JOIN customers c ON c.id=d.customer_id WHERE d.company_id=$1 AND (d.number ILIKE $2 OR c.name ILIKE $2) ORDER BY d.id DESC LIMIT 5`, [cid, like]),
        'Vente', 'ventes', (r) => r.number, (r) => `${r.cust || 'Client comptoir'} · ${Math.round(r.total).toLocaleString('fr-FR')} F`, (r) => `/print/sales_docs/${r.id}`);
    }
    if (c('achats')) add(await q('SELECT id,name,phone FROM suppliers WHERE company_id=$1 AND (name ILIKE $2 OR phone ILIKE $2) ORDER BY name LIMIT 5', [cid, like]), 'Fournisseur', 'achats', (r) => r.name, (r) => r.phone || '');
    if (c('production')) {
      add(await q(`SELECT po.id,po.number,po.lot_number,i.name FROM production_orders po LEFT JOIN items i ON i.id=po.product_id WHERE po.company_id=$1 AND (po.number ILIKE $2 OR po.lot_number ILIKE $2 OR i.name ILIKE $2) ORDER BY po.id DESC LIMIT 5`, [cid, like]),
        'Production', 'production', (r) => `${r.number} — ${r.name || ''}`, (r) => (r.lot_number ? `Lot ${r.lot_number}` : ''), (r) => `/print/production_orders/${r.id}`);
    }
    if (c('stock') || c('qualite')) add(await q('SELECT l.id,l.lot_number,l.qty,i.name,i.unit FROM lots l JOIN items i ON i.id=l.item_id WHERE l.company_id=$1 AND l.lot_number ILIKE $2 ORDER BY l.id DESC LIMIT 5', [cid, like]),
      'Lot', 'qualite', (r) => `Lot ${r.lot_number}`, (r) => `${r.name} · ${Number(r.qty).toLocaleString('fr-FR')} ${r.unit}`);
    if (c('rh')) add(await q('SELECT id,name,position FROM employees WHERE company_id=$1 AND name ILIKE $2 ORDER BY name LIMIT 5', [cid, like]), 'Employé', 'rh', (r) => r.name, (r) => r.position || '');
    return out;
  }

  // Résumé de la journée, prêt à envoyer sur WhatsApp
  if (action === 'daily') {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : new Date().toISOString().slice(0, 10);
    const co = await one('SELECT name FROM companies WHERE id=$1', [cid]);
    const F = (v) => `${Math.round(Number(v) || 0).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} F`;
    const N = (v) => (Math.round((Number(v) || 0) * 1000) / 1000).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
    const dd = new Date(day + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const out = { date: day, sections: [] };
    const L = [`*${co?.name || 'Résumé'} — résumé du ${dd}*`];
    if (c('ventes') || c('caisse')) {
      const sales = await one(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(total-cost),0) AS margin FROM sales_docs
        WHERE company_id=$1 AND type='facture' AND date=$2 AND status NOT IN ('brouillon','annule')`, [cid, day]);
      const byProd = await q(`SELECT i.name, i.unit, SUM(sl.qty) AS qty, SUM(sl.total) AS total FROM sales_lines sl JOIN sales_docs d ON d.id=sl.doc_id JOIN items i ON i.id=sl.item_id
        WHERE d.company_id=$1 AND d.type='facture' AND d.date=$2 AND d.status NOT IN ('brouillon','annule') GROUP BY i.name, i.unit ORDER BY 4 DESC LIMIT 8`, [cid, day]);
      const pays = await q(`SELECT a.name, SUM(p.amount) AS amount FROM payments p JOIN accounts a ON a.id=p.account_id WHERE p.company_id=$1 AND p.direction='in' AND p.date=$2 GROUP BY a.name ORDER BY 2 DESC`, [cid, day]);
      L.push('', `🛒 *Ventes* : ${F(sales.total)} (${sales.n} vente${Number(sales.n) > 1 ? 's' : ''})${Number(sales.total) > 0 ? ` — marge ${F(sales.margin)}` : ''}`);
      for (const r of byProd) L.push(`  • ${r.name} : ${N(r.qty)} ${r.unit || ''} = ${F(r.total)}`);
      if (pays.length) { L.push(`💰 *Argent reçu* : ${F(pays.reduce((s, x) => s + Number(x.amount), 0))}`); for (const r of pays) L.push(`  • ${r.name} : ${F(r.amount)}`); }
      out.sales = sales;
    }
    if (c('caisse')) {
      const exp = await q(`SELECT category, label, amount FROM expenses WHERE company_id=$1 AND date=$2 ORDER BY amount DESC`, [cid, day]);
      const tot = exp.reduce((s, x) => s + Number(x.amount), 0);
      L.push('', `🧾 *Dépenses* : ${exp.length ? F(tot) : 'aucune'}`); for (const r of exp.slice(0, 6)) L.push(`  • ${r.label || r.category} : ${F(r.amount)}`);
      if (exp.length > 6) L.push(`  • … et ${exp.length - 6} autre(s)`);
      const buy = await one(`SELECT COALESCE(-SUM(amount),0) AS v FROM cash_transactions WHERE company_id=$1 AND date=$2 AND category='Achat matières'`, [cid, day]);
      if (Number(buy.v) > 0) L.push(`🛒 *Achats de matières et emballages* : ${F(buy.v)}`);
      const bal = await q(`SELECT a.name, a.initial_balance+COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.account_id=a.id AND t.date<=$2),0) AS b
        FROM accounts a WHERE a.company_id=$1 AND a.active ORDER BY a.id`, [cid, day]);
      L.push(`🏦 *Soldes en fin de journée* : ${F(bal.reduce((s, x) => s + Number(x.b), 0))}`); for (const r of bal) L.push(`  • ${r.name} : ${F(r.b)}`);
    }
    if (c('production')) {
      const prods = await q(`SELECT i.name, i.unit, SUM(po.produced_qty) AS qty, SUM(COALESCE(po.volume_l,0)) AS liters, SUM(po.total_cost) AS cost,
          SUM(po.produced_qty*i.sale_price) AS value FROM production_orders po JOIN items i ON i.id=po.product_id
        WHERE po.company_id=$1 AND po.status='termine' AND COALESCE(po.finished_at::date, po.planned_date)=$2 GROUP BY i.name, i.unit ORDER BY 1`, [cid, day]);
      if (prods.length) {
        const cost = prods.reduce((s, x) => s + Number(x.cost), 0), value = prods.reduce((s, x) => s + Number(x.value), 0), lit = prods.reduce((s, x) => s + Number(x.liters), 0);
        L.push('', `🏭 *Production* : ${lit ? `${N(lit)} L — ` : ''}coût ${F(cost)}, bénéfice prévu ${F(value - cost)}`);
        for (const r of prods) L.push(`  • ${r.name} : ${N(r.qty)} ${r.unit || ''}`);
      } else L.push('', '🏭 *Production* : aucune ce jour');
    }
    if (c('stock') || c('production') || c('ventes')) {
      const pf = await q(`SELECT i.name, i.unit, COALESCE((SELECT SUM(qty) FROM lots l WHERE l.item_id=i.id AND l.status='ok'),0) AS s FROM items i
        WHERE i.company_id=$1 AND i.active AND i.type='pf' ORDER BY i.name`, [cid]);
      if (pf.length) { L.push('', '📦 *Stock de produits finis*'); for (const r of pf) L.push(`  • ${r.name} : ${N(r.s)} ${r.unit || ''}`); }
      const low = await q(`SELECT * FROM (SELECT i.name,i.unit,i.min_stock, COALESCE((SELECT SUM(qty) FROM lots l WHERE l.item_id=i.id AND l.status='ok'),0) AS s
        FROM items i WHERE i.company_id=$1 AND i.active AND i.min_stock>0) x WHERE s<min_stock ORDER BY name`, [cid]);
      if (low.length) { L.push(`⚠️ *Stock bas* : ${low.map((r) => `${r.name} (${N(r.s)} ${r.unit || ''})`).join(', ')}`); }
    }
    if (c('ventes') || c('production')) {
      const { orders, needs } = await openOrders(cid);
      const soon = orders.filter((o) => o.days !== null && o.days <= 1);
      if (orders.length) {
        L.push('', `📋 *Commandes en cours* : ${orders.length}${soon.length ? ` (dont ${soon.length} à livrer d'ici demain)` : ''}`);
        for (const o of soon.slice(0, 5)) L.push(`  • ${o.number} — ${o.customer_name || 'client'} : ${o.days < 0 ? 'EN RETARD' : o.days === 0 ? "aujourd'hui" : 'demain'}${o.ready ? ' ✅ prête' : ' ❗ à produire'}`);
        const miss = needs.filter((x) => x.missing > 0);
        if (miss.length) L.push(`  À produire : ${miss.map((x) => `${x.name} ${N(x.missing)} ${x.unit || ''}${x.missing_l ? ` (${N(x.missing_l)} L)` : ''}`).join(', ')}`);
      }
    }
    if (c('ventes')) {
      const dep = await one(`SELECT COUNT(*) AS n, COALESCE(SUM((SELECT SUM(qty_out*unit_price) FROM consignment_lines WHERE consignment_id=k.id)),0) AS v FROM consignments k WHERE k.company_id=$1 AND k.status='ouvert'`, [cid]);
      const debt = await one(`SELECT COALESCE(SUM(total-paid),0) AS d FROM sales_docs WHERE company_id=$1 AND type='facture' AND status IN ('valide','partiel')`, [cid]);
      if (Number(dep.n) > 0) L.push('', `🚶 *Chez les vendeurs* : ${F(dep.v)} de produits (${dep.n} dépôt${Number(dep.n) > 1 ? 's' : ''} en cours)`);
      if (Number(debt.d) > 0.5) L.push(`${Number(dep.n) > 0 ? '' : '\n'}📌 *Reste à encaisser (clients et vendeurs)* : ${F(debt.d)}`);
    }
    L.push('', '_Envoyé depuis ANGY ERP_');
    out.text = L.join('\n');
    return out;
  }

  // Clients qui doivent de l'argent (factures validées non soldées)
  if (action === 'debts') {
    if (!c('ventes')) fail('Accès refusé', 403);
    const rows = await q(`SELECT cu.id, cu.name, cu.phone, cu.type, COUNT(d.id) AS invoices, SUM(d.total-d.paid) AS due, MIN(d.date) AS oldest,
        (current_date - MIN(d.date)) AS days, MAX(d.date) AS last_date
      FROM sales_docs d JOIN customers cu ON cu.id=d.customer_id
      WHERE d.company_id=$1 AND d.type='facture' AND d.status IN ('valide','partiel') AND d.total-d.paid>0.5
      GROUP BY cu.id ORDER BY SUM(d.total-d.paid) DESC`, [cid]);
    const inv = rows.length ? await q(`SELECT id, number, date, total, paid, customer_id FROM sales_docs WHERE company_id=$1 AND type='facture' AND status IN ('valide','partiel') AND total-paid>0.5 ORDER BY date, id`, [cid]) : [];
    for (const r of rows) r.list = inv.filter((x) => x.customer_id === r.id);
    return rows;
  }

  if (action === 'depots') {
    if (!c('ventes')) fail('Accès refusé', 403);
    const open = await q(`SELECT k.id,k.number,k.date,k.tier,k.notes,k.customer_id,cu.name AS seller,cu.phone,(current_date-k.date) AS days
      FROM consignments k LEFT JOIN customers cu ON cu.id=k.customer_id WHERE k.company_id=$1 AND k.status='ouvert' ORDER BY k.date, k.id`, [cid]);
    const done = await q(`SELECT k.id,k.number,k.date,k.settled_at,cu.name AS seller,cu.phone,d.id AS sale_id,d.number AS sale_number,COALESCE(d.total,0) AS total,COALESCE(d.paid,0) AS paid,
        (SELECT SUM(qty_returned) FROM consignment_lines WHERE consignment_id=k.id) AS returned,(SELECT SUM(qty_lost) FROM consignment_lines WHERE consignment_id=k.id) AS lost
      FROM consignments k LEFT JOIN customers cu ON cu.id=k.customer_id LEFT JOIN sales_docs d ON d.id=k.sale_id
      WHERE k.company_id=$1 AND k.status='regle' ORDER BY k.settled_at DESC LIMIT 60`, [cid]);
    const ids = open.map((x) => x.id);
    const lines = ids.length ? await q(`SELECT cl.*, i.name, i.unit FROM consignment_lines cl JOIN items i ON i.id=cl.item_id WHERE cl.consignment_id = ANY($1::int[]) ORDER BY cl.id`, [ids]) : [];
    for (const o of open) { o.lines = lines.filter((l) => l.consignment_id === o.id); o.value = o.lines.reduce((s, l) => s + n(l.qty_out) * n(l.unit_price), 0); }
    const debts = await q(`SELECT cu.id, cu.name, cu.phone, SUM(d.total-d.paid) AS due FROM sales_docs d JOIN customers cu ON cu.id=d.customer_id
      WHERE d.company_id=$1 AND d.type='facture' AND d.channel='depot' AND d.status IN ('valide','partiel') GROUP BY cu.id HAVING SUM(d.total-d.paid)>0.5 ORDER BY 4 DESC`, [cid]);
    return { open, done, debts };
  }

  if (action === 'orders') {
    if (!c('ventes') && !c('production')) fail('Accès refusé', 403);
    return openOrders(cid);
  }

  if (action === 'alerts') {
    const out = [];
    if (c('ventes') || c('production')) {
      const { orders, needs } = await openOrders(cid);
      for (const o of orders.filter((x) => x.days !== null && x.days <= 2).slice(0, 5)) {
        const late = o.days < 0;
        out.push({ level: late || !o.ready ? 'red' : 'orange', mod: 'ventes', title: late ? 'Commande en retard' : o.days === 0 ? 'Commande à livrer aujourd\'hui' : `Commande à livrer dans ${o.days} j`,
          text: `${o.number} — ${o.customer_name || 'client'}${o.ready ? ' · prête' : ' · stock insuffisant, à produire'}` });
      }
      if (c('ventes')) {
        const old = await one(`SELECT COUNT(DISTINCT customer_id) AS n, COALESCE(SUM(total-paid),0) AS due FROM sales_docs WHERE company_id=$1 AND type='facture' AND status IN ('valide','partiel') AND total-paid>0.5 AND date < current_date - 30`, [cid]);
        if (Number(old.n) > 0) out.push({ level: 'orange', mod: 'ventes', title: 'Dettes de plus de 30 jours', text: `${old.n} client(s) doivent ${Math.round(old.due).toLocaleString('fr-FR')} F — Ventes & Clients → Dettes clients` });
      }
      for (const nd of needs.filter((x) => x.missing > 0).slice(0, 3)) {
        out.push({ level: 'orange', mod: 'ventes', title: 'À produire pour les commandes', text: `${nd.name} : ${n(nd.missing)} ${nd.unit || ''}${nd.missing_l ? ` (${nd.missing_l} L)` : ''}` });
      }
    }
    if (c('stock') || c('production')) {
      for (const r of await q(`SELECT * FROM (SELECT i.name,i.unit,i.min_stock, COALESCE((SELECT SUM(qty) FROM lots l WHERE l.item_id=i.id AND l.status='ok'),0) AS stock
        FROM items i WHERE i.company_id=$1 AND i.active AND i.min_stock>0) x WHERE stock<min_stock ORDER BY stock LIMIT 10`, [cid]))
        out.push({ level: 'orange', mod: 'stock', title: 'Stock bas', text: `${r.name} : ${n(r.stock)} ${r.unit} (min. ${n(r.min_stock)})` });
      for (const r of await q(`SELECT l.lot_number,l.expiry_date,i.name,(l.expiry_date-current_date) AS d FROM lots l JOIN items i ON i.id=l.item_id
        WHERE l.company_id=$1 AND l.qty>0 AND l.status='ok' AND l.expiry_date IS NOT NULL AND l.expiry_date<=current_date+15 ORDER BY l.expiry_date LIMIT 10`, [cid]))
        out.push({ level: r.d < 0 ? 'red' : 'orange', mod: 'stock', title: r.d < 0 ? 'Lot périmé' : 'Date limite proche', text: `${r.name} · lot ${r.lot_number} ${r.d < 0 ? `périmé depuis ${-r.d} j` : `dans ${r.d} j`}` });
    }
    if (c('qualite')) {
      const nc = await one("SELECT COUNT(*) c FROM nonconformities WHERE company_id=$1 AND status<>'cloturee'", [cid]);
      if (n(nc.c)) out.push({ level: 'red', mod: 'qualite', title: 'Non-conformités', text: `${nc.c} non-conformité(s) à traiter` });
      const ql = await one("SELECT COUNT(*) c FROM lots WHERE company_id=$1 AND status='quarantaine' AND qty>0", [cid]);
      if (n(ql.c)) out.push({ level: 'orange', mod: 'qualite', title: 'Lots en quarantaine', text: `${ql.c} lot(s) attendent une libération` });
    }
    if (c('ventes')) {
      const due = await one(`SELECT COUNT(*) c, COALESCE(SUM(total-paid),0) s FROM sales_docs WHERE company_id=$1 AND type='facture' AND status IN ('valide','partiel') AND due_date < current_date`, [cid]);
      if (n(due.c)) out.push({ level: 'red', mod: 'ventes', title: 'Factures en retard', text: `${due.c} facture(s) échue(s) · ${Math.round(n(due.s)).toLocaleString('fr-FR')} F à encaisser` });
    }
    if (c('rh')) {
      const pr = await one("SELECT COUNT(*) c FROM payrolls WHERE company_id=$1 AND status<>'paye' AND period < to_char(current_date,'YYYY-MM')", [cid]);
      if (n(pr.c)) out.push({ level: 'orange', mod: 'rh', title: 'Salaires', text: `${pr.c} bulletin(s) de paie des mois passés non payés` });
    }
    const replies = await one("SELECT COUNT(*) c FROM support_requests WHERE company_id=$1 AND reply IS NOT NULL AND updated_at > now() - interval '7 days'", [cid]);
    if (n(replies.c)) out.push({ level: 'blue', mod: 'aide', title: 'Angy Company vous a répondu', text: `${replies.c} réponse(s) à vos demandes` });
    if (c('admin')) {
      const co = await one('SELECT status, (sub_end-current_date) AS d FROM companies WHERE id=$1', [cid]);
      if (co.d !== null && co.d <= 7) out.push({ level: co.d < 3 ? 'red' : 'orange', mod: 'aide', title: co.status === 'essai' ? 'Fin de la période d\'essai' : 'Abonnement', text: co.d < 0 ? 'Expiré' : `Se termine dans ${co.d} jour(s)` });
    }
    return out;
  }

  // Le Gardien : alertes sur les actions sensibles (direction uniquement)
  if (action === 'guardian') {
    if (!c('gardien')) fail('Accès refusé pour votre rôle', 403);
    await guardChecks(cid);
    const seen = (await one('SELECT seen_until FROM guardian_seen WHERE user_id=$1', [user.uid]))?.seen_until || '1970-01-01';
    const unread = await one(`SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE level='grave') AS g FROM guardian_alerts
      WHERE company_id=$1 AND created_at > $2 AND level<>'info' AND (actor_id IS DISTINCT FROM $3)`, [cid, seen, user.uid]);
    if (req.query.count) {
      const last = await q(`SELECT id,level,title,message FROM guardian_alerts WHERE company_id=$1 AND created_at > $2 AND level<>'info' AND (actor_id IS DISTINCT FROM $3) ORDER BY id DESC LIMIT 5`, [cid, seen, user.uid]);
      return { unread: Number(unread.n), grave: Number(unread.g), last };
    }
    const days = Math.min(Number(req.query.days) || 30, 365);
    const list = await q(`SELECT id,kind,level,title,message,link_mod,actor_id,actor_name,created_at, created_at > $3 AS new FROM guardian_alerts
      WHERE company_id=$1 AND created_at > now() - ($2::int * interval '1 day') ORDER BY id DESC LIMIT 500`, [cid, days, seen]);
    return { list, unread: Number(unread.n), seen_until: seen };
  }
  if (action === 'guardian_seen') {
    if (!c('gardien')) fail('Accès refusé pour votre rôle', 403);
    if (user.support) return { ok: true };
    await q('INSERT INTO guardian_seen (user_id,seen_until) VALUES ($1,now()) ON CONFLICT (user_id) DO UPDATE SET seen_until=now()', [user.uid]);
    return { ok: true };
  }

  if (action === 'announcements') {
    return q("SELECT id,title,body,level FROM announcements WHERE active AND (ends_at IS NULL OR ends_at >= current_date) ORDER BY created_at DESC LIMIT 3");
  }

  if (action === 'support') {
    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.message || b.message.trim().length < 5) fail('Décrivez votre demande en quelques mots');
      await q('INSERT INTO support_requests (company_id,user_id,user_name,type,message) VALUES ($1,$2,$3,$4,$5)', [cid, user.uid, user.name, b.type || 'question', b.message.trim()]);
      return { ok: true };
    }
    return q('SELECT * FROM support_requests WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100', [cid]);
  }

  fail('Action inconnue', 404);
});
