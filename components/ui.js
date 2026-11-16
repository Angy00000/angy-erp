import { useEffect, useState, useCallback, useRef } from 'react';
import { crud, TONE, LABELS, money, num } from '../lib/client';

// ---------- Toasts ----------
let pushToast = () => {};
export function toast(msg, kind = 'ok') { pushToast({ msg, kind, id: Math.random() }); }
export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    pushToast = (t) => {
      setList((l) => [...l, t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), t.kind === 'error' ? 6000 : 3000);
    };
  }, []);
  return <div className="toasts">{list.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>;
}

// Confirmation + action avec gestion d'erreur
export async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}

// ---------- Data hook ----------
export function useData(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef(loader);
  ref.current = loader;
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await ref.current()); setError(null); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, error, loading, reload, setData };
}

// ---------- Ref options cache ----------
const refCache = new Map();
export function invalidateRefs(entity) {
  for (const k of [...refCache.keys()]) if (!entity || k.startsWith(entity + '|')) refCache.delete(k);
}
export function useRefOptions(entity, params) {
  const key = entity + '|' + JSON.stringify(params || {});
  const [rows, setRows] = useState(refCache.get(key)?.rows || []);
  useEffect(() => {
    let alive = true;
    if (!entity) return;
    const c = refCache.get(key);
    if (c && Date.now() - c.at < 30000) { setRows(c.rows); return; }
    crud.list(entity, params).then((r) => { refCache.set(key, { rows: r, at: Date.now() }); if (alive) setRows(r); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rows;
}

// ---------- Primitives ----------
export function Badge({ v, map, children }) {
  const label = children ?? (map && LABELS[map] ? LABELS[map][v] || v : v);
  if (!label && label !== 0) return null;
  return <span className={'badge ' + (TONE[v] || 'gray')}>{label}</span>;
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="modal-head"><h2>{title}</h2><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

export function Stat({ k, v, s, accent }) {
  return <div className={'card stat' + (accent ? ' accent' : '')}><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>;
}

export function Bars({ data, valueKey = 'total', labelKey = 'day', fmt = money }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div key={i} className="b" style={{ height: `${((Number(d[valueKey]) || 0) / max) * 100}%` }}>
          <span>{d[labelKey]} · {fmt(d[valueKey])}</span>
        </div>
      ))}
    </div>
  );
}

export function HBars({ data, valueKey = 'total', labelKey = 'name', fmt = money }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  if (!data.length) return <div className="muted small">Aucune donnée</div>;
  return data.map((d, i) => (
    <div key={i} className="hbar">
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d[labelKey]}</div>
      <div className="track"><div className="fill" style={{ width: `${((Number(d[valueKey]) || 0) / max) * 100}%` }} /></div>
      <div className="mono small">{fmt(d[valueKey])}</div>
    </div>
  ));
}

