import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { money, num, date, datetime, today } from '../lib/client';
import { Modal, Form, toast, Tabs } from '../components/ui';
import { Ic } from '../components/modules/Dashboard';
import { waLink, UpdateBanner } from '../components/Chrome';
import { REQ_TYPES, REQ_STATUS } from '../components/modules/Aide';

async function call(action, body, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const r = await fetch(`/api/console/${action}${qs}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Erreur'), { status: r.status });
  return j;
}
const STATUS = { essai: ['Essai', 'amber'], actif: ['Actif', 'green'], suspendu: ['Suspendu', 'red'] };
const PERIOD = { mois: 'par mois', trimestre: 'par trimestre', annee: 'par an' };
const PAY_MODES = { wave: 'Wave', orange_money: 'Orange Money', especes: 'Espèces', virement: 'Virement', autre: 'Autre' };
const addMonths = (iso, m) => { const d = new Date((iso || today()) + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const since = (d) => { if (!d) return 'jamais'; const m = Math.round((Date.now() - Date.parse(d)) / 60000); if (m < 60) return `il y a ${Math.max(1, m)} min`; if (m < 1440) return `il y a ${Math.round(m / 60)} h`; return `il y a ${Math.round(m / 1440)} j`; };

export default function ConsolePage() {
  const [state, setState] = useState('loading');
  const [admin, setAdmin] = useState(null);
  const check = useCallback(() => call('me').then((r) => { setAdmin(r.admin); setState('in'); }).catch(() => setState('out')), []);
  useEffect(() => { check(); }, [check]);
  return (
    <>
      <Head><title>Console Angy Company — ANGY ERP</title></Head>
      {state === 'loading' && <div className="spinner" style={{ paddingTop: 120 }}>Chargement…</div>}
      {state === 'out' && <Login onOk={check} />}
      {state === 'in' && <ConsoleApp admin={admin} onLogout={async () => { await call('logout', {}); setState('out'); }} />}
    </>
  );
}

function Login({ onOk }) {
  const [d, setD] = useState({}); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await call('login', d); onOk(); } catch (x) { setErr(x.message); setBusy(false); } };
  return (
    <div className="lp">
      <div className="lp-bg on" style={{ backgroundImage: 'url(/img/erp.webp)' }} />
      <div className="lp-shade" />
      <header className="lp-top"><div className="logo"><span className="logo-word">ANGY</span><img src="/img/logo.webp" alt="ERP" height={34} /></div><span className="lp-badge">Console de la plateforme</span></header>
      <main className="lp-main" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(340px,420px)' }}>
        <section className="lp-hero">
          <h1>Console <span className="lp-grad">Angy Company.</span></h1>
          <p>Entreprises clientes, abonnements, accès et dépannage, annonces et demandes d'aide — réservé à l'équipe Angy Company.</p>
        </section>
        <section className="lp-card">
          <form onSubmit={submit} style={{ paddingTop: 14 }}>
            <h2>Connexion</h2><p className="lp-sub">Accès réservé.</p>
            {err && <div className="lp-err">{err}</div>}
            <label>Email<input type="email" required value={d.email || ''} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
            <label>Mot de passe<input type="password" required value={d.password || ''} onChange={(e) => setD({ ...d, password: e.target.value })} /></label>
            <button className="lp-btn lg full" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
          </form>
        </section>
      </main>
    </div>
  );
}

const NAV = [['vue', 'Vue d\'ensemble', 'trend'], ['entreprises', 'Entreprises', 'factory'], ['abonnements', 'Abonnements', 'coins'], ['demandes', 'Demandes d\'aide', 'help'], ['annonces', 'Annonces', 'megaphone'], ['equipe', 'Équipe', 'users'], ['reglages', 'Réglages', 'gear'], ['journal', 'Journal', 'clock'], ['compte', 'Mon compte', 'key']];

function ConsoleApp({ admin, onLogout }) {
  const [tab, setTab] = useState('vue');
  const [focus, setFocus] = useState(null);
  const [open, setOpen] = useState(false);
  const go = (t, id) => { setTab(t); setFocus(id || null); setOpen(false); };
  return (
    <div className="shell">
      <aside className={'side' + (open ? ' open' : '')}>
        <div className="side-head"><div className="logo"><span className="logo-word">ANGY</span><img src="/img/logo.webp" alt="ERP" height={28} /></div><div className="company">Console Angy Company</div></div>
        <nav className="nav">{NAV.map(([k, l, ic]) => <a key={k} href="#" className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); go(k); }}><span className="ic"><Ic n={ic} s={16} /></span>{l}</a>)}</nav>
        <div className="side-foot"><div className="side-user"><span className="avatar">{(admin?.name || 'A')[0]}</span><div className="who"><b>{admin?.name}</b><span>Équipe Angy Company</span></div><button className="side-ic" onClick={onLogout} title="Se déconnecter"><Ic n="logout" s={16} /></button></div></div>
      </aside>
      <div className="main">
        <header className="topbar2"><button className="icon-btn menu-btn" onClick={() => setOpen(true)}><Ic n="menu" s={20} /></button><b className="muted">Console de la plateforme ANGY ERP</b><span style={{ flex: 1 }} /><a className="btn sm" href="/" target="_blank" rel="noreferrer">Voir le site</a></header>
        <UpdateBanner />
        <div className="content">
          <div className="page-head"><div><h1>{NAV.find((x) => x[0] === tab)?.[1]}</h1></div></div>
          {tab === 'vue' && <Vue go={go} />}
          {tab === 'entreprises' && <Companies focus={focus} />}
          {tab === 'abonnements' && <Payments go={go} />}
          {tab === 'demandes' && <Requests />}
          {tab === 'annonces' && <Annonces />}
          {tab === 'equipe' && <Team admin={admin} />}
          {tab === 'reglages' && <Settings admin={admin} />}
          {tab === 'journal' && <Journal />}
          {tab === 'compte' && <Account admin={admin} />}
        </div>
      </div>
      {open && <div className="side-ov" onClick={() => setOpen(false)} />}
    </div>
  );
}

function useCall(action, params, deps = []) {
  const [data, setData] = useState(null); const [err, setErr] = useState(null);
  const reload = useCallback(() => call(action, null, params).then((r) => { setData(r); setErr(null); }).catch((e) => setErr(e.message)), // eslint-disable-next-line react-hooks/exhaustive-deps
  [action, JSON.stringify(params || {})]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload, ...deps]);
  return { data, err, reload };
}

function Vue({ go }) {
  const { data: d, err } = useCall('overview');
  if (err) return <div className="err">{err}</div>;
  if (!d) return <div className="spinner">Chargement…</div>;
  const k = d.k; const max = Math.max(1, ...d.revenue.map((r) => Number(r.total)));
  const kpis = [
    ['factory', 'blue', 'Entreprises', `${k.active} actives / ${k.total}`, `${k.trial} en essai · ${k.suspended} suspendue(s)`, 'entreprises'],
    ['coins', 'green', 'Revenu mensuel prévu', money(k.mrr), 'abonnements actifs ramenés au mois', 'abonnements'],
    ['wallet', 'orange', 'Encaissé ce mois', money(k.paid_month), `${money(k.paid_total)} au total`, 'abonnements'],
    ['help', k.requests ? 'red' : 'slate', 'Demandes à traiter', k.requests, `${k.users} utilisateurs · ${k.logins_7d} actifs en 7 j`, 'demandes'],
  ];
  return (
    <div className="dash">
      <div className="kpis">{kpis.map(([ic, tone, l, v, s, to]) => <button key={l} className={'kpi t-' + tone} onClick={() => go(to)}><span className="kpi-ic"><Ic n={ic} /></span><span className="kpi-k">{l}</span><span className="kpi-v">{v}</span><span className="kpi-s">{s}</span></button>)}</div>
      <div className="dgrid">
        <div className="panel">
          <div className="panel-h"><span className="panel-ic"><Ic n="trend" s={16} /></span><h3>Encaissements des abonnements (12 mois)</h3></div>
          <div className="chart" style={{ height: 180 }}>
            <div className="chart-y"><span>{num(Math.round(max))}</span><span /><span>0</span></div>
            <div className="chart-area"><div className="chart-grid"><i /><i /><i /></div>
              <div className="chart-bars">{d.revenue.map((r, i) => <div key={r.month} className={'cb' + (i === d.revenue.length - 1 ? ' today' : '')}><div className="cb-bar" style={{ height: `${(Number(r.total) / max) * 100}%` }}><span className="cb-tip">{r.month}<b>{money(r.total)}</b></span></div></div>)}</div>
              <div className="chart-x">{d.revenue.map((r) => <span key={r.month}>{r.month.slice(5)}</span>)}</div></div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><span className="panel-ic"><Ic n="alert" s={16} /></span><h3>À surveiller</h3></div>
          {!d.alerts.length && <div className="empty-s ok">Tout va bien 👌</div>}
          {d.alerts.map((a, i) => <div key={i} className="watch"><span className={'dot ' + (a.level === 'red' ? 'red' : a.level === 'orange' ? 'orange' : 'blue')} /><span className="w-n">{a.text}</span><button className="btn sm" onClick={() => go('entreprises', a.id)}>Voir</button></div>)}
        </div>
      </div>
      <div className="dgrid">
        <div className="panel">
          <div className="panel-h"><span className="panel-ic"><Ic n="factory" s={16} /></span><h3>Dernières entreprises</h3><button className="panel-a" onClick={() => go('entreprises')}>Toutes <Ic n="arrow" s={14} /></button></div>
          {d.companies.slice(0, 6).map((c) => <div key={c.id} className="watch"><span className={'dot ' + (c.status === 'actif' ? 'blue' : c.status === 'essai' ? 'yellow' : 'red')} /><span className="w-n">{c.name}<small>{c.admin_email} · créée le {date(c.created_at)} · {num(c.sales)} vente(s), {num(c.productions)} production(s)</small></span><span className={'badge ' + STATUS[c.status]?.[1]}>{STATUS[c.status]?.[0]}</span></div>)}
        </div>
        <div className="panel">
          <div className="panel-h"><span className="panel-ic"><Ic n="clock" s={16} /></span><h3>Activité de l'équipe</h3></div>
          {!d.recent.length && <div className="empty-s">Aucune activité</div>}
          {d.recent.map((l) => <div key={l.id} className="watch"><span className="w-n">{l.admin_name} · {l.action}{l.company ? ` — ${l.company}` : ''}<small>{datetime(l.created_at)}</small></span></div>)}
        </div>
      </div>
    </div>
  );
}

function Companies({ focus }) {
  const { data, err, reload } = useCall('companies');
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [st, setSt] = useState('');
  useEffect(() => { if (focus && data) { const c = data.find((x) => x.id === focus); if (c) setModal({ k: 'edit', c }); } }, [focus, data]);
  if (err) return <div className="err">{err}</div>;
  if (!data) return <div className="spinner">Chargement…</div>;
  const rows = data.filter((c) => (!st || c.status === st) && (!search || `${c.name} ${c.admin_email} ${c.phone}`.toLowerCase().includes(search.toLowerCase())));
  const act = async (fn, msg) => { try { const r = await fn(); if (msg) toast(msg); reload(); return r; } catch (e) { toast(e.message, 'error'); } };
  return (
    <>
      <div className="toolbar">
        <input className="input sm" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
        <select className="input sm" value={st} onChange={(e) => setSt(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <div className="grow" />
        <button className="btn primary" onClick={() => setModal({ k: 'new' })}>+ Nouvelle entreprise</button>
      </div>
      <div className="card"><div className="table-wrap"><table className="t">
        <thead><tr><th>Entreprise</th><th>Administrateur</th><th>Statut</th><th>Fin d'abonnement</th><th className="r">Tarif</th><th>Activité</th><th /></tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.id}>
            <td><b>{c.name}</b><br /><span className="muted small">{c.sector || '—'}{c.phone ? ` · ${c.phone}` : ''}</span></td>
            <td>{c.admin_name}<br /><span className="muted small">{c.admin_email}</span></td>
            <td><span className={'badge ' + STATUS[c.status]?.[1]}>{STATUS[c.status]?.[0] || c.status}</span></td>
            <td>{c.sub_end ? <>{date(c.sub_end)}<br /><span className={'small ' + (c.days_left < 0 ? 'neg strong' : c.days_left <= 7 ? 'neg' : 'muted')}>{c.days_left < 0 ? `expiré depuis ${-c.days_left} j` : `${c.days_left} j restants`}</span></> : <span className="muted">Sans limite</span>}</td>
            <td className="r">{Number(c.price) ? <>{money(c.price)}<br /><span className="muted small">{PERIOD[c.periodicity]}</span></> : <span className="muted">—</span>}</td>
            <td className="small">{num(c.users)} utilisateur(s) · {num(c.items)} article(s)<br /><span className="muted">{num(c.sales)} vente(s) · {num(c.productions)} prod. · connexion {since(c.last_login)}</span></td>
            <td className="actions">
              <button className="btn sm primary" title="Ouvrir son espace en mode support" onClick={() => act(() => call('impersonate', { id: c.id })).then((r) => r && window.open('/app', '_blank'))}><Ic n="eye" s={14} /> Ouvrir</button>
              <button className="btn sm" onClick={() => setModal({ k: 'edit', c })}>Gérer</button>
            </td>
          </tr>
        ))}</tbody>
      </table>{!rows.length && <div className="empty">Aucune entreprise</div>}</div></div>
      {modal?.k === 'new' && <NewCompany onClose={(r) => { setModal(r ? { k: 'created', r } : null); if (r) reload(); }} />}
      {modal?.k === 'created' && <Credentials title="Entreprise créée" r={modal.r} onClose={() => setModal(null)} />}
      {modal?.k === 'edit' && <ManageCompany c={modal.c} onClose={(changed) => { setModal(null); if (changed) reload(); }} onCreds={(r) => setModal({ k: 'created', r })} />}
    </>
  );
}

function Credentials({ title, r, onClose }) {
  const text = `Bonjour,\n\nVoici vos accès à ANGY ERP :\nLien : ${typeof window !== 'undefined' ? window.location.origin : ''}\nEmail : ${r.email}\nMot de passe : ${r.password}\n\nPensez à changer votre mot de passe après la première connexion (icône clé en bas du menu).\n\nAngy Company`;
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={() => { navigator.clipboard?.writeText(text); toast('Copié'); }}>Copier le message</button><button className="btn primary" onClick={onClose}>Fermer</button></>}>
      <div className="note" style={{ marginBottom: 12 }}>Notez ce mot de passe maintenant : il ne pourra plus être affiché ensuite.</div>
      <dl className="kv"><dt>Email</dt><dd className="mono strong">{r.email}</dd><dt>Mot de passe</dt><dd className="mono strong" style={{ fontSize: 18 }}>{r.password}</dd></dl>
      <textarea className="input" readOnly value={text} style={{ marginTop: 14, minHeight: 170 }} />
    </Modal>
  );
}

const COMPANY_FIELDS = [
  { k: 'name', l: 'Nom de l\'entreprise', req: true }, { k: 'sector', l: 'Secteur d\'activité' },
  { k: 'phone', l: 'Téléphone' }, { k: 'email', l: 'Email de l\'entreprise' }, { k: 'address', l: 'Adresse', full: true },
  { k: 'status', l: 'Statut', t: 'select', opts: Object.entries(STATUS).map(([k, [l]]) => [k, l]), req: true }, { k: 'sub_end', l: 'Fin d\'abonnement', t: 'date', help: 'Vide = sans limite' },
  { k: 'price', l: 'Tarif (FCFA)', t: 'number' }, { k: 'periodicity', l: 'Périodicité', t: 'select', opts: Object.entries(PERIOD) },
  { k: 'admin_notes', l: 'Notes internes', t: 'textarea', full: true },
];

function NewCompany({ onClose }) {
  const [d, setD] = useState({ status: 'essai', sub_end: addMonths(today(), 1), periodicity: 'mois' });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setErr(null); try { onClose(await call('company_create', d)); } catch (e) { setErr(e.message); setBusy(false); } };
  return (
    <Modal wide title="Nouvelle entreprise cliente" onClose={() => onClose(null)} footer={<><button className="btn" onClick={() => onClose(null)}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>Créer l'entreprise</button></>}>
      {err && <div className="err">{err}</div>}
      <Form data={d} setData={setD} fields={COMPANY_FIELDS} />
      <h3 style={{ fontSize: 14, margin: '18px 0 10px' }}>Administrateur de l'entreprise</h3>
      <Form data={d} setData={setD} fields={[{ k: 'admin_name', l: 'Nom complet', req: true }, { k: 'admin_email', l: 'Email (identifiant)', t: 'email', req: true }, { k: 'admin_password', l: 'Mot de passe', help: 'Vide = généré automatiquement' }, { k: 'demo', l: 'Charger des données d\'exemple', t: 'bool' }]} />
    </Modal>
  );
}

function ManageCompany({ c, onClose, onCreds }) {
  const [tab, setTab] = useState('infos');
  const [d, setD] = useState({ ...c });
  const [pay, setPay] = useState({ date: today(), method: 'wave', amount: c.price || '', new_end: addMonths(c.sub_end && c.days_left >= 0 ? c.sub_end : today(), c.periodicity === 'annee' ? 12 : c.periodicity === 'trimestre' ? 3 : 1) });
  const { data: users } = useCall('users', { id: c.id });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const run = async (fn, msg, close = true) => { setBusy(true); setErr(null); try { const r = await fn(); if (msg) toast(msg); if (close) onClose(true); return r; } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Modal wide title={c.name} onClose={() => onClose(false)}>
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginBottom: 12 }}>
        <span className={'badge ' + STATUS[c.status]?.[1]}>{STATUS[c.status]?.[0]}</span>
        <span className="muted small">{c.sub_end ? `Fin : ${date(c.sub_end)} (${c.days_left} j)` : 'Sans limite'} · Payé au total : {money(c.paid_total)}</span>
        {c.phone && <a className="btn sm" href={waLink(c.phone, `Bonjour ${c.contact_name || ''}, ici Angy Company au sujet de votre espace ANGY ERP.`)} target="_blank" rel="noreferrer"><Ic n="whatsapp" s={14} /> WhatsApp</a>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['infos', 'Informations'], ['pay', 'Paiement / prolongation'], ['acces', 'Accès & utilisateurs']]} />
      {tab === 'infos' && <>
        <Form data={d} setData={setD} fields={COMPANY_FIELDS} />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          <div className="row">
            {c.status !== 'suspendu'
              ? <button className="btn danger" disabled={busy} onClick={() => window.confirm(`Suspendre ${c.name} ? Ses utilisateurs ne pourront plus se connecter.`) && run(() => call('company_update', { id: c.id, status: 'suspendu' }), 'Entreprise suspendue')}>Suspendre</button>
              : <button className="btn" disabled={busy} onClick={() => run(() => call('company_update', { id: c.id, status: 'actif' }), 'Entreprise réactivée')}>Réactiver</button>}
            <button className="btn" disabled={busy} onClick={() => run(() => call('company_update', { id: c.id, sub_end: addMonths(c.sub_end && c.days_left >= 0 ? c.sub_end : today(), 1) }), '+1 mois accordé')}>+1 mois offert</button>
          </div>
          <button className="btn primary" disabled={busy} onClick={() => run(() => call('company_update', { id: c.id, ...Object.fromEntries(COMPANY_FIELDS.map((f) => [f.k, d[f.k]])) }), 'Enregistré')}>Enregistrer</button>
        </div>
      </>}
      {tab === 'pay' && <>
        <div className="note" style={{ marginBottom: 12 }}>Enregistrer un paiement prolonge l'abonnement jusqu'à la nouvelle date et passe l'entreprise en « Actif ».</div>
        <Form data={pay} setData={setPay} fields={[{ k: 'amount', l: 'Montant reçu (FCFA)', t: 'number', req: true }, { k: 'date', l: 'Date', t: 'date' }, { k: 'method', l: 'Mode', t: 'select', opts: Object.entries(PAY_MODES) },
          { k: 'new_end', l: 'Nouvelle fin d\'abonnement', t: 'date' }, { k: 'period_label', l: 'Période payée', ph: 'Ex. Décembre 2026' }, { k: 'note', l: 'Note' }]} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn primary" disabled={busy} onClick={() => run(() => call('payment', { id: c.id, ...pay }), 'Paiement enregistré — reçu ouvert').then((r) => r?.payment_id && window.open('/recu-abonnement/' + r.payment_id, '_blank'))}>Enregistrer et imprimer le reçu</button></div>
      </>}
      {tab === 'acces' && <>
        <table className="t"><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Dernière connexion</th><th /></tr></thead>
          <tbody>{(users || []).map((u) => <tr key={u.id}><td><b>{u.name}</b><br /><span className="muted small">{u.email}</span>{!u.active && <span className="badge red" style={{ marginLeft: 6 }}>Désactivé</span>}</td><td>{u.role}</td><td className="small">{u.last_login ? datetime(u.last_login) : 'jamais'}</td>
            <td className="actions"><button className="btn sm" disabled={busy} onClick={() => window.confirm(`Générer un nouveau mot de passe pour ${u.email} ?`) && run(() => call('reset_password', { id: c.id, user_id: u.id }), null, false).then((r) => r && onCreds(r))}>Nouveau mot de passe</button></td></tr>)}</tbody></table>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn primary" onClick={() => run(() => call('impersonate', { id: c.id }), null, false).then((r) => r && window.open('/app', '_blank'))}><Ic n="eye" s={15} /> Ouvrir son espace (mode support)</button>
        </div>
      </>}
    </Modal>
  );
}

const relanceText = (c) => c.days_left < 0
  ? `Bonjour ${c.contact_name || ''}, ici Angy Company. L'abonnement ANGY ERP de ${c.name} a expiré le ${date(c.sub_end)}. Pour retrouver l'accès, merci de procéder au renouvellement${Number(c.price) ? ` (${money(c.price)} ${PERIOD[c.periodicity] || ''})` : ''}. Merci de votre confiance !`
  : `Bonjour ${c.contact_name || ''}, ici Angy Company. ${c.status === 'essai' ? 'La période d\'essai' : 'L\'abonnement'} ANGY ERP de ${c.name} se termine le ${date(c.sub_end)} (dans ${c.days_left} jour(s)). Pour continuer sans interruption, merci de procéder au renouvellement${Number(c.price) ? ` (${money(c.price)} ${PERIOD[c.periodicity] || ''})` : ''}. Merci de votre confiance !`;

function Payments({ go }) {
  const { data, err, reload } = useCall('payments');
  const { data: comps } = useCall('companies');
  const [mode, setMode] = useState('');
  if (err) return <div className="err">{err}</div>;
  if (!data) return <div className="spinner">Chargement…</div>;
  const rows = data.filter((p) => !mode || p.method === mode);
  const total = rows.reduce((s, p) => s + Number(p.amount), 0);
  const due = (comps || []).filter((c) => c.status !== 'suspendu' && c.sub_end && c.days_left <= 7).sort((a, b) => a.days_left - b.days_left);
  const del = async (p) => { if (!window.confirm(`Supprimer le paiement ${p.number || ''} de ${p.company} ? (l'échéance de l'entreprise n'est pas modifiée)`)) return; try { await call('payment_delete', { id: p.id }); toast('Paiement supprimé'); reload(); } catch (e) { toast(e.message, 'error'); } };
  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h"><span className="panel-ic"><Ic n="bell" s={16} /></span><h3>À relancer ({due.length})</h3><span className="muted small">abonnements expirés ou se terminant dans 7 jours</span></div>
        {!due.length && <div className="empty-s ok">Aucune échéance proche 👌</div>}
        {due.map((c) => (
          <div key={c.id} className="watch">
            <span className={'dot ' + (c.days_left < 0 ? 'red' : 'orange')} />
            <span className="w-n">{c.name}<small>{c.days_left < 0 ? `expiré depuis ${-c.days_left} j` : `fin dans ${c.days_left} j`} · {date(c.sub_end)}{Number(c.price) ? ` · ${money(c.price)} ${PERIOD[c.periodicity] || ''}` : ''}{c.phone ? ` · ${c.phone}` : ' · pas de téléphone'}</small></span>
            {c.phone && <a className="btn sm" href={waLink(c.phone, relanceText(c))} target="_blank" rel="noreferrer"><Ic n="whatsapp" s={14} /> Relancer</a>}
            <button className="btn sm primary" onClick={() => go('entreprises', c.id)}>Encaisser</button>
          </div>
        ))}
      </div>
      <div className="toolbar">
        <select className="input sm" value={mode} onChange={(e) => setMode(e.target.value)}><option value="">Tous les modes</option>{Object.entries(PAY_MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <div className="grow" /><span className="muted small">{rows.length} paiement(s) · {money(total)}</span>
      </div>
      <div className="card"><div className="table-wrap"><table className="t">
        <thead><tr><th>Reçu</th><th>Date</th><th>Entreprise</th><th>Période</th><th>Mode</th><th>Nouvelle échéance</th><th className="r">Montant</th><th /></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.id}><td className="mono small">{p.number || '—'}</td><td>{date(p.date)}</td><td><b>{p.company}</b></td><td>{p.period_label}</td><td>{PAY_MODES[p.method] || p.method}</td><td>{date(p.new_end)}</td><td className="r">{money(p.amount)}</td>
          <td className="actions"><a className="btn sm" href={'/recu-abonnement/' + p.id} target="_blank" rel="noreferrer"><Ic n="print" s={14} /> Reçu</a><button className="btn sm danger" title="Supprimer" onClick={() => del(p)}>✕</button></td></tr>)}</tbody>
        {rows.length > 0 && <tfoot><tr><td>Total</td><td /><td /><td /><td /><td /><td className="r">{money(total)}</td><td /></tr></tfoot>}
      </table>{!rows.length && <div className="empty">Aucun paiement enregistré. Ouvrez une entreprise → « Paiement / prolongation ».</div>}</div></div>
    </>
  );
}

