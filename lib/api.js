import { SignJWT, jwtVerify } from 'jose';
import { can } from './perms';
import { q } from './db';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'angy-erp-dev-secret-change-me');

export async function signToken(payload) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(secret);
}
export async function verifyToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}
const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
export function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', `erp_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${secure}`);
}
export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `erp_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

export function requireModule(user, module) {
  if (module && !can(user.role, module)) fail('Accès refusé pour votre rôle', 403);
}

export function handler(fn, opts = {}) {
  return async (req, res) => {
    try {
      let user = null;
      if (!opts.public) {
        user = await verifyToken(req.cookies?.erp_token);
        if (!user) return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
        requireModule(user, opts.module);
      }
      const out = await fn(req, res, user);
      if (out !== undefined && !res.headersSent) res.status(200).json(out);
    } catch (e) {
      if (!e.status) console.error(e);
      let msg = e.message || 'Erreur';
      if (e.code === '23505') msg = 'Cette valeur existe déjà';
      if (e.code === '23503') msg = 'Élément lié à d\'autres données, suppression impossible';
      res.status(e.status || 400).json({ error: msg });
    }
  };
}

export async function audit(user, action, entity, entityId, data) {
  try {
    await q(
      'INSERT INTO audit_logs (company_id,user_id,user_name,action,entity,entity_id,data) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user.cid, user.uid, user.name, action, entity, entityId == null ? null : String(entityId), data ? JSON.stringify(data) : null]
    );
  } catch (e) {
    console.error('audit', e.message);
  }
}

export async function nextNumber(t, cid, key, prefix) {
  const year = new Date().getFullYear();
  const k = `${key}-${year}`;
  const r = await t.one(
    `INSERT INTO counters (company_id,key,value) VALUES ($1,$2,1)
     ON CONFLICT (company_id,key) DO UPDATE SET value=counters.value+1 RETURNING value`,
    [cid, k]
  );
  return `${prefix}-${year}-${String(r.value).padStart(4, '0')}`;
}

export const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
export const r2 = (v) => Math.round(n(v) * 100) / 100;
