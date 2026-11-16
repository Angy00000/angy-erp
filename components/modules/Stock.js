import { useState } from 'react';
import { api, op, money, num, opts, today, daysUntil, date as fdate, LABELS } from '../../lib/client';
import { Tabs, Badge, invalidateRefs, Modal, useRefOptions, RefSelect, toast, useData, confirmDo } from '../ui';
import CrudTable from '../CrudTable';
import ActionModal from '../ActionModal';

// Quels champs ont un sens selon le type d'article
const SOLD = ['pf', 'service'];                       // vendus : prix de vente, code-barres
const MADE = ['pf', 'semi_fini'];                     // fabriqués : contenance
const BOUGHT = ['mp', 'emballage', 'consommable', 'materiel']; // achetés : prix d'achat
const PERISH = ['mp', 'pf', 'semi_fini'];             // périssables : durée de conservation
export const UNITS = ['unité', 'kg', 'g', 'L', 'mL', 'bouteille', 'pot', 'sachet', 'bidon', 'carton', 'pack', 'm', 'pièce'].map((u) => [u, u]);

export default function Stock() {
  const [tab, setTab] = useState('items');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['items', 'Articles & niveaux'], ['achats', '🛒 Achats'], ['lots', 'Lots'], ['moves', 'Mouvements'], ['cats', 'Catégories'], ['wh', 'Entrepôts']]} />
      {tab === 'items' && <Items />}
      {tab === 'achats' && <PurchaseHistory />}
      {tab === 'lots' && <Lots />}
      {tab === 'moves' && <Moves />}
      {tab === 'cats' && <CrudTable entity="categories" title="Catégorie" columns={[{ k: 'name', l: 'Nom' }, { k: 'kind', l: 'Type d\'articles', map: 'item_type' }]}
        fields={[{ k: 'name', l: 'Nom', req: true }, { k: 'kind', l: 'Type d\'articles', t: 'select', opts: opts('item_type') }]} defaults={{ kind: 'pf' }} />}
      {tab === 'wh' && <CrudTable entity="warehouses" title="Entrepôt" columns={[{ k: 'name', l: 'Nom' }, { k: 'kind', l: 'Type' }, { k: 'temperature', l: 'Température' }]}
        fields={[{ k: 'name', l: 'Nom', req: true }, { k: 'kind', l: 'Type', t: 'select', opts: [['principal', 'Principal'], ['froid', 'Froid'], ['quarantaine', 'Quarantaine'], ['boutique', 'Boutique / point de vente'], ['autre', 'Autre']] }, { k: 'temperature', l: 'Température cible' }]} />}
    </div>
  );
}

const STOCK_IN_FIELDS = [
  { k: 'item_id', l: 'Article', t: 'ref', ref: 'items', params: { active: true }, req: true, full: true, label: (r) => `${r.name} (${r.unit || ''})` },
  { k: 'qty', l: 'Quantité', t: 'number', req: true }, { k: 'unit_cost', l: 'Prix payé par unité', t: 'number', help: 'Ex. prix d\'un kg. Vide = coût moyen actuel' },
  { k: 'account_id', l: 'Payé via (compte)', t: 'ref', ref: 'accounts', params: { active: true }, placeholder: 'Ne pas toucher à la caisse', help: 'L\'argent (quantité × prix) sort de ce compte. Vide si déjà payé ou don.' },
  { k: 'lot_number', l: 'N° de lot', ph: 'Automatique si vide' }, { k: 'expiry_date', l: 'Date limite (DLC/DLUO)', t: 'date', help: 'Vide = calculée selon la durée de vie' },
  { k: 'warehouse_id', l: 'Entrepôt', t: 'ref', ref: 'warehouses' }, { k: 'supplier_id', l: 'Fournisseur', t: 'ref', ref: 'suppliers', quickCreate: { label: 'fournisseur', fields: ['name', 'phone'] } },
  { k: 'note', l: 'Note', full: true },
];
const STOCK_OUT_FIELDS = [
  { k: 'item_id', l: 'Article', t: 'ref', ref: 'items', params: { active: true }, req: true, full: true, label: (r) => `${r.name} (stock ${num(r.stock)} ${r.unit || ''})` },
  { k: 'qty', l: 'Quantité', t: 'number', req: true },
  { k: 'type', l: 'Motif', t: 'select', req: true, opts: [['sortie', 'Sortie / consommation'], ['perte', 'Perte'], ['casse', 'Casse'], ['peremption', 'Péremption'], ['echantillon', 'Échantillon'], ['don', 'Don']] },
  { k: 'note', l: 'Note', full: true },
];