function Requests() {
  const { data, err, reload } = useCall('requests');
  const [edit, setEdit] = useState(null);
  if (err) return <div className="err">{err}</div>;
  if (!data) return <div className="spinner">Chargement…</div>;
  return (
    <>
      {!data.length && <div className="card empty">Aucune demande pour le moment.</div>}
      <div className="grid g2">{data.map((r) => (
        <div key={r.id} className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="row"><span className={'badge ' + REQ_TYPES[r.type]?.[1]}>{REQ_TYPES[r.type]?.[0] || r.type}</span><b>{r.company}</b></span><span className={'badge ' + REQ_STATUS[r.status]?.[1]}>{REQ_STATUS[r.status]?.[0]}</span></div>
          <div className="muted small" style={{ margin: '6px 0' }}>{r.user_name} · {datetime(r.created_at)}</div>
          <p className="req-m">{r.message}</p>
          {r.reply && <div className="req-r"><b>Notre réponse</b><p>{r.reply}</p></div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm primary" onClick={() => setEdit({ ...r })}>Répondre</button>
            {r.company_phone && <a className="btn sm" href={waLink(r.company_phone, `Bonjour, ici Angy Company au sujet de votre demande : « ${r.message.slice(0, 80)} »`)} target="_blank" rel="noreferrer">WhatsApp</a>}
          </div>
        </div>
      ))}</div>
      {edit && <Modal title={`Demande de ${edit.company}`} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Annuler</button><button className="btn primary" onClick={async () => { try { await call('request_update', { id: edit.id, status: edit.status, reply: edit.reply }); toast('Réponse enregistrée'); setEdit(null); reload(); } catch (e) { toast(e.message, 'error'); } }}>Enregistrer</button></>}>
        <p className="req-m">{edit.message}</p>
        <Form data={edit} setData={setEdit} fields={[{ k: 'status', l: 'Statut', t: 'select', opts: Object.entries(REQ_STATUS).map(([k, [l]]) => [k, l]), req: true }, { k: 'reply', l: 'Réponse (visible par le client)', t: 'textarea', full: true }]} />
      </Modal>}
    </>
  );
}

