import { useState, useEffect } from 'react';
import { op, crud, money, num, opts, today } from '../../lib/client';
import { Tabs, run, confirmDo, invalidateRefs, RefSelect } from '../ui';
import CrudTable from '../CrudTable';
import { MarketPurchase, PurchaseHistory } from './Stock';
import ActionModal from '../ActionModal';
import BuyList from './AchatsList';

export default function Achats({ company }) {
  const [tab, setTab] = useState('achats');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['achats', '🛒 Achats payés'], ['liste', '📝 À acheter'], ['po', 'Bons de commande'], ['suppliers', 'Fournisseurs'], ['pay', 'Paiements fournisseurs']]} />
      {tab === 'achats' && <PurchaseHistory />}
      {tab === 'liste' && <BuyList company={company} />}
      {tab === 'po' && <Orders />}
      {tab === 'suppliers' && <Suppliers />}
      {tab === 'pay' && <SupplierPayments />}
    </div>
  );
}

function Orders() {
  const [modal, setModal] = useState(null);
  const close = (reload) => (ok) => { setModal(null); if (ok) { invalidateRefs('items'); invalidateRefs('suppliers'); reload(); } };
  return (
    <>
      {modal?.k === 'market' && <MarketPurchase onClose={(ok) => { const r = modal.reload; setModal(null); if (ok) { invalidateRefs('items'); invalidateRefs('accounts'); r(); } }} />}
      <div className="note" style={{ marginBottom: 12 }}>Achat payé et reçu tout de suite (marché, boutique, grossiste, fournisseur) ? Utilisez <b>🛒 Nouvel achat</b> : le stock et la caisse sont mis à jour tout de suite. Le bon de commande sert seulement quand un fournisseur livre plus tard (il faudra ensuite <b>Réceptionner</b>).</div>
      <CrudTable entity="purchase_orders" title="Bon de commande fournisseur" csvName="commandes-fournisseurs" dateRange newLabel="Nouvelle commande"
        toolbar={(reload) => <button className="btn primary" onClick={() => setModal({ k: 'market', reload })}>🛒 Nouvel achat</button>}
        initialRange={{ from: today().slice(0, 5) + '01-01', to: today() }}
        filters={[{ k: 'status', l: 'Statut', opts: opts('po_status') }, { k: 'supplier_id', l: 'Fournisseur', ref: 'suppliers' }]}
        columns={[
          { k: 'number', l: 'N°', fmt: (r) => <span className="strong">{r.number}</span>, csv: (r) => r.number },
          { k: 'date', l: 'Date', t: 'date' }, { k: 'supplier_name', l: 'Fournisseur' }, { k: 'expected_date', l: 'Livraison prévue', t: 'date' },
          { k: 'total', l: 'Montant commandé', t: 'money' }, { k: 'received_value', l: 'Reçu', t: 'money' }, { k: 'paid', l: 'Payé', t: 'money' },
          { k: 'status', l: 'Statut', t: 'badge', map: 'po_status' },
        ]}
        sums={['total', 'received_value', 'paid']}
        defaults={() => ({ date: today() })}
        canEdit={(r) => ['brouillon', 'envoye'].includes(r.status)} canDelete={(r) => r.status === 'brouillon'}
        fields={[
          { k: 'supplier_id', l: 'Fournisseur', t: 'ref', ref: 'suppliers', placeholder: 'Fournisseur divers (marché)', quickCreate: { label: 'fournisseur', fields: ['name', 'phone'] } }, { k: 'date', l: 'Date', t: 'date', req: true },
          { k: 'expected_date', l: 'Livraison prévue', t: 'date' }, { k: 'notes', l: 'Notes / conditions', t: 'textarea', full: true },
        ]}
        lines={{ title: 'Articles commandés', itemParams: { active: true }, fields: [{ k: 'qty', l: 'Qté' }, { k: 'unit_price', l: 'Prix unitaire', w: 130 }], onItem: (it) => ({ unit_price: it.purchase_price || it.cost_price, qty: 1 }) }}
        rowActions={(r, reload) => <>
          <a className="btn sm" href={`/print/purchase_orders/${r.id}`} target="_blank" rel="noreferrer">Imprimer</a>
          {r.status === 'brouillon' && <button className="btn sm" onClick={() => run(() => op('po_status', { id: r.id, status: 'envoye' }), 'Commande marquée envoyée').then(reload)}>Envoyer</button>}
          {['brouillon', 'envoye', 'partiel'].includes(r.status) && <button className="btn sm primary" onClick={() => setModal({ k: 'rec', row: r, reload })}>Réceptionner</button>}
          {r.status !== 'annule' && r.received_value - r.paid > 0.5 && <button className="btn sm accent" onClick={() => setModal({ k: 'pay', row: r, reload })}>Payer</button>}
          {['brouillon', 'envoye'].includes(r.status) && <button className="btn sm danger" onClick={() => confirmDo('Annuler cette commande ?') && run(() => op('po_status', { id: r.id, status: 'annule' }), 'Commande annulée').then(reload)}>Annuler</button>}
        </>}
      />
      {modal?.k === 'rec' && <Receive row={modal.row} onClose={close(modal.reload)} />}
      {modal?.k === 'pay' && (
        <ActionModal title={`Payer ${modal.row.number} — ${modal.row.supplier_name}`} initial={{ amount: Math.round(modal.row.received_value - modal.row.paid), date: today() }}
          fields={[{ k: 'amount', l: 'Montant', t: 'number', req: true }, { k: 'account_id', l: 'Payé depuis', t: 'ref', ref: 'accounts', req: true }, { k: 'date', l: 'Date', t: 'date' }, { k: 'reference', l: 'Référence' }]}
          onSubmit={(d) => op('supplier_pay', { ...d, po_id: modal.row.id })} onClose={close(modal.reload)} />
      )}
    </>
  );
}