// ---------- Field ----------
export function Field({ f, value, onChange, data }) {
  const id = 'f_' + f.k;
  const set = (v) => onChange(f.k, v);
  let input;
  if (f.t === 'select') {
    input = (
      <select id={id} className="input" value={value ?? ''} onChange={(e) => set(e.target.value)}>
        {!f.req && <option value="">—</option>}
        {(typeof f.opts === 'function' ? f.opts(data) : f.opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  } else if (f.t === 'ref') {
    input = <RefSelect id={id} f={f} value={value} onChange={set} data={data} />;
  } else if (f.t === 'textarea') {
    input = <textarea id={id} className="input" value={value ?? ''} onChange={(e) => set(e.target.value)} />;
  } else if (f.t === 'bool') {
    return (
      <div className={'field check' + (f.full ? ' full' : '')}>
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />
        <label htmlFor={id} style={{ margin: 0 }}>{f.l}</label>
      </div>
    );
  } else {
    input = (
      <input id={id} className="input" type={f.t === 'number' ? 'number' : f.t === 'date' ? 'date' : f.t === 'password' ? 'password' : f.t === 'email' ? 'email' : f.t === 'month' ? 'month' : 'text'}
        step={f.t === 'number' ? f.step || 'any' : undefined} value={value ?? ''} placeholder={f.ph}
        onChange={(e) => set(e.target.value)} />
    );
  }
  return (
    <div className={'field' + (f.full ? ' full' : '')}>
      <label htmlFor={id}>{f.l}{f.req && <span className="req"> *</span>}</label>
      {input}
      {f.help && <div className="muted small" style={{ marginTop: 4 }}>{f.help}</div>}
    </div>
  );
}

export function RefSelect({ id, f, value, onChange, data }) {
  const params = typeof f.params === 'function' ? f.params(data || {}) : f.params;
  const base = useRefOptions(f.ref, params);
  const [extra, setExtra] = useState(null);
  const rows = extra && !base.some((r) => r.id === extra.id) ? [...base, extra] : base;
  const label = f.label || ((r) => r.name || r.number || r.lot_number || r.id);
  const [adding, setAdding] = useState(false);
  const [nv, setNv] = useState({});
  const [busy, setBusy] = useState(false);
  // Création rapide (ex. nouveau fournisseur) sans quitter le formulaire
  const create = async () => {
    if (!nv.name?.trim()) return toast('Indiquez le nom', 'error');
    setBusy(true);
    try {
      const r = await crud.create(f.ref, { name: nv.name.trim(), phone: nv.phone || null });
      setExtra(r); invalidateRefs(f.ref); onChange(r.id, r); setAdding(false); setNv({}); toast(`${f.quickCreate.label[0].toUpperCase() + f.quickCreate.label.slice(1)} ajouté`);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <>
      <select id={id} className="input" value={value ?? ''} onChange={(e) => { if (e.target.value === '__new') { setAdding(true); return; } onChange(e.target.value ? Number(e.target.value) : '', rows.find((r) => r.id === Number(e.target.value))); }}>
        <option value="">{f.placeholder || '— Choisir —'}</option>
        {rows.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        {f.quickCreate && <option value="__new">+ Nouveau {f.quickCreate.label}…</option>}
      </select>
      {adding && (
        <div className="quick-new">
          <input className="input" autoFocus placeholder={`Nom du ${f.quickCreate.label}`} value={nv.name || ''} onChange={(e) => setNv({ ...nv, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} />
          {f.quickCreate.fields?.includes('phone') && <input className="input" placeholder="Téléphone" value={nv.phone || ''} onChange={(e) => setNv({ ...nv, phone: e.target.value })} />}
          <button type="button" className="btn sm primary" disabled={busy} onClick={create}>Ajouter</button>
          <button type="button" className="btn sm ghost" onClick={() => { setAdding(false); setNv({}); }}>✕</button>
        </div>
      )}
    </>
  );
}

export function Form({ fields, data, setData }) {
  const onChange = (k, v) => setData((d) => ({ ...d, [k]: v }));
  return (
    <div className="form">
      {fields.filter((f) => !f.show || f.show(data)).map((f) => <Field key={f.k} f={f} value={data[f.k]} onChange={onChange} data={data} />)}
    </div>
  );
}

export function Cell({ c, row }) {
  if (c.fmt) return c.fmt(row);
  const v = row[c.k];
  if (c.t === 'money') return money(v);
  if (c.t === 'qty') return num(v);
  if (c.t === 'badge') return <Badge v={v} map={c.map} />;
  if (c.t === 'bool') return v ? '✓' : '—';
  if (c.t === 'date') return v ? new Date(String(v).length === 10 ? v + 'T00:00:00' : v).toLocaleDateString('fr-FR') : '';
  if (c.map) return LABELS[c.map]?.[v] || v;
  return v ?? '';
}

export function confirmDo(msg) { return typeof window !== 'undefined' && window.confirm(msg); }
