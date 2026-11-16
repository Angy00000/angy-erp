import { useState } from 'react';
import { api, op, money, date, today, LABELS } from '../../lib/client';
import { useData, useRefOptions, Modal, Stat, toast, invalidateRefs } from '../ui';
import { waLink } from '../Chrome';
import { Ic } from './Dashboard';

// Clients (et vendeurs) qui doivent encore de l'argent : rappel WhatsApp et encaissement en un clic.
export default function Dettes({ company }) {
  const { data, reload } = useData(() => api('app/debts'), []);
  const [pay, setPay] = useState(null);
  const [open, setOpen] = useState({});
  if (!data) return <div className="spinner">Chargement…</div>;
  const total = data.reduce((s, x) => s + Number(x.due), 0);
  const late = data.filter((x) => x.days > 30);
  const msg = (x) => `Bonjour ${x.name}, ici ${company?.name || 'nous'}. Petit rappel amical : il reste ${money(x.due)} à régler sur ${x.invoices > 1 ? `${x.invoices} factures` : 'votre facture'} (depuis le ${date(x.oldest)}). Vous pouvez payer par Wave, Orange Money ou en espèces. Merci beaucoup !`;
  return (
    <div>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Stat k="Total à encaisser" v={money(total)} s={`${data.length} client(s) doivent de l'argent`} accent={total > 0} />
        <Stat k="Depuis plus de 30 jours" v={money(late.reduce((s, x) => s + Number(x.due), 0))} s={`${late.length} client(s) à relancer en priorité`} />
        <Stat k="Plus grosse dette" v={data[0] ? money(data[0].due) : '—'} s={data[0]?.name || 'aucune'} />
      </div>
      {!data.length && <div className="card empty">Personne ne doit d'argent. 👏</div>}
      {data.length > 0 && (
        <div className="card"><div className="table-wrap"><table className="t">
          <thead><tr><th>Client</th><th>Type</th><th className="r">Factures</th><th>Depuis</th><th className="r">Doit</th><th /></tr></thead>
          <tbody>{data.map((x) => [
            <tr key={x.id}>
              <td><b>{x.name}</b><br /><span className="muted small">{x.phone || 'pas de téléphone'}</span></td>
              <td className="small">{LABELS.customer_type[x.type] || '—'}</td>
              <td className="r"><button className="link-btn" onClick={() => setOpen({ ...open, [x.id]: !open[x.id] })}>{x.invoices} {open[x.id] ? '▲' : '▼'}</button></td>
              <td className={x.days > 30 ? 'neg strong' : ''}>{date(x.oldest)}<br /><span className="small">{x.days > 0 ? `il y a ${x.days} j` : 'aujourd\'hui'}</span></td>
              <td className="r neg strong">{money(x.due)}</td>
              <td className="actions">
                {x.phone && <a className="btn sm" href={waLink(x.phone, msg(x))} target="_blank" rel="noreferrer"><Ic n="whatsapp" s={14} /> Rappel</a>}
                <button className="btn sm primary" onClick={() => setPay(x)}>Encaisser</button>
              </td>
            </tr>,
            open[x.id] && <tr key={x.id + 'l'} className="sub-row"><td colSpan={6}>
              {x.list.map((f) => <div key={f.id} className="row small" style={{ justifyContent: 'space-between', padding: '3px 0' }}>
                <span><a href={`/print/sales_docs/${f.id}`} target="_blank" rel="noreferrer"><b>{f.number}</b></a> du {date(f.date)}</span>
                <span>total {money(f.total)} · payé {money(f.paid)} · <b className="neg">reste {money(f.total - f.paid)}</b></span></div>)}
            </td></tr>,
          ])}</tbody>
        </table></div></div>
      )}
      {pay && <PayDebt x={pay} onClose={(ok) => { setPay(null); if (ok) { invalidateRefs('accounts'); reload(); } }} />}
    </div>
  );
}

function PayDebt({ x, onClose }) {
  const accounts = useRefOptions('accounts', { active: true });
  const [d, setD] = useState({ amount: String(Math.round(Number(x.due))), date: today() });
  const [busy, setBusy] = useState(false);
  const acc = d.account_id || accounts[0]?.id || '';
  const go = async () => {
    setBusy(true);
    try {
      const r = await op('customer_pay', { customer_id: x.id, amount: Number(d.amount), account_id: acc, date: d.date, reference: d.reference });
      toast(r.rest > 0.5 ? `Paiement enregistré — il reste ${money(r.rest)}` : 'Paiement enregistré — tout est réglé');
      onClose(true);
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return (
    <Modal title={`Encaisser — ${x.name}`} onClose={() => onClose(false)}
      footer={<><button className="btn" onClick={() => onClose(false)}>Annuler</button><button className="btn primary" disabled={busy || !(Number(d.amount) > 0)} onClick={go}>Enregistrer le paiement</button></>}>
      <div className="note" style={{ marginBottom: 12 }}>Le client doit <b>{money(x.due)}</b>. Le paiement est appliqué aux factures <b>les plus anciennes d'abord</b>.</div>
      <div className="form">
        <div className="field"><label>Montant reçu</label><input type="number" className="input" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} autoFocus /></div>
        <div className="field"><label>Reçu sur</label><select className="input" value={acc} onChange={(e) => setD({ ...d, account_id: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="field"><label>Date</label><input type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
        <div className="field"><label>Référence (n° Wave / OM…)</label><input className="input" value={d.reference || ''} onChange={(e) => setD({ ...d, reference: e.target.value })} /></div>
      </div>
    </Modal>
  );
}
