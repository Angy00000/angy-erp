import { useState } from 'react';
import { report, money, num, date, daysUntil, api, today } from '../../lib/client';
import { useData, Badge, Modal, toast } from '../ui';

// ---------- Icônes (traits fins) ----------
const P = {
  cart: 'M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2M9 20.5h.01M17 20.5h.01',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Zm14 6h.01',
  box: 'M21 8 12 3 3 8m18 0v8l-9 5m9-13-9 5m0 8-9-5V8m9 13v-8M3 8l9 5',
  trend: 'M3 17l6-6 4 4 8-8m0 0h-5m5 0v5',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  factory: 'M3 21V10l6 4V10l6 4V5h6v16H3Zm4-4h2m4 0h2',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z',
  bank: 'M3 10 12 4l9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h2',
  coins: 'M9 8c3.3 0 6-1.1 6-2.5S12.3 3 9 3 3 4.1 3 5.5 5.7 8 9 8Zm-6-2.5v4C3 10.9 5.7 12 9 12s6-1.1 6-2.5v-4M3 9.5v4C3 14.9 5.7 16 9 16m6-6.5c3.3 0 6 1.1 6 2.5S18.3 14.5 15 14.5 9 13.4 9 12m12 0v4c0 1.4-2.7 2.5-6 2.5S9 17.4 9 16v-4m12 4v4c0 1.4-2.7 2.5-6 2.5S9 21.4 9 20v-4',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  search: 'm21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9m4.3 13a1.9 1.9 0 0 0 3.4 0',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm12-3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7Zm1 1h.01',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  sun: 'M12 3v2m0 14v2M5.6 5.6 7 7m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4 7 17M17 7l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5m5 5H3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20m16 0v-1.5a3.5 3.5 0 0 0-2.6-3.4M14.5 4.2a3.5 3.5 0 0 1 0 6.6M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  print: 'M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7v-7Z',
  whatsapp: 'M20 11.6A8.4 8.4 0 0 1 7.6 19L3 20.5l1.5-4.4A8.4 8.4 0 1 1 20 11.6ZM9 8.5c.3 2.8 3.2 5.6 6 6l1.1-1.4-1.9-1-.8.8c-1-.4-2-1.4-2.4-2.4l.8-.8-1-1.9L9 8.5Z',
};
export function Ic({ n, s = 18 }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={P[n]} /></svg>;
}