function Receive({ row, onClose }) {
  const [po, setPo] = useState(null);
  useEffect(() => { crud.get('purchase_orders', row.id).then(setPo); }, [row.id]);
  if (!po) return null;
  const init = Object.fromEntries(po.lines.map((l) => [l.id, { qty: Math.max(0, l.qty - l.received_qty) }]));
  return (
    <ActionModal title={`Réception — ${row.number}`} wide submitLabel="Enregistrer la réception" initial={{ lines: init }}
      onSubmit={(d) => op('po_receive', { id: row.id, warehouse_id: d.warehouse_id, lines: Object.entries(d.lines).map(([line_id, v]) => ({ line_id: Number(line_id), ...v })) })}
      onClose={onClose}>
      {(d, setD) => {
        if (!po) return <div className="spinner">Chargement…</div>;
        const setL = (id, patch) => setD((x) => ({ ...x, lines: { ...x.lines, [id]: { ...(x.lines[id] || { qty: undefined }), ...patch } } }));
        return (
          <>
            <div className="field" style={{ maxWidth: 320, marginBottom: 12 }}><label>Entrepôt de réception</label>
              <RefSelect f={{ ref: 'warehouses', placeholder: 'Entrepôt par défaut' }} value={d.warehouse_id} onChange={(v) => setD((x) => ({ ...x, warehouse_id: v }))} /></div>
            <div className="table-wrap"><table className="lines">
              <thead><tr><th>Article</th><th>Commandé</th><th>Déjà reçu</th><th>Qté reçue</th><th>Prix unit.</th><th>N° lot fournisseur</th><th>DLC</th><th>Quarantaine</th></tr></thead>
              <tbody>{po.lines.map((l) => {
                const v = d.lines[l.id] || {};
                return (
                  <tr key={l.id}>
                    <td className="strong">{l.item_name}</td><td>{num(l.qty)} {l.unit}</td><td>{num(l.received_qty)}</td>
                    <td><input className="input" type="number" step="any" style={{ width: 90 }} value={v.qty ?? ''} onChange={(e) => setL(l.id, { qty: e.target.value })} /></td>
                    <td><input className="input" type="number" step="any" style={{ width: 100 }} value={v.unit_price ?? l.unit_price} onChange={(e) => setL(l.id, { unit_price: e.target.value })} /></td>
                    <td><input className="input" style={{ width: 130 }} value={v.lot_number || ''} onChange={(e) => setL(l.id, { lot_number: e.target.value })} placeholder="Auto" /></td>
                    <td><input className="input" type="date" value={v.expiry_date || ''} onChange={(e) => setL(l.id, { expiry_date: e.target.value })} /></td>
                    <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!v.quarantine} onChange={(e) => setL(l.id, { quarantine: e.target.checked })} /></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <div className="note" style={{ marginTop: 12 }}>Chaque ligne reçue crée un lot traçable. Cochez « Quarantaine » si le lot doit être contrôlé par la qualité avant utilisation.</div>
          </>
        );
      }}
    </ActionModal>
  );
}

function Suppliers() {
  const [pay, setPay] = useState(null);
  return (
    <>
      <CrudTable entity="suppliers" title="Fournisseur" csvName="fournisseurs" newLabel="Nouveau fournisseur"
        columns={[
          { k: 'code', l: 'Code' }, { k: 'name', l: 'Fournisseur', fmt: (r) => <span className="strong">{r.name}</span>, csv: (r) => r.name },
          { k: 'contact', l: 'Contact' }, { k: 'phone', l: 'Téléphone' }, { k: 'payment_terms', l: 'Conditions' },
          { k: 'approved', l: 'Agréé', t: 'bool' }, { k: 'rating', l: 'Note /5' },
          { k: 'balance', l: 'Solde dû', r: true, fmt: (r) => <span className={r.balance > 0 ? 'neg strong' : ''}>{money(r.balance)}</span>, csv: (r) => r.balance },
        ]}
        sums={['balance']} defaults={{ approved: true }}
        fields={[
          { k: 'name', l: 'Raison sociale', req: true }, { k: 'code', l: 'Code' }, { k: 'contact', l: 'Personne de contact' }, { k: 'phone', l: 'Téléphone' },
          { k: 'email', l: 'Email', t: 'email' }, { k: 'ninea', l: 'NINEA' }, { k: 'payment_terms', l: 'Conditions de paiement' },
          { k: 'rating', l: 'Évaluation (1 à 5)', t: 'number' }, { k: 'address', l: 'Adresse', full: true },
          { k: 'approved', l: 'Fournisseur agréé (référencé qualité)', t: 'bool', full: true }, { k: 'notes', l: 'Notes', t: 'textarea', full: true },
        ]}
        rowActions={(r, reload) => r.balance > 0.5 && <button className="btn sm accent" onClick={() => setPay({ row: r, reload })}>Payer</button>}
      />
      {pay && <ActionModal title={`Paiement — ${pay.row.name}`} initial={{ amount: Math.round(pay.row.balance), date: today() }}
        fields={[{ k: 'amount', l: 'Montant', t: 'number', req: true }, { k: 'account_id', l: 'Payé depuis', t: 'ref', ref: 'accounts', req: true }, { k: 'date', l: 'Date', t: 'date' }, { k: 'reference', l: 'Référence' }]}
        onSubmit={(d) => op('supplier_pay', { ...d, supplier_id: pay.row.id })} onClose={(ok) => { const r = pay.reload; setPay(null); if (ok) r(); }} />}
    </>
  );
}

function SupplierPayments() {
  return (
    <CrudTable entity="payments" title="Paiement" params={{ direction: 'out', party_type: 'supplier' }} dateRange csvName="paiements-fournisseurs" canCreate={false}
      columns={[{ k: 'date', l: 'Date', t: 'date' }, { k: 'amount', l: 'Montant', t: 'money' }, { k: 'account_name', l: 'Compte' }, { k: 'reference', l: 'Référence' }]}
      sums={['amount']} />
  );
}
