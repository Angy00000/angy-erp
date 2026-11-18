import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { api, setCurrency, ACCESS } from '../../lib/client';
import { MODULES, ROLES, can as canRole } from '../../lib/perms';
import Dashboard, { Ic } from '../../components/modules/Dashboard';
import Ventes from '../../components/modules/Ventes';
import Caisse from '../../components/modules/Caisse';
import Stock from '../../components/modules/Stock';
import Achats from '../../components/modules/Achats';
import Production from '../../components/modules/Production';
import Qualite from '../../components/modules/Qualite';
import RH from '../../components/modules/RH';
import Rapports from '../../components/modules/Rapports';
import Admin from '../../components/modules/Admin';
import Aide from '../../components/modules/Aide';
import Imprimes from '../../components/modules/Imprimes';
import Gardien from '../../components/modules/Gardien';
import { SearchPalette, Bell, Announcements, PasswordModal, useTheme, waLink, InstallApp, UpdateBanner, WhatsNew, GuardBell } from '../../components/Chrome';
import { CHANGELOG } from '../../lib/changelog';

const VIEWS = { dashboard: Dashboard, ventes: Ventes, caisse: Caisse, stock: Stock, achats: Achats, production: Production, qualite: Qualite, rh: RH, rapports: Rapports, admin: Admin, aide: Aide, imprimes: Imprimes, gardien: Gardien };
const SUBTITLES = {
  dashboard: 'Vue d\'ensemble de l\'activité en temps réel',
  ventes: 'Point de vente, factures, devis, commandes et clients',
  caisse: 'Comptes, encaissements, dépenses et journal de trésorerie',
  stock: 'Articles, lots, niveaux de stock et mouvements',
  achats: 'Commandes fournisseurs, réceptions et paiements',
  production: 'Production rapide, ordres de fabrication, rentabilité et besoins matières',
  qualite: 'Contrôles, libération des lots, non-conformités, HACCP et traçabilité',
  rh: 'Employés, pointage, planning des équipes et paie',
  rapports: 'Analyses financières, commerciales, de production et qualité',
  admin: 'Entreprise, utilisateurs, rôles et journal d\'activité',
  imprimes: 'Fiches vierges et états à imprimer, avec votre logo : production, hygiène, stock, ventes, caisse, personnel',
  gardien: 'Surveille les actions sensibles : annulations, remises, pertes, sorties d\'argent, vendeurs, accès',
  aide: 'Signalez un problème ou proposez une amélioration à l\'équipe Angy Company',
};
const initials = (s) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');