function Annonces() {
  const { data, err, reload } = useCall('announcements');
  const [edit, setEdit] = useState(null);
  if (err) return <div className="err">{err}</div>;
  if (!data) return <div className="spinner">Chargement…</div>;
  const LV = { info: 'Information', success: 'Nouveauté', warn: 'Attention' };
  return (
    <>
      <div className="toolbar"><span className="muted small">Les annonces actives s'affichent en haut de l'application chez tous les clients.</span><div className="grow" /><button className="btn primary" onClick={() => setEdit({ level: 'info', active: true })}>+ Nouvelle annonce</button></div>
      <div className="card"><div className="table-wrap"><table className="t">
        <thead><tr><th>Annonce</th><th>Type</th><th>Jusqu'au</th><th>Statut</th><th /></tr></thead>
        <tbody>{data.map((a) => <tr key={a.id}><td><b>{a.title}</b><br /><span className="muted small">{a.body}</span></td><td>{LV[a.level]}</td><td>{date(a.ends_at) || '—'}</td><td>{a.active ? <span className="badge green">Visible</span> : <span className="badge gray">Arrêtée</span>}</td>
          <td className="actions"><button className="btn sm" onClick={() => setEdit({ ...a })}>Modifier</button><button className="btn sm danger" onClick={async () => { if (window.confirm('Supprimer cette annonce ?')) { await call('announcement_delete', { id: a.id }); reload(); } }}>✕</button></td></tr>)}</tbody>
      </table>{!data.length && <div className="empty">Aucune annonce</div>}</div></div>
      {edit && <Modal title={edit.id ? 'Modifier l\'annonce' : 'Nouvelle annonce'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Annuler</button><button className="btn primary" onClick={async () => { try { await call('announcement_save', edit); toast('Annonce enregistrée'); setEdit(null); reload(); } catch (e) { toast(e.message, 'error'); } }}>Publier</button></>}>
        <Form data={edit} setData={setEdit} fields={[{ k: 'title', l: 'Titre', req: true, full: true }, { k: 'body', l: 'Message', t: 'textarea', full: true }, { k: 'level', l: 'Type', t: 'select', opts: Object.entries(LV), req: true }, { k: 'ends_at', l: 'Afficher jusqu\'au', t: 'date' }, { k: 'active', l: 'Visible', t: 'bool' }]} />
      </Modal>}
    </>
  );
}

