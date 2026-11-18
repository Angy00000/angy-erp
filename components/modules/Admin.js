import { useState } from 'react';
import { op, api, datetime } from '../../lib/client';
import { ROLES, ASSIGNABLE } from '../../lib/perms';
import { Tabs, Form, run, toast, useData, confirmDo } from '../ui';
import CrudTable from '../CrudTable';

export default function Admin({ company, onCompany }) {
  const [tab, setTab] = useState('company');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['company', 'Entreprise'], ['users', 'Utilisateurs'], ['roles', 'Rôles & accès'], ['audit', 'Journal d\'activité']]} />
      {tab === 'company' && <Company company={company} onCompany={onCompany} />}
      {tab === 'users' && <Users />}
      {tab === 'roles' && <Roles />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

// Le logo est réduit sur l'appareil (400 px maximum) puis enregistré avec l'entreprise.
export function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Choisissez une image (PNG, JPG…)'));
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = URL.createObjectURL(file);
  });
}

function Company({ company, onCompany }) {
  const [d, setD] = useState({ ...company });
  const save = () => run(() => op('company_update', d), 'Informations enregistrées').then(onCompany);
  const pick = async (e) => { try { const logo = await readLogo(e.target.files?.[0]); setD((x) => ({ ...x, logo })); } catch (x) { toast(x.message, 'error'); } e.target.value = ''; };
  return (
    <div className="card card-pad" style={{ maxWidth: 820 }}>
      <h3>Informations de l'entreprise (apparaissent sur les factures et documents)</h3>
      <div className="logo-edit">
        <div className="logo-prev">{d.logo ? <img src={d.logo} alt="Logo" /> : <span>Pas de logo</span>}</div>
        <div>
          <b>Logo de l'entreprise</b>
          <p className="muted small" style={{ margin: '4px 0 10px' }}>Il apparaît dans le menu, sur les factures, devis, reçus, bons et toutes les fiches imprimées.</p>
          <div className="row">
            <label className="btn">{d.logo ? 'Changer le logo' : 'Ajouter un logo'}<input type="file" accept="image/*" onChange={pick} hidden /></label>
            {d.logo && <button type="button" className="btn ghost" onClick={() => setD({ ...d, logo: null })}>Retirer</button>}
          </div>
        </div>
      </div>
      <Form data={d} setData={setD} fields={[
        { k: 'name', l: 'Raison sociale', req: true }, { k: 'sector', l: 'Secteur d\'activité' },
        { k: 'slogan', l: 'Slogan (sous le nom sur les documents)', full: true },
        { k: 'phone', l: 'Téléphone(s)' }, { k: 'email', l: 'Email' }, { k: 'address', l: 'Adresse' }, { k: 'city', l: 'Ville', ph: 'Dakar' },
        { k: 'ninea', l: 'NINEA' }, { k: 'rccm', l: 'RCCM' }, { k: 'currency', l: 'Devise' }, { k: 'tax_rate', l: 'Taux de TVA par défaut (%)', t: 'number' },
        { k: 'invoice_footer', l: 'Pied de page des factures (conditions, coordonnées bancaires…)', t: 'textarea', full: true },
      ]} />
      <div className="space" />
      <button className="btn primary" onClick={save}>Enregistrer</button>{d.logo !== company.logo && <span className="muted small" style={{ marginLeft: 10 }}>N'oubliez pas d'enregistrer pour garder le logo.</span>}
    </div>
  );
}

function Users() {
  const { data: roles } = useData(() => api('app/roles'), []);
  const all = [{ key: 'admin', label: 'Administrateur' }, ...(roles || Object.entries(ROLES).filter(([k]) => k !== 'admin').map(([key, r]) => ({ key, label: r.label })))];
  const uniq = all.filter((r, i) => all.findIndex((x) => x.key === r.key) === i);
  const roleOpts = uniq.map((r) => [r.key, r.label]);
  const labelOf = (k) => uniq.find((r) => r.key === k)?.label || ROLES[k]?.label || k;
  return (
    <>
      <div className="note" style={{ marginBottom: 12 }}>Ajoutez un compte pour chaque employé qui utilise le logiciel. Le <b>rôle</b> décide des menus qu'il voit : vous pouvez changer ce que chaque rôle peut faire dans l'onglet <b>Rôles & accès</b>. Un changement de rôle s'applique tout de suite.</div>
      <CrudTable entity="users" title="Utilisateur" newLabel="Nouvel utilisateur"
        columns={[
          { k: 'name', l: 'Nom', fmt: (r) => <span className="strong">{r.name}</span>, csv: (r) => r.name }, { k: 'email', l: 'Email' },
          { k: 'role', l: 'Rôle', fmt: (r) => labelOf(r.role), csv: (r) => labelOf(r.role) }, { k: 'active', l: 'Actif', t: 'bool' },
          { k: 'last_login', l: 'Dernière connexion', fmt: (r) => datetime(r.last_login), csv: (r) => r.last_login },
        ]}
        defaults={{ role: 'vente', active: true }}
        fields={[
          { k: 'name', l: 'Nom complet', req: true }, { k: 'email', l: 'Email (identifiant)', t: 'email', req: true },
          { k: 'role', l: 'Rôle', t: 'select', opts: roleOpts, req: true }, { k: 'password', l: 'Mot de passe', t: 'password', help: 'À la modification : laisser vide pour ne pas changer' },
          { k: 'active', l: 'Compte actif', t: 'bool' },
        ]}
      />
    </>
  );
}

