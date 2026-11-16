import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { fail, signToken, setAuthCookie, n } from '../../../lib/api';
import { q, one, tx } from '../../../lib/db';
import { seedCompany } from '../../../lib/seed';

// Console Angy Company : gestion des entreprises clientes de la plateforme.
// Session séparée (cookie pa_token), réservée à l'équipe Angy Company.
const secret = new TextEncoder().encode((process.env.JWT_SECRET || 'angy-erp-dev-secret-change-me') + ':console');
const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
const setPa = (res, tok, age = 86400 * 2) => res.setHeader('Set-Cookie', `pa_token=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`);
const genPassword = () => crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);

async function log(admin, action, companyId, data) {
  await q('INSERT INTO platform_logs (admin_name,action,company_id,data) VALUES ($1,$2,$3,$4)', [admin?.name || null, action, companyId || null, data ? JSON.stringify(data) : null]).catch(() => {});
}

const COMPANY_SELECT = `SELECT c.id, c.name, c.sector, c.phone, c.email, c.address, c.contact_name, c.status, c.sub_end, c.price, c.periodicity, c.admin_notes, c.created_at,
  (c.sub_end - current_date) AS days_left,
  (SELECT email FROM users u WHERE u.company_id=c.id AND u.role='admin' ORDER BY u.id LIMIT 1) AS admin_email,
  (SELECT name FROM users u WHERE u.company_id=c.id AND u.role='admin' ORDER BY u.id LIMIT 1) AS admin_name,
  (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id) AS users,
  (SELECT MAX(last_login) FROM users u WHERE u.company_id=c.id) AS last_login,
  (SELECT COUNT(*) FROM sales_docs d WHERE d.company_id=c.id AND d.status<>'annule') AS sales,
  (SELECT COUNT(*) FROM production_orders p WHERE p.company_id=c.id AND p.status='termine') AS productions,
  (SELECT COUNT(*) FROM items i WHERE i.company_id=c.id) AS items,
  (SELECT COALESCE(SUM(amount),0) FROM subscription_payments s WHERE s.company_id=c.id) AS paid_total
  FROM companies c`;

const monthly = (c) => (c.status === 'actif' ? n(c.price) / ({ mois: 1, trimestre: 3, annee: 12 }[c.periodicity] || 1) : 0);