function Journal() {
  const { data } = useCall('logs');
  if (!data) return <div className="spinner">Chargement…</div>;
  return <div className="card"><div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Membre</th><th>Action</th><th>Entreprise</th></tr></thead>
    <tbody>{data.map((l) => <tr key={l.id}><td>{datetime(l.created_at)}</td><td>{l.admin_name}</td><td>{l.action}</td><td>{l.company || (l.data?.name) || ''}</td></tr>)}</tbody></table></div></div>;
}

function Account({ admin }) {
  const [d, setD] = useState({});
  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <div className="panel-h"><span className="panel-ic"><Ic n="key" s={16} /></span><h3>Changer le mot de passe de la console</h3></div>
      <p className="muted small" style={{ marginTop: 0 }}>Connecté : <b>{admin?.name}</b> · {admin?.role === 'membre' ? 'Membre' : 'Propriétaire'}</p>
      <Form data={d} setData={setD} fields={[{ k: 'current', l: 'Mot de passe actuel', t: 'password', full: true }, { k: 'next', l: 'Nouveau mot de passe (8 caractères min.)', t: 'password', full: true }]} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn primary" onClick={async () => { try { await call('password', d); toast('Mot de passe modifié'); setD({}); } catch (e) { toast(e.message, 'error'); } }}>Enregistrer</button></div>
    </div>
  );
}

