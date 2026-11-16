import { useState, useEffect } from 'react';
import { op, crud, money, num, opts, today, report, date, LABELS } from '../../lib/client';
import { Tabs, Badge, run, confirmDo, invalidateRefs, useData, Modal, Stat, useRefOptions, RefSelect, toast } from '../ui';
import { EXPENSE_CATS } from './Caisse';
import CrudTable from '../CrudTable';
import ActionModal from '../ActionModal';

export default function Production() {
  const [tab, setTab] = useState('of');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['of', 'Ordres de fabrication'], ['profit', 'Rentabilité par production'], ['plan', 'Planning'], ['mrp', 'Besoins matières'], ['recipes', 'Recettes / nomenclatures']]} />
      {tab === 'of' && <Orders />}
      {tab === 'profit' && <Profitability />}
      {tab === 'plan' && <Planning />}
      {tab === 'mrp' && <MRP />}
      {tab === 'recipes' && <Recipes />}
    </div>
  );
}

function Orders() {
  const [modal, setModal] = useState(null);
  const close = (reload) => (ok) => { setModal(null); if (ok) { invalidateRefs('items'); invalidateRefs('lots'); reload(); } };
  return (
    <>
      <CrudTable entity="production_orders" title="Ordre de fabrication" csvName="ordres-fabrication" newLabel="OF avec recette"
        toolbar={(reload) => <button className="btn accent" onClick={() => setModal({ k: 'quick', reload })}>⚡ Production rapide</button>}
        filters={[{ k: 'status', l: 'Statut', opts: opts('prod_status') }, { k: 'product_id', l: 'Produit', ref: 'items', params: { type: 'pf' } }]}
        columns={[
          { k: 'number', l: 'N° OF', fmt: (r) => <span className="strong">{r.number}</span>, csv: (r) => r.number },
          { k: 'product_name', l: 'Produit' }, { k: 'planned_date', l: 'Date prévue', t: 'date' },
          { k: 'planned_qty', l: 'Prévu', r: true, fmt: (r) => `${num(r.planned_qty)} ${r.product_unit || ''}`, csv: (r) => r.planned_qty },
          { k: 'produced_qty', l: 'Produit', r: true, fmt: (r) => (r.status === 'termine' ? <>{num(r.produced_qty)}{r.rejected_qty > 0 && <span className="neg small"> (−{num(r.rejected_qty)})</span>}</> : '—'), csv: (r) => r.produced_qty },
          { k: 'lot_number', l: 'Lot', fmt: (r) => <span className="mono">{r.lot_number}</span>, csv: (r) => r.lot_number },
          { k: 'unit_cost', l: 'Coût unitaire', r: true, fmt: (r) => (r.status === 'termine' ? money(r.unit_cost) : ''), csv: (r) => r.unit_cost },
          { k: 'total_cost', l: 'Coût total', t: 'money' },
          { k: 'status', l: 'Statut', t: 'badge', map: 'prod_status' },
        ]}
        defaults={() => ({ planned_date: today() })}
        canEdit={(r) => ['planifie', 'en_cours'].includes(r.status)} canDelete={(r) => r.status === 'planifie'}
        fields={[
          { k: 'recipe_id', l: 'Recette', t: 'ref', ref: 'recipes', params: { active: true }, req: true, full: true, label: (r) => `${r.name} (rend ${num(r.yield_qty)} ${r.product_unit || ''})` },
          { k: 'planned_qty', l: 'Quantité à produire', t: 'number', req: true }, { k: 'planned_date', l: 'Date prévue', t: 'date' },
          { k: 'team', l: 'Équipe / responsable' }, { k: 'lot_number', l: 'N° de lot (optionnel)', ph: 'Automatique' },
          { k: 'labor_cost', l: 'Main-d\'œuvre (optionnel)', t: 'number', help: 'Vide = valeur de la recette' }, { k: 'overhead_cost', l: 'Frais généraux (optionnel)', t: 'number' },
          { k: 'notes', l: 'Instructions / notes', t: 'textarea', full: true },
        ]}
        rowActions={(r, reload) => <>
          {r.status === 'termine' && <button className="btn sm primary" onClick={() => setModal({ k: 'detail', row: r })}>Coûts & bénéfice</button>}
          <a className="btn sm" href={`/print/production_orders/${r.id}`} target="_blank" rel="noreferrer">Fiche</a>
          {['planifie', 'en_cours'].includes(r.status) && <button className="btn sm" onClick={() => setModal({ k: 'check', row: r })}>Besoins</button>}
          {r.status === 'planifie' && <button className="btn sm" onClick={() => run(() => op('prod_start', { id: r.id }), 'Production démarrée').then(reload)}>Démarrer</button>}
          {['planifie', 'en_cours'].includes(r.status) && <button className="btn sm primary" onClick={() => setModal({ k: 'done', row: r, reload })}>Terminer</button>}
          {['planifie', 'en_cours'].includes(r.status) && <button className="btn sm danger" onClick={() => confirmDo('Annuler cet ordre de fabrication ?') && run(() => op('prod_cancel', { id: r.id }), 'OF annulé').then(reload)}>Annuler</button>}
        </>}
      />
      {modal?.k === 'check' && <CheckModal row={modal.row} onClose={() => setModal(null)} />}
      {modal?.k === 'done' && <CompleteModal row={modal.row} onClose={(ok) => { const row = modal.row; close(modal.reload)(ok); if (ok) setModal({ k: 'detail', row }); }} />}
      {modal?.k === 'detail' && <ProdDetail id={modal.row.id} onClose={() => setModal(null)} />}
      {modal?.k === 'quick' && <QuickProd onClose={(res) => { const rl = modal.reload; setModal(res && res.orders?.length === 1 ? { k: 'detail', row: { id: res.id } } : null); if (res) { invalidateRefs('items'); invalidateRefs('lots'); rl(); } }} />}
    </>
  );
}

