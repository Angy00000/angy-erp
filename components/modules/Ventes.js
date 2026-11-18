import { useState, useMemo } from 'react';
import { api, op, crud, money, num, date, opts, today, LABELS } from '../../lib/client';
import { Tabs, Badge, Modal, Stat, useRefOptions, useData, run, confirmDo, invalidateRefs, toast } from '../ui';
import Commandes from './Commandes';
import Depots from './Depots';
import Dettes from './Dettes';
import CrudTable from '../CrudTable';
import ActionModal from '../ActionModal';

const accountField = { k: 'account_id', l: 'Compte d\'encaissement', t: 'ref', ref: 'accounts', params: { active: true }, req: true };

export default function Ventes({ can, company }) {
  const [tab, setTab] = useState('pos');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['pos', 'Point de vente'], ['hist', '📜 Historique des ventes'], ['cmd', 'Commandes clients'], ['depots', 'Vendeurs & dépôts'], ['docs', 'Factures, devis & commandes'], ['dettes', 'Dettes clients'], ['clients', 'Clients'], ['pay', 'Encaissements']]} />
      {tab === 'pos' && <POS />}
      {tab === 'hist' && <SalesHistory />}
      {tab === 'cmd' && <Commandes canProduce={!can || can('production')} />}
      {tab === 'depots' && <Depots />}
      {tab === 'dettes' && <Dettes company={company} />}
      {tab === 'docs' && <Docs />}
      {tab === 'clients' && <Clients />}
      {tab === 'pay' && <Payments />}
    </div>
  );
}

