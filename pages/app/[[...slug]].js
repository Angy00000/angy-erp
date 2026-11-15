import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { api, setCurrency } from '../../lib/client';
import { MODULES, ROLES, can as canRole } from '../../lib/perms';
import Dashboard from '../../components/modules/Dashboard';
import Ventes from '../../components/modules/Ventes';
import Caisse from '../../components/modules/Caisse';
import Stock from '../../components/modules/Stock';
import Achats from '../../components/modules/Achats';
import Production from '../../components/modules/Production';
import Qualite from '../../components/modules/Qualite';
import RH from '../../components/modules/RH';
import Rapports from '../../components/modules/Rapports';
import Admin from '../../components/modules/Admin';

const VIEWS = { dashboard: Dashboard, ventes: Ventes, caisse: Caisse, stock: Stock, achats: Achats, production: Production, qualite: Qualite, rh: RH, rapports: Rapports, admin: Admin };
const SUBTITLES = {
  dashboard: 'Vue d\'ensemble de l\'activité en temps réel',
  ventes: 'Point de vente, factures, devis, commandes et clients',
  caisse: 'Comptes, encaissements, dépenses et journal de trésorerie',
  stock: 'Articles, lots, niveaux de stock et mouvements',
  achats: 'Commandes fournisseurs, réceptions et paiements',
  production: 'Ordres de fabrication, recettes, planning et besoins matières',
  qualite: 'Contrôles, libération des lots, non-conformités, HACCP et traçabilité',
  rh: 'Employés, pointage, planning des équipes et paie',
  rapports: 'Analyses financières, commerciales, de production et qualité',
  admin: 'Entreprise, utilisateurs, rôles et journal d\'activité',
};

export default function AppShell() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const mod = (router.query.slug && router.query.slug[0]) || 'dashboard';

  const load = useCallback(() => api('auth/me').then((r) => { setCurrency(r.company?.currency); setMe(r); }).catch(() => router.replace('/')), [router]);
  useEffect(() => { load(); }, [load]);

  if (!me) return <div className="spinner" style={{ paddingTop: 120 }}>Chargement…</div>;
  const role = me.user.role;
  const can = (m) => canRole(role, m);
  const visible = MODULES.filter((m) => can(m.key) || (m.key === 'rapports' && ['ventes', 'stock', 'production', 'caisse', 'qualite'].some(can)));
  const current = visible.find((m) => m.key === mod) ? mod : 'dashboard';
  const View = VIEWS[current];
  const go = (m) => { router.push('/app/' + m); setOpen(false); };
  const logout = async () => { await api('auth/logout', { method: 'POST' }).catch(() => {}); router.replace('/'); };
  const meta = MODULES.find((m) => m.key === current);

  return (
    <div className="shell">
      <aside className={'side' + (open ? ' open' : '')}>
        <div className="side-head">
          <div className="logo"><div className="logo-mark">A</div>ANGY ERP</div>
          <div className="company">{me.company?.name}</div>
        </div>
        <nav className="nav">
          {visible.map((m) => (
            <a key={m.key} href={'/app/' + m.key} className={current === m.key ? 'on' : ''} onClick={(e) => { e.preventDefault(); go(m.key); }}>
              <span className="ic">{m.icon}</span>{m.label}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">{me.user.name}</div>
          <div className="role">{ROLES[role]?.label}</div>
          <button onClick={logout}>Se déconnecter</button>
        </div>
      </aside>
      <div className="main" onClick={() => open && setOpen(false)}>
        <div className="topbar"><button onClick={(e) => { e.stopPropagation(); setOpen(true); }}>☰</button><b>{meta?.label}</b></div>
        <div className="content">
          <div className="page-head">
            <div><h1>{meta?.label}</h1><div className="sub">{SUBTITLES[current]}</div></div>
            <div className="muted small">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <View key={current} go={go} can={can} company={me.company} onCompany={load} user={me.user} />
        </div>
      </div>
    </div>
  );
}
