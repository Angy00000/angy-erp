import { useMemo, useState } from 'react';
import { api, crud, money, num, LABELS } from '../../lib/client';
import { useData, useRefOptions, Stat, invalidateRefs } from '../ui';
import { waLink } from '../Chrome';
import { MarketPurchase } from './Stock';

// « À acheter » : ce qui va manquer, combien acheter et pour combien, d'après ce qui est utilisé chaque jour.
// + Préparer une production : ce qu'il faut pour X sachets / bouteilles d'un jus, d'après les recettes.
const famOf = (name) => { const r = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(String(name || '').trim()); return r ? { fam: r[1].trim(), fmt: r[2].trim() } : { fam: String(name || '').trim(), fmt: '' }; };
const PERIODS = [[7, '1 semaine'], [14, '2 semaines'], [30, '1 mois']];

export default function BuyList({ company }) {
  const [days, setDays] = useState(14);
  const { data, reload } = useData(() => api(`app/buy_list?days=${days}`), [days]);
  const [qty, setQty] = useState({});      // quantités modifiées à la main
  const [extra, setExtra] = useState({});  // ajouté depuis « Préparer une production »
  const [off, setOff] = useState({});      // décochés
  const [buy, setBuy] = useState(null);
  const [showAll, setShowAll] = useState(false);
  if (!data) return <div className="spinner">Chargement…</div>;

  const rows = data.list.map((x) => {
    const q = qty[x.id] !== undefined ? Number(qty[x.id]) || 0 : Math.max(x.to_buy, extra[x.id] || 0);
    return { ...x, q, sum: Math.round(q * x.price) };
  });
  const needed = rows.filter((x) => x.q > 0);
  const shown = showAll ? rows : needed;
  const chosen = needed.filter((x) => !off[x.id]);
  const budget = chosen.reduce((s, x) => s + x.sum, 0);
  const soon = rows.filter((x) => x.days_left !== null && x.days_left <= 5);
  const text = `🛒 Liste d'achats — ${company?.name || ''}\n` + chosen.map((x) => `• ${x.name} : ${num(x.q)} ${x.unit || ''}${x.price ? ` (≈ ${money(x.sum)})` : ''}`).join('\n') + `\n\nTotal estimé : ${money(budget)}`;

  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>
        Le logiciel regarde <b>ce que vous utilisez chaque jour</b> (moyenne des 30 derniers jours) et calcule <b>ce qu'il faut acheter</b> pour tenir la période choisie, plus le stock minimum. Corrigez les quantités si besoin, puis envoyez la liste ou enregistrez l'achat.
      </div>
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="muted small">Acheter pour tenir :</span>
        <div className="seg">{PERIODS.map(([d, l]) => <button key={d} className={days === d ? 'on' : ''} onClick={() => { setDays(d); setQty({}); }}>{l}</button>)}</div>
        <div className="grow" />
        <a className={'btn' + (chosen.length ? '' : ' disabled')} href={chosen.length ? waLink('', text) : undefined} target="_blank" rel="noreferrer">📲 Envoyer la liste (WhatsApp)</a>
        <button className="btn primary" disabled={!chosen.length} onClick={() => setBuy(chosen)}>🛒 J'ai acheté : enregistrer l'achat</button>
      </div>
      <div className="grid g3" style={{ margin: '14px 0' }}>
        <Stat k="Articles à acheter" v={needed.length} s={`pour ${PERIODS.find((p) => p[0] === days)?.[1] || `${days} jours`}`} accent={needed.length > 0} />
        <Stat k="Budget estimé" v={money(budget)} s="au dernier prix d'achat" />
        <Stat k="Vont manquer dans 5 jours ou moins" v={soon.length} s={soon.slice(0, 3).map((x) => x.name).join(', ') || 'rien'} accent={soon.length > 0} />
      </div>

      <div className="card">
        {!shown.length && <div className="empty">Rien à acheter pour cette période 👌 {rows.length > 0 && <button className="link-btn" onClick={() => setShowAll(true)}>Voir tous les articles</button>}</div>}
        {shown.length > 0 && <div className="table-wrap"><table className="t">
          <thead><tr><th style={{ width: 30 }} /><th>Article</th><th className="r">En stock</th><th className="r">Utilisé / jour</th><th>Il reste pour</th><th className="r" style={{ width: 150 }}>À acheter</th><th className="r">Prix</th><th className="r">Total</th></tr></thead>
          <tbody>{shown.map((x) => (
            <tr key={x.id} className={off[x.id] ? 'muted' : ''}>
              <td>{x.q > 0 && <input type="checkbox" checked={!off[x.id]} onChange={(e) => setOff({ ...off, [x.id]: !e.target.checked })} />}</td>
              <td className="nm"><b>{x.name}</b><div className="muted small">{LABELS.item_type[x.type]}{x.supplier ? ` · ${x.supplier}` : ''}</div></td>
              <td className={'r nw' + (x.stock <= 0 ? ' neg strong' : '')}>{num(x.stock)} {x.unit || ''}</td>
              <td className="r nw">{x.per_day > 0 ? `${num(Math.round(x.per_day * 100) / 100)} ${x.unit || ''}` : <span className="muted">pas utilisé</span>}</td>
              <td className="nw">{x.days_left === null ? <span className="muted">—</span>
                : <span className={'badge ' + (x.days_left <= 2 ? 'red' : x.days_left <= 7 ? 'amber' : 'green')}>{x.days_left <= 0 ? 'Épuisé' : `${x.days_left} jour${x.days_left > 1 ? 's' : ''}`}</span>}</td>
              <td className="r"><div className="buy-in"><input type="number" min="0" step="any" className="input" value={qty[x.id] !== undefined ? qty[x.id] : x.q || ''} placeholder="0" onChange={(e) => setQty({ ...qty, [x.id]: e.target.value })} /><span>{x.unit || ''}</span></div>
                {extra[x.id] > 0 && qty[x.id] === undefined && <div className="small pos">dont {num(extra[x.id])} pour la production prévue</div>}</td>
              <td className="r nw muted">{x.price ? money(x.price) : '—'}</td>
              <td className="r nw strong">{x.sum ? money(x.sum) : '—'}</td>
            </tr>
          ))}</tbody>
          {chosen.length > 0 && <tfoot><tr><td /><td colSpan={6} className="strong">Total des articles cochés</td><td className="r strong">{money(budget)}</td></tr></tfoot>}
        </table></div>}
        {needed.length > 0 && rows.length > needed.length && <button className="link-btn" style={{ margin: 10 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Masquer les articles en quantité suffisante' : `Voir aussi les ${rows.length - needed.length} article(s) en quantité suffisante`}</button>}
      </div>

      <PlanProduction stock={rows} onAdd={(add) => { setExtra(add); setQty({}); }} />

      {buy && <MarketPurchase prefill={buy.map((x) => ({ item_id: x.id, qty: String(x.q), unit_cost: x.price ? String(x.price) : '' }))}
        onClose={(ok) => { setBuy(null); if (ok) { invalidateRefs('items'); invalidateRefs('accounts'); setQty({}); setExtra({}); reload(); } }} />}
    </div>
  );
}

// « Je veux produire 300 sachets de bissap et 20 bouteilles de 1 L » → ce qu'il faut et ce qui manque
function PlanProduction({ stock, onAdd }) {
  const products = useRefOptions('items', { type: 'pf', active: true });
  const { data: recipes } = useData(async () => {
    const list = await crud.list('recipes', { active: true }).catch(() => []);
    return Promise.all(list.map((r) => crud.get('recipes', r.id).catch(() => ({ ...r, lines: [] }))));
  }, []);
  const [fam, setFam] = useState('');
  const [counts, setCounts] = useState({});
  const fams = useMemo(() => {
    const m = new Map();
    for (const p of products) { const f = famOf(p.name).fam; if (!m.has(f)) m.set(f, []); m.get(f).push(p); }
    for (const v of m.values()) v.sort((a, b) => (Number(a.unit_volume) || 0) - (Number(b.unit_volume) || 0));
    return [...m].map(([name, items]) => ({ name, items })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [products]);
  if (!recipes || !products.length) return null;
  const g = fams.find((x) => x.name === fam);
  const need = new Map(); const noRecipe = [];
  for (const p of g ? g.items : []) {
    const c = Number(counts[p.id]) || 0;
    if (!c) continue;
    const r = recipes.find((x) => x.product_id === p.id && x.active !== false);
    if (!r) { noRecipe.push(p.name); continue; }
    for (const l of r.lines || []) need.set(l.item_id, (need.get(l.item_id) || 0) + (Number(l.qty) * c) / (Number(r.yield_qty) || 1));
  }
  const lines = [...need].map(([id, q]) => {
    const s = stock.find((x) => x.id === id);
    const missing = Math.max(0, q - (s ? s.stock : 0));
    return { id, name: s?.name || `Article ${id}`, unit: s?.unit || '', q: Math.round(q * 1000) / 1000, stock: s ? s.stock : 0, missing: missing >= 10 ? Math.ceil(missing) : Math.ceil(missing * 10) / 10 };
  });
  const missingAll = lines.filter((x) => x.missing > 0);
  return (
    <div className="card card-pad" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>🧮 Préparer une production</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Combien voulez-vous produire ? Le logiciel calcule avec les recettes ce qu'il faut et <b>ce qui manque dans le stock</b>.</p>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <select className="input" style={{ maxWidth: 260 }} value={fam} onChange={(e) => { setFam(e.target.value); setCounts({}); }}>
          <option value="">— Choisir le jus / produit —</option>{fams.map((x) => <option key={x.name}>{x.name}</option>)}
        </select>
        {g && g.items.map((p) => (
          <label key={p.id} className="plan-in"><span>{famOf(p.name).fmt || p.name}</span>
            <div className="buy-in"><input type="number" min="0" className="input" placeholder="0" value={counts[p.id] || ''} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} /><span>{p.unit}s</span></div></label>
        ))}
      </div>
      {noRecipe.length > 0 && <div className="err" style={{ marginTop: 10 }}>Pas de recette pour {noRecipe.join(', ')} : créez-la dans Production → Recettes.</div>}
      {lines.length > 0 && <>
        <div className="table-wrap" style={{ marginTop: 12 }}><table className="t">
          <thead><tr><th>Il faut</th><th className="r">Quantité</th><th className="r">En stock</th><th className="r">Manque</th></tr></thead>
          <tbody>{lines.map((x) => <tr key={x.id}><td className="nm"><b>{x.name}</b></td><td className="r nw">{num(x.q)} {x.unit}</td><td className="r nw">{num(x.stock)} {x.unit}</td>
            <td className={'r nw strong ' + (x.missing > 0 ? 'neg' : 'pos')}>{x.missing > 0 ? `${num(x.missing)} ${x.unit}` : 'OK ✓'}</td></tr>)}</tbody>
        </table></div>
        {missingAll.length > 0
          ? <button className="btn primary" style={{ marginTop: 10 }} onClick={() => onAdd(Object.fromEntries(missingAll.map((x) => [x.id, x.missing])))}>+ Ajouter ce qui manque à la liste d'achats</button>
          : <div className="note ok-note" style={{ marginTop: 10 }}>Tout est en stock pour cette production 👍</div>}
      </>}
    </div>
  );
}
