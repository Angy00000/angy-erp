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

export default function Dashboard({ go, user, company, can }) {
  const { data: d, loading } = useData(() => report('dashboard'), []);
  if (loading && !d) return <div className="spinner">Chargement du tableau de bord…</div>;
  if (!d) return null;
  const cashTotal = (d.cash || []).reduce((s, a) => s + a.balance, 0);
  const kpis = [
    d.sales && { ic: 'trend', tone: 'orange', k: 'Ventes du mois', v: money(d.sales.month), s: <>Marge brute <b>{money(d.sales.month_margin)}</b></>, to: 'rapports' },
    d.cash && { ic: 'receipt', tone: 'red', k: 'Dépenses du mois', v: money(d.month_expenses), s: 'Toutes catégories', to: 'caisse' },
    d.stock && { ic: 'box', tone: 'blue', k: 'Valeur du stock', v: money(d.stock.value), s: `${d.stock.items} article(s) en stock`, to: 'stock' },
    d.sales && { ic: 'coins', tone: 'violet', k: 'Créances clients', v: money(d.sales.receivables), s: 'Reste à encaisser', to: 'ventes' },
    d.payables !== undefined && { ic: 'truck', tone: 'slate', k: 'Dettes fournisseurs', v: money(d.payables), s: 'Reste à payer', to: 'achats' },
    d.prod_month && { ic: 'factory', tone: 'green', k: 'Production du mois', v: num(d.prod_month.produced), s: `${d.prod_month.orders} production(s) · ${num(d.prod_month.rejected)} rebut(s)`, to: 'production' },
    d.quality && { ic: 'shield', tone: d.quality.open_nc > 0 ? 'red' : 'green', k: 'Qualité', v: `${d.quality.open_nc} NC`, s: `${d.quality.blocked_lots} lot(s) bloqué(s) · ${d.quality.controls} contrôle(s)`, to: 'qualite' },
    d.low && { ic: 'alert', tone: d.low.length ? 'orange' : 'green', k: 'Alertes stock', v: d.low.length + (d.expiring?.length || 0), s: `${d.low.length} stock bas · ${d.expiring?.length || 0} DLC proche`, to: 'stock' },
  ].filter(Boolean);

  return (
    <div className="dash">
      <Hero d={d} cashTotal={cashTotal} user={user} company={company} go={go} can={can} />
      {d.setup && <Setup s={d.setup} go={go} />}

      <div className="kpis">
        {kpis.map((x) => (
          <button key={x.k} className={'kpi t-' + x.tone} onClick={() => go(x.to)}>
            <span className="kpi-ic"><Ic n={x.ic} /></span>
            <span className="kpi-k">{x.k}</span>
            <span className="kpi-v">{x.v}</span>
            <span className="kpi-s">{x.s}</span>
          </button>
        ))}
      </div>

      <div className="dgrid">
        {d.daily && <SalesChart daily={d.daily} />}
        {d.cash && (
          <div className="panel">
            <PanelHead ic="wallet" t="Trésorerie" a="Caisse" on={() => go('caisse')} />
            <div className="cash-total"><span>Total disponible</span><b className={cashTotal < 0 ? 'neg' : ''}>{money(cashTotal)}</b></div>
            {d.cash.map((a) => (
              <div key={a.id} className="acc">
                <span className={'acc-ic ' + a.type}><Ic n={a.type === 'banque' ? 'bank' : a.type === 'mobile_money' ? 'phone' : 'wallet'} s={16} /></span>
                <span className="acc-n">{a.name}</span>
                <span className={'acc-v mono' + (a.balance < 0 ? ' neg' : '')}>{money(a.balance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dgrid">
        {d.month_prod && <ProdProfit p={d.month_prod} go={go} />}
        {d.pf_stock && (
          <div className="panel">
            <PanelHead ic="box" t="Produits finis en stock" a="Stock" on={() => go('stock')} />
            {!d.pf_stock.length && <Empty t="Aucun produit fini" />}
            {d.pf_stock.map((i) => (
              <div key={i.id} className="pf">
                <div className="pf-n">{i.name}<span>{money(i.sale_price)} / {i.unit}</span></div>
                <div className={'pf-q' + (i.stock <= 0 ? ' zero' : '')}>{num(i.stock)}<small>{i.unit}</small></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dgrid three">
        {d.top && (
          <div className="panel">
            <PanelHead ic="star" t="Meilleures ventes du mois" />
            {!d.top.length && <Empty t="Aucune vente ce mois-ci" />}
            {d.top.map((t, i) => {
              const max = d.top[0]?.total || 1;
              return (
                <div key={t.name} className="rank">
                  <span className={'rank-n r' + i}>{i + 1}</span>
                  <div className="rank-b"><div className="rank-t"><span>{t.name}</span><b className="mono">{money(t.total)}</b></div>
                    <div className="track"><div className="fill" style={{ width: `${(t.total / max) * 100}%` }} /></div>
                    <span className="muted small">{num(t.qty)} vendu(s)</span></div>
                </div>
              );
            })}
          </div>
        )}
        {(d.low || d.expiring) && (
          <div className="panel">
            <PanelHead ic="alert" t="À surveiller" a="Stock" on={() => go('stock')} />
            {!d.low?.length && !d.expiring?.length && <Empty t="Tout est en ordre 👌" ok />}
            {(d.low || []).map((i) => (
              <div key={'l' + i.id} className="watch"><span className="dot orange" /><span className="w-n">{i.name}<small>Stock bas</small></span><span className="mono neg">{num(i.stock)} / {num(i.min_stock)} {i.unit}</span></div>
            ))}
            {(d.expiring || []).map((l) => {
              const dd = daysUntil(l.expiry_date);
              return <div key={'e' + l.id} className="watch"><span className={'dot ' + (dd < 0 ? 'red' : 'yellow')} /><span className="w-n">{l.name}<small>Lot {l.lot_number} · {num(l.qty)} {l.unit}</small></span><Badge v={dd < 0 ? 'perime' : dd < 8 ? 'bloque' : 'partiel'}>{dd < 0 ? 'Périmé' : `J-${dd}`}</Badge></div>;
            })}
          </div>
        )}
        {d.production && (
          <div className="panel">
            <PanelHead ic="clock" t="Production à venir" a="Planning" on={() => go('production')} />
            {!d.production.length && <Empty t="Aucune production planifiée" />}
            {d.production.map((p) => (
              <div key={p.id} className="watch"><span className="dot blue" /><span className="w-n">{p.product_name}<small>{p.number} · {num(p.planned_qty)} prévus · {date(p.planned_date)}</small></span><Badge v={p.status} map="prod_status" /></div>
            ))}
          </div>
        )}
      </div>
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
      <PanelHead ic="trend" t="Ventes des 30 derniers jours" />
      <div className="chart-sum">
        <div><span>Total</span><b>{money(total)}</b></div>
        <div><span>Marge brute</span><b>{money(margin)}</b></div>
        <div><span>Moyenne / jour de vente</span><b>{money(days ? total / days : 0)}</b></div>
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
      <PanelHead ic="factory" t="Rentabilité des productions du mois" a="Détails" on={() => go('production')} />
      <div className="chart-sum four">
        <div><span>Dépensé</span><b>{money(p.cost)}</b></div>
        <div><span>Rapporté</span><b>{money(p.revenue)}</b></div>
        <div><span>Bénéfice réalisé</span><b className={p.profit < 0 ? 'neg' : 'pos'}>{money(p.profit)}</b></div>
        <div><span>Bénéfice prévu</span><b>{money(p.projected)}</b></div>
      </div>
      {!p.rows.length && <Empty t="Aucune production terminée ce mois-ci — utilisez « ⚡ Production rapide »." />}
      {p.rows.length > 0 && (
        <div className="table-wrap"><table className="t pp">
          <thead><tr><th>Production</th><th className="r">Produit</th><th className="r">Coût</th><th>Vendu</th><th className="r">Rapporté</th><th className="r">Bénéfice</th></tr></thead>
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
    d.sales && ['Ventes du jour', money(d.sales.today), `${d.sales.today_count} vente(s)`],
    d.cash && ['Trésorerie', money(cashTotal), `${d.cash.length} compte(s)`],
    d.month_prod && ['Bénéfice du mois', money(d.month_prod.profit), `${d.month_prod.count} production(s)`],
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
            <button className="btn wa-btn" onClick={() => setDaily(true)}><Ic n="whatsapp" s={16} /> Résumé du jour</button></div>
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
