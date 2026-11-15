import { useState, useEffect } from 'react';
import { op, crud, report, money, num, opts, today, date, datetime, LABELS } from '../../lib/client';
import { Tabs, Badge, run, invalidateRefs, toast } from '../ui';
import CrudTable from '../CrudTable';
import ActionModal from '../ActionModal';

export default function Qualite() {
  const [tab, setTab] = useState('controls');
  const [traceLot, setTraceLot] = useState('');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['controls', 'Contrôles'], ['release', 'Libération des lots'], ['nc', 'Non-conformités & CAPA'], ['haccp', 'Plan HACCP'], ['trace', 'Traçabilité']]} />
      {tab === 'controls' && <Controls />}
      {tab === 'release' && <Release onTrace={(n) => { setTraceLot(n); setTab('trace'); }} />}
      {tab === 'nc' && <NC />}
      {tab === 'haccp' && <Haccp />}
      {tab === 'trace' && <Trace initial={traceLot} />}
    </div>
  );
}

const QC_FIELDS = [
  { k: 'type', l: 'Type de contrôle', t: 'select', opts: opts('qc_type'), req: true },
  { k: 'date', l: 'Date', t: 'date' },
  { k: 'lot_id', l: 'Lot contrôlé', t: 'ref', ref: 'lots', params: { instock: 1 }, label: (r) => `${r.lot_number} — ${r.item_name}` },
  { k: 'production_id', l: 'Ordre de fabrication', t: 'ref', ref: 'production_orders', label: (r) => `${r.number} — ${r.product_name || ''}` },
  { k: 'item_id', l: 'Article', t: 'ref', ref: 'items' },
  { k: 'parameter', l: 'Paramètre contrôlé', req: true, ph: 'Ex. Température pasteurisation, °Brix, pH, aspect…' },
  { k: 'value', l: 'Valeur mesurée', req: true }, { k: 'target', l: 'Spécification / limite', ph: 'Ex. ≥ 85 °C' },
  { k: 'result', l: 'Résultat', t: 'select', opts: opts('qc_result'), req: true }, { k: 'controller', l: 'Contrôleur' },
  { k: 'notes', l: 'Observations', t: 'textarea', full: true },
];

function Controls() {
  const [nc, setNc] = useState(null);
  return (
    <>
      <CrudTable entity="quality_controls" title="Contrôle qualité" csvName="controles-qualite" newLabel="Nouveau contrôle"
        filters={[{ k: 'type', l: 'Type', opts: opts('qc_type') }, { k: 'result', l: 'Résultat', opts: opts('qc_result') }]}
        columns={[
          { k: 'date', l: 'Date', fmt: (r) => datetime(r.date), csv: (r) => r.date }, { k: 'type', l: 'Type', map: 'qc_type' },
          { k: 'parameter', l: 'Paramètre', fmt: (r) => <span className="strong">{r.parameter}</span>, csv: (r) => r.parameter },
          { k: 'value', l: 'Mesure' }, { k: 'target', l: 'Spécification' },
          { k: 'lot_number', l: 'Lot / OF', fmt: (r) => <span className="mono small">{[r.lot_number, r.production_number].filter(Boolean).join(' · ')}</span>, csv: (r) => r.lot_number },
          { k: 'item_name', l: 'Article' }, { k: 'controller', l: 'Contrôleur' }, { k: 'result', l: 'Résultat', t: 'badge', map: 'qc_result' },
        ]}
        defaults={() => ({ type: 'produit_fini', date: today(), result: 'conforme' })}
        fields={QC_FIELDS}
        rowActions={(r) => r.result === 'non_conforme' && <button className="btn sm danger" onClick={() => setNc(r)}>Ouvrir une NC</button>}
      />
      {nc && <ActionModal title="Ouvrir une non-conformité" initial={{ date: today(), source: 'Contrôle ' + (LABELS.qc_type[nc.type] || ''), lot_id: nc.lot_id, severity: 'majeure', description: `${nc.parameter} : mesuré ${nc.value} (spécification ${nc.target || '—'})` }}
        fields={NC_FIELDS.slice(0, 7)} onSubmit={(d) => crud.create('nonconformities', { ...d, status: 'ouverte' })} onClose={() => setNc(null)} />}
    </>
  );
}

