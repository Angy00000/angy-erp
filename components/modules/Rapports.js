import { useState, Fragment } from 'react';
import { report, money, num, date, monthStart, today, exportCSV, LABELS } from '../../lib/client';
import { Tabs, useData, Stat, HBars, Bars } from '../ui';

export default function Rapports({ can }) {
  const all = [['pnl', 'Compte de résultat', 'rapports'], ['sales', 'Ventes', 'ventes'], ['byprod', 'Par produit & format', 'ventes'], ['stock', 'Valorisation du stock', 'stock'], ['prod', 'Production & coûts', 'production'], ['cash', 'Trésorerie', 'caisse'], ['bal', 'Créances & dettes', 'ventes'], ['qual', 'Qualité', 'qualite']];
  const tabs = all.filter((t) => can('rapports') || can(t[2])).map(([k, l]) => [k, l]);
  const [tab, setTab] = useState(tabs[0]?.[0]);
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const ranged = ['pnl', 'sales', 'byprod', 'prod', 'cash', 'qual'].includes(tab);
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      <div className="toolbar">
        {ranged && <>
          <input type="date" className="input sm" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <input type="date" className="input sm" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          <button className="btn sm" onClick={() => setRange({ from: monthStart(), to: today() })}>Ce mois</button>
          <button className="btn sm" onClick={() => setRange({ from: today().slice(0, 4) + '-01-01', to: today() })}>Cette année</button>
        </>}
        <div className="grow" />
        <button className="btn" onClick={() => window.print()}>Imprimer / PDF</button>
      </div>
      {tab === 'pnl' && <PnL range={range} />}
      {tab === 'sales' && <Sales range={range} />}
      {tab === 'byprod' && <ByProduct range={range} />}
      {tab === 'stock' && <StockVal />}
      {tab === 'prod' && <Prod range={range} />}
      {tab === 'cash' && <Cash range={range} />}
      {tab === 'bal' && <Balances />}
      {tab === 'qual' && <Qual range={range} />}
    </div>
  );
}

const Loading = () => <div className="spinner">Calcul du rapport…</div>;

function PnL({ range }) {
  const { data: d, error } = useData(() => report('pnl', range), [range.from, range.to]);
  if (error) return <div className="err">{error}</div>;
  if (!d) return <Loading />;
  const L = ({ l, v, strong, neg, indent }) => <div className="list-row" style={{ paddingLeft: indent ? 18 : 0 }}><span className={strong ? 'strong' : ''}>{l}</span><span className={'mono ' + (strong ? 'strong ' : '') + (neg ? 'neg' : '')}>{money(v)}</span></div>;
  const margin = d.revenue ? (d.gross / d.revenue) * 100 : 0;
  return (
    <div className="grid g2">
      <div className="card card-pad">
        <h3>Compte de résultat simplifié — {date(d.from)} au {date(d.to)}</h3>
        <L l={`Chiffre d'affaires (${d.invoices} factures)`} v={d.revenue} strong />
        <L l="Coût des produits vendus" v={-d.cogs} neg indent />
        <L l={`Marge brute (${margin.toFixed(1)} %)`} v={d.gross} strong />
        {d.expenses.map((e) => <L key={e.category} l={e.category} v={-e.total} neg indent />)}
        <L l="Salaires payés" v={-d.salaries} neg indent />
        <L l="Pertes de stock (casse, péremption)" v={-d.losses} neg indent />
        <div style={{ borderTop: '2px solid var(--ink)', marginTop: 6 }} />
        <L l="RÉSULTAT NET" v={d.net} strong neg={d.net < 0} />
      </div>
      <div className="grid" style={{ alignContent: 'start' }}>
        <Stat accent k="Résultat net" v={money(d.net)} s={d.net >= 0 ? 'Bénéfice' : 'Perte'} />
        <Stat k="Marge brute" v={`${margin.toFixed(1)} %`} s={money(d.gross)} />
        <div className="card card-pad"><h3>Répartition des charges</h3><HBars data={[...d.expenses.map((e) => ({ name: e.category, total: e.total })), { name: 'Salaires', total: d.salaries }].filter((x) => x.total > 0)} /></div>
      </div>
    </div>
  );
}

