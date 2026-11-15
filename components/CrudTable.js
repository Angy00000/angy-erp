import { useState, useMemo } from 'react';
import { crud, exportCSV, money, num, monthStart, today } from '../lib/client';
import { useData, Modal, Form, Cell, run, toast, invalidateRefs, RefSelect, confirmDo, useRefOptions } from './ui';

export default function CrudTable({
  entity, title, columns, fields, defaults, filters = [], dateRange, params: fixedParams, rowActions, toolbar,
  canEdit = () => true, canDelete = () => true, canCreate = true, lines, csvName, sums = [], onSaved, newLabel, empty,
  initialRange,
}) {
  const [search, setSearch] = useState('');
  const [f, setF] = useState({});
  const [range, setRange] = useState(dateRange ? initialRange || { from: monthStart(), to: today() } : {});
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const params = { ...fixedParams, ...f, ...range, search };
  const { data, loading, error, reload } = useData(() => crud.list(entity, params), [entity, JSON.stringify(params)]);
  const rows = data || [];

  const open = async (row) => {
    setErr(null);
    if (row) {
      const full = lines ? await run(() => crud.get(entity, row.id)) : row;
      setEdit({ ...full, lines: full.lines ? full.lines.map((l) => ({ ...l })) : [] });
    } else {
      const d = typeof defaults === 'function' ? defaults() : { ...(defaults || {}) };
      setEdit({ ...d, lines: lines ? [{}] : undefined });
    }
  };
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      for (const fl of fields) if (fl.req && (edit[fl.k] === undefined || edit[fl.k] === null || edit[fl.k] === '') && (!fl.show || fl.show(edit))) throw new Error(`Champ requis : ${fl.l}`);
      const body = { ...edit };
      if (lines) body.lines = (edit.lines || []).filter((l) => l.item_id || l.description);
      const saved = edit.id ? await crud.update(entity, edit.id, body) : await crud.create(entity, body);
      invalidateRefs(entity);
      toast(edit.id ? 'Modifications enregistrées' : 'Créé avec succès');
      setEdit(null);
      reload();
      onSaved && onSaved(saved);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  const del = async (row) => {
    if (!confirmDo('Supprimer définitivement cet élément ?')) return;
    await run(() => crud.remove(entity, row.id), 'Supprimé');
    invalidateRefs(entity);
    reload();
  };

  const totals = useMemo(() => Object.fromEntries(sums.map((k) => [k, rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)])), [rows, sums]);

  return (
    <div>
      <div className="toolbar">
        <input className="input sm" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        {filters.map((fl) => <FilterSelect key={fl.k} fl={fl} value={f[fl.k] ?? ''} onChange={(v) => setF((x) => ({ ...x, [fl.k]: v }))} />)}
        {dateRange && <>
          <input type="date" className="input sm" value={range.from || ''} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <input type="date" className="input sm" value={range.to || ''} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </>}
        <div className="grow" />
        {toolbar && toolbar(reload, rows)}
        <button className="btn" onClick={() => exportCSV(csvName || entity, columns.filter((c) => c.l), rows)}>⇩ CSV</button>
        {canCreate && fields && <button className="btn primary" onClick={() => open(null)}>+ {newLabel || 'Nouveau'}</button>}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="t">
            <thead><tr>{columns.map((c) => <th key={c.k + c.l} className={c.t === 'money' || c.t === 'qty' || c.r ? 'r' : ''}>{c.l}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => <td key={c.k + c.l} className={c.t === 'money' || c.t === 'qty' || c.r ? 'r' : ''}><Cell c={c} row={row} /></td>)}
                  <td className="actions">
                    {rowActions && rowActions(row, reload)}
                    {fields && canEdit(row) && <button className="btn sm" onClick={() => open(row)}>Modifier</button>}
                    {fields && canDelete(row) && <button className="btn sm danger" onClick={() => del(row)}>✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
            {sums.length > 0 && rows.length > 0 && (
              <tfoot><tr>{columns.map((c, i) => <td key={c.k + c.l} className={sums.includes(c.k) ? 'r' : ''}>{i === 0 ? 'Total' : sums.includes(c.k) ? (c.t === 'money' ? money(totals[c.k]) : num(totals[c.k])) : ''}</td>)}<td /></tr></tfoot>
            )}
          </table>
          {loading && !data && <div className="spinner">Chargement…</div>}
          {error && <div className="err" style={{ margin: 12 }}>{error}</div>}
          {!loading && !rows.length && <div className="empty">{empty || 'Aucun élément pour le moment'}</div>}
        </div>
      </div>

      {edit && (
        <Modal title={(edit.id ? 'Modifier' : 'Nouveau') + ' — ' + title} onClose={() => setEdit(null)} wide={!!lines}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Annuler</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button></>}>
          {err && <div className="err">{err}</div>}
          <Form fields={fields} data={edit} setData={setEdit} />
          {lines && <LinesEditor cfg={lines} value={edit.lines || []} onChange={(l) => setEdit((e) => ({ ...e, lines: l }))} doc={edit} />}
        </Modal>
      )}
    </div>
  );
}

