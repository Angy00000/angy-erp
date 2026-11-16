import { useState } from 'react';
import { op, money, num, opts, today, daysUntil, LABELS } from '../../lib/client';
import { Tabs, Badge, invalidateRefs, Modal, useRefOptions, RefSelect, toast } from '../ui';
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
      <Tabs value={tab} onChange={setTab} tabs={[['items', 'Articles & niveaux'], ['lots', 'Lots'], ['moves', 'Mouvements'], ['cats', 'Catégories'], ['wh', 'Entrepôts']]} />
      {tab === 'items' && <Items />}
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

function Items() {
  const [modal, setModal] = useState(null);
  const done = (reload) => (ok) => { setModal(null); if (ok) { invalidateRefs('items'); invalidateRefs('lots'); reload(); } };
  return (
    <>
      <CrudTable entity="items" title="Article" csvName="articles" newLabel="Nouvel article"
        filters={[{ k: 'type', l: 'Type', opts: opts('item_type') }, { k: 'category_id', l: 'Catégorie', ref: 'categories' }]}
        toolbar={(reload) => <>
          <button className="btn primary" onClick={() => setModal({ k: 'market', reload })}>🛒 Achat au marché</button>
          <button className="btn" onClick={() => setModal({ k: 'in', reload })}>⬇ Entrée stock</button>
          <button className="btn" onClick={() => setModal({ k: 'out', reload })}>⬆ Sortie / perte</button>
        </>}
        columns={[
          { k: 'code', l: 'Code' },
          { k: 'name', l: 'Article', fmt: (r) => <><span className="strong">{r.name}</span>{!r.active && <span className="muted small"> (inactif)</span>}<br /><span className="muted small">{r.category_name}</span></> , csv: (r) => r.name },
          { k: 'type', l: 'Type', map: 'item_type' },
          { k: 'stock', l: 'Stock', r: true, fmt: (r) => r.type === 'service' ? '—' : <span className={r.min_stock > 0 && r.stock < r.min_stock ? 'neg strong' : ''}>{num(r.stock)} {r.unit}</span>, csv: (r) => r.stock },
          { k: 'stock_blocked', l: 'Bloqué', r: true, fmt: (r) => (r.stock_blocked > 0 ? <span className="neg">{num(r.stock_blocked)}</span> : ''), csv: (r) => r.stock_blocked },
          { k: 'cost_price', l: 'Coût moyen', t: 'money' },
          { k: 'sale_price', l: 'Prix vente', r: true, fmt: (r) => (SOLD.includes(r.type) ? money(r.sale_price) : <span className="muted">—</span>), csv: (r) => (SOLD.includes(r.type) ? r.sale_price : '') },
          { k: 'value', l: 'Valeur stock', r: true, fmt: (r) => money(r.stock * r.cost_price), csv: (r) => Math.round(r.stock * r.cost_price) },
        ]}
        defaults={{ type: 'pf', unit: 'unité', active: true }}
        fields={[
          { k: 'name', l: 'Désignation', req: true }, { k: 'code', l: 'Code / référence' },
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


// Achat au marché : plusieurs articles en une fois, entrés en stock et payés depuis un compte.
export function MarketPurchase({ onClose }) {
  const items = useRefOptions('items', { active: true }).filter((i) => ['mp', 'emballage', 'consommable', 'materiel', 'semi_fini'].includes(i.type));
  const accounts = useRefOptions('accounts', { active: true });
  const [rows, setRows] = useState([{}, {}, {}]);
  const [d, setD] = useState({ date: today() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const setRow = (i, x) => setRows((r) => r.map((y, j) => (j === i ? { ...y, ...x } : y)));
  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_cost) || 0), 0);
  const acc = d.account_id === undefined ? (accounts[0]?.id || '') : d.account_id;
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await op('market_purchase', { ...d, account_id: acc || null, lines: rows.filter((x) => x.item_id && Number(x.qty) > 0) });
      toast(`Achat enregistré : ${r.count} article(s), ${money(r.total)}${acc ? ' sortis de la caisse' : ''}`);
      onClose(true);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const groups = { mp: 'Matières premières', emballage: 'Emballages', consommable: 'Consommables', materiel: 'Matériel', semi_fini: 'Semi-finis' };
  return (
    <Modal wide title="🛒 Achat au marché" onClose={() => onClose(false)}
      footer={<><button className="btn" onClick={() => onClose(false)}>Annuler</button><button className="btn primary" disabled={busy || total <= 0} onClick={save}>{busy ? 'Enregistrement…' : `Enregistrer l'achat${total > 0 ? ' — ' + money(total) : ''}`}</button></>}>
      {err && <div className="err">{err}</div>}
      <div className="note" style={{ marginBottom: 12 }}>Tout ce que vous avez acheté et ramené : chaque article <b>entre dans le stock</b> et le total <b>sort de la caisse</b> choisie.</div>
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
              <td className="small muted">{it ? `${num(it.stock)} ${it.unit || ''}` : ''}</td>
              <td><input type="number" step="any" className="input" placeholder={it?.unit || ''} value={r.qty || ''} onChange={(e) => setRow(i, { qty: e.target.value })} disabled={!it} /></td>
              <td><input type="number" step="any" className="input" placeholder={it ? `F / ${it.unit || 'unité'}` : ''} value={r.unit_cost || ''} onChange={(e) => setRow(i, { unit_cost: e.target.value })} disabled={!it} /></td>
              <td className="r mono">{Number(r.qty) > 0 && Number(r.unit_cost) > 0 ? money(Number(r.qty) * Number(r.unit_cost)) : ''}</td>
              <td>{rows.length > 1 && <button className="btn sm ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>}</td>
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
        <div className="field"><label>Fournisseur (facultatif)</label><RefSelect f={{ ref: 'suppliers', placeholder: 'Marché / divers', quickCreate: { label: 'fournisseur', fields: ['name', 'phone'] } }} value={d.supplier_id} onChange={(v) => setD({ ...d, supplier_id: v })} /></div>
        <div className="field"><label>Note</label><input className="input" placeholder="Ex. Marché Castor" value={d.note || ''} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      </div>
    </Modal>
  );
}