function Sales({ range }) {
  const { data: d } = useData(() => report('sales', range), [range.from, range.to]);
  if (!d) return <Loading />;
  return (
    <div>
      <div className="grid g4">
        <Stat accent k="Chiffre d'affaires" v={money(d.totals.total)} s={`${d.totals.count} factures`} />
        <Stat k="Marge brute" v={money(d.totals.total - d.totals.cost)} s={d.totals.total ? `${(((d.totals.total - d.totals.cost) / d.totals.total) * 100).toFixed(1)} %` : ''} />
        <Stat k="Encaissé" v={money(d.totals.paid)} />
        <Stat k="Panier moyen" v={money(d.totals.count ? d.totals.total / d.totals.count : 0)} />
      </div>
      <div className="space" />
      {d.by_day.length > 0 && <div className="card card-pad"><h3>Évolution</h3><Bars data={d.by_day.map((x) => ({ ...x, day: date(x.day) }))} /></div>}
      <div className="space" />
      <div className="grid g2">
        <Table title="Par produit" rows={d.by_item} cols={[['name', 'Produit'], ['qty', 'Qté', 'qty'], ['total', 'CA', 'money'], ['m', 'Marge', 'money', (r) => r.total - r.cost]]} />
        <Table title="Par client" rows={d.by_customer} cols={[['name', 'Client'], ['count', 'Factures', 'qty'], ['total', 'CA', 'money'], ['due', 'Reste dû', 'money']]} />
        <div className="card card-pad"><h3>Par canal</h3><HBars data={d.by_channel.map((c) => ({ ...c, name: LABELS.channel[c.name] || c.name }))} /></div>
      </div>
    </div>
  );
}

function Table({ title, rows, cols, foot }) {
  const val = (r, c) => (c[3] ? c[3](r) : r[c[0]]);
  const fmt = (v, t) => (t === 'money' ? money(v) : t === 'qty' ? num(v) : t === 'date' ? date(v) : v);
  return (
    <div className="card">
      <div className="card-pad row" style={{ justifyContent: 'space-between', paddingBottom: 6 }}><h3 style={{ margin: 0 }}>{title}</h3>
        <button className="btn sm no-print" onClick={() => exportCSV(title, cols.map((c) => ({ k: c[0], l: c[1], csv: (r) => val(r, c) })), rows)}>CSV</button></div>
      <div className="table-wrap"><table className="t">
        <thead><tr>{cols.map((c) => <th key={c[0]} className={c[2] === 'money' || c[2] === 'qty' ? 'r' : ''}>{c[1]}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c[0]} className={c[2] === 'money' || c[2] === 'qty' ? 'r' : ''}>{fmt(val(r, c), c[2])}</td>)}</tr>)}</tbody>
        {foot && rows.length > 0 && <tfoot><tr>{cols.map((c, i) => <td key={c[0]} className={c[2] === 'money' || c[2] === 'qty' ? 'r' : ''}>{i === 0 ? 'Total' : foot.includes(c[0]) ? fmt(rows.reduce((s, r) => s + (Number(val(r, c)) || 0), 0), c[2]) : ''}</td>)}</tr></tfoot>}
      </table>{!rows.length && <div className="empty">Aucune donnée</div>}</div>
    </div>
  );
}

function StockVal() {
  const { data: d } = useData(() => report('stock'), []);
  if (!d) return <Loading />;
  const total = d.items.reduce((s, i) => s + i.value, 0);
  const byType = Object.entries(d.items.reduce((m, i) => ({ ...m, [i.type]: (m[i.type] || 0) + i.value }), {})).map(([k, v]) => ({ name: LABELS.item_type[k] || k, total: v }));
  return (
    <div>
      <div className="grid g3"><Stat accent k="Valeur totale du stock" v={money(total)} /><div className="card card-pad" style={{ gridColumn: 'span 2' }}><h3>Par type</h3><HBars data={byType} /></div></div>
      <div className="space" />
      <Table title="Inventaire valorisé (coût moyen pondéré)" rows={d.items} foot={['value']}
        cols={[['code', 'Code'], ['name', 'Article'], ['type', 'Type', null, (r) => LABELS.item_type[r.type]], ['stock', 'Stock', 'qty'], ['unit', 'Unité'], ['cost_price', 'Coût unit.', 'money'], ['value', 'Valeur', 'money'], ['blocked', 'Bloqué', 'qty'], ['next_expiry', 'Prochaine DLC', 'date']]} />
    </div>
  );
}

