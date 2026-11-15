import { useState } from 'react';
import { Modal, Form, toast } from './ui';

// Petit formulaire modal générique pour les opérations métier
export default function ActionModal({ title, fields, initial, onSubmit, onClose, submitLabel = 'Valider', children, wide }) {
  const [data, setData] = useState(initial || {});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null);
    for (const f of fields || []) if (f.req && (data[f.k] === undefined || data[f.k] === '' || data[f.k] === null) && (!f.show || f.show(data))) return setErr(`Champ requis : ${f.l}`);
    setBusy(true);
    try {
      const r = await onSubmit(data);
      if (r !== false) { toast('Opération enregistrée'); onClose(true); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} onClose={() => onClose(false)} wide={wide}
      footer={<><button className="btn" onClick={() => onClose(false)}>Annuler</button><button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'En cours…' : submitLabel}</button></>}>
      {err && <div className="err">{err}</div>}
      {typeof children === 'function' ? children(data, setData) : children}
      {fields && <Form fields={fields} data={data} setData={setData} />}
    </Modal>
  );
}