const ROLE_L = { proprietaire: ['Propriétaire', 'green'], membre: ['Membre', 'blue'] };
function Team({ admin }) {
  const { data, err, reload } = useCall('team');
  const [edit, setEdit] = useState(null);
  const [creds, setCreds] = useState(null);
  const isOwner = admin?.role !== 'membre';
  if (err) return <div className="err">{err}</div>;
  if (!data) return <div className="spinner">Chargement…</div>;
  const save = async () => { try { const r = await call('team_save', edit); setEdit(null); reload(); if (r.password) setCreds(r); else toast('Enregistré'); } catch (e) { toast(e.message, 'error'); } };
  const credText = creds && `Bonjour ${creds.name},\n\nVoici ton accès à la console Angy Company (ANGY ERP) :\nLien : ${typeof window !== 'undefined' ? window.location.origin : ''}/console\nEmail : ${creds.email}\nMot de passe provisoire : ${creds.password}\n\nChange-le dans « Mon compte » dès la première connexion.`;
  return (
    <>
      <div className="toolbar"><span className="muted small">Le <b>propriétaire</b> a tous les droits. Un <b>membre</b> gère les entreprises, paiements, demandes et annonces, mais ne touche ni à l'équipe ni aux réglages.</span><div className="grow" />
        {isOwner && <button className="btn primary" onClick={() => setEdit({ role: 'membre', active: true })}>+ Ajouter un membre</button>}</div>
      <div className="card"><div className="table-wrap"><table className="t">
        <thead><tr><th>Membre</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th /></tr></thead>
        <tbody>{data.map((a) => <tr key={a.id}><td><b>{a.name}</b>{a.id === admin?.aid && <span className="muted small"> (vous)</span>}<br /><span className="muted small">{a.email}</span></td>
          <td><span className={'badge ' + (ROLE_L[a.role] || ROLE_L.proprietaire)[1]}>{(ROLE_L[a.role] || ROLE_L.proprietaire)[0]}</span></td>
          <td>{a.active === false ? <span className="badge red">Désactivé</span> : <span className="badge green">Actif</span>}</td>
          <td className="small">{a.last_login ? datetime(a.last_login) : 'jamais'}</td>
          <td className="actions">{isOwner && <><button className="btn sm" onClick={() => setEdit({ ...a })}>Modifier</button>
            {a.id !== admin?.aid && <button className="btn sm" onClick={async () => { if (!window.confirm(`Nouveau mot de passe pour ${a.email} ?`)) return; try { setCreds(await call('team_reset', { id: a.id })); } catch (e) { toast(e.message, 'error'); } }}>Nouveau mot de passe</button>}</>}</td></tr>)}</tbody>
      </table></div></div>
      {edit && <Modal title={edit.id ? 'Modifier le membre' : 'Nouveau membre'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Annuler</button><button className="btn primary" onClick={save}>{edit.id ? 'Enregistrer' : 'Créer l\'accès'}</button></>}>
        <Form data={edit} setData={setEdit} fields={[{ k: 'name', l: 'Nom complet', req: true, full: true }, ...(edit.id ? [] : [{ k: 'email', l: 'Email (identifiant)', t: 'email', req: true, full: true }]),
          { k: 'role', l: 'Rôle', t: 'select', opts: Object.entries(ROLE_L).map(([k, [l]]) => [k, l]), req: true }, ...(edit.id ? [{ k: 'active', l: 'Accès actif', t: 'bool' }] : [])]} />
        {!edit.id && <p className="muted small">Un mot de passe provisoire sera généré.</p>}
      </Modal>}
      {creds && <Modal title="Accès console" onClose={() => setCreds(null)} footer={<><button className="btn" onClick={() => { navigator.clipboard?.writeText(credText); toast('Copié'); }}>Copier le message</button><button className="btn primary" onClick={() => setCreds(null)}>Fermer</button></>}>
        <div className="note" style={{ marginBottom: 12 }}>Notez ce mot de passe maintenant : il ne pourra plus être affiché ensuite.</div>
        <dl className="kv"><dt>Email</dt><dd className="mono strong">{creds.email}</dd><dt>Mot de passe</dt><dd className="mono strong" style={{ fontSize: 18 }}>{creds.password}</dd></dl>
        <textarea className="input" readOnly value={credText} style={{ marginTop: 14, minHeight: 150 }} />
      </Modal>}
    </>
  );
}