function Release({ onTrace }) {
  const [modal, setModal] = useState(null);
  const act = (r, status, reload) => run(() => op('lot_status', { lot_id: r.id, status }), status === 'ok' ? 'Lot libéré' : 'Statut mis à jour').then(() => { invalidateRefs('lots'); invalidateRefs('items'); reload(); });
  return (
    <>
      <div className="note" style={{ marginBottom: 12 }}>Lots en quarantaine ou bloqués : ils ne peuvent être ni vendus ni consommés en production tant qu'ils ne sont pas libérés.</div>
      {['quarantaine', 'bloque'].map((st) => (
        <div key={st} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, margin: '6px 0 10px' }}>{st === 'quarantaine' ? 'En quarantaine — en attente de libération' : 'Bloqués'}</h3>
          <CrudTable entity="lots" title="Lot" canCreate={false} params={{ status: st, instock: 1 }} csvName={'lots-' + st}
            columns={[{ k: 'lot_number', l: 'Lot', fmt: (r) => <span className="mono strong">{r.lot_number}</span>, csv: (r) => r.lot_number }, { k: 'item_name', l: 'Article' }, { k: 'qty', l: 'Qté', r: true, fmt: (r) => `${num(r.qty)} ${r.unit}`, csv: (r) => r.qty }, { k: 'production_date', l: 'Date', t: 'date' }, { k: 'expiry_date', l: 'DLC', t: 'date' }, { k: 'supplier_name', l: 'Fournisseur' }]}
            rowActions={(r, reload) => <>
              <button className="btn sm" onClick={() => onTrace(r.lot_number)}>Tracer</button>
              <button className="btn sm" onClick={() => setModal({ row: r, reload })}>+ Contrôle</button>
              <button className="btn sm primary" onClick={() => act(r, 'ok', reload)}>Libérer</button>
              {st !== 'bloque' && <button className="btn sm danger" onClick={() => act(r, 'bloque', reload)}>Bloquer</button>}
              {st === 'bloque' && <button className="btn sm" onClick={() => act(r, 'quarantaine', reload)}>→ Quarantaine</button>}
            </>}
            empty="Aucun lot"
          />
        </div>
      ))}
      {modal && <ActionModal title={`Contrôle du lot ${modal.row.lot_number}`} initial={{ type: 'produit_fini', lot_id: modal.row.id, item_id: modal.row.item_id, date: today(), result: 'conforme' }}
        fields={QC_FIELDS.filter((f) => !['lot_id', 'item_id', 'production_id'].includes(f.k))}
        onSubmit={(d) => crud.create('quality_controls', d)} onClose={() => setModal(null)} />}
    </>
  );
}

const NC_FIELDS = [
  { k: 'date', l: 'Date de détection', t: 'date', req: true },
  { k: 'source', l: 'Origine', t: 'select', opts: ['Réception', 'Production', 'Contrôle produit fini', 'Contrôle Réception MP', 'Contrôle En cours de fabrication', 'Contrôle Produit fini', 'Réclamation client', 'Audit interne', 'Hygiène', 'Stockage', 'Autre'].map((x) => [x, x]) },
  { k: 'lot_id', l: 'Lot concerné', t: 'ref', ref: 'lots', label: (r) => `${r.lot_number} — ${r.item_name}` },
  { k: 'severity', l: 'Gravité', t: 'select', opts: opts('severity') },
  { k: 'description', l: 'Description de l\'écart', t: 'textarea', full: true, req: true },
  { k: 'responsible', l: 'Responsable du traitement' }, { k: 'due_date', l: 'Échéance', t: 'date' },
  { k: 'root_cause', l: 'Analyse des causes (5M : matière, méthode, main-d\'œuvre, milieu, matériel)', t: 'textarea', full: true },
  { k: 'corrective_action', l: 'Actions correctives / préventives', t: 'textarea', full: true },
  { k: 'status', l: 'Statut', t: 'select', opts: opts('nc_status') }, { k: 'closed_at', l: 'Date de clôture', t: 'date', show: (d) => d.status === 'cloturee' },
];

function NC() {
  return (
    <CrudTable entity="nonconformities" title="Non-conformité" csvName="non-conformites" newLabel="Nouvelle NC"
      filters={[{ k: 'status', l: 'Statut', opts: opts('nc_status') }, { k: 'severity', l: 'Gravité', opts: opts('severity') }]}
      columns={[
        { k: 'number', l: 'N°', fmt: (r) => <span className="strong">{r.number}</span>, csv: (r) => r.number }, { k: 'date', l: 'Date', t: 'date' }, { k: 'source', l: 'Origine' },
        { k: 'description', l: 'Description', fmt: (r) => <span title={r.description}>{(r.description || '').slice(0, 70)}{(r.description || '').length > 70 ? '…' : ''}</span>, csv: (r) => r.description },
        { k: 'lot_number', l: 'Lot', fmt: (r) => <span className="mono">{r.lot_number}</span>, csv: (r) => r.lot_number }, { k: 'severity', l: 'Gravité', t: 'badge', map: 'severity' },
        { k: 'responsible', l: 'Responsable' },
        { k: 'due_date', l: 'Échéance', fmt: (r) => r.due_date ? <span className={r.status !== 'cloturee' && r.due_date < today() ? 'neg strong' : ''}>{date(r.due_date)}</span> : '', csv: (r) => r.due_date },
        { k: 'status', l: 'Statut', t: 'badge', map: 'nc_status' },
      ]}
      defaults={() => ({ date: today(), severity: 'mineure', status: 'ouverte' })}
      fields={NC_FIELDS}
    />
  );
}

