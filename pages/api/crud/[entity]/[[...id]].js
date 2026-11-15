import bcrypt from 'bcryptjs';
import { handler, fail, audit, nextNumber } from '../../../../lib/api';
import { can } from '../../../../lib/perms';
import { ENTITIES } from '../../../../lib/entities';
import { q, one, tx } from '../../../../lib/db';
import { cashTx } from '../../../../lib/stock';

const clean = (v) => (v === '' || v === undefined ? null : v);

function baseSelect(cfg) {
  const alias = cfg.alias || cfg.table;
  return { alias, sql: cfg.select || `SELECT ${alias}.* FROM ${cfg.table} AS ${alias}` };
}

async function fetchOne(cfg, id, cid, t) {
  const { alias, sql } = baseSelect(cfg);
  const run = t ? t.one : one;
  const row = await run(`${sql} WHERE ${alias}.company_id=$1 AND ${alias}.id=$2`, [cid, id]);
  if (!row) return null;
  if (cfg.lines) row.lines = await (t ? t.q : q)(cfg.lines.select, [id]);
  return row;
}

async function saveLines(t, cfg, id, lines) {
  const L = cfg.lines;
  await t.q(`DELETE FROM ${L.table} WHERE ${L.fk}=$1`, [id]);
  const saved = [];
  for (const raw of lines || []) {
    if (!raw || (!raw.item_id && !raw.description)) continue;
    const l = { ...raw };
    if (cfg.lineCompute) Object.assign(l, cfg.lineCompute(l));
    const cols = [...L.fields, ...(cfg.lineCompute ? ['total'] : [])];
    const vals = cols.map((c) => clean(l[c]));
    await t.q(
      `INSERT INTO ${L.table} (${L.fk},${cols.join(',')}) VALUES ($1,${cols.map((_, i) => '$' + (i + 2)).join(',')})`,
      [id, ...vals]
    );
    saved.push(l);
  }
  return saved;
}

async function syncCash(t, cfg, entity, row, user) {
  if (!cfg.cash) return;
  await t.q('DELETE FROM cash_transactions WHERE company_id=$1 AND ref_type=$2 AND ref_id=$3', [user.cid, entity, row.id]);
  const c = cfg.cash(row);
  if (c) await cashTx(t, user, { ...c, ref_type: entity, ref_id: row.id });
}