export default function AppShell() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const [pwd, setPwd] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const mod = (router.query.slug && router.query.slug[0]) || 'dashboard';

  const load = useCallback(() => api('auth/me').then((r) => { setCurrency(r.company?.currency); setMe(r); }).catch(() => router.replace('/')), [router]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);

  if (!me) return <div className="spinner" style={{ paddingTop: 120 }}>Chargement…</div>;
  const logout = async () => { await api('auth/logout', { method: 'POST' }).catch(() => {}); if (me.user.support) window.close(); router.replace('/'); };
  if (me.blocked) return <Blocked msg={me.blocked} company={me.company} contact={me.contact || {}} onLogout={logout} />;

  const role = me.user.role;
  const can = (m) => canRole({ role, modules: me.user.modules }, m);
  ACCESS.money = can('argent');
  const visible = MODULES.filter((m) => m.nav !== false && (can(m.key) || (m.key === 'rapports' && ACCESS.money && ['ventes', 'stock', 'production', 'caisse', 'qualite'].some(can))));
  const current = visible.find((m) => m.key === mod) ? mod : 'dashboard';
  const View = VIEWS[current];
  const go = (m) => { router.push('/app/' + m); setOpen(false); };
  const meta = MODULES.find((m) => m.key === current);
  const daysLeft = me.company?.days_left;

  let lastGroup = null;
  return (
    <div className="shell">
      <aside className={'side' + (open ? ' open' : '')}>
        <div className="side-head">
          <div className="logo"><img src="/img/logo.webp" alt="ERP" height={28} /></div>
          <div className="company">{me.company?.logo && <img src={me.company.logo} alt="" />}<span>{me.company?.name}</span></div>
        </div>
        <nav className="nav">
          {visible.map((m) => {
            const head = m.group && m.group !== lastGroup ? <div key={'g' + m.group} className="nav-group">{m.group}</div> : null;
            lastGroup = m.group;
            return [head, (
              <a key={m.key} href={'/app/' + m.key} className={current === m.key ? 'on' : ''} onClick={(e) => { e.preventDefault(); go(m.key); }}>
                <span className="ic">{m.icon}</span>{m.label}
              </a>
            )];
          })}
        </nav>
        <div className="side-foot">
          <div className="side-user">
            <span className="avatar">{initials(me.user.name)}</span>
            <div className="who"><b>{me.user.name}</b><span>{me.user.role_label || ROLES[role]?.label || role}</span></div>
            {!me.user.support && <button className="side-ic" title="Changer mon mot de passe" onClick={() => setPwd(true)}><Ic n="key" s={16} /></button>}
            <button className="side-ic" title="Se déconnecter" onClick={logout}><Ic n="logout" s={16} /></button>
          </div>
          <InstallApp />
          <div className="side-sign">ERP · un produit Angy Company<br /><span title="Version installée">Version {CHANGELOG[0]?.v}</span></div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar2">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Ic n="menu" s={20} /></button>
          <button className="gsearch" onClick={() => setSearch(true)}><Ic n="search" s={17} /><span>Rechercher…</span><span className="kbd">Ctrl K</span></button>
          <span style={{ flex: 1 }} />
          {can('gardien') && <GuardBell go={go} />}
          <Bell go={go} />
          <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}><Ic n={theme === 'dark' ? 'sun' : 'moon'} s={19} /></button>
        </header>
        {me.user.support && (
          <div className="banner support"><Ic n="eye" s={17} /><span><b>Mode support Angy Company</b> — vous voyez l'espace de {me.company?.name} comme son administrateur. Les modifications sont réelles.</span>
            <button className="btn sm" onClick={logout}>Quitter</button></div>
        )}
        {!me.user.support && role === 'admin' && daysLeft !== null && daysLeft !== undefined && daysLeft <= 7 && (
          <div className={'banner ' + (daysLeft <= 2 ? 'red' : 'warn')}><Ic n="clock" s={17} />
            <span><b>{me.company.status === 'essai' ? 'Période d\'essai' : 'Abonnement'}</b> : se termine {daysLeft <= 0 ? 'aujourd\'hui' : `dans ${daysLeft} jour(s)`}. Contactez Angy Company pour continuer sans interruption.</span>
            <button className="btn sm" onClick={() => go('aide')}>Contacter</button></div>
        )}
        <UpdateBanner />
        <Announcements />
        <div className="content">
          <div className="page-head">
            <div><h1>{meta?.label}</h1><div className="sub">{SUBTITLES[current]}</div></div>
          </div>
          <View key={current} go={go} can={can} company={me.company} onCompany={load} user={me.user} contact={me.contact} />
        </div>
      </div>
      {open && <div className="side-ov" onClick={() => setOpen(false)} />}
      {search && <SearchPalette onClose={() => setSearch(false)} go={go} />}
      {pwd && <PasswordModal onClose={() => setPwd(false)} />}
      {!me.user.support && <WhatsNew list={CHANGELOG} />}
    </div>
  );
}

function Blocked({ msg, company, contact, onLogout }) {
  return (
    <div className="lp blocked">
      <div className="lp-bg on" style={{ backgroundImage: 'url(/img/usine-1.webp)' }} />
      <div className="lp-shade" />
      <div className="blk-card">
        <div className="logo" style={{ justifyContent: 'center', marginBottom: 18 }}><img src="/img/logo.webp" alt="ERP" height={34} /></div>
        <h2>{company?.name}</h2>
        <p>{msg}</p>
        <p className="lp-sub">Vos données sont conservées et seront de nouveau accessibles dès la réactivation.</p>
        {contact.whatsapp && <a className="lp-btn lg full" href={waLink(contact.whatsapp, `Bonjour Angy Company, je vous contacte pour l'abonnement ERP de ${company?.name || 'mon entreprise'}.`)} target="_blank" rel="noreferrer">Contacter Angy Company sur WhatsApp</a>}
        {!contact.whatsapp && contact.telephone && <p className="lp-sub">Angy Company : <b>{contact.telephone}</b></p>}
        <button className="lp-btn ghost lg full" style={{ marginTop: 10 }} onClick={onLogout}>Se déconnecter</button>
      </div>
    </div>
  );
}