export default async function consoleApi(req, res) {
  try {
    const { action } = req.query;
    const b = req.body || {};

    if (action === 'login') {
      if (req.method !== 'POST') fail('Méthode non supportée', 405);
      const a = await one('SELECT * FROM platform_admins WHERE email=$1', [String(b.email || '').trim().toLowerCase()]);
      if (!a || !(await bcrypt.compare(String(b.password || ''), a.password_hash))) fail('Email ou mot de passe incorrect', 401);
      await q('UPDATE platform_admins SET last_login=now() WHERE id=$1', [a.id]);
      setPa(res, await new SignJWT({ aid: a.id, name: a.name }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('2d').sign(secret));
      await log(a, 'connexion');
      return res.json({ ok: true });
    }
    if (action === 'logout') { setPa(res, '', 0); return res.json({ ok: true }); }

    let admin;
    try { admin = (await jwtVerify(req.cookies?.pa_token || '', secret)).payload; } catch { fail('Connexion requise', 401); }

    const id = parseInt(b.id ?? req.query.id, 10);
    const getCompany = async () => { const c = await one(`${COMPANY_SELECT} WHERE c.id=$1`, [id]); if (!c) fail('Entreprise introuvable', 404); return c; };

    switch (action) {
      case 'me': return res.json({ admin });

      case 'overview': {
        const companies = await q(`${COMPANY_SELECT} ORDER BY c.created_at DESC`);
        const k = {
          total: companies.length,
          active: companies.filter((c) => c.status === 'actif').length,
          trial: companies.filter((c) => c.status === 'essai').length,
          suspended: companies.filter((c) => c.status === 'suspendu').length,
          users: companies.reduce((s, c) => s + n(c.users), 0),
          mrr: companies.reduce((s, c) => s + monthly(c), 0),
          paid_month: n((await one("SELECT COALESCE(SUM(amount),0) s FROM subscription_payments WHERE date >= date_trunc('month', current_date)")).s),
          paid_total: n((await one('SELECT COALESCE(SUM(amount),0) s FROM subscription_payments')).s),
          requests: n((await one("SELECT COUNT(*) c FROM support_requests WHERE status IN ('nouvelle','en_cours')")).c),
          logins_7d: n((await one("SELECT COUNT(*) c FROM users WHERE last_login > now() - interval '7 days'")).c),
        };
        const alerts = [];
        for (const c of companies) {
          if (c.status === 'suspendu') continue;
          if (c.days_left !== null && c.days_left < 0) alerts.push({ level: 'red', text: `${c.name} : abonnement expiré depuis ${-c.days_left} jour(s)`, id: c.id });
          else if (c.days_left !== null && c.days_left <= 7) alerts.push({ level: 'orange', text: `${c.name} : ${c.status === 'essai' ? 'essai' : 'abonnement'} se termine dans ${c.days_left} jour(s)`, id: c.id });
          if (!c.last_login && c.status !== 'suspendu') alerts.push({ level: 'gray', text: `${c.name} : jamais connecté`, id: c.id });
        }
        const revenue = await q(`SELECT to_char(g, 'YYYY-MM') AS month, COALESCE(SUM(s.amount),0) AS total FROM generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), '1 month') g
          LEFT JOIN subscription_payments s ON date_trunc('month', s.date) = g GROUP BY g ORDER BY g`);
        const recent = await q('SELECT l.*, c.name AS company FROM platform_logs l LEFT JOIN companies c ON c.id=l.company_id ORDER BY l.created_at DESC LIMIT 12');
        return res.json({ k, alerts, companies, revenue, recent });
      }

      case 'companies': return res.json(await q(`${COMPANY_SELECT} ORDER BY c.name`));

      case 'company_create': {
        const email = String(b.admin_email || '').trim().toLowerCase();
        if (!b.name || !b.admin_name || !email) fail('Nom de l\'entreprise, nom et email de l\'administrateur requis');
        if (await one('SELECT id FROM users WHERE email=$1', [email])) fail('Un compte existe déjà avec cet email');
        const password = b.admin_password || genPassword();
        const out = await tx(async (t) => {
          const c = await t.one(`INSERT INTO companies (name,sector,phone,email,address,contact_name,status,sub_end,price,periodicity,admin_notes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [b.name, b.sector || null, b.phone || null, b.email || null, b.address || null, b.admin_name, b.status || 'essai', b.sub_end || null, n(b.price), b.periodicity || 'mois', b.admin_notes || null]);
          const u = await t.one("INSERT INTO users (company_id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,'admin') RETURNING id", [c.id, b.admin_name, email, await bcrypt.hash(password, 10)]);
          await seedCompany(t, { uid: u.id, cid: c.id, role: 'admin', name: b.admin_name }, !!b.demo);
          return c.id;
        });
        await log(admin, 'entreprise créée', out, { name: b.name, email });
        return res.json({ id: out, email, password });
      }

      case 'company_update': {
        const c = await getCompany();
        const f = ['name', 'sector', 'phone', 'email', 'address', 'contact_name', 'status', 'sub_end', 'price', 'periodicity', 'admin_notes'];
        const keys = f.filter((k) => k in b);
        if (keys.length) await q(`UPDATE companies SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1`, [id, ...keys.map((k) => (b[k] === '' ? null : b[k]))]);
        await log(admin, b.status && b.status !== c.status ? `statut → ${b.status}` : 'entreprise modifiée', id, { name: c.name });
        return res.json(await getCompany());
      }

      case 'payment': {
        const c = await getCompany();
        const amount = n(b.amount);
        if (amount <= 0) fail('Montant invalide');
        const newEnd = b.new_end || null;
        await tx(async (t) => {
          await t.q('INSERT INTO subscription_payments (company_id,amount,date,method,period_label,new_end,note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [id, amount, b.date || new Date().toISOString().slice(0, 10), b.method || null, b.period_label || null, newEnd, b.note || null]);
          if (newEnd) await t.q("UPDATE companies SET sub_end=$1, status='actif' WHERE id=$2", [newEnd, id]);
        });
        await log(admin, 'paiement enregistré', id, { name: c.name, amount });
        return res.json(await getCompany());
      }
      case 'payments': return res.json(await q('SELECT s.*, c.name AS company FROM subscription_payments s JOIN companies c ON c.id=s.company_id ORDER BY s.date DESC, s.id DESC LIMIT 300'));

      case 'reset_password': {
        const c = await getCompany();
        const u = await one("SELECT id, email, name FROM users WHERE company_id=$1 AND (id=$2 OR $2 IS NULL) ORDER BY (role='admin') DESC, id LIMIT 1", [id, b.user_id || null]);
        if (!u) fail('Aucun utilisateur');
        const password = b.password || genPassword();
        await q('UPDATE users SET password_hash=$1, active=true WHERE id=$2', [await bcrypt.hash(password, 10), u.id]);
        await log(admin, 'mot de passe réinitialisé', id, { name: c.name, email: u.email });
        return res.json({ email: u.email, name: u.name, password });
      }

      case 'users': return res.json(await q('SELECT id,name,email,role,active,last_login FROM users WHERE company_id=$1 ORDER BY id', [id]));

      case 'impersonate': {
        const c = await getCompany();
        const u = await one("SELECT * FROM users WHERE company_id=$1 ORDER BY (role='admin') DESC, id LIMIT 1", [id]);
        if (!u) fail('Aucun utilisateur');
        setAuthCookie(res, await signToken({ uid: u.id, cid: id, role: 'admin', name: `Support Angy (${admin.name})`, support: true }));
        await log(admin, 'mode support', id, { name: c.name });
        return res.json({ ok: true });
      }

      case 'requests': return res.json(await q(`SELECT r.*, c.name AS company, c.phone AS company_phone FROM support_requests r LEFT JOIN companies c ON c.id=r.company_id
        ORDER BY CASE r.status WHEN 'nouvelle' THEN 0 WHEN 'en_cours' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 300`));
      case 'request_update': {
        await q('UPDATE support_requests SET status=COALESCE($2,status), reply=COALESCE($3,reply), updated_at=now() WHERE id=$1', [id, b.status || null, b.reply ?? null]);
        await log(admin, 'demande traitée', null, { id });
        return res.json({ ok: true });
      }

      case 'announcements': return res.json(await q('SELECT * FROM announcements ORDER BY created_at DESC'));
      case 'announcement_save': {
        if (!b.title) fail('Titre requis');
        if (b.id) await q('UPDATE announcements SET title=$2, body=$3, level=$4, active=$5, ends_at=$6 WHERE id=$1', [b.id, b.title, b.body || null, b.level || 'info', b.active !== false, b.ends_at || null]);
        else await q('INSERT INTO announcements (title,body,level,active,ends_at) VALUES ($1,$2,$3,$4,$5)', [b.title, b.body || null, b.level || 'info', b.active !== false, b.ends_at || null]);
        await log(admin, b.id ? 'annonce modifiée' : 'annonce publiée', null, { title: b.title });
        return res.json({ ok: true });
      }
      case 'announcement_delete': { await q('DELETE FROM announcements WHERE id=$1', [id]); await log(admin, 'annonce supprimée'); return res.json({ ok: true }); }

      case 'logs': return res.json(await q('SELECT l.*, c.name AS company FROM platform_logs l LEFT JOIN companies c ON c.id=l.company_id ORDER BY l.created_at DESC LIMIT 300'));

      case 'password': {
        const a = await one('SELECT * FROM platform_admins WHERE id=$1', [admin.aid]);
        if (!a || !(await bcrypt.compare(String(b.current || ''), a.password_hash))) fail('Mot de passe actuel incorrect');
        if (!b.next || b.next.length < 8) fail('Nouveau mot de passe : 8 caractères minimum');
        await q('UPDATE platform_admins SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(b.next, 10), a.id]);
        await log(admin, 'mot de passe console changé');
        return res.json({ ok: true });
      }

      default: fail('Action inconnue', 404);
    }
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status || 400).json({ error: e.code === '23505' ? 'Cette valeur existe déjà' : e.message || 'Erreur' });
  }
}