function ReqTable({ lines }) {
  return (
    <table className="t">
      <thead><tr><th>Matière</th><th className="r">Besoin</th><th className="r">Disponible</th><th className="r">Manque</th><th className="r">Coût estimé</th></tr></thead>
      <tbody>{lines.map((l) => (
        <tr key={l.item_id}><td>{l.name}</td><td className="r">{num(l.required)} {l.unit}</td><td className="r">{num(l.available)}</td>
          <td className="r">{l.missing > 0 ? <span className="neg strong">{num(l.missing)}</span> : <span className="pos">OK</span>}</td><td className="r">{money(l.est_cost)}</td></tr>
      ))}</tbody>
      <tfoot><tr><td>Total matières</td><td /><td /><td /><td className="r">{money(lines.reduce((s, l) => s + l.est_cost, 0))}</td></tr></tfoot>
    </table>
  );
}

function CheckModal({ row, onClose }) {
  const { data, error } = useData(() => op('prod_check', { id: row.id }), [row.id]);
  return (
    <Modal title={`Besoins matières — ${row.number}`} onClose={onClose} wide>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="spinner">Calcul…</div>}
      {data && <>
        <div className="muted" style={{ marginBottom: 10 }}>{row.product_name} · {num(row.planned_qty)} {row.product_unit} à produire</div>
        <ReqTable lines={data.lines} />
        {data.lines.some((l) => l.missing > 0) ? <div className="err" style={{ marginTop: 12 }}>Stock insuffisant : commandez les matières manquantes avant de lancer la production.</div> : <div className="note" style={{ marginTop: 12 }}>Toutes les matières sont disponibles ✓</div>}
      </>}
    </Modal>
  );
}

