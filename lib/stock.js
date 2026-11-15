import { fail, n } from './api';

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, days) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
};

export async function getItem(t, cid, id) {
  const it = await t.one('SELECT * FROM items WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid]);
  if (!it) fail('Article introuvable');
  return it;
}

export async function itemStock(t, itemId) {
  const r = await t.one("SELECT COALESCE(SUM(qty),0) AS s FROM lots WHERE item_id=$1 AND status='ok'", [itemId]);
  return n(r.s);
}

async function defaultWarehouse(t, cid) {
  const w = await t.one('SELECT id FROM warehouses WHERE company_id=$1 ORDER BY id LIMIT 1', [cid]);
  return w ? w.id : null;
}

// Entrée en stock : crée un lot, un mouvement et recalcule le coût moyen pondéré (CMUP)
export async function stockIn(t, user, o) {
  const cid = user.cid;
  const qty = n(o.qty);
  if (qty <= 0) fail('Quantité invalide');
  const item = await getItem(t, cid, o.item_id);
  if (item.type === 'service') fail('Un service ne se stocke pas');
  const unitCost = o.unit_cost === undefined || o.unit_cost === null || o.unit_cost === '' ? n(item.cost_price) : n(o.unit_cost);
  const prodDate = o.production_date || today();
  const expiry = o.expiry_date || (item.shelf_life_days ? addDays(prodDate, item.shelf_life_days) : null);
  const stamp = prodDate.replace(/-/g, '').slice(2);
  const lotNumber = (o.lot_number || '').trim() || `L${stamp}-${item.code || item.id}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const wh = o.warehouse_id || (await defaultWarehouse(t, cid));
  const current = await itemStock(t, item.id);

  const lot = await t.one(
    `INSERT INTO lots (company_id,item_id,warehouse_id,lot_number,qty,initial_qty,unit_cost,production_date,expiry_date,supplier_id,status,source_type,source_id)
     VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [cid, item.id, wh, lotNumber, qty, unitCost, prodDate, expiry, o.supplier_id || null, o.status || 'ok', o.ref_type || 'manuel', o.ref_id || null]
  );
  await t.q(
    `INSERT INTO stock_movements (company_id,item_id,lot_id,warehouse_id,type,qty,unit_cost,ref_type,ref_id,note,user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [cid, item.id, lot.id, wh, o.type || 'entree', qty, unitCost, o.ref_type || null, o.ref_id || null, o.note || null, user.uid]
  );
  const base = Math.max(current, 0);
  const newCost = base + qty > 0 ? (base * n(item.cost_price) + qty * unitCost) / (base + qty) : unitCost;
  await t.q('UPDATE items SET cost_price=$1 WHERE id=$2', [newCost, item.id]);
  return lot;
}

// Sortie de stock FEFO (premier expiré, premier sorti)
export async function stockOut(t, user, o) {
  const cid = user.cid;
  let remaining = n(o.qty);
  if (remaining <= 0) fail('Quantité invalide');
  const item = await getItem(t, cid, o.item_id);
  if (item.type === 'service') return { consumed: [], cost: 0 };
  const params = [item.id];
  let where = "item_id=$1 AND qty>0 AND status='ok'";
  if (o.lot_id) {
    params.push(o.lot_id);
    where = 'item_id=$1 AND qty>0 AND id=$2';
  }
  const lots = await t.q(`SELECT * FROM lots WHERE ${where} ORDER BY expiry_date NULLS LAST, created_at, id FOR UPDATE`, params);
  const available = lots.reduce((s, l) => s + n(l.qty), 0);
  if (available + 1e-9 < remaining) {
    fail(`Stock insuffisant pour « ${item.name} » : disponible ${round3(available)} ${item.unit}, demandé ${round3(remaining)}`);
  }
  const consumed = [];
  let cost = 0;
  for (const l of lots) {
    if (remaining <= 1e-9) break;
    const take = Math.min(n(l.qty), remaining);
    await t.q('UPDATE lots SET qty=qty-$1 WHERE id=$2', [take, l.id]);
    await t.q(
      `INSERT INTO stock_movements (company_id,item_id,lot_id,warehouse_id,type,qty,unit_cost,ref_type,ref_id,note,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [cid, item.id, l.id, l.warehouse_id, o.type || 'sortie', -take, n(l.unit_cost), o.ref_type || null, o.ref_id || null, o.note || null, user.uid]
    );
    consumed.push({ lot_id: l.id, lot_number: l.lot_number, qty: take, unit_cost: n(l.unit_cost) });
    cost += take * n(l.unit_cost);
    remaining -= take;
  }
  return { consumed, cost, item };
}

// Remet en stock exactement les quantités sorties d'une référence (annulation)
export async function reverseMovements(t, user, refType, refId) {
  const moves = await t.q('SELECT * FROM stock_movements WHERE company_id=$1 AND ref_type=$2 AND ref_id=$3', [user.cid, refType, refId]);
  for (const m of moves) {
    if (m.lot_id) await t.q('UPDATE lots SET qty=qty-$1 WHERE id=$2', [n(m.qty), m.lot_id]);
    await t.q(
      `INSERT INTO stock_movements (company_id,item_id,lot_id,warehouse_id,type,qty,unit_cost,ref_type,ref_id,note,user_id)
       VALUES ($1,$2,$3,$4,'annulation',$5,$6,$7,$8,'Annulation',$9)`,
      [user.cid, m.item_id, m.lot_id, m.warehouse_id, -n(m.qty), n(m.unit_cost), refType + '_annule', refId, user.uid]
    );
  }
  return moves.length;
}

export async function cashTx(t, user, { account_id, amount, category, label, ref_type, ref_id, date }) {
  if (!account_id) fail('Choisissez un compte de trésorerie');
  const acc = await t.one('SELECT id FROM accounts WHERE id=$1 AND company_id=$2', [account_id, user.cid]);
  if (!acc) fail('Compte introuvable');
  return t.one(
    `INSERT INTO cash_transactions (company_id,account_id,date,amount,category,label,ref_type,ref_id,user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [user.cid, account_id, date || today(), n(amount), category || null, label || null, ref_type || null, ref_id || null, user.uid]
  );
}

const round3 = (v) => Math.round(v * 1000) / 1000;
export { today };
