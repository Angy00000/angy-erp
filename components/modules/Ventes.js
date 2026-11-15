import { useState } from 'react';
import { op, crud, money, num, date, opts, today, LABELS } from '../../lib/client';
import { Tabs, Badge, useRefOptions, run, confirmDo, invalidateRefs, toast } from '../ui';
import CrudTable from '../CrudTable';
import ActionModal from '../ActionModal';

const accountField = { k: 'account_id', l: 'Compte d\'encaissement', t: 'ref', ref: 'accounts', params: { active: true }, req: true };

export default function Ventes() {
  const [tab, setTab] = useState('pos');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['pos', 'Point de vente'], ['docs', 'Factures, devis & commandes'], ['clients', 'Clients'], ['pay', 'Encaissements']]} />
      {tab === 'pos' && <POS />}
      {tab === 'docs' && <Docs />}
      {tab === 'clients' && <Clients />}
      {tab === 'pay' && <Payments />}
    </div>
  );
}

function POS() {
  const [refresh, setRefresh] = useState(0);
  const items = useRefOptions('items', { active: true, _r: refresh });
  const customers = useRefOptions('customers', {});
  const accounts = useRefOptions('accounts', { active: true });
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);
  const [tier, setTier] = useState('detail');
  const [customer, setCustomer] = useState('');
  const [account, setAccount] = useState('');
  const [paid, setPaid] = useState('');
  const [discount, setDiscount] = useState('');
  const [channel, setChannel] = useState('comptoir');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);

  const sellable = items.filter((i) => (i.type === 'pf' || i.type === 'service' || i.type === 'semi_fini' || Number(i.sale_price) > 0) && (!q || i.name.toLowerCase().includes(q.toLowerCase()) || (i.code || '').toLowerCase().includes(q.toLowerCase()) || i.barcode === q));
  const price = (i) => (tier === 'gros' && Number(i.wholesale_price) > 0 ? Number(i.wholesale_price) : Number(i.sale_price));
  const add = (i) => setCart((c) => {
    const ex = c.find((x) => x.item_id === i.id);
    if (ex) return c.map((x) => (x.item_id === i.id ? { ...x, qty: Number(x.qty) + 1 } : x));
    return [...c, { item_id: i.id, name: i.name, unit_price: price(i), qty: 1, stock: i.stock, type: i.type }];
  });
  const total = cart.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_price || 0), 0) - Number(discount || 0);
  const acc = account || accounts[0]?.id || '';

  const checkout = async () => {
    if (!cart.length) return toast('Panier vide', 'error');
    setBusy(true);
    try {
      const r = await op('pos_sale', { lines: cart, customer_id: customer || null, account_id: acc, paid: paid === '' ? total : Number(paid), discount: Number(discount || 0), channel });
      toast(`Vente ${r.number} enregistrée`);
      setLast(r);
      setCart([]); setPaid(''); setDiscount('');
      invalidateRefs('items'); invalidateRefs('customers'); invalidateRefs('accounts');
      setRefresh((x) => x + 1);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="pos-layout">
      <div>
        <div className="toolbar">
          <input className="input" placeholder="Rechercher un produit, code ou code-barres…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && sellable.length === 1) { add(sellable[0]); setQ(''); } }} />
          <select className="input sm" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="detail">Prix détail</option><option value="gros">Prix de gros</option>
          </select>
        </div>
        <div className="tiles">
          {sellable.map((i) => (
            <button key={i.id} className={'tile' + (i.type !== 'service' && i.stock <= 0 ? ' out' : '')} onClick={() => add(i)}>
              <div className="nm">{i.name}</div>
              <div><div className="pr">{money(price(i))}</div><div className="st">{i.type === 'service' ? 'Service' : `Stock : ${num(i.stock)} ${i.unit || ''}`}</div></div>
            </button>
          ))}
          {!sellable.length && <div className="muted">Aucun produit vendable. Ajoutez des articles avec un prix de vente dans Stock & Articles.</div>}
        </div>
      </div>
      <div className="card card-pad" style={{ alignSelf: 'start', position: 'sticky', top: 16 }}>
        <h3>Panier</h3>
        {!cart.length && <div className="muted small" style={{ padding: '16px 0' }}>Touchez un produit pour l'ajouter</div>}
        {cart.map((l, idx) => (
          <div key={l.item_id} className="cart-line">
            <div><div className="strong small">{l.name}</div>{l.type !== 'service' && Number(l.qty) > Number(l.stock) && <div className="neg small">Stock insuffisant ({num(l.stock)})</div>}</div>
            <input className="input" type="number" step="any" value={l.qty} onChange={(e) => setCart(cart.map((x, j) => (j === idx ? { ...x, qty: e.target.value } : x)))} />
            <input className="input" type="number" step="any" value={l.unit_price} onChange={(e) => setCart(cart.map((x, j) => (j === idx ? { ...x, unit_price: e.target.value } : x)))} />
            <button className="btn sm ghost" onClick={() => setCart(cart.filter((_, j) => j !== idx))}>✕</button>
          </div>
        ))}
        <div className="space" />
        <div className="form" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field full"><label>Client</label>
            <select className="input" value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">Client comptoir</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="field"><label>Compte</label>
            <select className="input" value={acc} onChange={(e) => setAccount(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="field"><label>Canal</label>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>{opts('channel').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label>Remise</label><input className="input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></div>
          <div className="field"><label>Montant reçu</label><input className="input" type="number" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={String(Math.max(total, 0))} /></div>
        </div>
        <div className="space" />
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted strong">TOTAL</span><span className="total-big">{money(total)}</span></div>
        {paid !== '' && Number(paid) < total && <div className="note" style={{ marginTop: 8 }}>Reste dû par le client : {money(total - Number(paid))} (créance)</div>}
        {paid !== '' && Number(paid) > total && <div className="note" style={{ marginTop: 8 }}>Monnaie à rendre : {money(Number(paid) - total)}</div>}
        <div className="space" />
        <button className="btn accent" style={{ width: '100%', justifyContent: 'center', fontSize: 16, minHeight: 48 }} disabled={busy || !cart.length} onClick={checkout}>{busy ? 'Enregistrement…' : 'Encaisser la vente'}</button>
        {last && <div style={{ marginTop: 12 }} className="row"><span className="small muted">Dernière vente : {last.number}</span><a className="btn sm" href={`/print/sales_docs/${last.id}`} target="_blank" rel="noreferrer">Imprimer le reçu</a></div>}
      </div>
    </div>
  );
}

function Docs() {
  const [modal, setModal] = useState(null);
  const act = async (fn, msg, reload) => { await run(fn, msg); invalidateRefs('items'); reload(); };
  return (
    <>
      <CrudTable entity="sales_docs" title="Document de vente" csvName="ventes" dateRange newLabel="Nouveau document"
        filters={[{ k: 'type', l: 'Type', opts: opts('sale_type') }, { k: 'status', l: 'Statut', opts: opts('sale_status') }, { k: 'customer_id', l: 'Client', ref: 'customers' }]}
        columns={[
          { k: 'number', l: 'N°', fmt: (r) => <span className="strong">{r.number}</span> },
          { k: 'type', l: 'Type', map: 'sale_type' },
          { k: 'date', l: 'Date', t: 'date' },
          { k: 'customer_name', l: 'Client' },
          { k: 'total', l: 'Total', t: 'money' },
          { k: 'paid', l: 'Payé', t: 'money' },
          { k: 'due', l: 'Reste', r: true, fmt: (r) => (r.type === 'facture' ? <span className={r.total - r.paid > 0 ? 'neg' : ''}>{money(r.total - r.paid)}</span> : '—'), csv: (r) => r.total - r.paid },
          { k: 'status', l: 'Statut', t: 'badge', map: 'sale_status' },
        ]}
        sums={['total', 'paid']}
        defaults={() => ({ type: 'facture', date: today(), channel: 'comptoir' })}
        canEdit={(r) => r.status === 'brouillon'} canDelete={(r) => r.status === 'brouillon'}
        fields={[
          { k: 'type', l: 'Type de document', t: 'select', opts: opts('sale_type'), req: true },
          { k: 'customer_id', l: 'Client', t: 'ref', ref: 'customers' },
          { k: 'date', l: 'Date', t: 'date', req: true },
          { k: 'due_date', l: 'Échéance', t: 'date' },
          { k: 'channel', l: 'Canal', t: 'select', opts: opts('channel') },
          { k: 'discount', l: 'Remise globale', t: 'number' },
          { k: 'tax', l: 'Taxes (TVA…)', t: 'number' },
          { k: 'notes', l: 'Notes', t: 'textarea', full: true },
        ]}
        lines={{ title: 'Articles', fields: [{ k: 'qty', l: 'Qté', w: 90 }, { k: 'unit_price', l: 'Prix unitaire', w: 120 }, { k: 'discount', l: 'Remise', w: 100 }],
          onItem: (item, doc) => ({ unit_price: doc?.channel === 'grossiste' && item.wholesale_price > 0 ? item.wholesale_price : item.sale_price, qty: 1 }) }}
        rowActions={(r, reload) => (
          <>
            <a className="btn sm" href={`/print/sales_docs/${r.id}`} target="_blank" rel="noreferrer">Imprimer</a>
            {r.status === 'brouillon' && <button className="btn sm primary" onClick={() => confirmDo(r.type === 'facture' ? 'Valider la facture ? Le stock sera déduit.' : 'Valider ce document ?') && act(() => op('sale_validate', { id: r.id }), 'Document validé', reload)}>Valider</button>}
            {r.type === 'facture' && ['valide', 'partiel'].includes(r.status) && <button className="btn sm accent" onClick={() => setModal({ kind: 'pay', row: r, reload })}>Encaisser</button>}
            {r.type === 'devis' && ['brouillon', 'valide'].includes(r.status) && <button className="btn sm" onClick={() => act(() => op('sale_convert', { id: r.id, to: 'commande' }), 'Bon de commande créé', reload)}>→ Commande</button>}
            {['devis', 'commande'].includes(r.type) && ['brouillon', 'valide'].includes(r.status) && <button className="btn sm" onClick={() => act(() => op('sale_convert', { id: r.id, to: 'facture' }), 'Facture créée (brouillon)', reload)}>→ Facture</button>}
            {r.paid > 0 && <button className="btn sm danger" onClick={() => confirmDo('Rembourser tous les encaissements de ce document ?') && act(() => op('sale_refund', { id: r.id }), 'Paiements remboursés', reload)}>Rembourser</button>}
            {!['annule', 'transforme', 'brouillon'].includes(r.status) && r.paid === 0 && <button className="btn sm danger" onClick={() => confirmDo('Annuler ce document ? Le stock sera réintégré.') && act(() => op('sale_cancel', { id: r.id }), 'Document annulé', reload)}>Annuler</button>}
          </>
        )}
      />
      {modal?.kind === 'pay' && (
        <ActionModal title={`Encaisser ${modal.row.number}`} initial={{ amount: modal.row.total - modal.row.paid, date: today() }}
          fields={[{ k: 'amount', l: 'Montant', t: 'number', req: true }, accountField, { k: 'date', l: 'Date', t: 'date' }, { k: 'reference', l: 'Référence (n° transaction…)', t: 'text' }]}
          onSubmit={(d) => op('sale_pay', { ...d, id: modal.row.id })}
          onClose={(ok) => { setModal(null); if (ok) modal.reload(); }}>
          <div className="note" style={{ marginBottom: 12 }}>Reste à payer : <b>{money(modal.row.total - modal.row.paid)}</b></div>
        </ActionModal>
      )}
    </>
  );
}

function Clients() {
  return (
    <CrudTable entity="customers" title="Client" csvName="clients" newLabel="Nouveau client"
      filters={[{ k: 'type', l: 'Type', opts: opts('customer_type') }]}
      columns={[
        { k: 'code', l: 'Code' }, { k: 'name', l: 'Nom', fmt: (r) => <span className="strong">{r.name}</span> }, { k: 'type', l: 'Type', map: 'customer_type' },
        { k: 'phone', l: 'Téléphone' }, { k: 'revenue', l: 'Chiffre d\'affaires', t: 'money' },
        { k: 'balance', l: 'Solde dû', r: true, fmt: (r) => <span className={r.balance > 0 ? 'neg strong' : ''}>{money(r.balance)}</span>, csv: (r) => r.balance },
      ]}
      sums={['revenue', 'balance']}
      defaults={{ type: 'particulier' }}
      fields={[
        { k: 'name', l: 'Nom / raison sociale', req: true }, { k: 'code', l: 'Code client' },
        { k: 'type', l: 'Type', t: 'select', opts: opts('customer_type') }, { k: 'phone', l: 'Téléphone' },
        { k: 'email', l: 'Email', t: 'email' }, { k: 'credit_limit', l: 'Plafond de crédit', t: 'number' },
        { k: 'address', l: 'Adresse', full: true }, { k: 'notes', l: 'Notes', t: 'textarea', full: true },
      ]}
    />
  );
}

function Payments() {
  return (
    <CrudTable entity="payments" title="Encaissement" params={{ direction: 'in' }} dateRange csvName="encaissements"
      columns={[{ k: 'date', l: 'Date', t: 'date' }, { k: 'amount', l: 'Montant', t: 'money' }, { k: 'account_name', l: 'Compte' }, { k: 'method', l: 'Mode' }, { k: 'reference', l: 'Référence' },
        { k: 'doc_id', l: 'Document', fmt: (r) => r.doc_id ? <a href={`/print/sales_docs/${r.doc_id}`} target="_blank" rel="noreferrer">Voir</a> : '' }]}
      sums={['amount']} canCreate={false}
    />
  );
}