// Contenance lisible : 0,125 → 12,5 cl · 0,25 → 25 cl · 1 → 1 L
export const fmtVol = (v) => { const x = Number(v) || 0; if (!x) return ''; return x < 1 ? `${String(Math.round(x * 1000) / 10).replace('.', ',')} cl` : `${String(x).replace('.', ',')} L`; };
const TYPE_TABS = [['', 'Tout', '▦'], ['pf', 'Produits finis', '🧃'], ['mp', 'Matières premières', '🌿'], ['emballage', 'Emballages', '🍶'], ['consommable', 'Consommables', '🧴'], ['materiel', 'Matériel', '🛠️'], ['semi_fini', 'Semi-finis', '⚗️'], ['service', 'Services', '🤝']];
function StockState({ r }) {
  if (r.type === 'service') return <span className="muted">—</span>;
  if (!(Number(r.stock) > 0)) return <span className="badge red">Épuisé</span>;
  if (Number(r.min_stock) > 0 && Number(r.stock) < Number(r.min_stock)) return <span className="badge amber">Bientôt fini</span>;
  return <span className="badge green">En stock</span>;
}

// Résumé par jus : litres en stock tous formats confondus
function JuiceSummary({ items }) {
  const m = new Map();
  for (const i of items) {
    const r = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(String(i.name).trim());
    const fam = r ? r[1].trim() : String(i.name).trim();
    const g = m.get(fam) || { name: fam, liters: 0, value: 0, parts: [] };
    g.liters += (Number(i.stock) || 0) * (Number(i.unit_volume) || 0);
    g.value += (Number(i.stock) || 0) * (Number(i.sale_price) || 0);
    if (Number(i.stock) > 0) g.parts.push(`${num(i.stock)} ${r ? r[2] : i.unit}`);
    m.set(fam, g);
  }
  const list = [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (!list.length) return null;
  return (
    <div className="juice-sum">
      {list.map((g) => (
        <div key={g.name} className={'juice-card' + (g.liters > 0 ? '' : ' empty')}>
          <span className="jn">{g.name}</span>
          <b>{g.liters > 0 ? `${num(g.liters)} L` : 'Épuisé'}</b>
          <small>{g.parts.length ? g.parts.join(' · ') : 'à produire'}</small>
          {g.value > 0 && <small className="jv">vaut {money(g.value)}</small>}
        </div>
      ))}
    </div>
  );
}

function Items() {
  const [modal, setModal] = useState(null);
  const [type, setType] = useState('');
  const all = useRefOptions('items', {});
  const counts = all.reduce((m, i) => ({ ...m, [i.type]: (m[i.type] || 0) + 1 }), {});
  const done = (reload) => (ok) => { setModal(null); if (ok) { invalidateRefs('items'); invalidateRefs('lots'); reload(); } };
  const nameCol = { k: 'name', l: 'Article', fmt: (r) => <><span className="strong">{r.name}</span>{!r.active && <span className="muted small"> (inactif)</span>}<br /><span className="muted small">{[type ? null : LABELS.item_type[r.type], r.category_name, r.code].filter(Boolean).join(' · ')}</span></>, csv: (r) => r.name };
  const stockCol = { k: 'stock', l: 'En stock', r: true, fmt: (r) => r.type === 'service' ? '—' : <><span className={'strong' + (Number(r.stock) > 0 ? '' : ' neg')}>{num(r.stock)} {r.unit}</span>{MADE.includes(r.type) && Number(r.unit_volume) > 0 && Number(r.stock) > 0 && <><br /><span className="muted small">= {num(r.stock * r.unit_volume)} L</span></>}{Number(r.stock_blocked) > 0 && <><br /><span className="neg small">+ {num(r.stock_blocked)} bloqué</span></>}</>, csv: (r) => r.stock };
  const stateCol = { k: 'state', l: 'État', fmt: (r) => <StockState r={r} />, csv: (r) => (Number(r.stock) > 0 ? 'en stock' : 'épuisé') };
  const columns = type === 'pf' ? [
    nameCol,
    { k: 'unit_volume', l: 'Format', fmt: (r) => fmtVol(r.unit_volume) ? <span className="badge gray">{r.unit} {fmtVol(r.unit_volume)}</span> : <span className="muted">{r.unit}</span>, csv: (r) => fmtVol(r.unit_volume) },
    stockCol, stateCol,
    { k: 'sale_price', l: 'Prix de vente', r: true, fmt: (r) => <span className="strong">{money(r.sale_price)}</span>, csv: (r) => r.sale_price },
    { k: 'cost_price', l: 'Coût de revient', r: true, fmt: (r) => (Number(r.cost_price) > 0 ? money(r.cost_price) : <span className="muted">après 1re production</span>), csv: (r) => r.cost_price },
    { k: 'value', l: 'Vaut à la vente', r: true, fmt: (r) => money(r.stock * r.sale_price), csv: (r) => Math.round(r.stock * r.sale_price) },
  ] : [
    nameCol, stockCol, stateCol,
    { k: 'cost_price', l: 'Prix d\'achat moyen', r: true, fmt: (r) => (Number(r.cost_price) > 0 ? <>{money(r.cost_price)}<span className="muted small"> / {r.unit}</span></> : <span className="muted">—</span>), csv: (r) => r.cost_price },
    ...(type ? [] : [{ k: 'sale_price', l: 'Prix de vente', r: true, fmt: (r) => (SOLD.includes(r.type) ? money(r.sale_price) : <span className="muted">—</span>), csv: (r) => (SOLD.includes(r.type) ? r.sale_price : '') }]),
    { k: 'value', l: 'Valeur du stock', r: true, fmt: (r) => money(r.stock * r.cost_price), csv: (r) => Math.round(r.stock * r.cost_price) },
  ];
  return (
    <>
      <div className="type-chips">
        {TYPE_TABS.filter(([k]) => !k || counts[k]).map(([k, l, ic]) => (
          <button key={k || 'all'} className={type === k ? 'on' : ''} onClick={() => setType(k)}>
            <span>{ic}</span>{l}<b>{k ? counts[k] : all.length}</b>
          </button>
        ))}
      </div>
      {type === 'pf' && <JuiceSummary items={all.filter((i) => i.type === 'pf' && i.active !== false)} />}
      <CrudTable key={type || 'all'} entity="items" title="Article" csvName="articles" newLabel="Nouvel article" params={type ? { type } : {}}
        filters={[{ k: 'category_id', l: 'Catégorie', ref: 'categories' }]}
        toolbar={(reload) => <>
          <button className="btn primary" onClick={() => setModal({ k: 'market', reload })}>🛒 Nouvel achat</button>
          <button className="btn" onClick={() => setModal({ k: 'in', reload })}>⬇ Entrée stock</button>
          <button className="btn" onClick={() => setModal({ k: 'out', reload })}>⬆ Sortie / perte</button>
        </>}
        columns={columns}
        defaults={{ type: type || 'pf', unit: type === 'mp' ? 'kg' : type === 'pf' ? 'bouteille' : 'pièce', active: true }}
        fields={[
          { k: 'name', l: 'Nom de l\'article', req: true, ph: 'Ex. Jus de bissap (bouteille 25 cl) · Sucre en poudre', help: 'Le nom qui apparaîtra au point de vente, sur les factures et dans le stock' }, { k: 'code', l: 'Code (facultatif)', ph: 'Ex. PF-BIS-25CL' },
          { k: 'type', l: 'Type', t: 'select', opts: opts('item_type'), req: true }, { k: 'category_id', l: 'Catégorie', t: 'ref', ref: 'categories' },
          { k: 'unit', l: 'Unité', t: 'select', opts: UNITS, help: 'Matières : kg · Emballages, consommables, matériel : pièce · Jus : sachet ou bouteille' },
          { k: 'unit_volume', l: 'Contenance par unité (litres)', t: 'number', help: 'Ex. 0,125 pour un sachet de 12,5 cl · 1 pour une bouteille d\'1 L', show: (d) => MADE.includes(d.type) },
          { k: 'barcode', l: 'Code-barres', show: (d) => SOLD.includes(d.type) },
          { k: 'purchase_price', l: 'Prix d\'achat habituel', t: 'number', help: 'Indicatif : le coût réel se met à jour tout seul à chaque Entrée stock', show: (d) => BOUGHT.includes(d.type) },
          { k: 'sale_price', l: 'Prix de vente détail', t: 'number', show: (d) => SOLD.includes(d.type) }, { k: 'wholesale_price', l: 'Prix de vente gros', t: 'number', show: (d) => SOLD.includes(d.type) },
          { k: 'min_stock', l: 'Stock minimum (alerte)', t: 'number', help: 'Le logiciel prévient quand il en reste moins', show: (d) => d.type !== 'service' && d.type !== 'materiel' },
          { k: 'shelf_life_days', l: 'Durée de conservation (jours)', t: 'number', help: 'Sert à calculer la date limite des lots', show: (d) => PERISH.includes(d.type) },
          { k: 'description', l: 'Description / spécifications', t: 'textarea', full: true }, { k: 'active', l: 'Article actif', t: 'bool' },
        ]}
      />
      {modal?.k === 'market' && <MarketPurchase onClose={(ok) => { const r = modal.reload; setModal(null); if (ok) { invalidateRefs('items'); invalidateRefs('accounts'); r(); } }} />}
      {modal?.k === 'in' && <ActionModal title="Entrée en stock" fields={STOCK_IN_FIELDS} initial={{}} onSubmit={(d) => op('stock_in', d)} onClose={done(modal.reload)} />}
      {modal?.k === 'out' && <ActionModal title="Sortie de stock (FEFO)" fields={STOCK_OUT_FIELDS} initial={{ type: 'sortie' }} onSubmit={(d) => op('stock_out', d)} onClose={done(modal.reload)}>
        <div className="note" style={{ marginBottom: 12 }}>La sortie consomme automatiquement les lots qui expirent en premier (FEFO).</div>
      </ActionModal>}
    </>
  );
}

function Lots() {
  const [modal, setModal] = useState(null);
  const done = (reload) => (ok) => { setModal(null); if (ok) { invalidateRefs('lots'); invalidateRefs('items'); reload(); } };
  return (
    <>
      <CrudTable entity="lots" title="Lot" csvName="lots" canCreate={false} params={{ instock: 1 }}
        filters={[{ k: 'status', l: 'Statut', opts: opts('lot_status') }, { k: 'item_id', l: 'Article', ref: 'items' }, { k: 'warehouse_id', l: 'Entrepôt', ref: 'warehouses' }]}
        columns={[
          { k: 'lot_number', l: 'Lot', fmt: (r) => <span className="mono strong">{r.lot_number}</span>, csv: (r) => r.lot_number },
          { k: 'item_name', l: 'Article' },
          { k: 'qty', l: 'Quantité', r: true, fmt: (r) => `${num(r.qty)} ${r.unit}`, csv: (r) => r.qty },
          { k: 'unit_cost', l: 'Coût unit.', t: 'money' },
          { k: 'warehouse_name', l: 'Entrepôt' },
          { k: 'production_date', l: 'Fabriqué / reçu', t: 'date' },
          { k: 'expiry_date', l: 'DLC', fmt: (r) => { const d = daysUntil(r.expiry_date); return r.expiry_date ? <span className={d < 0 ? 'neg strong' : d < 15 ? 'neg' : ''}>{new Date(r.expiry_date + 'T00:00:00').toLocaleDateString('fr-FR')}{d !== null && d < 31 ? ` (J${d >= 0 ? '-' + d : '+' + -d})` : ''}</span> : '—'; }, csv: (r) => r.expiry_date },
          { k: 'supplier_name', l: 'Fournisseur' },
          { k: 'status', l: 'Statut', t: 'badge', map: 'lot_status' },
        ]}
        canDelete={() => false}
        fields={[{ k: 'lot_number', l: 'N° de lot', req: true }, { k: 'expiry_date', l: 'DLC', t: 'date' }, { k: 'warehouse_id', l: 'Entrepôt', t: 'ref', ref: 'warehouses' }, { k: 'status', l: 'Statut', t: 'select', opts: opts('lot_status') }]}
        rowActions={(r, reload) => <>
          <button className="btn sm" onClick={() => setModal({ k: 'inv', row: r, reload })}>Inventaire</button>
          <button className="btn sm" onClick={() => setModal({ k: 'tr', row: r, reload })}>Transférer</button>
        </>}
      />
      {modal?.k === 'inv' && <ActionModal title={`Inventaire du lot ${modal.row.lot_number}`} initial={{ new_qty: modal.row.qty }}
        fields={[{ k: 'new_qty', l: `Quantité comptée (${modal.row.unit})`, t: 'number', req: true }, { k: 'note', l: 'Commentaire', full: true }]}
        onSubmit={(d) => op('inventory', { ...d, lot_id: modal.row.id })} onClose={done(modal.reload)}>
        <div className="note" style={{ marginBottom: 12 }}>{modal.row.item_name} — quantité théorique : <b>{num(modal.row.qty)} {modal.row.unit}</b></div>
      </ActionModal>}
      {modal?.k === 'tr' && <ActionModal title={`Transférer le lot ${modal.row.lot_number}`} initial={{ qty: modal.row.qty }}
        fields={[{ k: 'warehouse_id', l: 'Vers l\'entrepôt', t: 'ref', ref: 'warehouses', req: true }, { k: 'qty', l: 'Quantité', t: 'number', req: true }]}
        onSubmit={(d) => op('transfer', { ...d, lot_id: modal.row.id })} onClose={done(modal.reload)} />}
    </>
  );
}

function Moves() {
  return (
    <CrudTable entity="stock_movements" title="Mouvement" csvName="mouvements-stock" canCreate={false}
      filters={[{ k: 'type', l: 'Type', opts: opts('move_type') }, { k: 'item_id', l: 'Article', ref: 'items' }]}
      columns={[
        { k: 'created_at', l: 'Date', fmt: (r) => new Date(r.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }), csv: (r) => r.created_at },
        { k: 'type', l: 'Type', map: 'move_type' }, { k: 'item_name', l: 'Article' }, { k: 'lot_number', l: 'Lot', fmt: (r) => <span className="mono">{r.lot_number}</span>, csv: (r) => r.lot_number },
        { k: 'qty', l: 'Quantité', r: true, fmt: (r) => <span className={r.qty < 0 ? 'neg' : 'pos'}>{r.qty > 0 ? '+' : ''}{num(r.qty)} {r.unit}</span>, csv: (r) => r.qty },
        { k: 'unit_cost', l: 'Coût unit.', t: 'money' }, { k: 'note', l: 'Référence' }, { k: 'user_name', l: 'Par' },
      ]}
    />
  );
}