function Prod({ range }) {
  const { data: d } = useData(() => report('production', range), [range.from, range.to]);
  if (!d) return <Loading />;
  const produced = d.by_product.reduce((s, p) => s + p.produced, 0);
  const rejected = d.by_product.reduce((s, p) => s + p.rejected, 0);
  return (
    <div>
      <div className="grid g4">
        <Stat accent k="Quantité produite" v={num(produced)} s={`${d.orders.length} OF terminés`} />
        <Stat k="Taux de rebut" v={`${produced + rejected ? ((rejected / (produced + rejected)) * 100).toFixed(1) : 0} %`} s={`${num(rejected)} unités`} />
        <Stat k="Coût total de production" v={money(d.orders.reduce((s, o) => s + o.total_cost, 0))} />
        <Stat k="Coût matières" v={money(d.orders.reduce((s, o) => s + o.material_cost, 0))} />
      </div>
      <div className="space" />
      <div className="grid g2">
        <Table title="Par produit — coût de revient et marge" rows={d.by_product} cols={[['name', 'Produit'], ['produced', 'Produit', 'qty'], ['rejected', 'Rebut', 'qty'], ['avg_unit_cost', 'Coût unit. moyen', 'money'], ['sale_price', 'Prix vente', 'money'], ['m', 'Marge unit.', 'money', (r) => r.sale_price - r.avg_unit_cost]]} />
        <Table title="Consommation de matières" rows={d.consumption} foot={['cost']} cols={[['name', 'Matière'], ['qty', 'Quantité', 'qty'], ['unit', 'Unité'], ['cost', 'Coût', 'money']]} />
      </div>
      <div className="space" />
      <Table title="Détail des ordres de fabrication" rows={d.orders} foot={['total_cost']} cols={[['date', 'Date', 'date'], ['number', 'OF'], ['product', 'Produit'], ['lot_number', 'Lot'], ['produced_qty', 'Produit', 'qty'], ['rejected_qty', 'Rebut', 'qty'], ['material_cost', 'Matières', 'money'], ['labor_cost', 'M.O.', 'money'], ['overhead_cost', 'Frais', 'money'], ['total_cost', 'Total', 'money'], ['unit_cost', 'Coût unit.', 'money']]} />
    </div>
  );
}

function Cash({ range }) {
  const { data: d } = useData(() => report('cash', range), [range.from, range.to]);
  if (!d) return <Loading />;
  return (
    <div className="grid g2">
      <Table title="Mouvements par compte" rows={d.accounts} foot={['opening', 'inflow', 'outflow', 'closing']} cols={[['name', 'Compte'], ['opening', 'Solde début', 'money'], ['inflow', 'Entrées', 'money'], ['outflow', 'Sorties', 'money'], ['closing', 'Solde fin', 'money']]} />
      <Table title="Par catégorie" rows={d.by_category} foot={['inflow', 'outflow']} cols={[['category', 'Catégorie'], ['inflow', 'Entrées', 'money'], ['outflow', 'Sorties', 'money']]} />
    </div>
  );
}

function Balances() {
  const { data: d } = useData(() => report('balances'), []);
  if (!d) return <Loading />;
  return (
    <div className="grid g2">
      <Table title="Créances clients (à encaisser)" rows={d.customers} foot={['due']} cols={[['name', 'Client'], ['phone', 'Téléphone'], ['oldest', 'Plus ancienne', 'date'], ['due', 'Montant dû', 'money']]} />
      <Table title="Dettes fournisseurs (à payer)" rows={d.suppliers} foot={['due']} cols={[['name', 'Fournisseur'], ['phone', 'Téléphone'], ['due', 'Montant dû', 'money']]} />
    </div>
  );
}

