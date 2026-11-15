import bcrypt from 'bcryptjs';
import { handler, fail, signToken, verifyToken, setAuthCookie, clearAuthCookie, audit } from '../../../lib/api';
import { q, one, tx } from '../../../lib/db';
import { seedCompany } from '../../../lib/seed';

export default handler(async (req, res) => {
  const { action } = req.query;

  if (action === 'me') {
    const p = await verifyToken(req.cookies?.erp_token);
    if (!p) fail('Non connecté', 401);
    const u = await one('SELECT id,name,email,role,active FROM users WHERE id=$1', [p.uid]);
    if (!u || !u.active) fail('Compte désactivé', 401);
    const company = await one('SELECT * FROM companies WHERE id=$1', [p.cid]);
    return { user: { ...u, cid: p.cid }, company };
  }

  if (action === 'logout') {
    clearAuthCookie(res);
    return { ok: true };
  }

  if (req.method !== 'POST') fail('Méthode non supportée', 405);
  const b = req.body || {};

  if (action === 'login') {
    const email = String(b.email || '').trim().toLowerCase();
    const u = await one('SELECT * FROM users WHERE email=$1', [email]);
    if (!u || !(await bcrypt.compare(String(b.password || ''), u.password_hash))) fail('Email ou mot de passe incorrect', 401);
    if (!u.active) fail('Compte désactivé, contactez votre administrateur', 403);
    await q('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
    const payload = { uid: u.id, cid: u.company_id, role: u.role, name: u.name };
    setAuthCookie(res, await signToken(payload));
    await audit(payload, 'connexion', 'users', u.id);
    return { ok: true };
  }

  if (action === 'signup') {
    const email = String(b.email || '').trim().toLowerCase();
    if (!b.company || !b.name || !email) fail('Remplissez tous les champs');
    if (!b.password || b.password.length < 6) fail('Mot de passe de 6 caractères minimum');
    if (await one('SELECT id FROM users WHERE email=$1', [email])) fail('Un compte existe déjà avec cet email');
    const hash = await bcrypt.hash(b.password, 10);
    const payload = await tx(async (t) => {
      const c = await t.one('INSERT INTO companies (name,sector,phone,address) VALUES ($1,$2,$3,$4) RETURNING id', [b.company, b.sector || null, b.phone || null, b.address || null]);
      const u = await t.one("INSERT INTO users (company_id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,'admin') RETURNING id", [c.id, b.name, email, hash]);
      const p = { uid: u.id, cid: c.id, role: 'admin', name: b.name };
      await seedCompany(t, p, !!b.demo);
      return p;
    });
    setAuthCookie(res, await signToken(payload));
    await audit(payload, 'création entreprise', 'companies', payload.cid);
    return { ok: true };
  }

  fail('Action inconnue', 404);
}, { public: true });