function Haccp() {
  return (
    <>
      <div className="row no-print" style={{ justifyContent: 'flex-end', marginBottom: 8 }}><button className="btn" onClick={() => window.print()}>Imprimer le plan</button></div>
      <CrudTable entity="haccp_points" title="Étape HACCP" csvName="plan-haccp" newLabel="Nouvelle étape"
        columns={[
          { k: 'step', l: 'Étape', fmt: (r) => <span className="strong">{r.step}</span>, csv: (r) => r.step }, { k: 'hazard', l: 'Danger' },
          { k: 'is_ccp', l: 'CCP', fmt: (r) => (r.is_ccp ? <span className="badge red">CCP</span> : <span className="badge gray">PRPo</span>), csv: (r) => (r.is_ccp ? 'CCP' : 'PRPo') },
          { k: 'critical_limit', l: 'Limite critique' }, { k: 'monitoring', l: 'Surveillance' }, { k: 'frequency', l: 'Fréquence' }, { k: 'corrective_action', l: 'Action corrective' }, { k: 'responsible', l: 'Responsable' },
        ]}
        defaults={{ is_ccp: false }}
        fields={[
          { k: 'step', l: 'Étape du procédé', req: true, full: true }, { k: 'hazard', l: 'Danger (biologique, chimique, physique, allergène)', full: true },
          { k: 'is_ccp', l: 'Point critique pour la maîtrise (CCP)', t: 'bool', full: true }, { k: 'critical_limit', l: 'Limite critique' }, { k: 'monitoring', l: 'Méthode de surveillance' },
          { k: 'frequency', l: 'Fréquence' }, { k: 'responsible', l: 'Responsable' }, { k: 'corrective_action', l: 'Action corrective', t: 'textarea', full: true },
        ]}
      />
    </>
  );
}

function Trace({ initial }) {
  const [lot, setLot] = useState(initial || '');
  const [data, setData] = useState(null);
  const search = async (v) => {
    const val = (v ?? lot).trim();
    if (!val) return;
    try { setData(await report('trace', { lot_number: val })); } catch (e) { setData(null); toast(e.message, 'error'); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (initial) search(initial); }, [initial]);
  return (
    <div>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 360 }} placeholder="Numéro de lot (matière ou produit fini)" value={lot} onChange={(e) => setLot(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn primary" onClick={() => search()}>Tracer</button>
        {data && <button className="btn" onClick={() => window.print()}>Imprimer</button>}
      </div>
      {data && (
        <div className="grid g2">
          <div className="card card-pad">
            <h3>Lot {data.lot.lot_number}</h3>
            <dl className="kv">
              <dt>Article</dt><dd className="strong">{data.lot.item_name}</dd>
              <dt>Quantité initiale</dt><dd>{num(data.lot.initial_qty)} {data.lot.unit}</dd>
              <dt>Quantité restante</dt><dd>{num(data.lot.qty)} {data.lot.unit}</dd>
              <dt>Date</dt><dd>{date(data.lot.production_date)}</dd>
              <dt>DLC</dt><dd>{date(data.lot.expiry_date) || '—'}</dd>
              <dt>Statut</dt><dd><Badge v={data.lot.status} map="lot_status" /></dd>
              <dt>Coût unitaire</dt><dd>{money(data.lot.unit_cost)}</dd>
              {data.lot.supplier_name && <><dt>Fournisseur</dt><dd>{data.lot.supplier_name}</dd></>}
              {data.origin && <><dt>Origine</dt><dd>{data.origin.number} {data.origin.team ? '· ' + data.origin.team : ''}</dd></>}
            </dl>
          </div>
          <div className="card card-pad">
            <h3>Contrôles qualité associés</h3>
            {!data.controls.length && <div className="muted small">Aucun contrôle enregistré</div>}
            {data.controls.map((c, i) => <div key={i} className="list-row"><span>{c.parameter} : <b>{c.value}</b> <span className="muted small">({c.target || '—'})</span><br /><span className="muted small">{datetime(c.date)} · {c.controller}</span></span><Badge v={c.result} map="qc_result" /></div>)}
          </div>
          <div className="card card-pad">
            <h3>↑ Amont — matières utilisées</h3>
            {!data.upstream.length && <div className="muted small">{data.lot.source_type === 'production_orders' ? 'Aucune consommation enregistrée' : 'Lot d\'origine externe (achat / entrée manuelle)'}</div>}
            {data.upstream.map((u, i) => <div key={i} className="trace-step"><span className="strong">{u.name}</span> — lot <span className="mono">{u.lot_number}</span><br /><span className="muted small">{num(u.qty)} {u.unit} · {u.supplier_name || 'fournisseur ?'} · DLC {date(u.expiry_date) || '—'}</span></div>)}
          </div>
          <div className="card card-pad">
            <h3>↓ Aval — destinations du lot</h3>
            {!data.downstream.length && <div className="muted small">Aucune sortie de ce lot</div>}
            {data.downstream.map((d, i) => <div key={i} className="trace-step"><span className="strong">{LABELS.move_type[d.type] || d.type}</span> — {d.reference}<br /><span className="muted small">{num(-d.qty)} {data.lot.unit} · {datetime(d.created_at)}</span></div>)}
          </div>
        </div>
      )}
      {!data && <div className="card empty">Saisissez un numéro de lot pour obtenir sa traçabilité complète : matières premières utilisées, fournisseurs, contrôles et clients livrés. Indispensable en cas de rappel produit.</div>}
    </div>
  );
}