function Qual({ range }) {
  const { data: d } = useData(() => report('quality', range), [range.from, range.to]);
  if (!d) return <Loading />;
  const tot = d.controls.reduce((s, c) => s + c.total, 0), ok = d.controls.reduce((s, c) => s + c.ok, 0);
  return (
    <div>
      <div className="grid g3">
        <Stat accent k="Taux de conformité" v={tot ? `${((ok / tot) * 100).toFixed(1)} %` : '—'} s={`${tot} contrôle(s)`} />
        <Stat k="Non-conformités" v={num(d.nc.reduce((s, n) => s + n.count, 0))} s="sur la période" />
        <Stat k="Actions en retard" v={num(d.overdue.length)} />
      </div>
      <div className="space" />
      <div className="grid g2">
        <Table title="Contrôles par type" rows={d.controls} cols={[['type', 'Type', null, (r) => LABELS.qc_type[r.type] || r.type], ['total', 'Total', 'qty'], ['ok', 'Conformes', 'qty'], ['nok', 'Non conformes', 'qty'], ['rate', 'Taux', null, (r) => `${((r.ok / (r.total || 1)) * 100).toFixed(0)} %`]]} />
        <Table title="NC en retard" rows={d.overdue} cols={[['number', 'N°'], ['description', 'Description'], ['responsible', 'Responsable'], ['due_date', 'Échéance', 'date']]} />
      </div>
    </div>
  );
}

// ---------- Par produit & format : quel jus rapporte le plus, quel format, quel jour ----------
const famOf = (name) => { const r = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(String(name || '').trim()); return r ? { fam: r[1].trim(), fmt: r[2].trim() } : { fam: String(name || '').trim(), fmt: '' }; };
const cap = (x) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);
const DOW = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');