// Nouvel achat (marché, boutique, grossiste, fournisseur) : plusieurs articles en une fois, entrés en stock et payés depuis un compte.
export function MarketPurchase({ onClose, edit }) {
  const items = useRefOptions('items', { active: true }).filter((i) => ['mp', 'emballage', 'consommable', 'materiel', 'semi_fini'].includes(i.type) || (edit && edit.lines.some((l) => l.item_id === i.id)));
  const accounts = useRefOptions('accounts', { active: true });
  const [rows, setRows] = useState(() => (edit ? edit.lines.map((l) => ({ id: l.id, item_id: l.item_id, qty: String(Number(l.qty)), unit_cost: String(Number(l.unit_cost)), used: Number(l.used) || 0 })) : [{}, {}, {}]));
  const [d, setD] = useState(() => (edit ? { id: edit.id, date: edit.date, account_id: edit.account_id || '', supplier_id: edit.supplier_id || '', note: edit.note || '' } : { date: today() }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const setRow = (i, x) => setRows((r) => r.map((y, j) => (j === i ? { ...y, ...x } : y)));
  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_cost) || 0), 0);
  const acc = d.account_id === undefined ? (accounts[0]?.id || '') : d.account_id;
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await op('market_purchase', { ...d, account_id: acc || null, lines: rows.filter((x) => x.item_id && Number(x.qty) > 0) });
      toast(r.edited ? `Achat ${r.number} modifié : stock et caisse corrigés (${money(r.total)})` : `Achat ${r.number} enregistré : ${r.count} article(s), ${money(r.total)}${acc ? ' sortis de la caisse' : ''} — retrouvez-le dans l'onglet 🛒 Achats`);
      onClose(true);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const groups = { mp: 'Matières premières', emballage: 'Emballages', consommable: 'Consommables', materiel: 'Matériel', semi_fini: 'Semi-finis' };
  return (
    <Modal wide title={edit ? `✏️ Modifier l'achat ${edit.number}` : '🛒 Nouvel achat'} onClose={() => onClose(false)}
      footer={<><button className="btn" onClick={() => onClose(false)}>Fermer</button><button className="btn primary" disabled={busy || total <= 0} onClick={save}>{busy ? 'Enregistrement…' : `${edit ? 'Enregistrer les corrections' : 'Enregistrer l\'achat'}${total > 0 ? ' — ' + money(total) : ''}`}</button></>}>
      {err && <div className="err">{err}</div>}
      {edit
        ? <div className="note" style={{ marginBottom: 12 }}>Corrigez les quantités, les prix, la caisse ou la date : <b>le stock et la caisse sont corrigés automatiquement</b>. Ce qui a déjà été utilisé en production ne peut pas être retiré.</div>
        : <div className="note" style={{ marginBottom: 12 }}>Tout achat payé et reçu (marché, boutique, grossiste, fournisseur) : chaque article <b>entre dans le stock</b> et le total <b>sort de la caisse</b> choisie.</div>}
      <div className="table-wrap"><table className="lines">
        <thead><tr><th style={{ minWidth: 230 }}>Article</th><th>En stock</th><th style={{ width: 110 }}>Quantité</th><th style={{ width: 130 }}>Prix par unité</th><th className="r">Total</th><th /></tr></thead>
        <tbody>{rows.map((r, i) => {
          const it = items.find((x) => x.id === Number(r.item_id));
          return (
            <tr key={i}>
              <td><select className="input" value={r.item_id || ''} onChange={(e) => { const x = items.find((y) => y.id === Number(e.target.value)); setRow(i, { item_id: x ? x.id : '', unit_cost: x && Number(x.cost_price || x.purchase_price) > 0 ? String(Number(x.cost_price || x.purchase_price)) : '' }); }}>
                <option value="">— Choisir —</option>
                {Object.entries(groups).map(([t, l]) => { const list = items.filter((x) => x.type === t); return list.length ? <optgroup key={t} label={l}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup> : null; })}
              </select></td>
              <td className="small muted">{it ? `${num(it.stock)} ${it.unit || ''}` : ''}{r.used > 0 && <><br /><span className="neg">{num(r.used)} déjà utilisé</span></>}</td>
              <td><input type="number" step="any" className="input" placeholder={it?.unit || ''} value={r.qty || ''} onChange={(e) => setRow(i, { qty: e.target.value })} disabled={!it} /></td>
              <td><input type="number" step="any" className="input" placeholder={it ? `F / ${it.unit || 'unité'}` : ''} value={r.unit_cost || ''} onChange={(e) => setRow(i, { unit_cost: e.target.value })} disabled={!it} /></td>
              <td className="r mono">{Number(r.qty) > 0 && Number(r.unit_cost) > 0 ? money(Number(r.qty) * Number(r.unit_cost)) : ''}</td>
              <td>{rows.length > 1 && !(r.used > 0) && <button className="btn sm ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          );
        })}</tbody>
        {total > 0 && <tfoot><tr><td colSpan={4} className="strong">Total payé</td><td className="r mono strong">{money(total)}</td><td /></tr></tfoot>}
      </table></div>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setRows([...rows, {}])}>+ Ajouter un article</button>
      {!items.length && <div className="note" style={{ marginTop: 8 }}>Créez d'abord vos matières premières et emballages : <b>+ Nouvel article</b>.</div>}
      <div className="form" style={{ marginTop: 14 }}>
        <div className="field"><label>Payé avec</label><select className="input" value={acc} onChange={(e) => setD({ ...d, account_id: e.target.value ? Number(e.target.value) : '' })}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="">Ne pas toucher à la caisse (déjà payé)</option></select></div>
        <div className="field"><label>Date</label><input type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
        <div className="field"><label>Fournisseur (facultatif)</label><RefSelect f={{ ref: 'suppliers', placeholder: 'Sans fournisseur / divers', quickCreate: { label: 'fournisseur', fields: ['name', 'phone'] } }} value={d.supplier_id} onChange={(v) => setD({ ...d, supplier_id: v })} /></div>
        <div className="field"><label>Note</label><input className="input" placeholder="Ex. Marché Castor, boutique Ndiaye…" value={d.note || ''} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      </div>
    </Modal>
  );
}

// Historique des achats payés : voir, modifier, annuler
export function PurchaseHistory() {
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const { data, reload } = useData(() => api(`app/purchases?from=${range.from}&to=${range.to}`), [range.from, range.to]);
  const [modal, setModal] = useState(null);
  const [open, setOpen] = useState({});
  const [qs, setQs] = useState('');
  const done = (ok) => { setModal(null); if (ok) { invalidateRefs('items'); invalidateRefs('accounts'); reload(); } };
  const cancel = async (p) => {
    if (!confirmDo(`Annuler l'achat ${p.number} ?\n\nLes articles sortent du stock et ${money(p.total)} reviennent dans ${p.account_name || 'la caisse'}.`)) return;
    try { await op('purchase_cancel', { id: p.id }); toast(`Achat ${p.number} annulé`); done(true); } catch (e) { toast(e.message, 'error'); }
  };
  const list = (data || []).filter((p) => !qs || [p.number, p.note, p.supplier_name, ...p.lines.map((l) => l.name)].join(' ').toLowerCase().includes(qs.toLowerCase()));
  const tot = list.filter((p) => p.status === 'ok').reduce((s, p) => s + Number(p.total), 0);
  return (
    <div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
        <button className="btn primary" onClick={() => setModal({ k: 'new' })}>🛒 Nouvel achat</button>
        <input className="input" style={{ maxWidth: 220 }} placeholder="Rechercher (article, n°, note…)" value={qs} onChange={(e) => setQs(e.target.value)} />
        <span style={{ flex: 1 }} />
        <label className="small muted">Du <input type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="small muted">au <input type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
      </div>
      {!data && <div className="spinner">Chargement…</div>}
      {data && !list.length && <div className="card empty">Aucun achat sur cette période. Cliquez <b>🛒 Nouvel achat</b> pour en enregistrer un.</div>}
      {data && list.length > 0 && (
        <div className="card"><div className="table-wrap"><table className="t">
          <thead><tr><th>N°</th><th>Date</th><th>Articles</th><th>Payé avec</th><th className="r">Total</th><th /></tr></thead>
          <tbody>{list.map((p) => [
            <tr key={p.id} className={p.status === 'annule' ? 'muted' : ''}>
              <td><b>{p.number}</b>{p.status === 'annule' && <><br /><span className="badge red">Annulé</span></>}</td>
              <td>{fdate(p.date)}<br /><span className="small muted">{p.user_name || ''}</span></td>
              <td><button className="link-btn" onClick={() => setOpen({ ...open, [p.id]: !open[p.id] })}>{p.lines.length} article(s) {open[p.id] ? '▲' : '▼'}</button>
                <div className="small muted">{p.lines.slice(0, 3).map((l) => String(l.name).trim()).join(', ')}{p.lines.length > 3 ? '…' : ''}{p.note ? ` — ${p.note}` : ''}</div></td>
              <td className="small">{p.account_name || <span className="muted">caisse non touchée</span>}{p.supplier_name ? <><br /><span className="muted">{p.supplier_name}</span></> : ''}</td>
              <td className="r strong">{money(p.total)}</td>
              <td className="actions">{p.status === 'ok' && <>
                <button className="btn sm" onClick={() => setModal({ k: 'edit', p })}>✏️ Modifier</button>
                <button className="btn sm danger" onClick={() => cancel(p)}>Annuler</button>
              </>}</td>
            </tr>,
            open[p.id] && <tr key={p.id + 'l'} className="sub-row"><td colSpan={6}><table className="t small"><tbody>
              {p.lines.map((l) => <tr key={l.id}><td>{String(l.name).trim()}</td><td className="r">{num(l.qty)} {l.unit || ''}</td><td className="r">× {money(l.unit_cost)}</td><td className="r strong">{money(Number(l.qty) * Number(l.unit_cost))}</td>
                <td className="small muted">{l.used > 0 ? `${num(l.used)} déjà utilisé` : 'pas encore utilisé'}</td></tr>)}
            </tbody></table></td></tr>,
          ])}</tbody>
          <tfoot><tr><td colSpan={4} className="strong">Total de la période</td><td className="r strong">{money(tot)}</td><td /></tr></tfoot>
        </table></div></div>
      )}
      {modal?.k === 'new' && <MarketPurchase onClose={done} />}
      {modal?.k === 'edit' && <MarketPurchase edit={modal.p} onClose={done} />}
    </div>
  );
}