// Regroupe « Jus de bissap (sachet 12,5 cl) », « Jus de bissap (bouteille 1 L) »… sous « Jus de bissap »
function groupProducts(list) {
  const m = new Map();
  for (const i of list) {
    const r = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(String(i.name).trim());
    const fam = r ? r[1].trim() : String(i.name).trim();
    const key = fam.toLowerCase();
    if (!m.has(key)) m.set(key, { name: fam, items: [] });
    m.get(key).items.push({ ...i, format: r ? r[2].charAt(0).toUpperCase() + r[2].slice(1) : '' });
  }
  for (const g of m.values()) g.items.sort((a, b) => (Number(a.unit_volume) || 0) - (Number(b.unit_volume) || 0) || Number(a.sale_price) - Number(b.sale_price));
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
const FAM_COLORS = { bissap: '#b0213a', bouye: '#c9a97a', gingembre: '#d9a21b', moringa: '#3f8a3a', tamarin: '#7a4a2a', mangue: '#f0a020', orange: '#f07a10', ananas: '#e6c229', citron: '#b5c925', corossol: '#8fbf6a' };
const famColor = (n) => { const k = Object.keys(FAM_COLORS).find((x) => n.toLowerCase().includes(x)); if (k) return FAM_COLORS[k]; let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 42%)`; };

function POS() {
  const [refresh, setRefresh] = useState(0);
  const items = useRefOptions('items', { active: true, _r: refresh });
  const { data: lots } = useData(() => crud.list('lots', { instock: true, status: 'ok', limit: 1000 }), [refresh]);
  const lotsOf = (id) => (lots || []).filter((x) => x.item_id === id).sort((a, b) => String(a.expiry_date || '9').localeCompare(String(b.expiry_date || '9')));
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
  const [day, setDay] = useState(today());
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [fix, setFix] = useState(null);

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
      const r = await op('pos_sale', { lines: cart, customer_id: customer || null, account_id: acc, paid: paid === '' ? total : Number(paid), discount: Number(discount || 0), channel, date: day || today() });
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
        <div className="pos-fams">
          {groupProducts(sellable).map((g) => (
            <div key={g.name} className="pos-fam">
              <div className="pos-fam-h"><span className="pos-av" style={{ background: famColor(g.name) }}>{g.name.replace(/^jus (de |d')?/i, '').slice(0, 1).toUpperCase()}</span><b>{g.name}</b></div>
              <div className="pos-fmts">
                {g.items.map((i) => {
                  const out = i.type !== 'service' && !(Number(i.stock) > 0);
                  const inCart = cart.find((x) => x.item_id === i.id);
                  return (
                    <button key={i.id} className={'pos-fmt' + (out ? ' out' : '') + (inCart ? ' in' : '')} onClick={() => add(i)} title={i.name}>
                      <span className="f">{g.items.length > 1 || i.format ? (i.format || i.name) : 'Ajouter'}</span>
                      <span className="p">{money(price(i))}</span>
                      <span className="s">{i.type === 'service' ? 'Service' : out ? 'Épuisé' : `${num(i.stock)} en stock`}</span>
                      {inCart && <span className="q">{num(inCart.qty)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!sellable.length && <div className="muted">Aucun produit vendable. Ajoutez des articles avec un prix de vente dans Stock & Articles.</div>}
        </div>
      </div>
      <div className="card card-pad" style={{ alignSelf: 'start', position: 'sticky', top: 16 }}>
        <h3>Panier</h3>
        {!cart.length && <div className="muted small" style={{ padding: '16px 0' }}>Touchez un produit pour l'ajouter</div>}
        {cart.map((l, idx) => (
          <div key={l.item_id} className="cart-line">
            <div><div className="strong small">{l.name}</div>{l.type !== 'service' && Number(l.qty) > Number(l.stock) && <div className="neg small">Stock insuffisant ({num(l.stock)})</div>}
              {l.type !== 'service' && lotsOf(l.item_id).length > 1 && (
                <select className="input lot-sel" value={l.lot_id || ''} onChange={(e) => setCart(cart.map((x, j) => (j === idx ? { ...x, lot_id: e.target.value ? Number(e.target.value) : '' } : x)))} title="Lot vendu">
                  <option value="">Lot : automatique (le plus ancien)</option>
                  {lotsOf(l.item_id).map((x) => <option key={x.id} value={x.id}>Lot {x.lot_number} · {num(x.qty)}{x.expiry_date ? ` · DLC ${date(x.expiry_date)}` : ''}</option>)}
                </select>
              )}</div>
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
          <div className="field full"><label>Date d'encaissement</label><input className="input" type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></div>
        </div>
        {day && day !== today() && <div className="note" style={{ marginTop: 8 }}>Vente enregistrée à la date du <b>{date(day)}</b> (pas aujourd'hui).</div>}
        <div className="space" />
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted strong">TOTAL</span><span className="total-big">{money(total)}</span></div>
        {paid !== '' && Number(paid) < total && <div className="note" style={{ marginTop: 8 }}>Reste dû par le client : {money(total - Number(paid))} (créance)</div>}
        {paid !== '' && Number(paid) > total && <div className="note" style={{ marginTop: 8 }}>Monnaie à rendre : {money(Number(paid) - total)}</div>}
        <div className="space" />
        <button className="btn accent" style={{ width: '100%', justifyContent: 'center', fontSize: 16, minHeight: 48 }} disabled={busy || !cart.length} onClick={checkout}>{busy ? 'Enregistrement…' : 'Encaisser la vente'}</button>
        {last && <div style={{ marginTop: 12 }} className="row"><span className="small muted">Dernière vente : {last.number}</span><a className="btn sm" href={`/print/sales_docs/${last.id}`} target="_blank" rel="noreferrer">Imprimer le reçu</a><button className="btn sm" onClick={() => setFix(last.id)}>✏️ Corriger</button></div>}
        {fix && <SaleEdit id={fix} onClose={(ok) => { setFix(null); if (ok) { invalidateRefs('items'); invalidateRefs('accounts'); setRefresh((x) => x + 1); } }} />}
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
            {canFix(r) && <button className="btn sm" onClick={() => setModal({ kind: 'fix', row: r, reload })}>✏️ Corriger</button>}
            {r.type === 'devis' && ['brouillon', 'valide'].includes(r.status) && <button className="btn sm" onClick={() => act(() => op('sale_convert', { id: r.id, to: 'commande' }), 'Bon de commande créé', reload)}>→ Commande</button>}
            {['devis', 'commande'].includes(r.type) && ['brouillon', 'valide'].includes(r.status) && <button className="btn sm" onClick={() => act(() => op('sale_convert', { id: r.id, to: 'facture' }), 'Facture créée (brouillon)', reload)}>→ Facture</button>}
            {r.paid > 0 && <button className="btn sm danger" onClick={() => confirmDo('Rembourser tous les encaissements de ce document ?') && act(() => op('sale_refund', { id: r.id }), 'Paiements remboursés', reload)}>Rembourser</button>}
            {!['annule', 'transforme', 'brouillon'].includes(r.status) && r.paid === 0 && <button className="btn sm danger" onClick={() => confirmDo('Annuler ce document ? Le stock sera réintégré.') && act(() => op('sale_cancel', { id: r.id }), 'Document annulé', reload)}>Annuler</button>}
          </>
        )}
      />
      {modal?.kind === 'fix' && <SaleEdit id={modal.row.id} onClose={(ok) => { const rl = modal.reload; setModal(null); if (ok) { invalidateRefs('items'); invalidateRefs('accounts'); rl(); } }} />}
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
  const [edit, setEdit] = useState(null);
  return (
    <>
      <CrudTable entity="payments" title="Encaissement" params={{ direction: 'in' }} dateRange csvName="encaissements"
        columns={[{ k: 'date', l: "Date d'encaissement", t: 'date' }, { k: 'amount', l: 'Montant', t: 'money' }, { k: 'account_name', l: 'Compte' }, { k: 'method', l: 'Mode' }, { k: 'reference', l: 'Référence' },
          { k: 'doc_id', l: 'Document', fmt: (r) => r.doc_id ? <a href={`/print/sales_docs/${r.doc_id}`} target="_blank" rel="noreferrer">{r.doc_number || 'Voir'}</a> : '' }]}
        sums={['amount']} canCreate={false}
        rowActions={(r, reload) => <button className="btn sm" onClick={() => setEdit({ row: r, reload })}>📅 Changer la date</button>}
      />
      {edit && (
        <ActionModal title="Changer la date d'encaissement" initial={{ date: String(edit.row.date).slice(0, 10), reference: edit.row.reference || '' }}
          fields={[{ k: 'date', l: "Date d'encaissement", t: 'date', req: true }, { k: 'reference', l: 'Référence (n° transaction…)', t: 'text' }]}
          onSubmit={(d) => op('payment_date', { ...d, id: edit.row.id })}
          onClose={(ok) => { const rl = edit.reload; setEdit(null); if (ok) { invalidateRefs('accounts'); rl(); } }}>
          <div className="note" style={{ marginBottom: 12 }}>Encaissement de <b>{money(edit.row.amount)}</b> sur {edit.row.account_name || 'le compte'}. La date change aussi dans la trésorerie.</div>
        </ActionModal>
      )}
    </>
  );
}

const canFix = (r) => r.type === 'facture' && ['valide', 'partiel', 'paye'].includes(r.status) && r.channel !== 'depot';

// Corriger une vente déjà enregistrée : le stock, la caisse et ce que doit le client se recalculent.
export function SaleEdit({ id, onClose }) {
  const { data: doc } = useData(() => crud.get('sales_docs', id), [id]);
  const items = useRefOptions('items', { active: true });
  const customers = useRefOptions('customers', {});
  const accounts = useRefOptions('accounts', { active: true });
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  if (doc && !f) {
    const wasPaid = Number(doc.paid) >= Number(doc.total) - 0.01;
    setF({ customer_id: doc.customer_id || '', date: String(doc.date).slice(0, 10), discount: String(Number(doc.discount) || ''), follow: wasPaid, paid: String(Number(doc.paid)), account_id: '',
      lines: (doc.lines || []).map((l) => ({ item_id: l.item_id, qty: String(Number(l.qty)), unit_price: String(Number(l.unit_price)), discount: Number(l.discount) || 0, lot_id: l.lot_id || '' })) });
    return null;
  }
  if (!doc || !f) return <Modal title="Corriger la vente" onClose={() => onClose(false)}><div className="spinner">Chargement…</div></Modal>;
  const sellable = items.filter((i) => i.type === 'pf' || i.type === 'service' || i.type === 'semi_fini' || Number(i.sale_price) > 0);
  const nameOf = (iid) => items.find((i) => i.id === Number(iid))?.name || doc.lines.find((l) => l.item_id === Number(iid))?.item_name || '';
  const subtotal = f.lines.reduce((s2, l) => s2 + (Number(l.qty) || 0) * (Number(l.unit_price) || 0) - (Number(l.discount) || 0), 0);
  const total = Math.round((subtotal - (Number(f.discount) || 0) + Number(doc.tax || 0)) * 100) / 100;
  const paid = f.follow ? Math.max(total, 0) : Math.min(Number(f.paid) || 0, total);
  const diff = Math.round((paid - Number(doc.paid)) * 100) / 100;
  const setLine = (i, v) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...v } : l)) });
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await op('sale_edit', { id, customer_id: f.customer_id || null, date: f.date, discount: Number(f.discount) || 0, paid, account_id: f.account_id || undefined,
        lines: f.lines.filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty), unit_price: Number(l.unit_price) || 0, discount: Number(l.discount) || 0, lot_id: l.lot_id || null })) });
      toast(`Vente ${r.number} corrigée`); onClose(true);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Corriger la vente ${doc.number}`} wide onClose={() => onClose(false)}
      footer={<><button className="btn" onClick={() => onClose(false)}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer la correction'}</button></>}>
      {err && <div className="err">{err}</div>}
      <div className="note" style={{ marginBottom: 12 }}>Changez ce qui est faux. Le stock, la caisse et ce que doit le client seront recalculés. Pour supprimer toute la vente, utilisez plutôt <b>Annuler</b>.</div>
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Produit</th><th className="r" style={{ width: 110 }}>Quantité</th><th className="r" style={{ width: 130 }}>Prix unitaire</th><th className="r">Total</th><th style={{ width: 40 }} /></tr></thead>
        <tbody>{f.lines.map((l, i) => (
          <tr key={i}>
            <td><select className="input" value={l.item_id} onChange={(e) => { const it = items.find((x) => x.id === Number(e.target.value)); setLine(i, { item_id: e.target.value, lot_id: '', unit_price: it ? String(Number(it.sale_price) || 0) : l.unit_price }); }}>
              <option value="">— Produit —</option>
              {!sellable.some((x) => x.id === Number(l.item_id)) && l.item_id && <option value={l.item_id}>{nameOf(l.item_id)}</option>}
              {sellable.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></td>
            <td><input className="input r" type="number" min="0" step="any" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
            <td><input className="input r" type="number" min="0" step="any" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} /></td>
            <td className="r nw strong">{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0) - (Number(l.discount) || 0))}</td>
            <td><button className="btn sm ghost" title="Retirer" onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })}>✕</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <button className="link-btn" style={{ margin: '8px 0 14px' }} onClick={() => setF({ ...f, lines: [...f.lines, { item_id: '', qty: '1', unit_price: '', discount: 0, lot_id: '' }] })}>+ Ajouter un produit</button>
      <div className="form" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="field"><label>Client</label><select className="input" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Date de la vente</label><input className="input" type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="field"><label>Remise</label><input className="input" type="number" min="0" value={f.discount} placeholder="0" onChange={(e) => setF({ ...f, discount: e.target.value })} /></div>
        <div className="field"><label>Argent reçu du client</label>
          <label className="row small" style={{ gap: 6, margin: '2px 0 6px' }}><input type="checkbox" checked={f.follow} onChange={(e) => setF({ ...f, follow: e.target.checked, paid: String(paid) })} /> Le client a tout payé</label>
          {!f.follow && <input className="input" type="number" min="0" value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} />}</div>
        {diff > 0.009 && <div className="field"><label>Compte où l'argent est reçu</label><select className="input" value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>
          <option value="">Même compte que la vente</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
      </div>
      <div className="fix-sum">
        <div><span className="muted small">Avant</span><b>{money(doc.total)}</b><span className="small muted">payé {money(doc.paid)}</span></div>
        <div className="arrow">→</div>
        <div><span className="muted small">Après</span><b>{money(total)}</b><span className="small muted">payé {money(paid)}</span></div>
        <div className="grow" />
        {diff > 0.009 && <div className="badge green">Le client donne encore {money(diff)}</div>}
        {diff < -0.009 && <div className="badge amber">À rendre au client : {money(-diff)}</div>}
        {total - paid > 0.009 && <div className="badge red">Reste dû : {money(total - paid)}</div>}
      </div>
    </Modal>
  );
}