function ByProduct({ range }) {
  const { data: d } = useData(() => report('by_product', range), [range.from, range.to]);
  const [open, setOpen] = useState({});
  if (!d) return <Loading />;
  const items = d.items.map((r) => {
    const f = famOf(r.name); const uv = Number(r.unit_volume) || 0; const qty = Number(r.qty) || 0;
    const revenue = Number(r.revenue) || 0; const cost = Number(r.cost) || 0;
    return { ...r, fam: f.fam, fmt: cap(f.fmt) || r.unit, uv, qty, revenue, cost, margin: revenue - cost, liters: qty * uv };
  });
  const tot = items.reduce((m, r) => ({ revenue: m.revenue + r.revenue, margin: m.margin + r.margin, liters: m.liters + r.liters }), { revenue: 0, margin: 0, liters: 0 });
  const group = (key) => {
    const m = new Map();
    for (const r of items) { const k = r[key]; const g = m.get(k) || { name: k, revenue: 0, margin: 0, liters: 0, qty: 0, rows: [] }; g.revenue += r.revenue; g.margin += r.margin; g.liters += r.liters; g.qty += r.qty; g.rows.push(r); m.set(k, g); }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  };
  const fams = group('fam');
  const fmts = group('fmt').map((g) => ({ ...g, unit: g.rows[0]?.unit, perL: g.liters > 0 ? g.margin / g.liters : null, perU: g.qty ? g.margin / g.qty : 0 }));
  const bestPerL = fmts.filter((x) => x.perL !== null).sort((a, b) => b.perL - a.perL)[0];
  // Produit sur la période / vendu / en stock, en litres quand c'est un jus
  const vol = (rows) => rows.reduce((s2, r) => s2 + (Number(r.qty) || 0) * (Number(r.unit_volume) || 0), 0);
  const units = (rows) => rows.reduce((s2, r) => s2 + (Number(r.qty) || 0), 0);
  const famNames = [...new Set([...fams.map((f) => f.name), ...d.produced.map((r) => famOf(r.name).fam)])];
  const flow = famNames.map((name) => {
    const pr = d.produced.filter((r) => famOf(r.name).fam === name); const st = d.stock.filter((r) => famOf(r.name).fam === name);
    const so = items.filter((r) => r.fam === name);
    const liq = [...pr, ...st, ...so].some((r) => Number(r.unit_volume) > 0);
    return { name, liq, produced: liq ? vol(pr) : units(pr), sold: liq ? so.reduce((s2, r) => s2 + r.liters, 0) : units(so), stock: liq ? vol(st) : units(st) };
  }).sort((a, b) => b.sold - a.sold);
  const days = d.weekday.map((x) => ({ name: DOW[x.dow], total: Number(x.days) ? Number(x.total) / Number(x.days) : 0, n: x.days }));
  const bestDay = [...days].sort((a, b) => b.total - a.total)[0];

  if (!items.length) return <div className="card empty">Aucune vente sur cette période.</div>;
  return (
    <div>
      <div className="grid g4">
        <Stat accent k="Chiffre d'affaires" v={money(tot.revenue)} s={tot.liters ? `${num(Math.round(tot.liters * 10) / 10)} L vendus` : `${items.length} produit(s)`} />
        <Stat k="Bénéfice (marge brute)" v={money(tot.margin)} s={`${pct(tot.margin, tot.revenue)} du chiffre d'affaires`} />
        <Stat k="Produit qui rapporte le plus" v={[...fams].sort((a, b) => b.margin - a.margin)[0]?.name || '—'} s={`bénéfice ${money([...fams].sort((a, b) => b.margin - a.margin)[0]?.margin || 0)}`} />
        <Stat k={bestPerL ? 'Format le plus rentable (par litre)' : 'Meilleur jour'} v={bestPerL ? bestPerL.name : bestDay?.name || '—'} s={bestPerL ? `${money(bestPerL.perL)} de bénéfice par litre` : bestDay ? `${money(bestDay.total)} en moyenne` : ''} />
      </div>
      <div className="space" />

      <div className="card">
        <div className="card-pad row" style={{ justifyContent: 'space-between', paddingBottom: 6 }}><h3 style={{ margin: 0 }}>Par produit</h3>
          <button className="btn sm no-print" onClick={() => exportCSV('ventes-par-produit-format', [{ k: 'fam', l: 'Produit' }, { k: 'fmt', l: 'Format' }, { k: 'qty', l: 'Quantité' }, { k: 'liters', l: 'Litres' }, { k: 'revenue', l: 'CA' }, { k: 'margin', l: 'Bénéfice' }], items)}>CSV</button></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Produit</th><th className="r">Vendu</th><th className="r">Chiffre d'affaires</th><th className="r">Bénéfice</th><th className="r">Marge</th><th style={{ width: '22%' }}>Part des ventes</th></tr></thead>
          <tbody>{fams.map((g) => (
            <Fragment key={g.name}>
              <tr className="clickable" onClick={() => setOpen({ ...open, [g.name]: !open[g.name] })}>
                <td className="nm"><b>{open[g.name] ? '▾' : '▸'} {g.name}</b><div className="muted small">{g.rows.length} format(s)</div></td>
                <td className="r nw">{g.liters > 0 ? `${num(Math.round(g.liters * 10) / 10)} L` : num(g.qty)}</td>
                <td className="r nw strong">{money(g.revenue)}</td>
                <td className={'r nw strong ' + (g.margin >= 0 ? 'pos' : 'neg')}>{money(g.margin)}</td>
                <td className="r nw">{pct(g.margin, g.revenue)}</td>
                <td><div className="share"><div style={{ width: `${tot.revenue ? (g.revenue / tot.revenue) * 100 : 0}%` }} /><span>{pct(g.revenue, tot.revenue)}</span></div></td>
              </tr>
              {open[g.name] && g.rows.sort((a, b) => a.uv - b.uv).map((r) => (
                <tr key={r.id} className="sub-row">
                  <td className="nm" style={{ paddingLeft: 30 }}>{r.fmt}</td>
                  <td className="r nw">{num(r.qty)} {r.unit}{r.liters > 0 && <div className="muted small">{num(Math.round(r.liters * 10) / 10)} L</div>}</td>
                  <td className="r nw">{money(r.revenue)}<div className="muted small">{money(r.qty ? r.revenue / r.qty : 0)} / {r.unit}</div></td>
                  <td className={'r nw ' + (r.margin >= 0 ? 'pos' : 'neg')}>{money(r.margin)}<div className="muted small">{money(r.qty ? r.margin / r.qty : 0)} / {r.unit}</div></td>
                  <td className="r nw">{pct(r.margin, r.revenue)}</td>
                  <td><div className="share sm"><div style={{ width: `${g.revenue ? (r.revenue / g.revenue) * 100 : 0}%` }} /><span>{pct(r.revenue, g.revenue)} du {g.name.toLowerCase()}</span></div></td>
                </tr>
              ))}
            </Fragment>
          ))}</tbody>
          <tfoot><tr><td>Total</td><td className="r">{tot.liters ? `${num(Math.round(tot.liters * 10) / 10)} L` : ''}</td><td className="r">{money(tot.revenue)}</td><td className="r">{money(tot.margin)}</td><td className="r">{pct(tot.margin, tot.revenue)}</td><td /></tr></tfoot>
        </table></div>
        <div className="muted small card-pad" style={{ paddingTop: 4 }}>Cliquez sur un produit pour voir ses formats.</div>
      </div>
      <div className="space" />

      <div>
        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 6 }}><h3 style={{ margin: 0 }}>Par format</h3>
            {bestPerL && <p className="muted small" style={{ margin: '4px 0 0' }}>Pour un même litre de jus, c'est en <b>{bestPerL.name.toLowerCase()}</b> qu'il rapporte le plus.</p>}</div>
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Format</th><th className="r">Vendu</th><th className="r">CA</th><th className="r">Bénéfice</th>{bestPerL && <th className="r">Bénéfice / litre</th>}</tr></thead>
            <tbody>{fmts.map((g) => (
              <tr key={g.name} className={bestPerL && g.name === bestPerL.name ? 'best-row' : ''}>
                <td className="nm"><b>{g.name}</b></td>
                <td className="r nw">{num(g.qty)} {g.unit}{g.liters > 0 && <div className="muted small">{num(Math.round(g.liters * 10) / 10)} L</div>}</td>
                <td className="r nw">{money(g.revenue)}</td>
                <td className={'r nw ' + (g.margin >= 0 ? 'pos' : 'neg')}>{money(g.margin)}</td>
                {bestPerL && <td className="r nw strong">{g.perL !== null ? money(g.perL) : '—'}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="space" />
        <div className="card card-pad">
          <h3>Jours de la semaine</h3>
          <p className="muted small" style={{ marginTop: -6 }}>Ventes moyennes par jour {bestDay ? <>— le meilleur jour est le <b>{bestDay.name.toLowerCase()}</b></> : ''}.</p>
          <HBars data={days} />
        </div>
      </div>
      <div className="space" />

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 6 }}><h3 style={{ margin: 0 }}>Produit, vendu et en stock</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Ce qui a été produit sur la période, ce qui a été vendu, et ce qui reste aujourd'hui.</p></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Produit</th><th className="r">Produit</th><th className="r">Vendu</th><th className="r">En stock aujourd'hui</th><th>Écoulement</th></tr></thead>
          <tbody>{flow.map((f) => {
            const u = f.liq ? ' L' : '';
            const rate = f.produced ? Math.min(100, (f.sold / f.produced) * 100) : null;
            return (
              <tr key={f.name}>
                <td className="nm"><b>{f.name}</b></td>
                <td className="r nw">{num(Math.round(f.produced * 10) / 10)}{u}</td>
                <td className="r nw">{num(Math.round(f.sold * 10) / 10)}{u}</td>
                <td className={'r nw ' + (f.stock <= 0 ? 'neg strong' : '')}>{f.stock <= 0 ? 'Épuisé' : `${num(Math.round(f.stock * 10) / 10)}${u}`}</td>
                <td>{rate !== null ? <div className="share"><div style={{ width: `${rate}%` }} /><span>{Math.round(rate)} % vendu</span></div> : <span className="muted small">pas produit sur la période</span>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>
    </div>
  );
}
