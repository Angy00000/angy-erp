import { useState } from 'react';
import { op, money, num, opts, today, daysUntil, LABELS } from '../../lib/client';
import { Tabs, Badge, invalidateRefs } from '../ui';
import CrudTable from '../CrudTable';
import ActionModal from '../ActionModal';

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
  { k: 'qty', l: 'Quantité', t: 'number', req: true }, { k: 'unit_cost', l: 'Coût unitaire', t: 'number', help: 'Vide = coût moyen actuel' },
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
          { k: 'sale_price', l: 'Prix vente', t: 'money' },
          { k: 'value', l: 'Valeur stock', r: true, fmt: (r) => money(r.stock * r.cost_price), csv: (r) => Math.round(r.stock * r.cost_price) },
        ]}
        defaults={{ type: 'pf', unit: 'unité', active: true }}
        fields={[
          { k: 'name', l: 'Désignation', req: true }, { k: 'code', l: 'Code / référence' },
          { k: 'type', l: 'Type', t: 'select', opts: opts('item_type'), req: true }, { k: 'category_id', l: 'Catégorie', t: 'ref', ref: 'categories' },
          { k: 'unit', l: 'Unité', t: 'select', opts: UNITS }, { k: 'unit_volume', l: 'Contenance par unité (litres)', t: 'number', help: 'Ex. 0,125 pour un sachet de 12,5 cl · 1 pour une bouteille d\'1 L' },
          { k: 'barcode', l: 'Code-barres' },
          { k: 'purchase_price', l: 'Prix d\'achat', t: 'number' }, { k: 'cost_price', l: 'Coût de revient moyen', t: 'number', help: 'Mis à jour automatiquement à chaque entrée' },
          { k: 'sale_price', l: 'Prix de vente détail', t: 'number' }, { k: 'wholesale_price', l: 'Prix de vente gros', t: 'number' },
          { k: 'min_stock', l: 'Stock minimum (alerte)', t: 'number' }, { k: 'shelf_life_days', l: 'Durée de vie (jours)', t: 'number', help: 'Sert à calculer la DLC des lots' },
          { k: 'description', l: 'Description / spécifications', t: 'textarea', full: true }, { k: 'active', l: 'Article actif', t: 'bool' },
        ]}
      />
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
