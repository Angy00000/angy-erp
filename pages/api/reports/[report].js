import { handler, fail, requireModule, n } from '../../../lib/api';
import { q, one } from '../../../lib/db';
import { can } from '../../../lib/perms';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';

const SALES_OK = "d.type='facture' AND d.status IN ('valide','partiel','paye')";

// Lots issus d'une production (y compris les parties de lot transférées vers un autre entrepôt)
const PROD_LOTS = `SELECT l.id AS lot_id, l.source_id AS po_id FROM lots l WHERE l.company_id=$1 AND l.source_type='production_orders'
  UNION ALL SELECT t.id, p.source_id FROM lots t JOIN lots p ON p.id=t.source_id AND p.source_type='production_orders' WHERE t.company_id=$1 AND t.source_type='transfert'`;
// Prix de vente net par unité pour la ligne de l'article dans la facture (remises de ligne et globale incluses)
const NET_PRICE = `COALESCE((SELECT SUM(x.total)/NULLIF(SUM(x.qty),0) FROM sales_lines x WHERE x.doc_id=d.id AND x.item_id=m.item_id),0)
  * CASE WHEN d.subtotal>0 THEN d.total/d.subtotal ELSE 1 END`;

async function profitRows(cid, where, params) {
  const rows = await q(`WITH pl AS (${PROD_LOTS}),
    sold AS (SELECT pl.po_id, SUM(-m.qty) AS qty, SUM(-m.qty * ${NET_PRICE}) AS revenue
      FROM stock_movements m JOIN pl ON pl.lot_id=m.lot_id JOIN sales_docs d ON d.id=m.ref_id AND d.status<>'annule'
      WHERE m.company_id=$1 AND m.type='vente' AND m.ref_type='sales_docs' GROUP BY pl.po_id),
    lost AS (SELECT pl.po_id, SUM(-m.qty) AS qty FROM stock_movements m JOIN pl ON pl.lot_id=m.lot_id
      WHERE m.company_id=$1 AND m.type IN ('perte','casse','peremption','echantillon','don') GROUP BY pl.po_id),
    rem AS (SELECT pl.po_id, SUM(l.qty) AS qty FROM pl JOIN lots l ON l.id=pl.lot_id GROUP BY pl.po_id),
    ex AS (SELECT production_id AS po_id, SUM(amount) AS amount FROM expenses WHERE company_id=$1 AND production_id IS NOT NULL GROUP BY 1)
    SELECT po.id, po.number, po.lot_number, po.finished_at::date::text AS date, po.produced_qty, po.rejected_qty, po.team,
      po.material_cost, po.labor_cost, po.overhead_cost, po.expense_cost, po.total_cost, po.volume_l, i.name AS product, i.unit, i.unit_volume, i.sale_price,
      COALESCE(ex.amount,0) AS direct_expenses, COALESCE(sold.qty,0) AS sold_qty, COALESCE(sold.revenue,0) AS revenue,
      COALESCE(lost.qty,0) AS lost_qty, COALESCE(rem.qty,0) AS remaining_qty
    FROM production_orders po JOIN items i ON i.id=po.product_id
    LEFT JOIN sold ON sold.po_id=po.id LEFT JOIN lost ON lost.po_id=po.id LEFT JOIN rem ON rem.po_id=po.id LEFT JOIN ex ON ex.po_id=po.id
    WHERE po.company_id=$1 AND po.status='termine' AND ${where} ORDER BY po.finished_at DESC`, [cid, ...params]);
  return rows.map((r) => {
    const cost = n(r.total_cost) + n(r.direct_expenses);
    const unit = n(r.produced_qty) ? cost / n(r.produced_qty) : 0;
    const profit = n(r.revenue) - n(r.sold_qty) * unit;
    const remaining_value = n(r.remaining_qty) * n(r.sale_price);
    const liters = n(r.volume_l) || n(r.produced_qty) * n(r.unit_volume);
    const projected = n(r.revenue) + remaining_value - cost;
    return {
      ...r, real_cost: cost, real_unit_cost: unit, profit, remaining_value, projected_profit: projected, liters, liter_cost: liters ? cost / liters : null,
      sold_pct: n(r.produced_qty) ? (n(r.sold_qty) / n(r.produced_qty)) * 100 : 0,
      margin_pct: n(r.revenue) ? (profit / n(r.revenue)) * 100 : 0,
      recovered: n(r.revenue) >= cost,
    };
  });
}

