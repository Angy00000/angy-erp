import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { api, crud, money, num, date, setCurrency } from '../lib/client';

// Étiquettes à coller sur les sachets / bouteilles : logo, produit, contenance, lot, dates, code-barres.
const FORMATS = {
  petit: { l: 'Petites — 24 par page (70 × 37 mm)', cols: 3, rows: 8, w: 70, h: 37 },
  moyen: { l: 'Moyennes — 14 par page (105 × 42 mm)', cols: 2, rows: 7, w: 105, h: 42 },
  grand: { l: 'Grandes — 8 par page (105 × 74 mm)', cols: 2, rows: 4, w: 105, h: 74 },
};

function Barcode({ value }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!value || !ref.current) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try { JsBarcode(ref.current, value, { format: /^\d{13}$/.test(value) ? 'EAN13' : 'CODE128', height: 26, width: 1.2, fontSize: 9, margin: 0, displayValue: true }); } catch { /* code invalide : on n'affiche rien */ }
    });
  }, [value]);
  return value ? <svg ref={ref} className="lb-bc" /> : null;
}

export default function Etiquettes() {
  const router = useRouter();
  const [ctx, setCtx] = useState(null);
  const [err, setErr] = useState(null);
  const [lotId, setLotId] = useState('');
  const [o, setO] = useState({ format: 'petit', count: 24, conservation: 'À conserver au frais (0 à 4 °C). Bien agiter avant de servir.', price: false, ingredients: '' });
  const set = (k) => (e) => setO((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    if (!router.isReady) return;
    (async () => {
      try {
        const me = await api('auth/me');
        setCurrency(me.company?.currency);
        const lots = (await crud.list('lots', { instock: true, limit: 1000 })).filter((l) => l.item_type === 'pf');
        setCtx({ c: me.company, lots });
        const q = router.query.lot ? Number(router.query.lot) : lots[0]?.id;
        if (q) setLotId(String(q));
      } catch (e) { setErr(e.status === 401 ? 'Connectez-vous d\'abord à ERP.' : e.message); }
    })();
  }, [router.isReady, router.query.lot]);

  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!lotId) { setInfo(null); return; }
    (async () => {
      const lot = await crud.get('lots', lotId);
      const item = await crud.get('items', lot.item_id);
      let ingredients = '';
      try {
        const rs = await crud.list('recipes', { product_id: item.id, active: true });
        if (rs[0]) {
          const r = await crud.get('recipes', rs[0].id);
          ingredients = (r.lines || []).filter((l) => !/sachet|bouteille|bouchon|étiquette|etiquette|emballage|carton|pot/i.test(l.item_name)).map((l) => l.item_name).join(', ');
        }
      } catch { /* pas d'accès aux recettes */ }
      setInfo({ lot, item });
      setO((x) => ({ ...x, ingredients }));
    })().catch((e) => setErr(e.message));
  }, [lotId]);

  if (err) return <div className="print-msg">{err}</div>;
  if (!ctx) return <div className="print-msg">Chargement…</div>;
  const f = FORMATS[o.format];
  const perPage = f.cols * f.rows;
  const count = Math.max(1, Math.min(500, Number(o.count) || 1));
  const pages = Math.ceil(count / perPage);
  const c = ctx.c;
  const vol = info && Number(info.item.unit_volume) ? (Number(info.item.unit_volume) < 1 ? `${num(Number(info.item.unit_volume) * 100)} cl` : `${num(info.item.unit_volume)} L`) : '';
  const code = info ? (info.item.barcode || info.lot.lot_number) : '';
  const Label = () => (
    <div className={'lb ' + o.format} style={{ width: `${f.w}mm`, height: `${f.h}mm` }}>
      <div className="lb-top">
        {c.logo && <img src={c.logo} alt="" />}
        <div className="lb-co"><b>{c.name}</b>{c.phone && <span>{c.phone}</span>}</div>
        {o.price && Number(info.item.sale_price) > 0 && <div className="lb-pr">{money(info.item.sale_price)}</div>}
      </div>
      <div className="lb-name">{info.item.name}{vol && !info.item.name.includes(vol) ? <span> · {vol}</span> : null}</div>
      {o.format !== 'petit' && o.ingredients && <div className="lb-ing"><b>Ingrédients :</b> {o.ingredients}</div>}
      <div className="lb-dates">
        <span>Lot <b>{info.lot.lot_number}</b></span>
        {info.lot.production_date && <span>Fab. <b>{date(info.lot.production_date)}</b></span>}
        {info.lot.expiry_date && <span>À consommer avant <b>{date(info.lot.expiry_date)}</b></span>}
      </div>
      {o.format !== 'petit' && o.conservation && <div className="lb-cons">{o.conservation}</div>}
      <Barcode value={code} />
    </div>
  );
  return (
    <div className="imp-page">
      <Head><title>{`Étiquettes — ${c.name}`}</title></Head>
      <style>{'@page { size: A4 portrait; margin: 0; }'}</style>
      <div className="imp-bar no-print lb-bar">
        <button className="btn" onClick={() => window.close()}>← Fermer</button>
        <select className="input sm" value={lotId} onChange={(e) => setLotId(e.target.value)} style={{ maxWidth: 320 }}>
          {!ctx.lots.length && <option value="">Aucun produit fini en stock</option>}
          {ctx.lots.map((l) => <option key={l.id} value={l.id}>{l.item_name} — lot {l.lot_number}{l.expiry_date ? ` (DLC ${date(l.expiry_date)})` : ''}</option>)}
        </select>
        <select className="input sm" value={o.format} onChange={(e) => setO({ ...o, format: e.target.value, count: FORMATS[e.target.value].cols * FORMATS[e.target.value].rows })}>
          {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
        </select>
        <label className="row small">Nombre <input className="input sm" type="number" min={1} max={500} value={o.count} onChange={set('count')} style={{ width: 80 }} /></label>
        <label className="row small"><input type="checkbox" checked={o.price} onChange={set('price')} /> Prix</label>
        <span className="grow" />
        <button className="btn primary" disabled={!info} onClick={() => window.print()}>Imprimer ({pages} page{pages > 1 ? 's' : ''})</button>
      </div>
      {info && o.format !== 'petit' && (
        <div className="no-print lb-opts">
          <label>Ingrédients <input className="input sm" value={o.ingredients} onChange={set('ingredients')} placeholder="Ex. eau, fleurs de bissap, sucre, menthe" /></label>
          <label>Conservation <input className="input sm" value={o.conservation} onChange={set('conservation')} /></label>
        </div>
      )}
      {!info && <div className="print-msg">Choisissez un lot de produit fini. Les étiquettes reprennent le n° de lot et la date limite de la production.</div>}
      {info && (
        <div className="imp-sheets">
          {Array.from({ length: pages }, (_, p) => (
            <article key={p} className="doc a4 lb-sheet" style={{ gridTemplateColumns: `repeat(${f.cols}, ${f.w}mm)`, gridAutoRows: `${f.h}mm` }}>
              {Array.from({ length: Math.min(perPage, count - p * perPage) }, (_, i) => <Label key={i} />)}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