// ───────────── Historique des ventes : voir clairement chaque vente et la corriger ─────────────
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const PERIODS_H = [
  ['today', "Aujourd'hui", () => [today(), today()]],
  ['yesterday', 'Hier', () => [addDays(-1), addDays(-1)]],
  ['week', '7 derniers jours', () => [addDays(-6), today()]],
  ['month', 'Ce mois', () => [today().slice(0, 8) + '01', today()]],
  ['all', 'Tout', () => ['', '']],
];
const shortName = (s) => String(s || '').replace(/^jus de /i, '').replace(/\s*\((.*)\)\s*$/, ' · $1');
const dayTitle = (d) => {
  const k = String(d).slice(0, 10);
  if (k === today()) return "Aujourd'hui";
  if (k === addDays(-1)) return 'Hier';
  const t = new Date(k + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const hour = (v) => (v ? new Date(v).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
const saleState = (d) => (d.status === 'annule' ? ['Annulée', 'gray'] : d.total - d.paid > 0.009 ? [d.paid > 0 ? `Doit ${money(d.total - d.paid)}` : `Pas payée · ${money(d.total)}`, 'red'] : ['Payée', 'green']);

function SalesHistory() {
  const [period, setPeriod] = useState('today');
  const [range, setRange] = useState(() => PERIODS_H[0][2]());
  const [qs, setQs] = useState('');
  const [state, setState] = useState('all');
  const [seller, setSeller] = useState('');
  const [open, setOpen] = useState({});
  const [modal, setModal] = useState(null);
  const accounts = useRefOptions('accounts', { active: true });
  const { data, reload } = useData(() => api(`app/sales_history?from=${range[0]}&to=${range[1]}`), [range[0], range[1]]);
  const list = data || [];
  const sellers = useMemo(() => [...new Map(list.filter((d) => d.user_id).map((d) => [d.user_id, d.user_name])).entries()], [data]);
  const shown = list.filter((d) => {
    if (state === 'paid' && (d.status === 'annule' || d.total - d.paid > 0.009)) return false;
    if (state === 'due' && (d.status === 'annule' || d.total - d.paid <= 0.009)) return false;
    if (state === 'cancel' && d.status !== 'annule') return false;
    if (state !== 'cancel' && state !== 'all' && d.status === 'annule') return false;
    if (seller && String(d.user_id) !== seller) return false;
    if (qs.trim()) {
      const t = qs.trim().toLowerCase();
      const hay = [d.number, d.customer_name, d.customer_phone, d.user_name, ...d.lines.map((l) => l.name)].join(' ').toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  });
  const live = shown.filter((d) => d.status !== 'annule');
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const days = [];
  for (const d of shown) { const k = String(d.date).slice(0, 10); let g = days.find((x) => x.k === k); if (!g) days.push(g = { k, list: [] }); g.list.push(d); }
  const after = (ok) => { setModal(null); if (ok) { invalidateRefs('items'); invalidateRefs('accounts'); reload(); } };
  const cancelSale = async (d) => {
    const msg = d.paid > 0 ? `Annuler la vente ${d.number} ? Les ${money(d.paid)} encaissés seront sortis de la caisse (rendus au client) et les produits remis en stock.` : `Annuler la vente ${d.number} ? Les produits seront remis en stock.`;
    if (!confirmDo(msg)) return;
    await run(async () => { if (d.paid > 0) await op('sale_refund', { id: d.id }); await op('sale_cancel', { id: d.id }); }, 'Vente annulée');
    invalidateRefs('items'); invalidateRefs('accounts'); reload();
  };

  const restoreSale = async (d) => {
    if (!confirmDo(`Rétablir la vente ${d.number} (${money(d.total)}) ? Les produits ressortent du stock et l'argent rendu revient en caisse.`)) return;
    await run(() => op('sale_restore', { id: d.id }), 'Vente rétablie');
    invalidateRefs('items'); invalidateRefs('accounts'); reload();
  };
  return (
    <div>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="seg hist-seg">{PERIODS_H.map(([k, l, f]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => { setPeriod(k); setRange(f()); }}>{l}</button>)}</div>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <input className="input hist-date" type="date" value={range[0]} onChange={(e) => { setPeriod('custom'); setRange([e.target.value, range[1] || e.target.value]); }} />
          <span className="muted">au</span>
          <input className="input hist-date" type="date" value={range[1]} onChange={(e) => { setPeriod('custom'); setRange([range[0] || e.target.value, e.target.value]); }} />
        </div>
      </div>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="🔎 Client, n° de vente, produit…" value={qs} onChange={(e) => setQs(e.target.value)} />
        <div className="type-chips" style={{ marginBottom: 0 }}>{[['all', 'Toutes'], ['paid', 'Payées'], ['due', 'Pas encore payées'], ['cancel', 'Annulées']].map(([k, l]) => <button key={k} className={'chip' + (state === k ? ' on' : '')} onClick={() => setState(k)}>{l}</button>)}</div>
        {sellers.length > 1 && <select className="input" style={{ maxWidth: 200 }} value={seller} onChange={(e) => setSeller(e.target.value)}><option value="">Tous les vendeurs</option>{sellers.map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}</select>}
      </div>

      <div className="grid g4 hist-stats" style={{ margin: '14px 0' }}>
        <Stat k="Ventes" v={live.length} s={shown.length - live.length ? `+ ${shown.length - live.length} annulée(s)` : 'sur la période'} />
        <Stat k="Total vendu" v={money(sum(live, (d) => d.total))} s={`${num(sum(live, (d) => d.lines.reduce((s, l) => s + l.qty, 0)))} articles`} />
        <Stat k="Argent reçu" v={money(sum(live, (d) => d.paid))} />
        <Stat k="Reste à encaisser" v={money(sum(live, (d) => Math.max(0, d.total - d.paid)))} accent={live.some((d) => d.total - d.paid > 0.009)} />
      </div>

      {!data && <div className="spinner">Chargement…</div>}
      {data && !shown.length && <div className="card"><div className="empty">Aucune vente pour cette période{qs || state !== 'all' || seller ? ' avec ces filtres' : ''}.</div></div>}
      {days.map((g) => {
        const gl = g.list.filter((d) => d.status !== 'annule');
        return (
          <div key={g.k} className="hist-day">
            <div className="hist-day-head"><b>{dayTitle(g.k)}</b><span className="muted small">{gl.length} vente{gl.length > 1 ? 's' : ''}{g.list.length > gl.length ? ` · ${g.list.length - gl.length} annulée(s)` : ''}</span><b className="hist-day-total">{money(sum(gl, (d) => d.total))}</b></div>
            <div className="card">
              {g.list.map((d) => {
                const [lab, col] = saleState(d); const isOpen = open[d.id];
                const fixable = canFix({ ...d, type: 'facture' }) && d.parent_type !== 'commande';
                return (
                  <div key={d.id} className={'hist-sale' + (d.status === 'annule' ? ' cancelled' : '') + (isOpen ? ' open' : '')}>
                    <div className="hist-main" onClick={() => setOpen({ ...open, [d.id]: !isOpen })}>
                      <div className="hist-when"><b>{String(d.created_at).length && iso(new Date(d.created_at)) === String(d.date).slice(0, 10) ? hour(d.created_at) : date(d.date)}</b><span className="muted small">{d.number}</span></div>
                      <div className="hist-what">
                        <div className="hist-who"><b>{d.customer_name || 'Client comptoir'}</b>{d.user_name && <span className="muted small"> · vendu par {d.user_name}</span>}
                          {d.channel && d.channel !== 'comptoir' && <span className="badge gray" style={{ marginLeft: 6 }}>{LABELS.channel?.[d.channel] || d.channel}</span>}
                          {d.corrected && <span className="badge amber" style={{ marginLeft: 6 }}>✏️ corrigée</span>}</div>
                        <div className="hist-items">{d.lines.map((l, i) => <span key={i} className="hist-item"><b>{num(l.qty)}</b> × {shortName(l.name)}</span>)}</div>
                      </div>
                      <div className="hist-amount"><b>{money(d.total)}</b><span className={'badge ' + col}>{lab}</span></div>
                    </div>
                    {isOpen && (
                      <div className="hist-detail">
                        <div className="table-wrap"><table className="t"><thead><tr><th>Produit</th><th className="r">Quantité</th><th className="r">Prix</th><th className="r">Total</th></tr></thead>
                          <tbody>{d.lines.map((l, i) => <tr key={i}><td className="nm">{l.name}</td><td className="r nw">{num(l.qty)} {l.unit || ''}</td><td className="r nw">{money(l.unit_price)}</td><td className="r nw strong">{money(l.total)}</td></tr>)}</tbody>
                          <tfoot>{d.discount > 0 && <tr><td colSpan={3}>Remise</td><td className="r">− {money(d.discount)}</td></tr>}<tr><td colSpan={3} className="strong">Total</td><td className="r strong">{money(d.total)}</td></tr></tfoot>
                        </table></div>
                        <div className="hist-pays">
                          <span className="muted small">Paiements :</span>
                          {d.payments.length ? d.payments.map((p, i) => <span key={i} className="badge green">{money(p.amount)} · {p.account_name || p.method || 'caisse'} · {date(p.date)}</span>) : <span className="muted small">aucun</span>}
                          {d.total - d.paid > 0.009 && d.status !== 'annule' && <span className="badge red">Reste {money(d.total - d.paid)}</span>}
                          {d.status !== 'annule' && d.cost > 0 && <span className="muted small">· bénéfice ≈ {money(d.total - d.cost)}</span>}
                        </div>
                        {d.notes && <div className="muted small" style={{ marginTop: 6 }}>Note : {d.notes}</div>}
                      </div>
                    )}
                    {d.status === 'annule' && (
                      <div className="hist-actions"><button className="btn sm" onClick={() => restoreSale(d)}>↩️ Rétablir la vente</button>
                        <button className="btn sm ghost" onClick={() => setOpen({ ...open, [d.id]: !isOpen })}>{isOpen ? 'Masquer' : 'Détails'}</button></div>
                    )}
                    {d.status !== 'annule' && (
                      <div className="hist-actions">
                        {fixable && <button className="btn sm" onClick={() => setModal({ kind: 'fix', d })}>✏️ Corriger</button>}
                        {d.total - d.paid > 0.009 && <button className="btn sm accent" onClick={() => setModal({ kind: 'pay', d })}>💰 Encaisser</button>}
                        <a className="btn sm" href={`/print/sales_docs/${d.id}`} target="_blank" rel="noreferrer">🧾 Reçu</a>
                        <button className="btn sm ghost" onClick={() => setOpen({ ...open, [d.id]: !isOpen })}>{isOpen ? 'Masquer' : 'Détails'}</button>
                        <div className="grow" />
                        {d.channel !== 'depot' && <button className="btn sm danger" onClick={() => cancelSale(d)}>Annuler la vente</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {modal?.kind === 'fix' && <SaleEdit id={modal.d.id} onClose={after} />}
      {modal?.kind === 'pay' && (
        <ActionModal title={`Encaisser ${modal.d.number}`} initial={{ amount: Math.round((modal.d.total - modal.d.paid) * 100) / 100, date: today(), account_id: modal.d.payments[0]?.account_id || accounts[0]?.id }}
          fields={[{ k: 'amount', l: 'Montant', t: 'number', req: true }, accountField, { k: 'date', l: "Date d'encaissement", t: 'date' }, { k: 'reference', l: 'Référence (n° transaction…)', t: 'text' }]}
          onSubmit={(v) => op('sale_pay', { ...v, id: modal.d.id })} onClose={after}>
          <div className="note" style={{ marginBottom: 12 }}>{modal.d.customer_name || 'Client comptoir'} · reste à payer : <b>{money(modal.d.total - modal.d.paid)}</b></div>
        </ActionModal>
      )}
    </div>
  );
}
