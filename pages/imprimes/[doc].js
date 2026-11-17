import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { api, crud, setCurrency } from '../../lib/client';
import { DOCS } from '../../components/imprimes';

export default function ImprimePage() {
  const router = useRouter();
  const { doc } = router.query;
  const d = DOCS[doc];
  const [ctx, setCtx] = useState(null);
  const [err, setErr] = useState(null);
  const [n, setN] = useState(1);
  useEffect(() => {
    if (!d) return;
    (async () => {
      try {
        const me = await api('auth/me');
        setCurrency(me.company?.currency);
        const data = {};
        for (const e of d.need || []) data[e] = await crud.list(e, { limit: 1000 }).catch(() => []);
        setCtx({ c: me.company, data });
      } catch (e) { setErr(e.status === 401 ? 'Connectez-vous d\'abord à ERP.' : e.message); }
    })();
  }, [d]);
  if (!doc) return null;
  if (!d) return <div className="print-msg">Document inconnu.</div>;
  if (err) return <div className="print-msg">{err}</div>;
  if (!ctx) return <div className="print-msg">Chargement…</div>;
  const Comp = d.C;
  const copies = d.etat ? 1 : n;
  return (
    <div className="imp-page">
      <Head><title>{`${d.t} — ${ctx.c.name}`}</title></Head>
      <style>{`@page { size: ${d.f} portrait; margin: 0; }`}</style>
      <div className="imp-bar no-print">
        <button className="btn" onClick={() => window.close()}>← Fermer</button>
        <span className="grow"><b>{d.t}</b> {d.etat ? '(état du jour)' : '(vierge)'}</span>
        {!d.etat && <label className="row small">Exemplaires <input className="input sm" type="number" min={1} max={30} value={n} onChange={(e) => setN(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} style={{ width: 70 }} /></label>}
        <button className="btn primary" onClick={() => window.print()}>Imprimer / PDF</button>
      </div>
      <div className="imp-sheets">{Array.from({ length: copies }, (_, i) => <Comp key={i} c={ctx.c} data={ctx.data} />)}</div>
    </div>
  );
}
