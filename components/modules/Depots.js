import { useState } from 'react';
import { api, op, money, num, date, datetime, today } from '../../lib/client';
import { useData, useRefOptions, Modal, Stat, toast, invalidateRefs, confirmDo } from '../ui';
import { waLink } from '../Chrome';
import { Ic } from './Dashboard';

// Produits confiés aux vendeuses / revendeurs : sortie le matin, retour et argent le soir.
export default function Depots({ canMoney = true }) {
  const { data, reload } = useData(() => api('app/depots'), []);
  const [modal, setModal] = useState(null);
  if (!data) return <div className="spinner">Chargement…</div>;
  const { open, done, debts } = data;
  const showMoney = data.money !== false;
  const refresh = () => { invalidateRefs('items'); invalidateRefs('lots'); invalidateRefs('accounts'); reload(); };
  const outValue = open.reduce((s, o) => s + o.value, 0);
  const debtTotal = debts.reduce((s, x) => s + Number(x.due), 0);
  return (
    <div>
      <div className="toolbar">
        <span className="muted small">Le matin : <b>Confier des produits</b> (ils sortent du stock). Le soir : <b>Retour du soir</b> — dites ce qui revient ; le logiciel calcule ce qui a été vendu{canMoney ? ' et ce que le vendeur doit' : ''}.</span>
        <div className="grow" />
        <button className="btn primary" onClick={() => setModal({ k: 'out' })}>+ Confier des produits</button>
      </div>
      <div className={'grid ' + (showMoney ? 'g3' : 'g2')} style={{ marginBottom: 16 }}>
        <Stat k="Chez les vendeurs" v={showMoney ? money(outValue) : `${num(open.reduce((s, o) => s + o.lines.reduce((a, l) => a + Number(l.qty_out), 0), 0))} articles`} s={`${open.length} dépôt(s) en cours`} />
        {showMoney && <Stat k="Argent attendu des vendeurs" v={money(debtTotal)} s={debts.length ? `${debts.length} vendeur(s) doivent encore` : 'personne ne doit rien'} accent={debtTotal > 0} />}
        <Stat k="Réglés récemment" v={num(done.length)} s="voir l'historique plus bas" />
      </div>

      {!open.length && <div className="card empty">Aucun produit chez les vendeurs en ce moment.</div>}
      <div className="grid g2">{open.map((o) => (
        <div key={o.id} className={'panel order' + (o.days > 1 ? ' late' : '')}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="row"><b>{o.seller}</b>{o.phone && <span className="muted small">· {o.phone}</span>}</span>
            <span className="muted small">{o.number} · {date(o.date)}{o.days > 0 ? ` (il y a ${o.days} j)` : ''}</span>
          </div>
          <table className="t order-l"><tbody>{o.lines.map((l) => (
            <tr key={l.id}><td>{l.name}</td><td className="r">{num(l.qty_out)} {l.unit}</td>{showMoney && <><td className="r small muted">{money(l.unit_price)}</td><td className="r mono">{money(l.qty_out * l.unit_price)}</td></>}</tr>
          ))}</tbody></table>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <span>{showMoney && <><span className="muted small">Valeur confiée </span><b>{money(o.value)}</b></>}</span>
            <span className="row">
              <button className="btn sm danger" onClick={() => confirmDo(`Annuler le dépôt ${o.number} ? Tous les produits reviennent en stock.`) && op('consign_cancel', { id: o.id }).then(() => { toast('Dépôt annulé, produits remis en stock'); refresh(); }).catch((e) => toast(e.message, 'error'))}>Annuler</button>
              <button className="btn sm primary" onClick={() => setModal({ k: 'settle', o })}>{canMoney ? 'Retour & argent' : 'Retour du soir'}</button>
            </span>
          </div>
        </div>
      ))}</div>

      {debts.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-h"><span className="panel-ic"><Ic n="wallet" s={16} /></span><h3>Ce que les vendeurs doivent encore</h3></div>
          {debts.map((x) => (
            <div key={x.id} className="watch">
              <span className="dot orange" /><span className="w-n">{x.name}<small>{x.phone || 'pas de téléphone'}</small></span>
              <b className="neg">{money(x.due)}</b>
              {x.phone && <a className="btn sm" href={waLink(x.phone, `Bonjour ${x.name}, petit rappel : il reste ${money(x.due)} à régler pour les produits confiés. Merci !`)} target="_blank" rel="noreferrer"><Ic n="whatsapp" s={14} /> Rappel</a>}
            </div>
          ))}
          <p className="muted small" style={{ margin: '8px 0 0' }}>Pour enregistrer un paiement : Ventes & Clients → Historique des ventes → la vente du vendeur → Encaisser.</p>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}><h3 style={{ margin: 0 }}>Historique des dépôts réglés</h3></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Dépôt</th><th>Vendeur</th><th>Confié le</th><th>Réglé le</th>{showMoney && <><th className="r">Vendu</th><th className="r">Payé</th><th className="r">Reste</th></>}<th className="r">Retours / pertes</th><th /></tr></thead>
          <tbody>{done.map((x) => (
            <tr key={x.id}><td className="strong">{x.number}</td><td>{x.seller}</td><td>{date(x.date)}</td><td className="small">{datetime(x.settled_at)}</td>
              {showMoney && <><td className="r">{money(x.total)}</td><td className="r">{money(x.paid)}</td><td className={'r' + (x.total - x.paid > 0.5 ? ' neg strong' : '')}>{money(x.total - x.paid)}</td></>}
              <td className="r small">{num(x.returned)} / {num(x.lost)}</td>
              <td className="actions">{showMoney && x.sale_id && <a className="btn sm" href={`/print/sales_docs/${x.sale_id}`} target="_blank" rel="noreferrer">Facture</a>}</td></tr>
          ))}</tbody>
        </table>{!done.length && <div className="empty">Aucun dépôt réglé pour le moment.</div>}</div>
      </div>

      {modal?.k === 'out' && <ConsignOut showMoney={showMoney} onClose={(ok) => { setModal(null); if (ok) refresh(); }} />}
      {modal?.k === 'settle' && <Settle o={modal.o} canMoney={canMoney && showMoney} onClose={(ok) => { setModal(null); if (ok) refresh(); }} />}
    </div>
  );
}