const REPORTS = {
  dashboard: [null, async (cid, qs, user) => {
    const t = today(), m = monthStart();
    const out = { role: user.role };
    const show = (mod) => can(user.role, mod);
    if (show('admin')) {
      out.setup = await one(`SELECT
        (SELECT COUNT(*) FROM companies WHERE id=$1 AND (phone IS NOT NULL OR ninea IS NOT NULL)) AS company,
        (SELECT COUNT(*) FROM items WHERE company_id=$1 AND type IN ('mp','emballage')) AS materials,
        (SELECT COUNT(*) FROM items WHERE company_id=$1 AND type='pf') AS products,
        (SELECT COUNT(*) FROM recipes WHERE company_id=$1) AS recipes,
        (SELECT COUNT(*) FROM lots WHERE company_id=$1) AS stock,
        (SELECT COUNT(*) FROM suppliers WHERE company_id=$1) AS suppliers,
        (SELECT COUNT(*) FROM users WHERE company_id=$1) AS users,
        (SELECT COUNT(*) FROM production_orders WHERE company_id=$1) AS productions`, [cid]);
    }
    if (show('ventes') || show('caisse')) {
      out.sales = await one(`SELECT
        COALESCE(SUM(total) FILTER (WHERE date=$2),0) AS today,
        COALESCE(COUNT(*) FILTER (WHERE date=$2),0) AS today_count,
        COALESCE(SUM(total) FILTER (WHERE date>=$3),0) AS month,
        COALESCE(SUM(total-cost) FILTER (WHERE date>=$3),0) AS month_margin,
        COALESCE(SUM(total-paid),0) AS receivables
        FROM sales_docs d WHERE company_id=$1 AND ${SALES_OK}`, [cid, t, m]);
      out.daily = await q(`SELECT g::date::text AS day, COALESCE(SUM(d.total),0) AS total, COALESCE(SUM(d.total-d.cost),0) AS margin
        FROM generate_series(current_date-29, current_date, '1 day') g
        LEFT JOIN sales_docs d ON d.date=g::date AND d.company_id=$1 AND ${SALES_OK} GROUP BY g ORDER BY g`, [cid]);
      out.top = await q(`SELECT i.name, SUM(sl.qty) AS qty, SUM(sl.total) AS total FROM sales_lines sl
        JOIN sales_docs d ON d.id=sl.doc_id JOIN items i ON i.id=sl.item_id
        WHERE d.company_id=$1 AND ${SALES_OK} AND d.date>=$2 GROUP BY i.name ORDER BY total DESC LIMIT 6`, [cid, m]);
    }
    if (show('caisse')) {
      out.cash = await q(`SELECT a.id,a.name,a.type, a.initial_balance+COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.account_id=a.id),0) AS balance
        FROM accounts a WHERE a.company_id=$1 AND a.active ORDER BY a.id`, [cid]);
      out.month_expenses = (await one('SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE company_id=$1 AND date>=$2', [cid, m])).s;
    }
    if (show('stock') || show('production')) {
      out.stock = await one(`SELECT COALESCE(SUM(l.qty*l.unit_cost),0) AS value,
        COUNT(DISTINCT l.item_id) FILTER (WHERE l.qty>0) AS items FROM lots l WHERE l.company_id=$1 AND l.status='ok'`, [cid]);
      out.low = await q(`SELECT * FROM (SELECT i.id,i.name,i.unit,i.min_stock, COALESCE((SELECT SUM(qty) FROM lots l WHERE l.item_id=i.id AND l.status='ok'),0) AS stock
        FROM items i WHERE i.company_id=$1 AND i.active AND i.type<>'service' AND i.min_stock>0) x WHERE stock<min_stock ORDER BY stock/NULLIF(min_stock,0) LIMIT 10`, [cid]);
      out.expiring = await q(`SELECT l.id,l.lot_number,l.qty,l.expiry_date,i.name,i.unit FROM lots l JOIN items i ON i.id=l.item_id
        WHERE l.company_id=$1 AND l.qty>0 AND l.status='ok' AND l.expiry_date IS NOT NULL AND l.expiry_date<=current_date+30 ORDER BY l.expiry_date LIMIT 10`, [cid]);
    }
    if (show('production')) {
      out.production = await q(`SELECT po.id,po.number,po.status,po.planned_qty,po.planned_date,i.name AS product_name FROM production_orders po
        LEFT JOIN items i ON i.id=po.product_id WHERE po.company_id=$1 AND po.status IN ('planifie','en_cours') ORDER BY po.planned_date NULLS LAST LIMIT 8`, [cid]);
      out.prod_month = await one(`SELECT COALESCE(SUM(produced_qty),0) AS produced, COALESCE(SUM(rejected_qty),0) AS rejected, COUNT(*) AS orders
        FROM production_orders WHERE company_id=$1 AND status='termine' AND finished_at>=$2`, [cid, m]);
    }
    if (show('qualite')) {
      out.quality = await one(`SELECT (SELECT COUNT(*) FROM nonconformities WHERE company_id=$1 AND status<>'cloturee') AS open_nc,
        (SELECT COUNT(*) FROM lots WHERE company_id=$1 AND status IN ('quarantaine','bloque') AND qty>0) AS blocked_lots,
        (SELECT COUNT(*) FROM quality_controls WHERE company_id=$1 AND date>=$2) AS controls,
        (SELECT COUNT(*) FROM quality_controls WHERE company_id=$1 AND date>=$2 AND result='non_conforme') AS nok`, [cid, m]);
    }
    if (show('achats')) {
      out.payables = (await one(`SELECT COALESCE(SUM(pl.received_qty*pl.unit_price),0) - COALESCE((SELECT SUM(amount) FROM payments WHERE company_id=$1 AND party_type='supplier'),0) AS s
        FROM purchase_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE po.company_id=$1 AND po.status<>'annule'`, [cid])).s;
    }
    return out;
  }],

  pnl: ['rapports', async (cid, qs) => {
    const from = qs.from || monthStart(), to = qs.to || today();
    const s = await one(`SELECT COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(cost),0) AS cogs, COUNT(*) AS invoices FROM sales_docs d
      WHERE company_id=$1 AND ${SALES_OK} AND date BETWEEN $2 AND $3`, [cid, from, to]);
    const expenses = await q(`SELECT COALESCE(category,'Divers') AS category, SUM(amount) AS total FROM expenses WHERE company_id=$1 AND date BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 2 DESC`, [cid, from, to]);
    const salaries = (await one(`SELECT COALESCE(SUM(net),0) AS s FROM payrolls WHERE company_id=$1 AND status='paye' AND paid_at BETWEEN $2 AND $3`, [cid, from, to])).s;
    const losses = (await one(`SELECT COALESCE(-SUM(qty*unit_cost),0) AS s FROM stock_movements WHERE company_id=$1 AND type IN ('perte','casse','peremption') AND created_at::date BETWEEN $2 AND $3`, [cid, from, to])).s;
    const exp = expenses.reduce((a, e) => a + n(e.total), 0);
    const gross = n(s.revenue) - n(s.cogs);
    return { from, to, ...s, gross, expenses, expenses_total: exp, salaries, losses, net: gross - exp - n(salaries) - n(losses) };
  }],

  sales: [['rapports', 'ventes'], async (cid, qs) => {
    const from = qs.from || monthStart(), to = qs.to || today();
    const p = [cid, from, to];
    const w = `d.company_id=$1 AND ${SALES_OK} AND d.date BETWEEN $2 AND $3`;
    return {
      from, to,
      totals: await one(`SELECT COALESCE(SUM(total),0) AS total, COALESCE(SUM(cost),0) AS cost, COALESCE(SUM(paid),0) AS paid, COUNT(*) AS count FROM sales_docs d WHERE ${w}`, p),
      by_item: await q(`SELECT i.name, i.unit, SUM(sl.qty) AS qty, SUM(sl.total) AS total, SUM(sl.qty*sl.unit_cost) AS cost FROM sales_lines sl JOIN sales_docs d ON d.id=sl.doc_id JOIN items i ON i.id=sl.item_id WHERE ${w} GROUP BY i.name,i.unit ORDER BY total DESC`, p),
      by_customer: await q(`SELECT COALESCE(c.name,'—') AS name, COUNT(*) AS count, SUM(d.total) AS total, SUM(d.total-d.paid) AS due FROM sales_docs d LEFT JOIN customers c ON c.id=d.customer_id WHERE ${w} GROUP BY 1 ORDER BY total DESC`, p),
      by_channel: await q(`SELECT COALESCE(channel,'—') AS name, COUNT(*) AS count, SUM(total) AS total FROM sales_docs d WHERE ${w} GROUP BY 1 ORDER BY total DESC`, p),
      by_day: await q(`SELECT date::text AS day, SUM(total) AS total FROM sales_docs d WHERE ${w} GROUP BY date ORDER BY date`, p),
    };
  }],

  stock: [['rapports', 'stock'], async (cid) => ({
    items: await q(`SELECT i.id,i.code,i.name,i.type,i.unit,i.min_stock,i.cost_price,i.sale_price,c.name AS category,
      COALESCE(SUM(l.qty) FILTER (WHERE l.status='ok'),0) AS stock,
      COALESCE(SUM(l.qty*l.unit_cost) FILTER (WHERE l.status='ok'),0) AS value,
      COALESCE(SUM(l.qty) FILTER (WHERE l.status<>'ok'),0) AS blocked,
      MIN(l.expiry_date) FILTER (WHERE l.qty>0) AS next_expiry
      FROM items i LEFT JOIN lots l ON l.item_id=i.id AND l.qty>0 LEFT JOIN categories c ON c.id=i.category_id
      WHERE i.company_id=$1 AND i.type<>'service' GROUP BY i.id,c.name ORDER BY i.type,i.name`, [cid]),
  })],

  production: [['rapports', 'production'], async (cid, qs) => {
    const from = qs.from || monthStart(), to = qs.to || today();
    return {
      from, to,
      orders: await q(`SELECT po.number,po.lot_number,po.produced_qty,po.rejected_qty,po.planned_qty,po.material_cost,po.labor_cost,po.overhead_cost,po.total_cost,po.unit_cost,po.finished_at::date::text AS date,i.name AS product,i.unit,i.sale_price
        FROM production_orders po LEFT JOIN items i ON i.id=po.product_id WHERE po.company_id=$1 AND po.status='termine' AND po.finished_at::date BETWEEN $2 AND $3 ORDER BY po.finished_at`, [cid, from, to]),
      by_product: await q(`SELECT i.name,i.unit, SUM(po.produced_qty) AS produced, SUM(po.rejected_qty) AS rejected, SUM(po.total_cost) AS cost, SUM(po.total_cost)/NULLIF(SUM(po.produced_qty),0) AS avg_unit_cost, MAX(i.sale_price) AS sale_price
        FROM production_orders po JOIN items i ON i.id=po.product_id WHERE po.company_id=$1 AND po.status='termine' AND po.finished_at::date BETWEEN $2 AND $3 GROUP BY i.name,i.unit ORDER BY produced DESC`, [cid, from, to]),
      consumption: await q(`SELECT i.name,i.unit, SUM(pc.qty) AS qty, SUM(pc.qty*pc.unit_cost) AS cost FROM production_consumptions pc JOIN production_orders po ON po.id=pc.production_id JOIN items i ON i.id=pc.item_id
        WHERE po.company_id=$1 AND po.finished_at::date BETWEEN $2 AND $3 GROUP BY i.name,i.unit ORDER BY cost DESC`, [cid, from, to]),
    };
  }],

  balances: [['rapports', 'ventes', 'achats', 'caisse'], async (cid) => ({
    customers: await q(`SELECT c.id,c.name,c.phone, SUM(d.total-d.paid) AS due, MIN(d.date) FILTER (WHERE d.total>d.paid) AS oldest FROM customers c JOIN sales_docs d ON d.customer_id=c.id
      WHERE c.company_id=$1 AND d.type='facture' AND d.status IN ('valide','partiel') GROUP BY c.id HAVING SUM(d.total-d.paid)>0 ORDER BY due DESC`, [cid]),
    suppliers: await q(`SELECT * FROM (SELECT s.id,s.name,s.phone,
      COALESCE((SELECT SUM(pl.received_qty*pl.unit_price) FROM purchase_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE po.supplier_id=s.id AND po.status<>'annule'),0)
      - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.party_type='supplier' AND p.party_id=s.id),0) AS due FROM suppliers s WHERE s.company_id=$1) x WHERE due>0 ORDER BY due DESC`, [cid]),
  })],

  cash: [['rapports', 'caisse'], async (cid, qs) => {
    const from = qs.from || monthStart(), to = qs.to || today();
    return {
      from, to,
      accounts: await q(`SELECT a.id,a.name,
        a.initial_balance+COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.account_id=a.id AND t.date<$2),0) AS opening,
        COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.account_id=a.id AND t.date BETWEEN $2 AND $3 AND amount>0),0) AS inflow,
        COALESCE((SELECT -SUM(amount) FROM cash_transactions t WHERE t.account_id=a.id AND t.date BETWEEN $2 AND $3 AND amount<0),0) AS outflow,
        a.initial_balance+COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.account_id=a.id AND t.date<=$3),0) AS closing
        FROM accounts a WHERE a.company_id=$1 ORDER BY a.id`, [cid, from, to]),
      by_category: await q(`SELECT COALESCE(category,'—') AS category, SUM(amount) FILTER (WHERE amount>0) AS inflow, -SUM(amount) FILTER (WHERE amount<0) AS outflow
        FROM cash_transactions WHERE company_id=$1 AND date BETWEEN $2 AND $3 AND COALESCE(category,'')<>'Transfert' GROUP BY 1 ORDER BY 1`, [cid, from, to]),
    };
  }],

  quality: [['rapports', 'qualite'], async (cid, qs) => {
    const from = qs.from || monthStart(), to = qs.to || today();
    return {
      from, to,
      controls: await q(`SELECT type, COUNT(*) AS total, COUNT(*) FILTER (WHERE result='conforme') AS ok, COUNT(*) FILTER (WHERE result='non_conforme') AS nok
        FROM quality_controls WHERE company_id=$1 AND date::date BETWEEN $2 AND $3 GROUP BY type ORDER BY type`, [cid, from, to]),
      nc: await q(`SELECT status, severity, COUNT(*) AS count FROM nonconformities WHERE company_id=$1 AND date BETWEEN $2 AND $3 GROUP BY status,severity`, [cid, from, to]),
      overdue: await q(`SELECT number,description,responsible,due_date FROM nonconformities WHERE company_id=$1 AND status<>'cloturee' AND due_date<current_date ORDER BY due_date`, [cid]),
    };
  }],

  // Rentabilité de chaque production (OF terminé) : coûts réels, ventes du lot, bénéfice
  profitability: [['production', 'rapports'], async (cid, qs) => {
    const from = qs.from || today().slice(0, 4) + '-01-01', to = qs.to || today();
    return profitRows(cid, 'po.finished_at::date BETWEEN $2 AND $3', [from, to]).then((rows) => ({ from, to, rows }));
  }],

  prod_detail: [['production', 'rapports'], async (cid, qs) => {
    const id = parseInt(qs.id, 10);
    const [row] = await profitRows(cid, 'po.id=$2', [id]);
    if (!row) fail('Ordre de fabrication introuvable ou non terminé', 404);
    const consumptions = await q(`SELECT i.name, i.unit, i.type, l.lot_number, s.name AS supplier_name, pc.qty, pc.unit_cost, pc.qty*pc.unit_cost AS cost
      FROM production_consumptions pc JOIN items i ON i.id=pc.item_id LEFT JOIN lots l ON l.id=pc.lot_id LEFT JOIN suppliers s ON s.id=l.supplier_id
      WHERE pc.production_id=$1 ORDER BY i.type, i.name`, [id]);
    const expenses = await q('SELECT id,date,category,label,amount FROM expenses WHERE company_id=$1 AND production_id=$2 ORDER BY date', [cid, id]);
    const sales = await q(`WITH pl AS (${PROD_LOTS}) SELECT d.id, d.number, d.date, COALESCE(c.name,'Client comptoir') AS customer, -m.qty AS qty,
        -m.qty * ${NET_PRICE} AS revenue
      FROM stock_movements m JOIN pl ON pl.lot_id=m.lot_id AND pl.po_id=$2
      JOIN sales_docs d ON d.id=m.ref_id AND d.status<>'annule' LEFT JOIN customers c ON c.id=d.customer_id
      WHERE m.company_id=$1 AND m.type='vente' AND m.ref_type='sales_docs' ORDER BY d.date, d.id`, [cid, id]);
    const losses = await q(`WITH pl AS (${PROD_LOTS}) SELECT m.type, m.created_at, -m.qty AS qty, m.note FROM stock_movements m JOIN pl ON pl.lot_id=m.lot_id AND pl.po_id=$2
      WHERE m.company_id=$1 AND m.type IN ('perte','casse','peremption','echantillon','don') ORDER BY m.created_at`, [cid, id]);
    return { ...row, consumptions, expenses, sales, losses };
  }],

  // Calcul des besoins matières (MRP) pour tous les OF planifiés / en cours
  mrp: [['production', 'achats', 'stock'], async (cid) => {
    const rows = await q(`SELECT rl.item_id, i.name, i.unit, i.cost_price, i.min_stock,
        SUM(rl.qty * po.planned_qty / NULLIF(r.yield_qty,0)) AS required,
        COALESCE((SELECT SUM(l.qty) FROM lots l WHERE l.item_id=rl.item_id AND l.status='ok'),0) AS available,
        COALESCE((SELECT SUM(pl.qty-pl.received_qty) FROM purchase_lines pl JOIN purchase_orders o ON o.id=pl.po_id WHERE pl.item_id=rl.item_id AND o.status IN ('brouillon','envoye','partiel')),0) AS on_order,
        string_agg(DISTINCT po.number, ', ') AS orders
      FROM production_orders po JOIN recipes r ON r.id=po.recipe_id JOIN recipe_lines rl ON rl.recipe_id=r.id JOIN items i ON i.id=rl.item_id
      WHERE po.company_id=$1 AND po.status IN ('planifie','en_cours')
      GROUP BY rl.item_id, i.name, i.unit, i.cost_price, i.min_stock ORDER BY i.name`, [cid]);
    return rows.map((r) => ({ ...r, missing: Math.max(0, n(r.required) - n(r.available) - n(r.on_order)) }));
  }],

  trace: [['qualite', 'stock', 'production'], async (cid, qs) => {
    const lot = qs.lot_id
      ? await one('SELECT l.*, i.name AS item_name, i.unit, s.name AS supplier_name FROM lots l JOIN items i ON i.id=l.item_id LEFT JOIN suppliers s ON s.id=l.supplier_id WHERE l.id=$1 AND l.company_id=$2', [qs.lot_id, cid])
      : await one('SELECT l.*, i.name AS item_name, i.unit, s.name AS supplier_name FROM lots l JOIN items i ON i.id=l.item_id LEFT JOIN suppliers s ON s.id=l.supplier_id WHERE l.lot_number ILIKE $1 AND l.company_id=$2 ORDER BY l.id LIMIT 1', [qs.lot_number || '', cid]);
    if (!lot) fail('Lot introuvable', 404);
    // Amont : si lot produit, les lots consommés ; si lot acheté, la commande fournisseur
    let upstream = [], origin = null;
    if (lot.source_type === 'production_orders') {
      origin = await one('SELECT number,finished_at,team,produced_qty,rejected_qty,unit_cost FROM production_orders WHERE id=$1', [lot.source_id]);
      upstream = await q(`SELECT pc.qty,pc.unit_cost,l.id AS lot_id,l.lot_number,l.expiry_date,i.name,i.unit,s.name AS supplier_name FROM production_consumptions pc
        JOIN lots l ON l.id=pc.lot_id JOIN items i ON i.id=pc.item_id LEFT JOIN suppliers s ON s.id=l.supplier_id WHERE pc.production_id=$1`, [lot.source_id]);
    } else if (lot.source_type === 'purchase_orders') {
      origin = await one('SELECT number,date FROM purchase_orders WHERE id=$1', [lot.source_id]);
    }
    // Aval : ventes et productions utilisant ce lot
    const downstream = await q(`SELECT m.type,m.qty,m.created_at,m.ref_type,m.ref_id,
      CASE WHEN m.ref_type='sales_docs' THEN (SELECT d.number||' — '||COALESCE(c.name,'') FROM sales_docs d LEFT JOIN customers c ON c.id=d.customer_id WHERE d.id=m.ref_id)
           WHEN m.ref_type='production_orders' THEN (SELECT po.number||' → lot '||COALESCE(po.lot_number,'') FROM production_orders po WHERE po.id=m.ref_id) ELSE m.note END AS reference
      FROM stock_movements m WHERE m.lot_id=$1 AND m.qty<0 ORDER BY m.created_at`, [lot.id]);
    const controls = await q('SELECT date,type,parameter,value,target,result,controller FROM quality_controls WHERE lot_id=$1 OR (production_id IS NOT NULL AND production_id=$2) ORDER BY date', [lot.id, lot.source_type === 'production_orders' ? lot.source_id : -1]);
    return { lot, origin, upstream, downstream, controls };
  }],
};

export default handler(async (req, res, user) => {
  const r = REPORTS[req.query.report];
  if (!r) fail('Rapport inconnu', 404);
  const [mods, fn] = r;
  if (mods) {
    const list = Array.isArray(mods) ? mods : [mods];
    if (!list.some((m) => can(user.role, m))) fail('Accès refusé pour votre rôle', 403);
  }
  return fn(user.cid, req.query, user);
});