export default handler(async (req, res, user) => {
  const { entity } = req.query;
  const id = req.query.id ? parseInt(req.query.id[0], 10) : null;
  const cfg = ENTITIES[entity];
  if (!cfg) fail('Ressource inconnue', 404);
  const canWrite = can(user.role, cfg.module);
  const canRead = canWrite || (cfg.readModules || []).some((m) => can(user.role, m));
  if (!canRead) fail('Accès refusé pour votre rôle', 403);
  const cid = user.cid;

  if (req.method === 'GET') {
    if (id) {
      const row = await fetchOne(cfg, id, cid);
      if (!row) fail('Introuvable', 404);
      return row;
    }
    const { alias, sql } = baseSelect(cfg);
    const params = [cid];
    const where = [`${alias}.company_id=$1`];
    const qs = req.query;
    for (const f of cfg.filters || []) {
      if (qs[f] !== undefined && qs[f] !== '') {
        params.push(qs[f] === 'true' ? true : qs[f] === 'false' ? false : qs[f]);
        where.push(`${alias}.${f}=$${params.length}`);
      }
    }
    if (qs.search && cfg.search) {
      params.push(`%${qs.search}%`);
      where.push('(' + cfg.search.map((c) => `${c}::text ILIKE $${params.length}`).join(' OR ') + ')');
    }
    if (cfg.dateCol && qs.from) { params.push(qs.from); where.push(`${cfg.dateCol}>=$${params.length}`); }
    if (cfg.dateCol && qs.to) { params.push(qs.to); where.push(`${cfg.dateCol}<=$${params.length}`); }
    for (const [k, cond] of Object.entries(cfg.extraWhere || {})) if (qs[k]) where.push(cond);
    const limit = Math.min(parseInt(qs.limit || '1000', 10) || 1000, 5000);
    return q(`${sql} WHERE ${where.join(' AND ')} ORDER BY ${cfg.order || alias + '.id DESC'} LIMIT ${limit}`, params);
  }

  if (!canWrite) fail('Lecture seule pour votre rôle', 403);
  if (cfg.readOnly) fail('Ressource en lecture seule', 405);
  const body = req.body || {};

  if (req.method === 'POST' && !id) {
    if (cfg.noCreate) fail('Création non autorisée ici', 405);
    const row = await tx(async (t) => {
      const data = {};
      for (const f of cfg.fields) if (f in body) data[f] = clean(body[f]);
      if (cfg.beforeSave) await cfg.beforeSave(t, data, user, null);
      if (entity === 'users') {
        if (!body.password || body.password.length < 6) fail('Mot de passe de 6 caractères minimum');
        data.email = String(data.email || '').trim().toLowerCase();
        data.password_hash = await bcrypt.hash(body.password, 10);
      }
      if (cfg.numbering) {
        const nb = cfg.numbering(data);
        data.number = await nextNumber(t, cid, nb.key, nb.prefix);
      }
      if (['sales_docs', 'purchase_orders', 'production_orders', 'expenses'].includes(entity)) data.user_id = user.uid;
      const cols = ['company_id', ...Object.keys(data)];
      const vals = [cid, ...Object.values(data)];
      const created = await t.one(
        `INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
        vals
      );
      let lines = [];
      if (cfg.lines) lines = await saveLines(t, cfg, created.id, body.lines);
      if (cfg.compute) {
        const patch = cfg.compute({ ...data }, lines);
        const keys = Object.keys(patch);
        await t.q(`UPDATE ${cfg.table} SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1`, [created.id, ...Object.values(patch)]);
      }
      const full = await fetchOne(cfg, created.id, cid, t);
      await syncCash(t, cfg, entity, full, user);
      return full;
    });
    await audit(user, 'création', entity, row.id, { number: row.number, name: row.name || row.label });
    return row;
  }

  if (!id) fail('Identifiant manquant');
  const existing = await fetchOne(cfg, id, cid);
  if (!existing) fail('Introuvable', 404);

  if (req.method === 'PUT') {
    const lock = cfg.lockedWhen && cfg.lockedWhen(existing);
    if (lock) fail(lock);
    const row = await tx(async (t) => {
      const data = {};
      for (const f of cfg.fields) if (f in body) data[f] = clean(body[f]);
      if (cfg.beforeSave) await cfg.beforeSave(t, data, user, existing);
      if (entity === 'users') {
        if (data.email) data.email = String(data.email).trim().toLowerCase();
        if (body.password) {
          if (body.password.length < 6) fail('Mot de passe de 6 caractères minimum');
          data.password_hash = await bcrypt.hash(body.password, 10);
        }
        if (id === user.uid && (data.role && data.role !== 'admin' || data.active === false)) fail('Vous ne pouvez pas retirer vos propres droits administrateur');
      }
      const keys = Object.keys(data);
      if (keys.length) await t.q(`UPDATE ${cfg.table} SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(',')} WHERE id=$1 AND company_id=$2`, [id, cid, ...Object.values(data)]);
      let lines = existing.lines || [];
      if (cfg.lines && body.lines) lines = await saveLines(t, cfg, id, body.lines);
      if (cfg.compute) {
        const patch = cfg.compute({ ...existing, ...data }, lines);
        const pk = Object.keys(patch);
        await t.q(`UPDATE ${cfg.table} SET ${pk.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1`, [id, ...Object.values(patch)]);
      }
      const full = await fetchOne(cfg, id, cid, t);
      await syncCash(t, cfg, entity, full, user);
      return full;
    });
    await audit(user, 'modification', entity, id, { number: row.number, name: row.name || row.label });
    return row;
  }

  if (req.method === 'DELETE') {
    if (cfg.noDelete) fail('Suppression non autorisée', 405);
    const lock = cfg.lockedWhen && cfg.lockedWhen(existing);
    if (lock && entity !== 'production_orders') fail(lock);
    if (entity === 'production_orders' && existing.status !== 'planifie') fail('Seul un ordre planifié peut être supprimé (annulez-le sinon)');
    if (entity === 'users' && id === user.uid) fail('Vous ne pouvez pas supprimer votre propre compte');
    if (entity === 'lots' && Math.abs(existing.qty) > 1e-9) fail('Un lot avec du stock ne peut pas être supprimé : faites un inventaire à 0 d\'abord');
    await tx(async (t) => {
      if (cfg.cash) await t.q('DELETE FROM cash_transactions WHERE company_id=$1 AND ref_type=$2 AND ref_id=$3', [cid, entity, id]);
      await t.q(`DELETE FROM ${cfg.table} WHERE id=$1 AND company_id=$2`, [id, cid]);
    });
    await audit(user, 'suppression', entity, id, { number: existing.number, name: existing.name || existing.label });
    return { ok: true };
  }
  fail('Méthode non supportée', 405);
});
