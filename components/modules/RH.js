import { useState, useEffect } from 'react';
import { op, crud, money, opts, today, monthStart } from '../../lib/client';
import { Tabs, run, useData, toast } from '../ui';
import CrudTable from '../CrudTable';
import ActionModal from '../ActionModal';

export default function RH() {
  const [tab, setTab] = useState('emp');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['emp', 'Employés'], ['att', 'Pointage'], ['plan', 'Planning des équipes'], ['pay', 'Paie']]} />
      {tab === 'emp' && <Employees />}
      {tab === 'att' && <Attendance />}
      {tab === 'plan' && <Schedules />}
      {tab === 'pay' && <Payroll />}
    </div>
  );
}

function Employees() {
  return (
    <CrudTable entity="employees" title="Employé" csvName="employes" newLabel="Nouvel employé"
      columns={[
        { k: 'code', l: 'Matricule' }, { k: 'name', l: 'Nom', fmt: (r) => <><span className="strong">{r.name}</span>{!r.active && <span className="muted small"> (inactif)</span>}</>, csv: (r) => r.name },
        { k: 'position', l: 'Poste' }, { k: 'department', l: 'Service' }, { k: 'phone', l: 'Téléphone' }, { k: 'contract_type', l: 'Contrat' },
        { k: 'hire_date', l: 'Embauche', t: 'date' }, { k: 'base_salary', l: 'Salaire de base', t: 'money' },
      ]}
      sums={['base_salary']} defaults={{ contract_type: 'CDI', active: true }}
      fields={[
        { k: 'name', l: 'Nom complet', req: true }, { k: 'code', l: 'Matricule' }, { k: 'position', l: 'Poste' },
        { k: 'department', l: 'Service', t: 'select', opts: ['Production', 'Qualité', 'Logistique / stock', 'Commercial', 'Administration', 'Direction', 'Entretien'].map((x) => [x, x]) },
        { k: 'phone', l: 'Téléphone' }, { k: 'hire_date', l: 'Date d\'embauche', t: 'date' },
        { k: 'contract_type', l: 'Type de contrat', t: 'select', opts: ['CDI', 'CDD', 'Stage', 'Journalier', 'Prestataire'].map((x) => [x, x]) },
        { k: 'base_salary', l: 'Salaire de base mensuel', t: 'number' }, { k: 'address', l: 'Adresse', full: true },
        { k: 'notes', l: 'Notes (formations, visites médicales…)', t: 'textarea', full: true }, { k: 'active', l: 'Actif', t: 'bool' },
      ]}
    />
  );
}