function Settings({ admin }) {
  const { data, err } = useCall('settings');
  const [d, setD] = useState(null);
  useEffect(() => { if (data) setD(data); }, [data]);
  const isOwner = admin?.role !== 'membre';
  if (err) return <div className="err">{err}</div>;
  if (!d) return <div className="spinner">Chargement…</div>;
  const save = async () => { try { setD(await call('settings_save', d)); toast('Réglages enregistrés'); } catch (e) { toast(e.message, 'error'); } };
  return (
    <div className="dgrid" style={{ alignItems: 'start' }}>
      <div className="panel">
        <div className="panel-h"><span className="panel-ic"><Ic n="whatsapp" s={16} /></span><h3>Coordonnées d'Angy Company</h3></div>
        <p className="muted small" style={{ marginTop: 0 }}>Affichées aux entreprises clientes : bouton WhatsApp dans « Aide & suggestions », écran d'abonnement expiré, page de connexion et reçus.</p>
        <Form data={d} setData={setD} fields={[{ k: 'whatsapp', l: 'Numéro WhatsApp du support', ph: '77 000 00 00' }, { k: 'telephone', l: 'Téléphone', ph: '77 000 00 00' }, { k: 'email', l: 'Email', t: 'email' }, { k: 'adresse', l: 'Adresse' }]} />
      </div>
      <div className="panel">
        <div className="panel-h"><span className="panel-ic"><Ic n="clock" s={16} /></span><h3>Inscriptions</h3></div>
        <Form data={d} setData={setD} fields={[{ k: 'essai_jours', l: 'Durée de l\'essai gratuit (jours)', t: 'number', help: '0 = sans limite. S\'applique aux nouvelles entreprises qui s\'inscrivent seules.' }]} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          {isOwner ? <button className="btn primary" onClick={save}>Enregistrer les réglages</button> : <span className="muted small">Seul le propriétaire peut modifier les réglages.</span>}
        </div>
      </div>
    </div>
  );
}