const short = (v) => {
  const x = Math.abs(Number(v) || 0);
  if (x >= 1e6) return `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (x >= 1e4) return `${Math.round(v / 1e3).toLocaleString('fr-FR')} k`;
  return num(Math.round(v));
};

const famOf = (name) => { const r = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(String(name || '').trim()); return r ? { fam: r[1].trim(), fmt: r[2].trim() } : { fam: String(name || '').trim(), fmt: '' }; };
const STOCK_TYPES = [
  ['pf', 'Produits prêts à vendre', 'Jus et autres produits finis (au prix de revient)', 'orange'],
  ['semi_fini', 'Semi-finis', 'Produits en cours', 'violet'],
  ['mp', 'Matières premières', 'Bissap, bouye, sucre, gingembre…', 'green'],
  ['emballage', 'Emballages', 'Sachets, bouteilles, étiquettes…', 'blue'],
  ['consommable', 'Consommables', 'Produits utilisés au quotidien', 'slate'],
  ['materiel', 'Matériel', 'Équipements suivis en stock', 'slate'],
];
const hourOf = (v) => (v ? new Date(v).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');

export default function Dashboard({ go, user, company, can }) {
  const { data: d, loading } = useData(() => report('dashboard'), []);
  if (loading && !d) return <div className="spinner">Chargement du tableau de bord…</div>;
  if (!d) return null;
  const cashTotal = (d.cash || []).reduce((s, a) => s + Number(a.balance || 0), 0);
  const S = d.sales;
  const others = [
    d.cash && { ic: 'receipt', tone: 'red', k: 'Dépenses du mois', v: money(d.month_expenses), s: Number(d.month_expenses) ? 'Toutes catégories' : 'Aucune dépense enregistrée', to: 'caisse' },
    d.payables !== undefined && Number(d.payables) > 0 && { ic: 'truck', tone: 'slate', k: 'Dettes fournisseurs', v: money(d.payables), s: 'Reste à payer', to: 'achats' },
    d.quality && { ic: 'shield', tone: d.quality.open_nc > 0 ? 'red' : 'green', k: 'Qualité', v: d.quality.open_nc > 0 ? `${d.quality.open_nc} problème(s)` : 'RAS', s: `${d.quality.blocked_lots} lot(s) bloqué(s) · ${d.quality.controls} contrôle(s) ce mois`, to: 'qualite' },
    d.low && { ic: 'alert', tone: d.low.length || d.expiring?.length ? 'orange' : 'green', k: 'Alertes stock', v: d.low.length + (d.expiring?.length || 0) || 'Aucune', s: `${d.low.length} stock bas · ${d.expiring?.length || 0} date limite proche`, to: 'stock' },
  ].filter(Boolean);

  return (
    <div className="dash">
      <Hero d={d} cashTotal={cashTotal} user={user} company={company} go={go} can={can} />
      {d.setup && <Setup s={d.setup} go={go} />}

      {S && d.money === false && (<>
        <SecTitle t="Ventes" s="Nombre de ventes (ventes annulées non comptées)" />
        <div className="kpis">
          <Kpi ic="cart" tone="orange" k="Aujourd'hui" v={`${S.today_count} vente${S.today_count > 1 ? 's' : ''}`} s={`${num(S.today_items)} article(s)`} on={() => go('ventes')} />
          <Kpi ic="trend" tone="blue" k="7 derniers jours" v={`${S.week_count} vente${S.week_count > 1 ? 's' : ''}`} s="toute l'équipe" on={() => go('ventes')} />
          <Kpi ic="star" tone="green" k="Ce mois" v={`${S.month_count} vente${S.month_count > 1 ? 's' : ''}`} s="toute l'équipe" on={() => go('ventes')} />
        </div>
        <div className="dgrid">
          {d.recent && <Recent list={d.recent} go={go} mine />}
          {d.top && <TopByJuice top={d.top} />}
        </div>
      </>)}
      {S && d.money !== false && (<>
        <SecTitle t="Ventes" s="Ce qui a été vendu (ventes annulées non comptées)" />
        <div className="kpis">
          <Kpi ic="cart" tone="orange" k="Aujourd'hui" v={money(S.today)} s={<>{S.today_count} vente{S.today_count > 1 ? 's' : ''} · {num(S.today_items)} article{S.today_items > 1 ? 's' : ''}<br />Hier : {money(S.yesterday)}</>} on={() => go('ventes')} />
          <Kpi ic="trend" tone="blue" k="7 derniers jours" v={money(S.week)} s={<>{S.week_count} vente{S.week_count > 1 ? 's' : ''}<br />≈ {money(S.week / 7)} par jour</>} on={() => go('ventes')} />
          <Kpi ic="star" tone="green" k={`Ce mois (${new Date().toLocaleDateString('fr-FR', { month: 'long' })})`} v={money(S.month)} s={<>{S.month_count} vente{S.month_count > 1 ? 's' : ''}<br />Bénéfice sur les produits : <b className={S.month_margin < 0 ? 'neg' : 'pos'}>{money(S.month_margin)}</b></>} on={() => go('rapports')} />
          <Kpi ic="coins" tone={S.receivables > 0 ? 'violet' : 'green'} k="Reste à encaisser" v={money(S.receivables)} s={S.receivables > 0 ? <>{S.receivables_count} vente{S.receivables_count > 1 ? 's' : ''} pas encore payée{S.receivables_count > 1 ? 's' : ''}</> : 'Tout est encaissé ✓'} on={() => go('ventes')} />
        </div>
        <div className="dgrid">
          {d.daily && <SalesChart daily={d.daily} />}
          {d.cash && <Treasury cash={d.cash} total={cashTotal} go={go} />}
        </div>
        <div className="dgrid">
          {d.recent && <Recent list={d.recent} go={go} />}
          {d.top && <TopByJuice top={d.top} />}
        </div>
      </>)}
      {!S && d.cash && <div className="dgrid"><Treasury cash={d.cash} total={cashTotal} go={go} /></div>}

      {(d.stock_types || d.pf_stock) && (<>
        <SecTitle t="Stock" s="Ce que vous avez en ce moment" />
        <div className="dgrid">
          {d.pf_stock && <JuiceStock list={d.pf_stock} go={go} />}
          {d.stock_types && <StockValue types={d.stock_types} total={d.stock?.value} go={go} />}
        </div>
      </>)}

      {(d.prod_month || d.month_prod) && (<>
        <SecTitle t="Production" s="Ce qui a été fabriqué ce mois-ci" />
        <div className="dgrid">
          {d.month_prod && <ProdProfit p={d.month_prod} go={go} />}
          {d.prod_month && <ProdMonth p={d.prod_month} items={d.prod_items || []} go={go} />}
        </div>
      </>)}

      {others.length > 0 && (<>
        <SecTitle t="À surveiller" s="Dépenses, alertes et qualité" />
        <div className="kpis">{others.map((x) => <Kpi key={x.k} {...x} on={() => go(x.to)} />)}</div>
      </>)}

      <div className="dgrid three">
        {(d.low || d.expiring) && (
          <div className="panel">
            <PanelHead ic="alert" t="Stock bas et dates limites" a="Stock" on={() => go('stock')} />
            {!d.low?.length && !d.expiring?.length && <Empty t="Tout est en ordre 👌" ok />}
            {(d.low || []).map((i) => (
              <div key={'l' + i.id} className="watch"><span className="dot orange" /><span className="w-n">{i.name}<small>Stock bas (minimum {num(i.min_stock)})</small></span><span className="mono neg">{num(i.stock)} {i.unit}</span></div>
            ))}
            {(d.expiring || []).map((l) => {
              const dd = daysUntil(l.expiry_date);
              return <div key={'e' + l.id} className="watch"><span className={'dot ' + (dd < 0 ? 'red' : 'yellow')} /><span className="w-n">{l.name}<small>Lot {l.lot_number} · {num(l.qty)} {l.unit}</small></span><Badge v={dd < 0 ? 'perime' : dd < 8 ? 'bloque' : 'partiel'}>{dd < 0 ? 'Périmé' : `Dans ${dd} j`}</Badge></div>;
            })}
          </div>
        )}
        {d.production && (
          <div className="panel">
            <PanelHead ic="clock" t="Productions prévues" a="Production" on={() => go('production')} />
            {!d.production.length && <Empty t="Aucune production prévue" />}
            {d.production.map((p) => (
              <div key={p.id} className="watch"><span className="dot blue" /><span className="w-n">{p.product_name}<small>{num(p.planned_qty)} prévus · {date(p.planned_date)}</small></span><Badge v={p.status} map="prod_status" /></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SecTitle = ({ t, s }) => <div className="dsec"><h3>{t}</h3>{s && <span>{s}</span>}</div>;
function Kpi({ ic, tone, k, v, s, on }) {
  return (
    <button className={'kpi t-' + tone} onClick={on}>
      <span className="kpi-ic"><Ic n={ic} /></span>
      <span className="kpi-k">{k}</span>
      <span className="kpi-v">{v}</span>
      <span className="kpi-s">{s}</span>
    </button>
  );
}

function Treasury({ cash, total, go }) {
  return (
    <div className="panel">
      <PanelHead ic="wallet" t="Argent disponible" a="Caisse" on={() => go('caisse')} />
      <div className="cash-total"><span>Total, tous comptes</span><b className={total < 0 ? 'neg' : ''}>{money(total)}</b></div>
      {cash.map((a) => (
        <div key={a.id} className="acc">
          <span className={'acc-ic ' + a.type}><Ic n={a.type === 'banque' ? 'bank' : a.type === 'mobile_money' ? 'phone' : 'wallet'} s={16} /></span>
          <span className="acc-n">{a.name}</span>
          <span className={'acc-v mono' + (a.balance < 0 ? ' neg' : Number(a.balance) === 0 ? ' muted' : '')}>{money(a.balance)}</span>
        </div>
      ))}
    </div>
  );
}

function Recent({ list, go, mine }) {
  return (
    <div className="panel wide">
      <PanelHead ic="receipt" t={mine ? 'Mes dernières ventes' : 'Dernières ventes'} a={mine ? 'Mes ventes' : 'Historique des ventes'} on={() => go('ventes')} />
      {!list.length && <Empty t="Aucune vente pour l'instant" />}
      {list.map((v) => {
        const due = Number(v.total) - Number(v.paid);
        const isToday = String(v.date).slice(0, 10) === today();
        return (
          <div key={v.id} className="rs">
            <div className="rs-when"><b>{isToday ? hourOf(v.created_at) : date(v.date)}</b><span>{isToday ? "aujourd'hui" : v.number}</span></div>
            <div className="rs-what"><b>{v.customer_name || 'Client comptoir'}</b>{v.user_name && <span className="muted small"> · {v.user_name}</span>}<div className="rs-items">{(v.items || '').replace(/Jus de /g, '')}</div></div>
            <div className="rs-amt"><b>{money(v.total)}</b>{due > 0.009 ? <span className="badge red">Doit {money(due)}</span> : <span className="badge green">Payée</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

// Ventes du mois regroupées par jus (avec le détail par format)
function TopByJuice({ top }) {
  const m = new Map();
  const hasMoney = top.some((t) => t.total !== undefined);
  for (const t of top) { const { fam, fmt } = famOf(t.name); if (!m.has(fam)) m.set(fam, { fam, total: 0, units: 0, liters: 0, fmts: [] }); const g = m.get(fam); g.total += Number(t.total) || 0; g.units += Number(t.qty); g.liters += Number(t.qty) * (Number(t.unit_volume) || 0); g.fmts.push({ fmt: fmt || t.unit, qty: Number(t.qty), unit: t.unit }); }
  const key = hasMoney ? 'total' : (top.some((t) => Number(t.unit_volume) > 0) ? 'liters' : 'units');
  const list = [...m.values()].sort((a, b) => b[key] - a[key]);
  const max = list[0]?.[key] || 1;
  return (
    <div className="panel">
      <PanelHead ic="star" t="Ce qui se vend le mieux (ce mois)" />
      {!list.length && <Empty t="Aucune vente ce mois-ci" />}
      {list.slice(0, 7).map((g, i) => (
        <div key={g.fam} className="rank">
          <span className={'rank-n r' + i}>{i + 1}</span>
          <div className="rank-b"><div className="rank-t"><span>{g.fam}</span><b className="mono">{hasMoney ? money(g.total) : key === 'liters' ? `${num(Math.round(g.liters * 10) / 10)} L` : num(g.units)}</b></div>
            <div className="track"><div className="fill" style={{ width: `${(g[key] / max) * 100}%` }} /></div>
            <span className="muted small">{g.fmts.map((f) => `${num(f.qty)} ${f.fmt}`).join(' · ')}{g.liters > 0 ? ` — ${num(Math.round(g.liters * 10) / 10)} L` : ''}</span></div>
        </div>
      ))}
    </div>
  );
}

// Jus en stock : un tableau goût × format
function JuiceStock({ list, go }) {
  const fams = new Map(); const fmts = new Map();
  for (const p of list) {
    const { fam, fmt } = famOf(p.name); const f = fmt || p.unit || '—';
    if (!fams.has(fam)) fams.set(fam, {});
    fams.get(fam)[f] = p;
    if (!fmts.has(f)) fmts.set(f, Number(p.unit_volume) || 0);
  }
  const cols = [...fmts].sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const rows = [...fams].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  const totQty = list.reduce((s, p) => s + Number(p.stock), 0);
  const showVal = list.some((p) => p.sale_price !== undefined);
  const totSale = list.reduce((s, p) => s + Number(p.stock) * Number(p.sale_price || 0), 0);
  const totL = list.reduce((s, p) => s + Number(p.stock) * (Number(p.unit_volume) || 0), 0);
  return (
    <div className="panel wide">
      <PanelHead ic="box" t="Produits prêts à vendre" a="Stock" on={() => go('stock')} />
      <div className="chart-sum">
        <div><span>Unités en stock</span><b>{num(totQty)}</b></div>
        <div><span>Volume</span><b>{num(Math.round(totL * 10) / 10)} L</b></div>
        {showVal && <div><span>Valeur à la vente</span><b>{money(totSale)}</b></div>}
      </div>
      {!rows.length ? <Empty t="Aucun produit fini" /> : (
        <div className="table-wrap"><table className="t js-t">
          <thead><tr><th>Produit</th>{cols.map((c) => <th key={c} className="r">{c}</th>)}{showVal && <th className="r">Valeur à la vente</th>}</tr></thead>
          <tbody>{rows.map(([fam, byFmt]) => {
            const val = Object.values(byFmt).reduce((s, p) => s + Number(p.stock) * Number(p.sale_price || 0), 0);
            return (
              <tr key={fam}><td className="strong">{fam}</td>
                {cols.map((c) => { const p = byFmt[c]; return <td key={c} className={'r nw mono' + (!p ? ' muted' : Number(p.stock) <= 0 ? ' zero' : '')}>{p ? <>{num(p.stock)}<small> {p.unit}</small></> : '—'}</td>; })}
                {showVal && <td className="r nw mono">{money(val)}</td>}</tr>
            );
          })}</tbody>
        </table></div>
      )}
    </div>
  );
}

function StockValue({ types, total, go }) {
  const by = Object.fromEntries(types.map((t) => [t.type, t]));
  const rows = STOCK_TYPES.filter(([k]) => by[k] && Number(by[k].value) > 0).map(([k, l, s, tone]) => ({ k, l, s, tone, ...by[k] }));
  const sum = Number(total) || rows.reduce((a, r) => a + Number(r.value), 0);
  return (
    <div className="panel">
      <PanelHead ic="coins" t="Valeur du stock" a="Stock" on={() => go('stock')} />
      <div className="cash-total"><span>Tout le stock (prix d'achat / de revient)</span><b>{money(sum)}</b></div>
      <div className="sv-bar">{rows.map((r) => <i key={r.k} className={'t-' + r.tone} style={{ width: `${(Number(r.value) / (sum || 1)) * 100}%` }} title={r.l} />)}</div>
      {rows.map((r) => (
        <div key={r.k} className="sv-row">
          <span className={'sv-dot t-' + r.tone} />
          <span className="sv-n">{r.l}<small>{r.s} · {r.items} article{r.items > 1 ? 's' : ''}</small></span>
          <span className="sv-v mono">{money(r.value)}<small>{Math.round((Number(r.value) / (sum || 1)) * 100)} %</small></span>
        </div>
      ))}
      {by.pf && Number(by.pf.sale_value) > 0 && <div className="note small" style={{ marginTop: 10 }}>Les produits prêts à vendre valent <b>{money(by.pf.sale_value)}</b> au prix de vente (coût : {money(by.pf.value)}).</div>}
    </div>
  );
}

function ProdMonth({ p, items, go }) {
  return (
    <div className="panel">
      <PanelHead ic="factory" t="Fabriqué ce mois" a="Production" on={() => go('production')} />
      <div className="cash-total"><span>Volume produit</span><b>{num(Math.round(Number(p.liters) * 10) / 10)} L</b></div>
      <div className="muted small" style={{ marginBottom: 8 }}>{p.batches} production{p.batches > 1 ? 's' : ''}{p.cost !== undefined ? ` · coût total ${money(p.cost)}` : ''}{Number(p.rejected) > 0 ? ` · ${num(p.rejected)} rebut(s)` : ''}</div>
      {!items.length && <Empty t="Rien de fabriqué ce mois-ci" />}
      {items.map((i) => (
        <div key={i.name} className="pf"><div className="pf-n">{i.name.replace(/^Jus de /, '')}</div><div className="pf-q">{num(i.qty)}<small>{i.unit}</small></div></div>
      ))}
    </div>
  );
}

function PanelHead({ ic, t, a, on }) {
  return (
    <div className="panel-h">
      <span className="panel-ic"><Ic n={ic} s={16} /></span><h3>{t}</h3>
      {a && <button className="panel-a" onClick={on}>{a} <Ic n="arrow" s={14} /></button>}
    </div>
  );
}
const Empty = ({ t, ok }) => <div className={'empty-s' + (ok ? ' ok' : '')}>{t}</div>;

function SalesChart({ daily }) {
  const vals = daily.map((x) => Number(x.total) || 0);
  const max = Math.max(1, ...vals);
  const total = vals.reduce((a, b) => a + b, 0);
  const days = vals.filter((v) => v > 0).length;
  const margin = daily.reduce((a, x) => a + (Number(x.margin) || 0), 0);
  return (
    <div className="panel wide">
      <PanelHead ic="trend" t="Ventes jour par jour (30 derniers jours)" />
      <div className="chart-sum">
        <div><span>Total</span><b>{money(total)}</b></div>
        <div><span>Bénéfice sur les produits</span><b>{money(margin)}</b></div>
        <div><span>Moyenne par jour de vente</span><b>{money(days ? total / days : 0)}</b></div>
      </div>
      <div className="chart">
        <div className="chart-y"><span>{short(max)}</span><span>{short(max / 2)}</span><span>0</span></div>
        <div className="chart-area">
          <div className="chart-grid"><i /><i /><i /></div>
          <div className="chart-bars">
            {daily.map((x, i) => (
              <div key={x.day} className={'cb' + (i === daily.length - 1 ? ' today' : '')}>
                <div className="cb-bar" style={{ height: `${Math.max((Number(x.total) / max) * 100, Number(x.total) > 0 ? 3 : 0)}%` }}>
                  <span className="cb-tip">{date(x.day)}<b>{money(x.total)}</b></span>
                </div>
              </div>
            ))}
          </div>
          <div className="chart-x">{daily.map((x, i) => <span key={x.day}>{i % 5 === 4 || i === daily.length - 1 ? new Date(x.day + 'T00:00:00').getDate() : ''}</span>)}</div>
        </div>
      </div>
    </div>
  );
}

function ProdProfit({ p, go }) {
  return (
    <div className="panel wide">
      <PanelHead ic="factory" t="Est-ce que les productions du mois rapportent ?" a="Détails" on={() => go('production')} />
      <div className="chart-sum four">
        <div><span>Coût de fabrication</span><b>{money(p.cost)}</b></div>
        <div><span>Déjà vendu pour</span><b>{money(p.revenue)}</b></div>
        <div><span>Bénéfice réalisé</span><b className={p.profit < 0 ? 'neg' : 'pos'}>{money(p.profit)}</b></div>
        <div><span>Bénéfice si tout est vendu</span><b>{money(p.projected)}</b></div>
      </div>
      {!p.rows.length && <Empty t="Aucune production terminée ce mois-ci — utilisez « ⚡ Production rapide »." />}
      {p.rows.length > 0 && (
        <div className="table-wrap"><table className="t pp">
          <thead><tr><th>Production</th><th className="r">Fabriqué</th><th className="r">Coût</th><th>Déjà vendu</th><th className="r">Vendu pour</th><th className="r">Bénéfice</th></tr></thead>
          <tbody>{p.rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.product}</b><br /><span className="muted small">{r.number} · {date(r.date)}</span></td>
              <td className="r">{num(r.produced_qty)} {r.unit}</td>
              <td className="r">{money(r.real_cost)}</td>
              <td style={{ minWidth: 120 }}><div className="track"><div className="fill" style={{ width: `${Math.min(r.sold_pct, 100)}%` }} /></div><span className="muted small">{num(r.sold_qty)} · {r.sold_pct.toFixed(0)} %</span></td>
              <td className="r">{money(r.revenue)}</td>
              <td className="r"><b className={r.profit < 0 ? 'neg' : 'pos'}>{money(r.profit)}</b></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function DailySummary({ onClose }) {
  const [day, setDay] = useState(today());
  const { data, loading } = useData(() => api('app/daily', { params: { date: day } }), [day]);
  const text = data?.text || '';
  return (
    <Modal title="Résumé de la journée" onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(text).then(() => toast('Résumé copié')).catch(() => toast('Copie impossible', 'error')); }} disabled={!text}>Copier</button>
        <a className={'btn primary' + (!text ? ' disabled' : '')} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><Ic n="whatsapp" s={16} /> Envoyer sur WhatsApp</a>
      </>}>
      <div className="row" style={{ marginBottom: 10 }}><label className="small muted">Journée du</label><input type="date" className="input sm" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} style={{ width: 170 }} /></div>
      {loading && !data ? <div className="spinner">Préparation du résumé…</div> : <pre className="daily-txt">{text.replace(/\*([^*\n]+)\*/g, '$1').replace(/_([^_\n]+)_/g, '$1')}</pre>}
      <p className="muted small" style={{ margin: '8px 0 0' }}>« Envoyer sur WhatsApp » ouvre WhatsApp : choisissez la présidente ou le groupe du GIE.</p>
    </Modal>
  );
}

function Hero({ d, cashTotal, user, company, go, can }) {
  const [daily, setDaily] = useState(false);
  const h = new Date().getHours();
  const hello = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const first = (user?.name || '').split(' ')[0];
  const actions = [['ventes', 'Nouvelle vente', true], ['production', 'Production'], ['stock', 'Stock'], ['rapports', 'Rapports']].filter(([m]) => !can || can(m));
  const tiles = [
    d.sales && d.money !== false && ["Ventes d'aujourd'hui", money(d.sales.today), `${d.sales.today_count} vente(s)`],
    d.sales && d.money !== false && ['Ventes du mois', money(d.sales.month), `bénéfice ${money(d.sales.month_margin)}`],
    d.cash && ['Argent disponible', money(cashTotal), 'tous comptes'],
    d.sales && d.money === false && ["Ventes d'aujourd'hui", `${d.sales.today_count}`, `${num(d.sales.today_items)} article(s)`],
    d.sales && d.money === false && ['Ventes du mois', `${d.sales.month_count}`, 'ventes enregistrées'],
  ].filter(Boolean);
  return (
    <>
    <div className="hero" style={{ backgroundImage: 'url(/img/usine-2.webp)' }}>
      <div className="hero-in">
        <div>
          <div className="hk">{hello}{first ? `, ${first}` : ''}</div>
          <h2>{company?.name || 'Votre entreprise'}</h2>
          <p>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>{actions.map(([m, l, primary]) => <button key={m} className={'btn' + (primary ? ' accent' : '')} onClick={() => go(m)}>{l}</button>)}
            {d.money !== false && <button className="btn wa-btn" onClick={() => setDaily(true)}><Ic n="whatsapp" s={16} /> Résumé du jour</button>}</div>
        </div>
        {tiles.length > 0 && (
          <div className="hero-tiles">
            {tiles.map(([k, v, s]) => <div key={k} className="ht"><span>{k}</span><b>{v}</b><small>{s}</small></div>)}
          </div>
        )}
      </div>
    </div>
    {daily && <DailySummary onClose={() => setDaily(false)} />}
    </>
  );
}

function Setup({ s, go }) {
  const steps = [
    ['company', 'Informations de l’entreprise', 'admin', s.company > 0],
    ['materials', 'Matières, emballages, matériel', 'stock', s.materials > 0],
    ['products', 'Produits finis et prix', 'stock', s.products > 0],
    ['recipes', 'Recettes (optionnel)', 'production', s.recipes > 0],
    ['stock', 'Stock de départ', 'stock', s.stock > 0],
    ['suppliers', 'Fournisseurs', 'achats', s.suppliers > 0],
    ['users', 'Comptes des employés', 'admin', s.users > 1],
    ['productions', 'Première production', 'production', s.productions > 0],
  ];
  const done = steps.filter((x) => x[3]).length;
  if (done === steps.length) return null;
  return (
    <div className="setup">
      <div className="setup-h">
        <div><b>Démarrage</b><span>{done}/{steps.length} étapes terminées</span></div>
        <div className="track"><div className="fill" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      </div>
      <div className="setup-steps">
        {steps.map(([k, label, mod, ok]) => (
          <button key={k} className={'step' + (ok ? ' ok' : '')} onClick={() => go(mod)}>
            <span className="step-c">{ok ? '✓' : ''}</span>{label}
          </button>
        ))}
      </div>
    </div>
  );
}