function FilterSelect({ fl, value, onChange }) {
  if (fl.ref) {
    return <div style={{ minWidth: 170 }}><RefSelect f={{ ...fl, placeholder: fl.l }} value={value} onChange={(v) => onChange(v)} /></div>;
  }
  return (
    <select className="input sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{fl.l} : tous</option>
      {fl.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function LinesEditor({ cfg, value, onChange, doc }) {
  const items = useRefOptions('items', cfg.itemParams || { active: true });
  const set = (i, patch) => onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const lineTotal = (l) => (Number(l.qty) || 0) * (Number(l[cfg.priceKey || 'unit_price']) || 0) - (Number(l.discount) || 0);
  const total = value.reduce((s, l) => s + lineTotal(l), 0);
  return (
    <div style={{ marginTop: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 14 }}>{cfg.title || 'Lignes'}</h3>
        <button className="btn sm" onClick={() => onChange([...value, {}])}>+ Ajouter une ligne</button>
      </div>
      <div className="table-wrap">
        <table className="lines">
          <thead><tr><th style={{ minWidth: 220 }}>Article</th>{cfg.fields.map((f) => <th key={f.k}>{f.l}</th>)}{cfg.showTotal !== false && <th className="r">Total</th>}<th /></tr></thead>
          <tbody>
            {value.map((l, i) => {
              const it = items.find((x) => x.id === Number(l.item_id));
              return (
                <tr key={i}>
                  <td>
                    <select className="input" value={l.item_id ?? ''} onChange={(e) => {
                      const item = items.find((x) => x.id === Number(e.target.value));
                      set(i, { item_id: e.target.value ? Number(e.target.value) : '', ...(item && cfg.onItem ? cfg.onItem(item, doc) : {}) });
                    }}>
                      <option value="">— Article —</option>
                      {items.map((x) => <option key={x.id} value={x.id}>{x.name}{x.type !== 'service' ? ` (stock ${num(x.stock)} ${x.unit || ''})` : ''}</option>)}
                    </select>
                  </td>
                  {cfg.fields.map((f) => (
                    <td key={f.k} style={{ width: f.w || 110 }}>
                      <input className="input" type={f.t === 'text' ? 'text' : 'number'} step="any" value={l[f.k] ?? ''} onChange={(e) => set(i, { [f.k]: e.target.value })} placeholder={f.k === 'qty' && it ? it.unit : ''} />
                    </td>
                  ))}
                  {cfg.showTotal !== false && <td className="r mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(lineTotal(l))}</td>}
                  <td><button className="btn sm ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cfg.showTotal !== false && <div style={{ textAlign: 'right', marginTop: 10, fontWeight: 800 }}>Sous-total : <span className="mono">{money(total)}</span></div>}
    </div>
  );
}
