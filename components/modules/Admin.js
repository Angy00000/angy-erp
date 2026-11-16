import { useState } from 'react';
import { op, datetime } from '../../lib/client';
import { ROLES, MODULES, can } from '../../lib/perms';
import { Tabs, Form, run, toast } from '../ui';
import CrudTable from '../CrudTable';

export default function Admin({ company, onCompany }) {
  const [tab, setTab] = useState('company');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['company', 'Entreprise'], ['users', 'Utilisateurs & rôles'], ['audit', 'Journal d\'activité']]} />
      {tab === 'company' && <Company company={company} onCompany={onCompany} />}
      {tab === 'users' && <Users />}
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
  const roleOpts = Object.entries(ROLES).map(([k, r]) => [k, r.label]);
  return (
    <>
      <div className="note" style={{ marginBottom: 12 }}>Ajoutez un compte pour chaque employé qui utilise le logiciel. Le <b>rôle</b> décide des menus qu'il voit (tableau ci-dessous). Donnez-lui son email et son mot de passe : il pourra ensuite le changer lui-même (icône clé en bas du menu).</div>
      <CrudTable entity="users" title="Utilisateur" newLabel="Nouvel utilisateur"
        columns={[
          { k: 'name', l: 'Nom', fmt: (r) => <span className="strong">{r.name}</span>, csv: (r) => r.name }, { k: 'email', l: 'Email' },
          { k: 'role', l: 'Rôle', fmt: (r) => ROLES[r.role]?.label || r.role, csv: (r) => r.role }, { k: 'active', l: 'Actif', t: 'bool' },
          { k: 'last_login', l: 'Dernière connexion', fmt: (r) => datetime(r.last_login), csv: (r) => r.last_login },
        ]}
        defaults={{ role: 'vente', active: true }}
        fields={[
          { k: 'name', l: 'Nom complet', req: true }, { k: 'email', l: 'Email (identifiant)', t: 'email', req: true },
          { k: 'role', l: 'Rôle', t: 'select', opts: roleOpts, req: true }, { k: 'password', l: 'Mot de passe', t: 'password', help: 'À la modification : laisser vide pour ne pas changer' },
          { k: 'active', l: 'Compte actif', t: 'bool' },
        ]}
      />
      <div className="space" />
      <div className="card card-pad">
        <h3>Accès par rôle</h3>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Rôle</th>{MODULES.map((m) => <th key={m.key} style={{ textAlign: 'center' }} title={m.label}>{({ admin: 'Admin', dashboard: 'Tableau' })[m.key] || m.label.replace(/^Le /, '').split(/[ &]/)[0]}</th>)}</tr></thead>
          <tbody>{Object.entries(ROLES).map(([k, r]) => <tr key={k}><td className="strong">{r.label}</td>{MODULES.map((m) => <td key={m.key} style={{ textAlign: 'center' }}>{can(k, m.key) ? <span className="pos strong">✓</span> : <span className="muted">—</span>}</td>)}</tr>)}</tbody>
        </table></div>
      </div>
    </>
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