function CompleteModal({ row, onClose }) {
  const [req, setReq] = useState(null);
  useEffect(() => { op('prod_check', { id: row.id }).then(setReq).catch(() => setReq({ lines: [] })); }, [row.id]);
  if (!req) return null;
  return (
    <ActionModal wide title={`Clôturer la production — ${row.number}`} submitLabel="Enregistrer la production"
      initial={{ produced_qty: row.planned_qty, rejected_qty: 0, lot_number: row.lot_number || '', consumptions: req.lines.map((l) => ({ item_id: l.item_id, name: l.name, unit: l.unit, qty: l.required })) }}
      fields={[
        { k: 'produced_qty', l: `Quantité conforme produite (${row.product_unit || ''})`, t: 'number', req: true }, { k: 'rejected_qty', l: 'Quantité rebutée / non conforme', t: 'number' },
        { k: 'lot_number', l: 'N° de lot produit fini', ph: 'Automatique si vide' }, { k: 'expiry_date', l: 'DLC', t: 'date', help: 'Vide = selon la durée de vie de l\'article' },
        { k: 'warehouse_id', l: 'Entrepôt de stockage', t: 'ref', ref: 'warehouses' }, { k: 'expense_cost', l: 'Dépenses de production (achats du jour)', t: 'number', help: 'Ingrédients, sucre, gaz… achetés pour cette production' },
        { k: 'account_id', l: 'Dépenses payées depuis (optionnel)', t: 'ref', ref: 'accounts', show: (x) => Number(x.expense_cost) > 0 },
        { k: 'labor_cost', l: 'Main-d\'œuvre réelle (optionnel)', t: 'number' }, { k: 'overhead_cost', l: 'Frais généraux réels (optionnel)', t: 'number' },
        { k: 'quarantine', l: 'Placer le lot en quarantaine (libération après contrôle qualité)', t: 'bool', full: true },
      ]}
      onSubmit={async (d) => {
        const r = await op('prod_complete', { ...d, id: row.id, consumptions: d.consumptions.map((c) => ({ item_id: c.item_id, qty: c.qty })) });
      }}
      onClose={onClose}>
      {(d, setD) => (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 6 }}>Consommations réelles de matières</h3>
          <div className="muted small" style={{ marginBottom: 8 }}>Pré-remplies selon la recette pour la quantité prévue. Corrigez si la consommation réelle diffère. Les lots sont prélevés automatiquement en FEFO.</div>
          <table className="lines"><tbody>
            {d.consumptions.map((c, i) => (
              <tr key={c.item_id}><td style={{ width: '55%' }}>{c.name}</td>
                <td><input className="input" type="number" step="any" value={c.qty} onChange={(e) => setD((x) => ({ ...x, consumptions: x.consumptions.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)) }))} /></td>
                <td className="muted">{c.unit}</td>
                <td className="small">{(req.lines[i]?.missing || 0) > 0 && <span className="neg">dispo {num(req.lines[i].available)}</span>}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
    </ActionModal>
  );
}

function Planning() {
  const { data } = useData(() => crud.list('production_orders', { limit: 300 }), []);
  const rows = (data || []).filter((r) => ['planifie', 'en_cours'].includes(r.status));
  const byDate = {};
  for (const r of rows) (byDate[r.planned_date || 'Sans date'] ||= []).push(r);
  const days = Object.keys(byDate).sort();
  if (!data) return <div className="spinner">Chargement…</div>;
  if (!days.length) return <div className="card empty">Aucun ordre de fabrication planifié. Créez un OF dans l'onglet « Ordres de fabrication ».</div>;
  return (
    <div className="grid g3">
      {days.map((d) => (
        <div key={d} className="card card-pad">
          <h3>{d === 'Sans date' ? d : new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {byDate[d].map((r) => (
            <div key={r.id} className="list-row">
              <span><span className="strong">{r.product_name}</span><br /><span className="muted small">{r.number} · {num(r.planned_qty)} {r.product_unit} {r.team ? '· ' + r.team : ''}</span></span>
              <Badge v={r.status} map="prod_status" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MRP() {
  const { data, loading } = useData(() => report('mrp'), []);
  if (loading && !data) return <div className="spinner">Calcul des besoins…</div>;
  const rows = data || [];
  return (
    <div className="card">
      <div className="card-pad" style={{ paddingBottom: 0 }}><h3>Besoins cumulés des ordres planifiés et en cours</h3>
        <div className="muted small" style={{ marginBottom: 12 }}>Manque = besoin − stock disponible − quantités déjà commandées chez les fournisseurs.</div></div>
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Matière</th><th className="r">Besoin</th><th className="r">En stock</th><th className="r">En commande</th><th className="r">À commander</th><th className="r">Coût estimé</th><th>OF concernés</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.item_id}><td className="strong">{r.name}</td><td className="r">{num(r.required)} {r.unit}</td><td className="r">{num(r.available)}</td><td className="r">{num(r.on_order)}</td>
            <td className="r">{r.missing > 0 ? <span className="neg strong">{num(r.missing)}</span> : <span className="pos">—</span>}</td><td className="r">{money(r.missing * r.cost_price)}</td><td className="small muted">{r.orders}</td></tr>
        ))}</tbody>
      </table>{!rows.length && <div className="empty">Aucun besoin : pas d'OF planifié.</div>}</div>
    </div>
  );
}

function Recipes() {
  return (
    <CrudTable entity="recipes" title="Recette / nomenclature" csvName="recettes" newLabel="Nouvelle recette"
      columns={[
        { k: 'name', l: 'Recette', fmt: (r) => <><span className="strong">{r.name}</span>{!r.active && <span className="muted small"> (inactive)</span>}</>, csv: (r) => r.name },
        { k: 'product_name', l: 'Produit fini' },
        { k: 'yield_qty', l: 'Rendement', r: true, fmt: (r) => `${num(r.yield_qty)} ${r.product_unit || ''}`, csv: (r) => r.yield_qty },
        { k: 'material_cost', l: 'Coût matières', t: 'money' },
        { k: 'unit', l: 'Coût de revient / unité', r: true, fmt: (r) => <span className="strong">{money((r.material_cost + r.labor_cost + r.overhead_cost) / (r.yield_qty || 1))}</span>, csv: (r) => Math.round((r.material_cost + r.labor_cost + r.overhead_cost) / (r.yield_qty || 1)) },
      ]}
      defaults={{ yield_qty: 1, active: true, labor_cost: 0, overhead_cost: 0 }}
      fields={[
        { k: 'name', l: 'Nom de la recette', req: true }, { k: 'product_id', l: 'Produit fini obtenu', t: 'ref', ref: 'items', params: { active: true }, req: true },
        { k: 'yield_qty', l: 'Quantité obtenue (rendement)', t: 'number', req: true, help: 'Pour les quantités de matières ci-dessous' }, { k: 'duration_min', l: 'Durée (minutes)', t: 'number' },
        { k: 'labor_cost', l: 'Coût main-d\'œuvre du lot', t: 'number' }, { k: 'overhead_cost', l: 'Frais généraux du lot (énergie, gaz…)', t: 'number' },
        { k: 'instructions', l: 'Mode opératoire', t: 'textarea', full: true }, { k: 'active', l: 'Recette active', t: 'bool' },
      ]}
      lines={{ title: 'Matières et emballages pour un lot', fields: [{ k: 'qty', l: 'Quantité', w: 140 }], showTotal: false, itemParams: { active: true } }}
    />
  );
}

const pct = (v) => `${(Number(v) || 0).toFixed(1)} %`;

function Profitability() {
  const [range, setRange] = useState({ from: today().slice(0, 4) + '-01-01', to: today() });
  const [detail, setDetail] = useState(null);
  const { data, loading } = useData(() => report('profitability', range), [range.from, range.to]);
  const rows = data?.rows || [];
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return (
    <div>
      <div className="toolbar">
        <input type="date" className="input sm" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        <input type="date" className="input sm" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        <span className="muted small">Productions terminées sur la période</span>
      </div>
      <div className="grid g4">
        <Stat k="Dépensé pour produire" v={money(sum('real_cost'))} s={`${rows.length} production(s)`} />
        <Stat k="Rapporté par les ventes" v={money(sum('revenue'))} s={`${num(sum('sold_qty'))} unités vendues`} />
        <Stat accent k="Bénéfice réalisé" v={money(sum('profit'))} s="Sur les quantités déjà vendues" />
        <Stat k="Bénéfice prévu (tout vendu)" v={money(sum('projected_profit'))} s={`Stock restant : ${money(sum('remaining_value'))}`} />
      </div>
      <div className="space" />
      <div className="card"><div className="table-wrap"><table className="t">
        <thead><tr><th>Production</th><th className="r">Quantité</th><th className="r">Coût total</th><th className="r">Coût / unité</th><th className="r">Vendu</th><th className="r">Rapporté</th><th className="r">Bénéfice réalisé</th><th className="r">Bénéfice prévu</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td><span className="strong">{r.product}</span><br /><span className="muted small">{r.number} · lot <span className="mono">{r.lot_number}</span> · {date(r.date)}</span></td>
            <td className="r">{num(r.produced_qty)} {r.unit}{r.liters > 0 && <><br /><span className="muted small">{num(r.liters)} L</span></>}</td>
            <td className="r">{money(r.real_cost)}</td>
            <td className="r">{money(r.real_unit_cost)}</td>
            <td className="r">{num(r.sold_qty)} <span className="muted small">({r.sold_pct.toFixed(0)} %)</span></td>
            <td className="r">{money(r.revenue)}</td>
            <td className="r"><span className={'strong ' + (r.profit < 0 ? 'neg' : 'pos')}>{money(r.profit)}</span></td>
            <td className="r"><span className={r.projected_profit < 0 ? 'neg' : ''}>{money(r.projected_profit)}</span></td>
            <td className="actions"><button className="btn sm" onClick={() => setDetail(r.id)}>Détail</button></td>
          </tr>
        ))}</tbody>
        {rows.length > 0 && <tfoot><tr><td>Total</td><td /><td className="r">{money(sum('real_cost'))}</td><td /><td className="r">{num(sum('sold_qty'))}</td><td className="r">{money(sum('revenue'))}</td><td className="r">{money(sum('profit'))}</td><td className="r">{money(sum('projected_profit'))}</td><td /></tr></tfoot>}
      </table>
      {loading && !data && <div className="spinner">Calcul…</div>}
      {data && !rows.length && <div className="empty">Aucune production terminée sur la période.</div>}
      </div></div>
      <div className="note" style={{ marginTop: 12 }}>
        <b>Coût total</b> = matières et emballages consommés + main-d'œuvre + frais généraux + dépenses rattachées à la production.
        <b> Bénéfice réalisé</b> = ventes de ce lot − coût des unités vendues. <b>Bénéfice prévu</b> = ventes + stock restant au prix de vente − coût total.
      </div>
      {detail && <ProdDetail id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ProdDetail({ id, onClose }) {
  const { data: d, error, reload } = useData(() => report('prod_detail', { id }), [id]);
  const [addExp, setAddExp] = useState(false);
  const Line = ({ l, v, strong, neg }) => <div className="list-row"><span className={strong ? 'strong' : ''}>{l}</span><span className={'mono ' + (strong ? 'strong ' : '') + (neg ? 'neg' : '')}>{v}</span></div>;
  const groups = d ? Object.entries(d.consumptions.reduce((m, c) => { const k = c.type === 'emballage' ? 'Emballages' : c.type === 'mp' ? 'Matières premières' : 'Autres'; (m[k] ||= []).push(c); return m; }, {})) : [];
  return (
    <Modal wide title={d ? `${d.number} — ${d.product} (lot ${d.lot_number})` : 'Détail de la production'} onClose={onClose}
      footer={<><a className="btn" href={`/print/production_orders/${id}`} target="_blank" rel="noreferrer">Fiche de fabrication</a><button className="btn" onClick={() => window.print()}>Imprimer</button><button className="btn primary" onClick={onClose}>Fermer</button></>}>
      {error && <div className="err">{error}</div>}
      {!d && !error && <div className="spinner">Calcul…</div>}
      {d && <>
        <div className="grid g4">
          <Stat k="Produit" v={`${num(d.produced_qty)} ${d.unit}`} s={d.rejected_qty > 0 ? `${num(d.rejected_qty)} rebut(s)` : 'Aucun rebut'} />
          <Stat k="Coût total" v={money(d.real_cost)} s={`${money(d.real_unit_cost)} / ${d.unit}`} />
          <Stat k="Rapporté" v={money(d.revenue)} s={`${num(d.sold_qty)} vendus (${d.sold_pct.toFixed(0)} %)`} />
          <Stat accent k="Bénéfice réalisé" v={money(d.profit)} s={d.revenue ? `Marge ${pct(d.margin_pct)}` : 'Rien vendu pour l’instant'} />
        </div>
        <div className="space" />
        <div className="grid g2">
          <div className="card card-pad">
            <h3>Combien a coûté cette production</h3>
            {d.expense_cost > 0 && <Line l="Dépenses de production (achats)" v={money(d.expense_cost)} />}
            {(d.material_cost > 0 || !d.expense_cost) && <Line l="Matières premières & emballages (stock)" v={money(d.material_cost)} />}
            {(d.labor_cost > 0 || !d.expense_cost) && <Line l="Main-d'œuvre" v={money(d.labor_cost)} />}
            {(d.overhead_cost > 0 || !d.expense_cost) && <Line l="Frais généraux (énergie, gaz…)" v={money(d.overhead_cost)} />}
            {(d.direct_expenses > 0 || !d.expense_cost) && <Line l="Dépenses rattachées" v={money(d.direct_expenses)} />}
            <Line l="COÛT TOTAL" v={money(d.real_cost)} strong />
            {d.liters > 0 && <Line l={`Volume produit`} v={`${num(d.liters)} L`} />}
            {d.liters > 0 && <Line l="Coût par litre" v={money(d.liter_cost)} />}
            <Line l={`Coût de revient par ${d.unit}`} v={money(d.real_unit_cost)} strong />
            <Line l={`Prix de vente par ${d.unit}`} v={money(d.sale_price)} />
            <Line l={`Marge par ${d.unit}`} v={money(d.sale_price - d.real_unit_cost)} strong neg={d.sale_price - d.real_unit_cost < 0} />
          </div>
          <div className="card card-pad">
            <h3>Combien elle rapporte</h3>
            <Line l="Quantité vendue" v={`${num(d.sold_qty)} ${d.unit}`} />
            <Line l="Chiffre d'affaires du lot" v={money(d.revenue)} />
            <Line l="Coût des unités vendues" v={money(d.sold_qty * d.real_unit_cost)} />
            <Line l="BÉNÉFICE RÉALISÉ" v={money(d.profit)} strong neg={d.profit < 0} />
            <Line l="Pertes / dons / échantillons" v={`${num(d.lost_qty)} ${d.unit}`} />
            <Line l="Reste en stock" v={`${num(d.remaining_qty)} ${d.unit} (${money(d.remaining_value)})`} />
            <Line l="BÉNÉFICE PRÉVU SI TOUT EST VENDU" v={money(d.projected_profit)} strong neg={d.projected_profit < 0} />
            <div className={d.recovered ? 'note' : 'err'} style={{ marginTop: 10, marginBottom: 0 }}>{d.recovered ? '✓ Les ventes ont déjà remboursé tout le coût de cette production.' : `Il reste ${money(d.real_cost - d.revenue)} de ventes à faire pour rembourser le coût.`}</div>
          </div>
        </div>
        <div className="space" />
        <div className="card card-pad">
          <h3>Détail des matières et emballages utilisés</h3>
          {!d.consumptions.length && <div className="muted small">Aucune consommation enregistrée</div>}
          {groups.map(([g, list]) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <div className="small strong muted" style={{ textTransform: 'uppercase', margin: '8px 0 4px' }}>{g} — {money(list.reduce((s, c) => s + c.cost, 0))}</div>
              <table className="t"><tbody>{list.map((c, i) => <tr key={i}><td>{c.name}</td><td className="mono small">{c.lot_number}</td><td className="muted small">{c.supplier_name}</td><td className="r">{num(c.qty)} {c.unit}</td><td className="r">× {money(c.unit_cost)}</td><td className="r strong">{money(c.cost)}</td></tr>)}</tbody></table>
            </div>
          ))}
        </div>
        <div className="space" />
        <div className="grid g2">
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Dépenses rattachées</h3><button className="btn sm" onClick={() => setAddExp(true)}>+ Ajouter</button></div>
            <div className="muted small" style={{ margin: '6px 0' }}>Transport, gaz, location de matériel… payés pour cette production.</div>
            {!d.expenses.length && <div className="muted small">Aucune</div>}
            {d.expenses.map((e) => <div key={e.id} className="list-row"><span>{e.label}<br /><span className="muted small">{date(e.date)} · {e.category}</span></span><span className="mono">{money(e.amount)}</span></div>)}
          </div>
          <div className="card card-pad">
            <h3>Ventes de ce lot</h3>
            {!d.sales.length && <div className="muted small">Aucune vente pour l'instant</div>}
            {d.sales.map((s, i) => <div key={i} className="list-row"><span>{s.number} · {s.customer}<br /><span className="muted small">{date(s.date)} · {num(s.qty)} {d.unit}</span></span><span className="mono">{money(s.revenue)}</span></div>)}
            {d.losses.map((x, i) => <div key={'l' + i} className="list-row"><span className="neg">{LABELS.move_type[x.type] || x.type}{x.note ? ' · ' + x.note : ''}</span><span className="mono neg">{num(x.qty)} {d.unit}</span></div>)}
          </div>
        </div>
      </>}
      {addExp && <ActionModal title="Dépense pour cette production" initial={{ date: today(), category: 'Transport', production_id: id }}
        fields={[{ k: 'label', l: 'Libellé', req: true, full: true }, { k: 'amount', l: 'Montant', t: 'number', req: true }, { k: 'category', l: 'Catégorie', t: 'select', opts: EXPENSE_CATS.map((c) => [c, c]) },
          { k: 'date', l: 'Date', t: 'date', req: true }, { k: 'account_id', l: 'Payé via (compte)', t: 'ref', ref: 'accounts', help: 'Le compte sera débité automatiquement' }]}
        onSubmit={(x) => crud.create('expenses', x)} onClose={(ok) => { setAddExp(false); if (ok) reload(); }} />}
    </Modal>
  );
}

const USED_TYPES = ['mp', 'emballage', 'consommable', 'semi_fini'];
const itemCost = (it) => Number(it?.cost_price) || Number(it?.purchase_price) || 0;

export function QuickProd({ onClose, initial, note }) {
  const products = useRefOptions('items', { type: 'pf', active: true });
  const { data: allItems } = useData(() => crud.list('items', { active: true, limit: 1000 }), []);
  const stockItems = (allItems || []).filter((x) => USED_TYPES.includes(x.type));
  const [d, setD] = useState({ date: today() });
  const [rows, setRows] = useState(initial && initial.length ? initial : [{}]);
  const [usedRows, setUsedRows] = useState([{}]);
  const setUsed = (i, patch) => setUsedRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const usedCalc = usedRows.map((r) => {
    const it = stockItems.find((x) => x.id === Number(r.item_id));
    const q = Number(r.qty) || 0;
    return { it, q, value: it ? q * itemCost(it) : 0, short: it && q > Number(it.stock) + 1e-9 };
  });
  const material = usedCalc.reduce((s, c) => s + c.value, 0);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));
  const setRow = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const calc = rows.map((r) => {
    const p = products.find((x) => x.id === Number(r.product_id));
    const uv = Number(p?.unit_volume) || 0;
    const qty = uv ? (Number(r.volume_l) ? Math.round((Number(r.volume_l) / uv) * 1000) / 1000 : 0) : Number(r.qty) || 0;
    return { p, uv, qty, liters: uv ? qty * uv : 0 };
  });
  const valid = calc.filter((c) => c.p && c.qty > 0);
  const total = material + (Number(d.expense_cost) || 0) + (Number(d.labor_cost) || 0);
  const totalL = valid.reduce((s, c) => s + c.liters, 0);
  const byLiters = valid.length > 0 && valid.every((c) => c.liters > 0);
  const totalQ = valid.reduce((s, c) => s + c.qty, 0);
  const share = (c) => (byLiters ? c.liters / totalL : c.qty / (totalQ || 1));
  // Proposer le même jus dans un autre format (ex. sachet → bouteille)
  const base = (name) => (name || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
  const suggest = () => {
    const first = valid[0]?.p;
    const used = rows.map((r) => Number(r.product_id));
    const other = first && products.find((x) => !used.includes(x.id) && base(x.name) === base(first.name));
    setRows((r) => [...r, other ? { product_id: other.id } : {}]);
  };
  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await op('prod_simple', { ...d, lines: rows.filter((x) => x.product_id), consumptions: usedRows.filter((x) => x.item_id && Number(x.qty) > 0) });
      toast(`Production enregistrée : ${r.number}`);
      onClose(r);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal wide title="⚡ Production rapide" onClose={() => onClose(null)}
      footer={<><button className="btn" onClick={() => onClose(null)}>Annuler</button><button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : 'Enregistrer la production'}</button></>}>
      {err && <div className="err">{err}</div>}
      {note && <div className="note" style={{ marginBottom: 12 }}>{note}</div>}
      <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Ce qui a été produit</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>Une ligne par format. Ex. : Bissap en sachets <b>et</b> Bissap en bouteilles de 1 L. Les dépenses sont réparties selon les litres.</div>
      <div className="table-wrap"><table className="lines">
        <thead><tr><th style={{ minWidth: 240 }}>Produit / format</th><th>Litres ou quantité</th><th>Obtenu</th>{total > 0 && <th className="r">Coût / unité</th>}{total > 0 && <th className="r">Marge / unité</th>}<th /></tr></thead>
        <tbody>{rows.map((r, i) => {
          const c = calc[i];
          const unitCost = total > 0 && c.qty > 0 && valid.includes(c) ? (total * share(c)) / c.qty : null;
          return (
            <tr key={i}>
              <td><select className="input" value={r.product_id || ''} onChange={(e) => setRow(i, { product_id: e.target.value ? Number(e.target.value) : '', volume_l: '', qty: '' })}>
                <option value="">— Choisir —</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></td>
              <td style={{ width: 170 }}>{c.uv > 0
                ? <input type="number" step="any" className="input" placeholder="Litres" value={r.volume_l || ''} onChange={(e) => setRow(i, { volume_l: e.target.value })} />
                : <input type="number" step="any" className="input" placeholder={c.p ? c.p.unit : 'Quantité'} value={r.qty || ''} onChange={(e) => setRow(i, { qty: e.target.value })} disabled={!c.p} />}</td>
              <td className="strong" style={{ whiteSpace: 'nowrap' }}>{c.qty > 0 ? `${num(c.qty)} ${c.p.unit}${c.liters ? ` · ${num(c.liters)} L` : ''}` : <span className="muted">—</span>}</td>
              {total > 0 && <td className="r mono">{unitCost != null ? money(unitCost) : ''}</td>}
              {total > 0 && <td className="r mono">{unitCost != null && Number(c.p.sale_price) > 0 ? <span className={c.p.sale_price - unitCost < 0 ? 'neg strong' : 'pos strong'}>{money(c.p.sale_price - unitCost)}</span> : ''}</td>}
              <td>{rows.length > 1 && <button className="btn sm ghost" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={suggest}>+ Ajouter un autre format (bouteille, sachet…)</button>

      <h3 style={{ fontSize: 14, margin: '20px 0 4px' }}>1. Ce qu'on a pris dans le magasin</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>Matières premières et emballages déjà en stock (bissap, sucre, sachets, bouteilles…). Ils seront <b>retirés du stock</b> et leur prix d'achat compté dans le coût.</div>
      <div className="table-wrap"><table className="lines">
        <thead><tr><th style={{ minWidth: 240 }}>Article</th><th>En stock</th><th style={{ width: 150 }}>Quantité utilisée</th><th className="r">Valeur</th><th /></tr></thead>
        <tbody>{usedRows.map((r, i) => {
          const c = usedCalc[i];
          const taken = usedRows.map((x, j) => (j !== i ? Number(x.item_id) : null));
          return (
            <tr key={i}>
              <td><select className="input" value={r.item_id || ''} onChange={(e) => setUsed(i, { item_id: e.target.value ? Number(e.target.value) : '', qty: '' })}>
                <option value="">— Choisir —</option>
                {Object.entries({ mp: 'Matières premières', emballage: 'Emballages', consommable: 'Consommables', semi_fini: 'Semi-finis' }).map(([t, l]) => {
                  const list = stockItems.filter((x) => x.type === t && !taken.includes(x.id));
                  return list.length ? <optgroup key={t} label={l}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup> : null;
                })}
              </select></td>
              <td className={'small ' + (c.it && Number(c.it.stock) <= 0 ? 'neg strong' : 'muted')} style={{ whiteSpace: 'nowrap' }}>{c.it ? `${num(c.it.stock)} ${c.it.unit || ''}` : '—'}</td>
              <td><input type="number" step="any" className="input" placeholder={c.it?.unit || 'Quantité'} value={r.qty || ''} onChange={(e) => setUsed(i, { qty: e.target.value })} disabled={!c.it} />
                {c.short && <div className="neg small strong">Stock insuffisant</div>}</td>
              <td className="r mono">{c.q > 0 ? (itemCost(c.it) ? money(c.value) : <span className="muted small">prix d'achat non renseigné</span>) : ''}</td>
              <td>{usedRows.length > 1 && <button className="btn sm ghost" onClick={() => setUsedRows((x) => x.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          );
        })}</tbody>
        {material > 0 && <tfoot><tr><td colSpan={3} className="strong">Valeur prise dans le stock</td><td className="r mono strong">{money(material)}</td><td /></tr></tfoot>}
      </table></div>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setUsedRows((r) => [...r, {}])}>+ Ajouter un article du magasin</button>
      {!stockItems.length && allItems && <div className="note" style={{ marginTop: 8 }}>Aucune matière ni emballage enregistré. Créez-les dans <b>Stock & Articles</b> puis faites une <b>Entrée stock</b> : ils apparaîtront ici.</div>}

      <h3 style={{ fontSize: 14, margin: '20px 0 4px' }}>2. Les autres dépenses</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>Ce qui a été payé et <b>n'est pas dans le magasin</b> : gaz, eau, transport, achats faits le jour même…</div>
      <div className="form">
        <div className="field"><label>Autres dépenses (FCFA)</label><input type="number" step="any" className="input" value={d.expense_cost || ''} onChange={set('expense_cost')} placeholder="0" /></div>
        <div className="field"><label>Main-d'œuvre (optionnel)</label><input type="number" step="any" className="input" value={d.labor_cost || ''} onChange={set('labor_cost')} /></div>
        <div className="field"><label>Autres dépenses payées depuis (optionnel)</label><RefSelect f={{ ref: 'accounts', params: { active: true }, placeholder: 'Ne pas toucher à la caisse' }} value={d.account_id} onChange={(v) => setD((x) => ({ ...x, account_id: v }))} /></div>
      </div>

      <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>3. Informations du lot</h3>
      <div className="form">
        <div className="field"><label>Date de production</label><input type="date" className="input" value={d.date} onChange={set('date')} /></div>
        <div className="field"><label>N° de lot (optionnel)</label><input className="input" value={d.lot_number || ''} onChange={set('lot_number')} placeholder="Automatique" /></div>
        <div className="field"><label>Date limite (DLC)</label><input type="date" className="input" value={d.expiry_date || ''} onChange={set('expiry_date')} /></div>
        <div className="field full"><label>Note</label><input className="input" value={d.notes || ''} onChange={set('notes')} /></div>
      </div>
      {valid.length > 0 && total > 0 && (
        <div className="grid g3" style={{ marginTop: 16 }}>
          <Stat k="Coût total de la production" v={money(total)} s={[material > 0 && `stock ${money(material)}`, Number(d.expense_cost) > 0 && `dépenses ${money(d.expense_cost)}`, Number(d.labor_cost) > 0 && `main-d'œuvre ${money(d.labor_cost)}`].filter(Boolean).join(' + ')} />
          <Stat k="Coût par litre" v={totalL ? money(total / totalL) : '—'} s={totalL ? `${num(totalL)} L produits` : `${num(totalQ)} unités`} />
          <Stat accent k="Ventes prévues" v={money(valid.reduce((s, c) => s + c.qty * (Number(c.p.sale_price) || 0), 0))} s={`Bénéfice prévu : ${money(valid.reduce((s, c) => s + c.qty * (Number(c.p.sale_price) || 0), 0) - total)}`} />
        </div>
      )}
    </Modal>
  );
}
