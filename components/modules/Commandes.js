import { useState } from 'react';
import { api, op, crud, money, num, date, today, opts } from '../../lib/client';
import { useData, useRefOptions, Modal, Stat, toast, invalidateRefs, confirmDo } from '../ui';
import { QuickProd } from './Production';
import { waLink } from '../Chrome';
import { Ic } from './Dashboard';

// Commandes clients : ce qui est prêt, ce qu'il manque, et ce qu'il faut produire.
export default function Commandes({ canProduce = true }) {
  const { data, reload } = useData(() => api('app/orders'), []);
  const [modal, setModal] = useState(null);
  if (!data) return <div className="spinner">Chargement…</div>;
  const { orders, needs } = data;
  const toMake = needs.filter((x) => x.missing > 0);
  const refresh = () => { invalidateRefs('items'); invalidateRefs('lots'); reload(); };
  const produce = (list) => setModal({ k: 'prod', initial: list.map((x) => (x.unit_volume ? { product_id: x.item_id, volume_l: String(x.missing_l) } : { product_id: x.item_id, qty: String(x.missing) })) });
  const when = (o) => (o.days === null || o.days === undefined ? 'Sans date' : o.days < 0 ? `En retard de ${-o.days} j` : o.days === 0 ? 'Aujourd\'hui' : o.days === 1 ? 'Demain' : `Dans ${o.days} j`);
  return (
    <div>
      <div className="toolbar">
        <span className="muted small">Enregistrez les commandes de vos clients : le logiciel vous dit ce qui est prêt et ce qu'il faut produire.</span>
        <div className="grow" />
        <button className="btn primary" onClick={() => setModal({ k: 'new' })}>+ Nouvelle commande</button>
      </div>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Stat k="Commandes en cours" v={num(orders.length)} s={`${orders.filter((o) => o.ready).length} prête(s) à livrer`} />
        <Stat k="Montant à encaisser" v={money(orders.reduce((s, o) => s + o.remaining_value - o.advance, 0))} s={orders.some((o) => o.advance > 0) ? `acomptes déjà reçus : ${money(orders.reduce((s, o) => s + o.advance, 0))}` : 'à la livraison'} />
        <Stat accent={toMake.length > 0} k="À produire" v={toMake.length ? `${toMake.length} produit(s)` : 'Rien'} s={toMake.length ? 'le stock ne suffit pas' : 'le stock couvre toutes les commandes'} />
      </div>

      {toMake.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-h"><span className="panel-ic"><Ic n="factory" s={16} /></span><h3>À produire pour honorer les commandes</h3>
            {canProduce && toMake.length > 1 && <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => produce(toMake)}>⚡ Tout produire</button>}</div>
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Produit</th><th className="r">Commandé</th><th className="r">En stock</th><th className="r">Manque</th><th>Pour</th><th /></tr></thead>
            <tbody>{toMake.map((x) => (
              <tr key={x.item_id}>
                <td className="strong">{x.name}</td>
                <td className="r">{num(x.ordered)} {x.unit}</td>
                <td className="r">{num(x.stock)} {x.unit}</td>
                <td className="r neg strong">{num(x.missing)} {x.unit}{x.missing_l ? <><br /><span className="small">soit {num(x.missing_l)} L</span></> : null}</td>
                <td className="small muted">{x.orders.join(', ')}</td>
                <td className="actions">{canProduce && <button className="btn sm primary" onClick={() => produce([x])}>⚡ Produire</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {!orders.length && <div className="card empty">Aucune commande en cours. Cliquez sur « + Nouvelle commande » quand un client passe commande.</div>}
      <div className="grid g2">{orders.map((o) => (
        <div key={o.id} className={'panel order' + (o.days !== null && o.days < 0 ? ' late' : '')}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="row"><b>{o.number}</b><span className="muted small">du {date(o.date)}</span></span>
            <span className="row">{o.delivered_any && <span className="badge blue">Livrée en partie</span>}{o.ready ? <span className="badge green">Prête</span> : <span className="badge red">À produire</span>}</span>
          </div>
          <div className="order-c"><b>{o.customer_name || 'Client'}</b>{o.customer_phone && <span className="muted small"> · {o.customer_phone}</span>}</div>
          <div className={'small strong ' + (o.days !== null && o.days < 0 ? 'neg' : o.days !== null && o.days <= 1 ? 'warn-t' : 'muted')}>
            Livraison : {o.due_date ? `${date(o.due_date)} — ${when(o)}` : 'date non fixée'}</div>
          <table className="t order-l"><tbody>{o.lines.map((l) => (
            <tr key={l.id}><td>{l.name || l.description}</td><td className="r">{num(l.rest)} {l.unit}{Number(l.qty_delivered) > 0 && <div className="muted small">{num(l.qty_delivered)} déjà livré(s) sur {num(l.qty)}</div>}</td>
              <td className="r small">{l.rest <= 0 ? <span className="muted">livré</span> : l.missing > 0 ? <span className="neg strong">manque {num(l.missing)}</span> : <span className="pos strong">✓ en stock</span>}</td></tr>
          ))}</tbody></table>
          {o.notes && <p className="muted small" style={{ margin: '6px 0 0' }}>{o.notes}</p>}
          {o.advance > 0 && <div className="small" style={{ marginTop: 6 }}>Acompte reçu : <b className="pos">{money(o.advance)}</b> · reste à payer <b>{money(Math.max(o.remaining_value - o.advance, 0))}</b></div>}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
            <span className="strong">{money(o.remaining_value)}</span>
            <span className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={() => setModal({ k: 'advance', o })}>Acompte</button>
              {o.customer_phone && <a className="btn sm" href={waLink(o.customer_phone, `Bonjour ${o.customer_name || ''}, votre commande ${o.number} (${money(o.total)}) ${o.ready ? 'est prête' : 'est en préparation'}. Merci !`)} target="_blank" rel="noreferrer"><Ic n="whatsapp" s={14} /></a>}
              <a className="btn sm" href={`/print/sales_docs/${o.id}`} target="_blank" rel="noreferrer">Imprimer</a>
              {!o.delivered_any && <button className="btn sm danger" onClick={async () => {
                if (!confirmDo(o.advance > 0 ? `Annuler la commande ${o.number} ? L'acompte de ${money(o.advance)} sera remboursé (sortie de caisse).` : `Annuler la commande ${o.number} ?`)) return;
                try { if (o.advance > 0) await op('sale_refund', { id: o.id }); await op('sale_cancel', { id: o.id }); toast('Commande annulée'); refresh(); } catch (e) { toast(e.message, 'error'); }
              }}>Annuler</button>}
              <button className="btn sm primary" disabled={!o.can_deliver} title={o.can_deliver ? '' : 'Produisez d\'abord ce qui manque'} onClick={() => setModal({ k: 'deliver', o })}>{o.ready ? 'Livrer' : 'Livrer une partie'}</button>
            </span>
          </div>
        </div>
      ))}</div>

      {modal?.k === 'new' && <NewOrder onClose={(ok) => { setModal(null); if (ok) reload(); }} />}
      {modal?.k === 'advance' && <Advance o={modal.o} onClose={(ok) => { setModal(null); if (ok) refresh(); }} />}
      {modal?.k === 'deliver' && <Deliver o={modal.o} onClose={(ok) => { setModal(null); if (ok) refresh(); }} />}
      {modal?.k === 'prod' && <QuickProd initial={modal.initial} note="Quantités pré-remplies avec ce qui manque pour les commandes. Ajoutez ce que vous avez pris dans le magasin et les autres dépenses, puis enregistrez."
        onClose={(r) => { setModal(null); if (r) refresh(); }} />}
    </div>
  );
}

function NewOrder({ onClose }) {
  const customers = useRefOptions('customers', {});
  const products = useRefOptions('items', { active: true }).filter((i) => i.type === 'pf' || Number(i.sale_price) > 0);
  const [d, setD] = useState({ date: today(), channel: 'comptoir' });
  const [rows, setRows] = useState([{ qty: '' }]);
  const [newCust, setNewCust] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const setRow = (i, p) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0);
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      let customer_id = d.customer_id || null;
      if (newCust) {
        if (!d.cust_name) throw new Error('Nom du client requis');
        customer_id = (await crud.create('customers', { name: d.cust_name, phone: d.cust_phone || null })).id;
        invalidateRefs('customers');
      }
      const lines = rows.filter((r) => r.item_id && Number(r.qty) > 0).map((r) => ({ item_id: r.item_id, qty: Number(r.qty), unit_price: Number(r.unit_price) || 0 }));
      if (!lines.length) throw new Error('Ajoutez au moins un produit avec une quantité');
      const doc = await crud.create('sales_docs', { type: 'commande', customer_id, date: d.date, due_date: d.due_date || null, channel: d.channel, notes: d.notes || null, lines });
      toast(`Commande ${doc.number} enregistrée`);
      onClose(true);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal wide title="Nouvelle commande client" onClose={() => onClose(false)}
      footer={<><button className="btn" onClick={() => onClose(false)}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>Enregistrer la commande</button></>}>
      {err && <div className="err">{err}</div>}
      <div className="form">
        {!newCust ? (
          <div className="field"><label>Client <button type="button" className="link-btn" onClick={() => setNewCust(true)}>+ nouveau client</button></label>
            <select className="input" value={d.customer_id || ''} onChange={(e) => setD({ ...d, customer_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">— Choisir —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select></div>
        ) : (<>
          <div className="field"><label>Nom du nouveau client <button type="button" className="link-btn" onClick={() => setNewCust(false)}>choisir un client existant</button></label><input className="input" value={d.cust_name || ''} onChange={(e) => setD({ ...d, cust_name: e.target.value })} /></div>
          <div className="field"><label>Téléphone</label><input className="input" value={d.cust_phone || ''} onChange={(e) => setD({ ...d, cust_phone: e.target.value })} /></div>
        </>)}
        <div className="field"><label>Date de livraison prévue</label><input type="date" className="input" value={d.due_date || ''} onChange={(e) => setD({ ...d, due_date: e.target.value })} /></div>
        <div className="field"><label>Canal</label><select className="input" value={d.channel} onChange={(e) => setD({ ...d, channel: e.target.value })}>{opts('channel').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>Produits commandés</h3>
      <div className="table-wrap"><table className="lines">
        <thead><tr><th style={{ minWidth: 240 }}>Produit</th><th>En stock</th><th style={{ width: 120 }}>Quantité</th><th style={{ width: 130 }}>Prix unitaire</th><th className="r">Montant</th><th /></tr></thead>
        <tbody>{rows.map((r, i) => {
          const p = products.find((x) => x.id === Number(r.item_id));
          return (
            <tr key={i}>
              <td><select className="input" value={r.item_id || ''} onChange={(e) => { const it = products.find((x) => x.id === Number(e.target.value)); setRow(i, { item_id: it ? it.id : '', unit_price: it ? (d.channel === 'grossiste' && Number(it.wholesale_price) > 0 ? it.wholesale_price : it.sale_price) : '' }); }}>
                <option value="">— Choisir —</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
              <td className="small muted">{p ? `${num(p.stock)} ${p.unit || ''}` : ''}</td>
              <td><input type="number" step="any" className="input" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} disabled={!p} /></td>
              <td><input type="number" step="any" className="input" value={r.unit_price ?? ''} onChange={(e) => setRow(i, { unit_price: e.target.value })} disabled={!p} /></td>
              <td className="r mono">{Number(r.qty) > 0 ? money(Number(r.qty) * Number(r.unit_price || 0)) : ''}</td>
              <td>{rows.length > 1 && <button className="btn sm ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          );
        })}</tbody>
        {total > 0 && <tfoot><tr><td colSpan={4} className="strong">Total de la commande</td><td className="r mono strong">{money(total)}</td><td /></tr></tfoot>}
      </table></div>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setRows([...rows, { qty: '' }])}>+ Ajouter un produit</button>
      <div className="field" style={{ marginTop: 14 }}><label>Note (adresse de livraison, détails…)</label><input className="input" value={d.notes || ''} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
    </Modal>
  );
}

function Advance({ o, onClose }) {
  const accounts = useRefOptions('accounts', { active: true });
  const [d, setD] = useState({ date: today() });
  const [busy, setBusy] = useState(false);
  const max = Math.max(Number(o.total) - Number(o.paid), 0);
  const acc = d.account_id || accounts[0]?.id || '';
  const go = async () => {
    setBusy(true);
    try { await op('order_advance', { id: o.id, amount: Number(d.amount), account_id: acc, date: d.date }); toast('Acompte enregistré'); onClose(true); } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return (
    <Modal title={`Acompte — commande ${o.number}`} onClose={() => onClose(false)}
      footer={<><button className="btn" onClick={() => onClose(false)}>Annuler</button><button className="btn primary" disabled={busy || !(Number(d.amount) > 0)} onClick={go}>Enregistrer l'acompte</button></>}>
      <div className="note" style={{ marginBottom: 12 }}>L'acompte entre tout de suite en caisse. Il sera <b>déduit automatiquement</b> de la facture à la livraison.</div>
      <div className="form">
        <div className="field"><label>Montant reçu (max. {money(max)})</label><input type="number" className="input" value={d.amount || ''} onChange={(e) => setD({ ...d, amount: e.target.value })} autoFocus /></div>
        <div className="field"><label>Reçu sur</label><select className="input" value={acc} onChange={(e) => setD({ ...d, account_id: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="field"><label>Date</label><input type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
      </div>
    </Modal>
  );
}

function Deliver({ o, onClose }) {
  const accounts = useRefOptions('accounts', { active: true });
  const { data: lots } = useData(() => crud.list('lots', { instock: true, status: 'ok', limit: 1000 }), []);
  const [qty, setQty] = useState(Object.fromEntries(o.lines.map((l) => [l.id, String(Math.max(0, Math.min(l.rest, l.ready)))])));
  const [pick, setPick] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const value = o.lines.reduce((s, l) => s + (Number(qty[l.id]) || 0) * Number(l.unit_price), 0);
  const advanceUse = Math.min(o.advance, value);
  const [d, setD] = useState({ date: today() });
  const toPay = Math.max(value - advanceUse, 0);
  const paid = d.paid === undefined || d.paid === '' ? toPay : Number(d.paid);
  const partial = o.lines.some((l) => (Number(qty[l.id]) || 0) < l.rest);
  const acc = d.account_id || accounts[0]?.id || '';
  const go = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await op('order_deliver', { id: o.id, qtys: qty, lots: pick, account_id: acc, paid, date: d.date });
      toast(r.complete ? `Commande livrée — facture ${r.number}` : `Livraison partielle — facture ${r.number}. Le reste de la commande reste en cours.`);
      window.open(`/print/sales_docs/${r.id}`, '_blank');
      onClose(true);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal wide title={`Livrer la commande ${o.number}`} onClose={() => onClose(false)}
      footer={<><button className="btn" onClick={() => onClose(false)}>Annuler</button><button className="btn primary" disabled={busy || value <= 0} onClick={go}>{busy ? 'Enregistrement…' : partial ? 'Livrer cette partie et facturer' : 'Livrer et facturer'}</button></>}>
      {err && <div className="err">{err}</div>}
      <div className="note" style={{ marginBottom: 12 }}>La livraison crée la <b>facture</b> des quantités livrées, retire les produits du <b>stock</b>{o.advance > 0 ? <>, déduit l'<b>acompte</b></> : null} et enregistre l'argent reçu. Vous pouvez livrer une partie maintenant et le reste plus tard.</div>
      <table className="lines">
        <thead><tr><th>Produit</th><th className="r">Reste à livrer</th><th className="r">Prêt</th><th style={{ width: 110 }}>Livrer</th><th style={{ minWidth: 220 }}>Lot</th></tr></thead>
        <tbody>{o.lines.filter((l) => l.rest > 0).map((l) => {
          const ls = (lots || []).filter((x) => x.item_id === l.item_id).sort((a, b) => String(a.expiry_date || '9').localeCompare(String(b.expiry_date || '9')));
          const q = Number(qty[l.id]) || 0;
          return (
            <tr key={l.id}><td className="strong">{l.name || l.description}</td><td className="r">{num(l.rest)} {l.unit}</td>
              <td className={'r ' + (l.ready < l.rest ? 'neg' : 'pos')}>{num(l.ready)}</td>
              <td><input type="number" step="any" min="0" className="input" value={qty[l.id]} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} />{q > l.ready + 1e-9 && <div className="neg small">plus que le stock</div>}</td>
              <td>{l.item_id ? <select className="input" value={pick[l.id] || ''} onChange={(e) => setPick({ ...pick, [l.id]: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">Automatique (le plus ancien)</option>
                {ls.map((x) => <option key={x.id} value={x.id} disabled={Number(x.qty) < q}>Lot {x.lot_number} · {num(x.qty)} dispo{x.expiry_date ? ` · DLC ${date(x.expiry_date)}` : ''}</option>)}
              </select> : null}</td></tr>
          );
        })}</tbody>
      </table>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}><span className="muted">Montant de cette livraison</span><b>{money(value)}</b></div>
      {advanceUse > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Acompte déduit</span><b className="pos">− {money(advanceUse)}</b></div>}
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Reste à payer pour cette livraison</span><b>{money(toPay)}</b></div>
      <div className="form" style={{ marginTop: 14 }}>
        <div className="field"><label>Montant reçu maintenant</label><input type="number" className="input" value={d.paid ?? ''} placeholder={String(Math.round(toPay))} onChange={(e) => setD({ ...d, paid: e.target.value })} /><small className="muted">0 si le client paiera plus tard (suivi comme dette)</small></div>
        <div className="field"><label>Reçu sur</label><select className="input" value={acc} onChange={(e) => setD({ ...d, account_id: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="field"><label>Date de livraison</label><input type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
      </div>
    </Modal>
  );
}