function ConsignOut({ onClose, showMoney = true }) {
  const customers = useRefOptions('customers', {});
  const products = useRefOptions('items', { active: true }).filter((i) => i.type === 'pf' || (i.type !== 'service' && Number(i.sale_price) > 0));
  const sellers = [...customers].sort((a, b) => (['vendeur', 'revendeur'].includes(b.type) ? 1 : 0) - (['vendeur', 'revendeur'].includes(a.type) ? 1 : 0));
  const [d, setD] = useState({ date: today(), tier: 'detail' });
  const [rows, setRows] = useState([{}]);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const price = (p) => (d.tier === 'gros' && Number(p.wholesale_price) > 0 ? Number(p.wholesale_price) : Number(p.sale_price));
  const setRow = (i, x) => setRows((r) => r.map((y, j) => (j === i ? { ...y, ...x } : y)));
  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0);
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await op('consign_out', { customer_id: isNew ? null : d.customer_id, new_customer: isNew ? { name: d.name, phone: d.phone } : null, date: d.date, tier: d.tier, notes: d.notes,
        lines: rows.filter((x) => x.item_id && Number(x.qty) > 0) });
      toast(`Dépôt ${r.number} enregistré — produits sortis du stock`);
      if (isNew) invalidateRefs('customers');
      onClose(true);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal wide title="Confier des produits à un vendeur" onClose={() => onClose(false)}
      footer={<><button className="btn" onClick={() => onClose(false)}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>Confier et sortir du stock</button></>}>
      {err && <div className="err">{err}</div>}
      <div className="form">
        {!isNew ? (
          <div className="field"><label>Vendeur / revendeur <button type="button" className="link-btn" onClick={() => setIsNew(true)}>+ nouveau</button></label>
            <select className="input" value={d.customer_id || ''} onChange={(e) => setD({ ...d, customer_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">— Choisir —</option>{sellers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select></div>
        ) : (<>
          <div className="field"><label>Nom du vendeur <button type="button" className="link-btn" onClick={() => setIsNew(false)}>choisir dans la liste</button></label><input className="input" value={d.name || ''} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
          <div className="field"><label>Téléphone</label><input className="input" value={d.phone || ''} onChange={(e) => setD({ ...d, phone: e.target.value })} /></div>
        </>)}
        {showMoney && <div className="field"><label>Prix appliqué</label><select className="input" value={d.tier} onChange={(e) => { const tier = e.target.value; setD({ ...d, tier }); setRows((r) => r.map((x) => { const p = products.find((y) => y.id === x.item_id); return p ? { ...x, unit_price: tier === 'gros' && Number(p.wholesale_price) > 0 ? p.wholesale_price : p.sale_price } : x; })); }}>
          <option value="detail">Prix de détail</option><option value="gros">Prix de gros (revendeur)</option></select></div>}
        <div className="field"><label>Date</label><input type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
      </div>
      <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>Produits confiés</h3>
      <div className="table-wrap"><table className="lines">
        <thead><tr><th style={{ minWidth: 240 }}>Produit</th><th>En stock</th><th style={{ width: 120 }}>Quantité</th>{showMoney && <><th style={{ width: 130 }}>Prix unitaire</th><th className="r">Valeur</th></>}<th /></tr></thead>
        <tbody>{rows.map((r, i) => {
          const p = products.find((x) => x.id === r.item_id);
          const short = p && Number(r.qty) > Number(p.stock);
          return (
            <tr key={i}>
              <td><select className="input" value={r.item_id || ''} onChange={(e) => { const it = products.find((x) => x.id === Number(e.target.value)); setRow(i, { item_id: it ? it.id : '', unit_price: it ? price(it) : '' }); }}>
                <option value="">— Choisir —</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
              <td className={'small ' + (p && Number(p.stock) <= 0 ? 'neg' : 'muted')}>{p ? `${num(p.stock)} ${p.unit || ''}` : ''}</td>
              <td><input type="number" step="any" className="input" value={r.qty || ''} onChange={(e) => setRow(i, { qty: e.target.value })} disabled={!p} />{short && <div className="neg small strong">Stock insuffisant</div>}</td>
              {showMoney && <><td><input type="number" step="any" className="input" value={r.unit_price ?? ''} onChange={(e) => setRow(i, { unit_price: e.target.value })} disabled={!p} /></td>
              <td className="r mono">{Number(r.qty) > 0 ? money(Number(r.qty) * Number(r.unit_price || 0)) : ''}</td></>}
              <td>{rows.length > 1 && <button className="btn sm ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          );
        })}</tbody>
        {total > 0 && showMoney && <tfoot><tr><td colSpan={4} className="strong">Valeur confiée</td><td className="r mono strong">{money(total)}</td><td /></tr></tfoot>}
      </table></div>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setRows([...rows, {}])}>+ Ajouter un produit</button>
    </Modal>
  );
}

function Settle({ o, onClose, canMoney = true }) {
  const accounts = useRefOptions('accounts', { active: true });
  const [v, setV] = useState(Object.fromEntries(o.lines.map((l) => [l.id, { returned: '', lost: '', kept: '' }])));
  const [d, setD] = useState({ date: today() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const calc = o.lines.map((l) => {
    const r = Number(v[l.id].returned) || 0, p = Number(v[l.id].lost) || 0, k = Number(v[l.id].kept) || 0;
    const sold = Math.round((Number(l.qty_out) - r - p - k) * 1000) / 1000;
    return { l, r, p, k, sold, amount: sold * Number(l.unit_price), bad: sold < 0 };
  });
  const due = calc.reduce((s, c) => s + Math.max(c.amount, 0), 0);
  const paid = !canMoney ? 0 : d.paid === undefined || d.paid === '' ? due : Number(d.paid);
  const acc = d.account_id || accounts[0]?.id || '';
  const kept = calc.filter((c) => c.k > 0);
  const setAll = (field) => setV(Object.fromEntries(o.lines.map((l) => [l.id, { returned: field === 'returned' ? String(Number(l.qty_out)) : '', lost: '', kept: field === 'kept' ? String(Number(l.qty_out)) : '' }])));
  const setOne = (id, field, val) => setV({ ...v, [id]: { ...v[id], [field]: val } });
  const go = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await op('consign_settle', { id: o.id, date: d.date, account_id: acc, paid, lines: calc.map((c) => ({ id: c.l.id, returned: c.r, lost: c.p, kept: c.k })) });
      toast((r.sale_number ? `Retour enregistré — ventes ${r.sale_number}` : 'Retour enregistré — rien de vendu') + (r.next_number ? ` · reste gardé : dépôt ${r.next_number}` : ''));
      onClose(true);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal wide title={`Retour du soir — ${o.seller}`} onClose={() => onClose(false)}
      footer={<><button className="btn" onClick={() => onClose(false)}>Annuler</button><button className="btn primary" disabled={busy || calc.some((c) => c.bad)} onClick={go}>{busy ? 'Enregistrement…' : 'Valider le retour'}</button></>}>
      {err && <div className="err">{err}</div>}
      <div className="note" style={{ marginBottom: 10 }}>Pour chaque produit, notez ce que le vendeur <b>rapporte</b> (revient dans le stock), ce qu'il <b>garde pour demain</b> et ce qui est <b>perdu / abîmé</b>. Tout le reste compte comme <b>vendu</b>.</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="muted small">Raccourcis :</span>
        <button className="btn sm" onClick={() => setAll('sold')}>✅ Il a tout vendu</button>
        <button className="btn sm" onClick={() => setAll('returned')}>↩️ Il a tout rapporté</button>
        <button className="btn sm" onClick={() => setAll('kept')}>🕗 Il garde tout pour demain</button>
      </div>
      <div className="table-wrap"><table className="lines settle-t">
        <thead><tr><th>Produit</th><th className="r">Confié</th><th style={{ width: 110 }}>Rapporté</th><th style={{ width: 110 }}>Gardé pour demain</th><th style={{ width: 110 }}>Perdu / abîmé</th><th className="r">Vendu</th>{canMoney && <th className="r">À payer</th>}</tr></thead>
        <tbody>{calc.map((c) => (
          <tr key={c.l.id}><td className="strong">{c.l.name}</td><td className="r">{num(c.l.qty_out)}</td>
            {['returned', 'kept', 'lost'].map((f) => <td key={f}><input type="number" step="any" min="0" className="input" placeholder="0" value={v[c.l.id][f]} onChange={(e) => setOne(c.l.id, f, e.target.value)} /></td>)}
            <td className={'r strong ' + (c.bad ? 'neg' : 'pos')}>{c.bad ? 'trop' : num(c.sold)}</td>
            {canMoney && <td className="r mono">{money(Math.max(c.amount, 0))}</td>}</tr>
        ))}</tbody>
        {canMoney && <tfoot><tr><td colSpan={6} className="strong">Total des ventes du vendeur</td><td className="r mono strong">{money(due)}</td></tr></tfoot>}
      </table></div>
      <div className="settle-sum">
        <span>Vendu : <b>{num(calc.reduce((s, c) => s + Math.max(c.sold, 0), 0))}</b> · {money(due)}</span>
        <span>Revient en stock : <b>{num(calc.reduce((s, c) => s + c.r, 0))}</b></span>
        {kept.length > 0 && <span>Gardé pour demain : <b>{num(kept.reduce((s, c) => s + c.k, 0))}</b> (nouveau dépôt créé)</span>}
        {calc.some((c) => c.p > 0) && <span className="neg">Perdu : <b>{num(calc.reduce((s, c) => s + c.p, 0))}</b></span>}
      </div>
      <div className="form" style={{ marginTop: 14 }}>
        {canMoney && <div className="field"><label>Argent remis par le vendeur</label><input type="number" className="input" value={d.paid ?? ''} placeholder={String(Math.round(due))} onChange={(e) => setD({ ...d, paid: e.target.value })} /></div>}
        {canMoney && <div className="field"><label>Mis dans</label><select className="input" value={acc} onChange={(e) => setD({ ...d, account_id: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
        <div className="field"><label>Date</label><input type="date" className="input" value={d.date} max={today()} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
      </div>
      {!canMoney && due > 0 && <div className="note" style={{ marginTop: 10 }}>Le vendeur doit <b>{money(due)}</b> pour ce qu'il a vendu. L'argent sera encaissé par la caisse (Ventes → Historique des ventes).</div>}
      {canMoney && paid < due - 0.5 && <div className="note" style={{ marginTop: 10 }}>Le vendeur doit encore <b>{money(due - paid)}</b>. Ce montant est suivi dans « Ce que les vendeurs doivent encore ».</div>}
      {canMoney && paid > due + 0.5 && <div className="err" style={{ marginTop: 10 }}>Le montant remis dépasse le total des ventes.</div>}
    </Modal>
  );
}
