import { useState } from 'react';
import { op, datetime } from '../../lib/client';
import { ROLES, MODULES } from '../../lib/perms';
import { Tabs, Form, run } from '../ui';
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

function Company({ company, onCompany }) {
  const [d, setD] = useState({ ...company });
  const save = () => run(() => op('company_update', d), 'Informations enregistrées').then(onCompany);
  return (
    <div className="card card-pad" style={{ maxWidth: 820 }}>
      <h3>Informations de l'entreprise (apparaissent sur les factures et documents)</h3>
      <Form data={d} setData={setD} fields={[
        { k: 'name', l: 'Raison sociale', req: true }, { k: 'sector', l: 'Secteur d\'activité' },
        { k: 'phone', l: 'Téléphone' }, { k: 'email', l: 'Email' }, { k: 'address', l: 'Adresse', full: true },
        { k: 'ninea', l: 'NINEA' }, { k: 'rccm', l: 'RCCM' }, { k: 'currency', l: 'Devise' }, { k: 'tax_rate', l: 'Taux de TVA par défaut (%)', t: 'number' },
        { k: 'invoice_footer', l: 'Pied de page des factures (conditions, coordonnées bancaires…)', t: 'textarea', full: true },
      ]} />
      <div className="space" />
      <button className="btn primary" onClick={save}>Enregistrer</button>
    </div>
  );
}

function Users() {
  const roleOpts = Object.entries(ROLES).map(([k, r]) => [k, r.label]);
  return (
    <>
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
          <thead><tr><th>Rôle</th>{MODULES.map((m) => <th key={m.key} style={{ textAlign: 'center' }}>{m.label.split(' ')[0]}</th>)}</tr></thead>
          <tbody>{Object.entries(ROLES).map(([k, r]) => <tr key={k}><td className="strong">{r.label}</td>{MODULES.map((m) => <td key={m.key} style={{ textAlign: 'center' }}>{r.modules === '*' || r.modules.includes(m.key) ? <span className="pos strong">✓</span> : <span className="muted">—</span>}</td>)}</tr>)}</tbody>
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
