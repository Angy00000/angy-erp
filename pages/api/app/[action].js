import { handler, fail, n } from '../../../lib/api';
import { q, one } from '../../../lib/db';
import { can } from '../../../lib/perms';

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

  if (action === 'alerts') {
    const out = [];
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