// Rôles & accès : cocher ce que chaque rôle peut ouvrir
const MOD_HELP = {
  ventes: 'Caisse, ventes, clients, dettes, vendeurs',
  caisse: "Argent, comptes, dépenses",
  achats: 'Achats, fournisseurs, liste à acheter',
  production: 'Productions, recettes, rentabilité',
  stock: 'Articles, stock, lots, inventaire',
  qualite: 'Contrôles, HACCP, non-conformités',
  rh: 'Employés, présences, paie',
  rapports: 'Chiffres et bilans',
  gardien: 'Alertes de surveillance',
  argent: "Soldes des comptes, chiffre d'affaires, bénéfices, coûts, valeur du stock. Sans cette case : ne voit que ses propres ventes",
};
function Roles() {
  const { data, reload } = useData(() => api('app/roles'), []);
  const [edit, setEdit] = useState({});
  const [adding, setAdding] = useState(null);
  if (!data) return <div className="spinner">Chargement…</div>;
  const roles = data.filter((r) => r.key !== 'admin');
  const save = async (key, label, modules) => {
    await run(() => api('app/roles_save', { method: 'POST', body: { key, label, modules } }), 'Rôle enregistré');
    setEdit((e) => { const x = { ...e }; delete x[key || '_new']; return x; }); setAdding(null); reload();
  };
  const del = async (r) => {
    if (!confirmDo(r.builtin ? `Remettre « ${r.label} » avec ses accès d'origine ?` : `Supprimer le rôle « ${r.label} » ?`)) return;
    await run(() => api('app/roles_delete', { method: 'POST', body: { key: r.key } }), r.builtin ? 'Rôle remis par défaut' : 'Rôle supprimé');
    reload();
  };
  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>Cochez ce que chaque rôle peut ouvrir, puis <b>Enregistrer</b>. Le changement s'applique tout de suite à tous les employés qui ont ce rôle (ils voient les nouveaux menus en rechargeant la page). Le tableau de bord, l'aide et les imprimés sont pour tout le monde ; l'<b>Administration</b> reste réservée à l'administrateur.</div>
      <div className="toolbar"><div className="grow" /><button className="btn primary" onClick={() => setAdding({ label: '', modules: ['ventes'] })}>+ Nouveau rôle</button></div>
      <div className="role-grid">
        <div className="role-card admin">
          <div className="role-h"><b>Administrateur</b><span className="badge green">Accès à tout</span></div>
          <p className="muted small" style={{ margin: 0 }}>Voit et fait tout, y compris l'Administration. Ne se modifie pas.</p>
        </div>
        {adding && <RoleCard r={{ key: '', label: adding.label, modules: adding.modules, users: 0 }} isNew onSave={save} onCancel={() => setAdding(null)} />}
        {roles.map((r) => <RoleCard key={r.key} r={r} draft={edit[r.key]} setDraft={(v) => setEdit({ ...edit, [r.key]: v })} onSave={save} onDel={() => del(r)} onCancel={() => setEdit((e) => { const x = { ...e }; delete x[r.key]; return x; })} />)}
      </div>
    </div>
  );
}

function RoleCard({ r, draft, setDraft, onSave, onDel, onCancel, isNew }) {
  const [local, setLocal] = useState(isNew ? { label: r.label, modules: r.modules } : null);
  const cur = isNew ? local : (draft || { label: r.label, modules: r.modules });
  const set = (v) => (isNew ? setLocal(v) : setDraft(v));
  const dirty = isNew || !!draft;
  const toggle = (k) => set({ ...cur, modules: cur.modules.includes(k) ? cur.modules.filter((x) => x !== k) : [...cur.modules, k] });
  return (
    <div className={'role-card' + (dirty ? ' dirty' : '')}>
      <div className="role-h">
        <input className="input role-name" value={cur.label} placeholder="Nom du rôle (ex. Livreur)" onChange={(e) => set({ ...cur, label: e.target.value })} />
        {!isNew && <span className="muted small nw">{r.users} utilisateur{r.users > 1 ? 's' : ''}</span>}
      </div>
      {!isNew && r.changed && <div className="small" style={{ margin: '-4px 0 8px', color: 'var(--amber)' }}>Accès modifiés par vous</div>}
      {!isNew && !r.builtin && <div className="small muted" style={{ margin: '-4px 0 8px' }}>Rôle créé par vous</div>}
      <div className="role-mods">
        {ASSIGNABLE.map((m) => {
          const on = cur.modules.includes(m.key);
          return (
            <label key={m.key} className={'role-mod' + (on ? ' on' : '')}>
              <input type="checkbox" checked={on} onChange={() => toggle(m.key)} />
              <span><b>{m.label}</b><small>{MOD_HELP[m.key] || ''}</small></span>
            </label>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {dirty && <button className="btn primary sm" disabled={!cur.label.trim()} onClick={() => onSave(r.key, cur.label.trim(), cur.modules)}>Enregistrer</button>}
        {dirty && <button className="btn sm" onClick={onCancel}>Annuler</button>}
        <div className="grow" />
        {!isNew && !dirty && r.builtin && r.changed && <button className="btn sm ghost" onClick={onDel}>Remettre par défaut</button>}
        {!isNew && !dirty && !r.builtin && <button className="btn sm danger" onClick={onDel}>Supprimer</button>}
      </div>
    </div>
  );
}

function Audit() {
  return (
    <CrudTable entity="audit_logs" title="Activité" canCreate={false} csvName="journal-activite"
      columns={[
        { k: 'created_at', l: 'Date', fmt: (r) => datetime(r.created_at), csv: (r) => r.created_at }, { k: 'user_name', l: 'Utilisateur' },
        { k: 'action', l: 'Action' }, { k: 'entity', l: 'Élément' },
        { k: 'data', l: 'Détail', fmt: (r) => <span className="muted small">{r.data ? [r.data.number, r.data.name].filter(Boolean).join(' · ') || '' : ''}</span>, csv: (r) => JSON.stringify(r.data || '') },
      ]}
    />
  );
}
