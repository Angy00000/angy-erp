import { report, money, num, date, daysUntil } from '../../lib/client';
import { useData, Stat, Bars, HBars, Badge } from '../ui';

export default function Dashboard({ go }) {
  const { data: d, loading } = useData(() => report('dashboard'), []);
  if (loading && !d) return <div className="spinner">Chargement du tableau de bord…</div>;
  if (!d) return null;
  const cashTotal = (d.cash || []).reduce((s, a) => s + a.balance, 0);
  return (
    <div>
      {d.setup && <Setup s={d.setup} go={go} />}
      <div className="grid g4">
        {d.sales && <Stat accent k="Ventes du jour" v={money(d.sales.today)} s={`${d.sales.today_count} facture(s)`} />}
        {d.sales && <Stat k="Ventes du mois" v={money(d.sales.month)} s={`Marge brute : ${money(d.sales.month_margin)}`} />}
        {d.cash && <Stat k="Trésorerie totale" v={money(cashTotal)} s={`Dépenses du mois : ${money(d.month_expenses)}`} />}
        {d.stock && <Stat k="Valeur du stock" v={money(d.stock.value)} s={`${d.stock.items} article(s) en stock`} />}
        {d.sales && <Stat k="Créances clients" v={money(d.sales.receivables)} s="Reste à encaisser" />}
        {d.payables !== undefined && <Stat k="Dettes fournisseurs" v={money(d.payables)} s="Reste à payer" />}
        {d.prod_month && <Stat k="Production du mois" v={num(d.prod_month.produced)} s={`${d.prod_month.orders} OF · ${num(d.prod_month.rejected)} rebut(s)`} />}
        {d.quality && <Stat k="Qualité" v={`${d.quality.open_nc} NC ouverte(s)`} s={`${d.quality.blocked_lots} lot(s) bloqué(s) · ${d.quality.controls} contrôle(s) ce mois`} />}
      </div>
      <div className="space" />
      <div className="grid g3">
        {d.daily && (
          <div className="card card-pad" style={{ gridColumn: 'span 2' }}>
            <h3>Ventes des 30 derniers jours</h3>
            <Bars data={d.daily.map((x) => ({ ...x, day: date(x.day) }))} />
          </div>
        )}
        {d.top && (
          <div className="card card-pad">
            <h3>Meilleurs produits du mois</h3>
            <HBars data={d.top} />
          </div>
        )}
        {d.cash && (
          <div className="card card-pad">
            <h3>Comptes</h3>
            {d.cash.map((a) => <div key={a.id} className="list-row"><span>{a.name}</span><span className={'mono strong ' + (a.balance < 0 ? 'neg' : '')}>{money(a.balance)}</span></div>)}
          </div>
        )}
        {d.low && (
          <div className="card card-pad">
            <h3>Alertes de stock bas</h3>
            {!d.low.length && <div className="muted small">Aucune alerte 👌</div>}
            {d.low.map((i) => <div key={i.id} className="list-row"><span>{i.name}</span><span className="mono neg">{num(i.stock)} / {num(i.min_stock)} {i.unit}</span></div>)}
            {d.low.length > 0 && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => go('achats')}>Créer une commande</button>}
          </div>
        )}
        {d.expiring && (
          <div className="card card-pad">
            <h3>Lots proches de la péremption (30 j)</h3>
            {!d.expiring.length && <div className="muted small">Aucun lot concerné</div>}
            {d.expiring.map((l) => {
              const dd = daysUntil(l.expiry_date);
              return <div key={l.id} className="list-row"><span>{l.name}<br /><span className="muted small">{l.lot_number} · {num(l.qty)} {l.unit}</span></span><Badge v={dd < 0 ? 'perime' : dd < 8 ? 'bloque' : 'partiel'}>{dd < 0 ? 'Périmé' : `J-${dd}`}</Badge></div>;
            })}
          </div>
        )}
        {d.production && (
          <div className="card card-pad">
            <h3>Production à venir / en cours</h3>
            {!d.production.length && <div className="muted small">Aucun ordre planifié</div>}
            {d.production.map((p) => <div key={p.id} className="list-row"><span>{p.number} · {p.product_name}<br /><span className="muted small">{num(p.planned_qty)} prévus · {date(p.planned_date)}</span></span><Badge v={p.status} map="prod_status" /></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Setup({ s, go }) {
  const steps = [
    ['company', 'Renseigner les informations de l’entreprise (téléphone, NINEA, pied de facture)', 'admin', s.company > 0],
    ['materials', 'Créer les matières premières, emballages et matériel', 'stock', s.materials > 0],
    ['products', 'Créer les produits finis avec leur prix de vente', 'stock', s.products > 0],
    ['recipes', 'Créer les recettes : quantités de matières pour un lot', 'production', s.recipes > 0],
    ['stock', 'Saisir le stock de départ (bouton « Entrée stock »)', 'stock', s.stock > 0],
    ['suppliers', 'Ajouter les fournisseurs', 'achats', s.suppliers > 0],
    ['users', 'Créer les comptes des employés', 'admin', s.users > 1],
    ['productions', 'Lancer la première production', 'production', s.productions > 0],
  ];
  const done = steps.filter((x) => x[3]).length;
  if (done === steps.length) return null;
  return (
    <div className="card card-pad" style={{ marginBottom: 14, borderColor: 'var(--accent)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Démarrage — {done}/{steps.length} étapes</h3>
        <div className="hbar" style={{ gridTemplateColumns: '200px', margin: 0 }}><div className="track"><div className="fill" style={{ width: `${(done / steps.length) * 100}%` }} /></div></div></div>
      <div style={{ marginTop: 10 }}>
        {steps.map(([k, label, mod, ok]) => (
          <div key={k} className="list-row">
            <span className={ok ? 'muted' : 'strong'}>{ok ? '✓' : '○'}&nbsp; {label}</span>
            {!ok && <button className="btn sm" onClick={() => go(mod)}>Ouvrir</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