function Attendance() {
  const [day, setDay] = useState(today());
  const { data: emps } = useData(() => crud.list('employees', { active: true }), []);
  const { data: existing, reload } = useData(() => crud.list('attendance', { date: day }), [day]);
  const [rows, setRows] = useState({});
  useEffect(() => {
    if (!emps || !existing) return;
    const m = {};
    for (const e of emps) {
      const a = existing.find((x) => x.employee_id === e.id);
      m[e.id] = { status: a?.status || 'present', hours: a?.hours ?? 8, note: a?.note || '' };
    }
    setRows(m);
  }, [emps, existing]);
  const save = () => run(() => op('attendance_save', { date: day, entries: Object.entries(rows).map(([employee_id, v]) => ({ employee_id: Number(employee_id), ...v })) }), 'Pointage enregistré').then(reload);
  const set = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  return (
    <div>
      <div className="toolbar">
        <input type="date" className="input sm" value={day} onChange={(e) => setDay(e.target.value)} />
        <span className="muted small">{existing?.length ? `Pointage déjà saisi (${existing.length})` : 'Pas encore saisi pour ce jour'}</span>
        <div className="grow" />
        <button className="btn primary" onClick={save}>Enregistrer le pointage</button>
      </div>
      <div className="card"><div className="table-wrap"><table className="t">
        <thead><tr><th>Employé</th><th>Poste</th><th>Statut</th><th>Heures</th><th>Note</th></tr></thead>
        <tbody>{(emps || []).map((e) => rows[e.id] && (
          <tr key={e.id}><td className="strong">{e.name}</td><td>{e.position}</td>
            <td><select className="input" value={rows[e.id].status} onChange={(ev) => set(e.id, { status: ev.target.value })}>{opts('attendance').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
            <td style={{ width: 100 }}><input className="input" type="number" value={rows[e.id].hours ?? ''} onChange={(ev) => set(e.id, { hours: ev.target.value })} /></td>
            <td><input className="input" value={rows[e.id].note} onChange={(ev) => set(e.id, { note: ev.target.value })} /></td></tr>
        ))}</tbody>
      </table>{emps && !emps.length && <div className="empty">Ajoutez d'abord des employés</div>}</div></div>
    </div>
  );
}

function Schedules() {
  const week = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };
  return (
    <CrudTable entity="schedules" title="Affectation" csvName="planning-equipes" dateRange initialRange={{ from: today(), to: week() }} newLabel="Affecter"
      filters={[{ k: 'employee_id', l: 'Employé', ref: 'employees' }]}
      columns={[{ k: 'date', l: 'Date', t: 'date' }, { k: 'shift', l: 'Poste horaire' }, { k: 'employee_name', l: 'Employé', fmt: (r) => <span className="strong">{r.employee_name}</span>, csv: (r) => r.employee_name }, { k: 'task', l: 'Tâche' }, { k: 'production_number', l: 'OF' }]}
      defaults={() => ({ date: today(), shift: 'Matin (7h-15h)' })}
      fields={[
        { k: 'employee_id', l: 'Employé', t: 'ref', ref: 'employees', params: { active: true }, req: true }, { k: 'date', l: 'Date', t: 'date', req: true },
        { k: 'shift', l: 'Poste horaire', t: 'select', opts: ['Matin (7h-15h)', 'Après-midi (15h-23h)', 'Nuit (23h-7h)', 'Journée (8h-17h)'].map((x) => [x, x]) },
        { k: 'production_id', l: 'Ordre de fabrication', t: 'ref', ref: 'production_orders', params: { status: 'planifie' }, label: (r) => `${r.number} — ${r.product_name || ''}` },
        { k: 'task', l: 'Tâche', full: true, ph: 'Ex. Pasteurisation, embouteillage, nettoyage…' },
      ]}
    />
  );
}

function Payroll() {
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [pay, setPay] = useState(null);
  return (
    <>
      <div className="toolbar">
        <input type="month" className="input sm" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>
      <CrudTable key={period} entity="payrolls" title="Bulletin de paie" params={{ period }} csvName={'paie-' + period} canCreate={false}
        toolbar={(reload) => <button className="btn primary" onClick={() => run(() => op('payroll_generate', { period }), null).then((r) => { toast(`${r.created} bulletin(s) généré(s)`); reload(); })}>Générer les bulletins du mois</button>}
        columns={[
          { k: 'employee_name', l: 'Employé', fmt: (r) => <span className="strong">{r.employee_name}</span>, csv: (r) => r.employee_name }, { k: 'position', l: 'Poste' },
          { k: 'base', l: 'Base', t: 'money' }, { k: 'bonus', l: 'Primes', t: 'money' }, { k: 'deductions', l: 'Retenues', t: 'money' }, { k: 'advance', l: 'Avances', t: 'money' },
          { k: 'net', l: 'Net à payer', t: 'money' }, { k: 'status', l: 'Statut', t: 'badge', map: 'payroll_status' },
        ]}
        sums={['base', 'bonus', 'deductions', 'advance', 'net']}
        canEdit={(r) => r.status !== 'paye'} canDelete={(r) => r.status !== 'paye'}
        fields={[{ k: 'base', l: 'Salaire de base', t: 'number' }, { k: 'bonus', l: 'Primes / heures sup.', t: 'number' }, { k: 'deductions', l: 'Retenues (absences, cotisations…)', t: 'number' }, { k: 'advance', l: 'Avances déjà versées', t: 'number' }]}
        rowActions={(r, reload) => r.status !== 'paye' && <button className="btn sm accent" onClick={() => setPay({ row: r, reload })}>Payer</button>}
        empty="Aucun bulletin pour cette période : cliquez sur « Générer les bulletins du mois »."
      />
      {pay && <ActionModal title={`Payer ${pay.row.employee_name} — ${money(pay.row.net)}`} initial={{ date: today() }}
        fields={[{ k: 'account_id', l: 'Payé depuis', t: 'ref', ref: 'accounts', req: true }, { k: 'date', l: 'Date', t: 'date' }]}
        onSubmit={(d) => op('payroll_pay', { ...d, id: pay.row.id })} onClose={(ok) => { const r = pay.reload; setPay(null); if (ok) r(); }} />}
    </>
  );
}
