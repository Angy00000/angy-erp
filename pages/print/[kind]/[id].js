import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { api, crud, money, num, date, setCurrency, LABELS } from '../../../lib/client';
import { waLink } from '../../../components/Chrome';

const S = {
  page: { maxWidth: 820, margin: '0 auto', padding: '36px 40px', background: '#fff', minHeight: '100vh', fontSize: 13 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #0f3d2e', paddingBottom: 16, marginBottom: 22 },
  h: { fontSize: 22, fontWeight: 800, color: '#0f3d2e' },
  box: { border: '1px solid #e4e2d9', borderRadius: 8, padding: 12, minWidth: 240 },
  th: { textAlign: 'left', padding: '8px 6px', borderBottom: '2px solid #17221d', fontSize: 11, textTransform: 'uppercase' },
  td: { padding: '8px 6px', borderBottom: '1px solid #eee' },
  r: { textAlign: 'right' },
};

export default function PrintDoc() {
  const router = useRouter();
  const { kind, id } = router.query;
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!kind || !id) return;
    (async () => {
      try {
        const me = await api('auth/me');
        setCurrency(me.company?.currency);
        const doc = await crud.get(kind, id);
        let recipe = null;
        if (kind === 'production_orders' && doc.recipe_id) recipe = await crud.get('recipes', doc.recipe_id).catch(() => null);
        let customer = null;
        if (kind === 'sales_docs' && doc.customer_id) customer = await crud.get('customers', doc.customer_id).catch(() => null);
        setData({ company: me.company, doc, recipe, customer });
      } catch (e) { setErr(e.message); }
    })();
  }, [kind, id]);
  if (err) return <div style={S.page}>{err}</div>;
  if (!data) return <div style={S.page}>Chargement…</div>;
  const { company: c, doc: d } = data;
  const Header = ({ title, right }) => (
    <div style={S.head}>
      <div>
        <div style={S.h}>{c.name}</div>
        <div style={{ color: '#4b5a52', marginTop: 4, lineHeight: 1.5 }}>
          {c.sector && <div>{c.sector}</div>}{c.address && <div>{c.address}</div>}
          {(c.phone || c.email) && <div>{[c.phone, c.email].filter(Boolean).join(' · ')}</div>}
          {(c.ninea || c.rccm) && <div>{c.ninea && 'NINEA ' + c.ninea} {c.rccm && ' · RCCM ' + c.rccm}</div>}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 20, fontWeight: 800, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontFamily: 'monospace', fontSize: 15, marginTop: 4 }}>{d.number}</div>
        {right}
      </div>
    </div>
  );
  const Tools = () => <div className="no-print" style={{ textAlign: 'right', marginBottom: 16 }}><button className="btn primary" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button></div>;

  if (kind === 'sales_docs') {
    const cust = data.customer;
    const msg = `Bonjour${cust?.name ? ' ' + cust.name : ''},\n\n${LABELS.sale_type[d.type]} ${d.number} du ${date(d.date)} — ${c.name}\n` +
      d.lines.map((l) => `• ${num(l.qty)} × ${l.item_name || l.description} = ${money(l.total)}`).join('\n') +
      `\n\nTotal : ${money(d.total)}` + (d.type === 'facture' ? `\nPayé : ${money(d.paid)}\nReste à payer : ${money(d.total - d.paid)}` : '') + `\n\nMerci pour votre confiance.`;
    return (
      <div style={S.page}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <a className="btn" href={waLink(cust?.phone, msg)} target="_blank" rel="noreferrer">Envoyer par WhatsApp</a>
          <button className="btn primary" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button>
        </div>
        <Header title={LABELS.sale_type[d.type]} right={<div style={{ marginTop: 6 }}>Date : {date(d.date)}{d.due_date && <><br />Échéance : {date(d.due_date)}</>}</div>} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <div style={S.box}><div style={{ fontSize: 11, color: '#85918a', fontWeight: 700 }}>CLIENT</div><div style={{ fontWeight: 800, fontSize: 15 }}>{cust?.name || d.customer_name || 'Client comptoir'}</div>
            {cust?.address && <div>{cust.address}</div>}{cust?.phone && <div>{cust.phone}</div>}</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={S.th}>Désignation</th><th style={{ ...S.th, ...S.r }}>Qté</th><th style={{ ...S.th, ...S.r }}>Prix unit.</th><th style={{ ...S.th, ...S.r }}>Remise</th><th style={{ ...S.th, ...S.r }}>Total</th></tr></thead>
          <tbody>{d.lines.map((l) => <tr key={l.id}><td style={S.td}>{l.item_name || l.description}</td><td style={{ ...S.td, ...S.r }}>{num(l.qty)} {l.unit}</td><td style={{ ...S.td, ...S.r }}>{money(l.unit_price)}</td><td style={{ ...S.td, ...S.r }}>{l.discount ? money(l.discount) : ''}</td><td style={{ ...S.td, ...S.r }}>{money(l.total)}</td></tr>)}</tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <table style={{ minWidth: 300 }}><tbody>
            <tr><td style={S.td}>Sous-total</td><td style={{ ...S.td, ...S.r }}>{money(d.subtotal)}</td></tr>
            {d.discount > 0 && <tr><td style={S.td}>Remise</td><td style={{ ...S.td, ...S.r }}>− {money(d.discount)}</td></tr>}
            {d.tax > 0 && <tr><td style={S.td}>Taxes</td><td style={{ ...S.td, ...S.r }}>{money(d.tax)}</td></tr>}
            <tr><td style={{ ...S.td, fontWeight: 800, fontSize: 16 }}>TOTAL</td><td style={{ ...S.td, ...S.r, fontWeight: 800, fontSize: 16 }}>{money(d.total)}</td></tr>
            {d.type === 'facture' && <><tr><td style={S.td}>Payé</td><td style={{ ...S.td, ...S.r }}>{money(d.paid)}</td></tr>
              <tr><td style={{ ...S.td, fontWeight: 700 }}>Reste à payer</td><td style={{ ...S.td, ...S.r, fontWeight: 700 }}>{money(d.total - d.paid)}</td></tr></>}
          </tbody></table>
        </div>
        {d.notes && <p style={{ marginTop: 20 }}>{d.notes}</p>}
        {c.invoice_footer && <div style={{ marginTop: 40, paddingTop: 12, borderTop: '1px solid #ddd', fontSize: 11.5, color: '#4b5a52', whiteSpace: 'pre-line' }}>{c.invoice_footer}</div>}
        <div style={{ marginTop: 30, textAlign: 'center', color: '#85918a', fontSize: 11 }}>Merci pour votre confiance.</div>
      </div>
    );
  }

  if (kind === 'purchase_orders') {
    return (
      <div style={S.page}>
        <Tools />
        <Header title="Bon de commande" right={<div style={{ marginTop: 6 }}>Date : {date(d.date)}{d.expected_date && <><br />Livraison souhaitée : {date(d.expected_date)}</>}</div>} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}><div style={S.box}><div style={{ fontSize: 11, color: '#85918a', fontWeight: 700 }}>FOURNISSEUR</div><div style={{ fontWeight: 800, fontSize: 15 }}>{d.supplier_name}</div></div></div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={S.th}>Article</th><th style={{ ...S.th, ...S.r }}>Quantité</th><th style={{ ...S.th, ...S.r }}>Prix unit.</th><th style={{ ...S.th, ...S.r }}>Total</th></tr></thead>
          <tbody>{d.lines.map((l) => <tr key={l.id}><td style={S.td}>{l.item_name}</td><td style={{ ...S.td, ...S.r }}>{num(l.qty)} {l.unit}</td><td style={{ ...S.td, ...S.r }}>{money(l.unit_price)}</td><td style={{ ...S.td, ...S.r }}>{money(l.qty * l.unit_price)}</td></tr>)}</tbody>
          <tfoot><tr><td style={{ ...S.td, fontWeight: 800 }} colSpan={3}>TOTAL</td><td style={{ ...S.td, ...S.r, fontWeight: 800 }}>{money(d.total)}</td></tr></tfoot>
        </table>
        {d.notes && <p style={{ marginTop: 20 }}>{d.notes}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60 }}><div>Signature acheteur</div><div>Cachet fournisseur</div></div>
      </div>
    );
  }

  if (kind === 'production_orders') {
    const r = data.recipe;
    const factor = r ? (d.planned_qty || 0) / (r.yield_qty || 1) : 0;
    return (
      <div style={S.page}>
        <Tools />
        <Header title="Ordre de fabrication" right={<div style={{ marginTop: 6 }}>Statut : {LABELS.prod_status[d.status]}<br />Date prévue : {date(d.planned_date)}</div>} />
        <table style={{ width: '100%', marginBottom: 20 }}><tbody>
          <tr><td style={S.td}><b>Produit</b></td><td style={S.td}>{d.product_name}</td><td style={S.td}><b>Quantité prévue</b></td><td style={S.td}>{num(d.planned_qty)} {d.product_unit}</td></tr>
          <tr><td style={S.td}><b>Recette</b></td><td style={S.td}>{d.recipe_name}</td><td style={S.td}><b>Équipe</b></td><td style={S.td}>{d.team}</td></tr>
          <tr><td style={S.td}><b>N° de lot</b></td><td style={S.td}>{d.lot_number || '………………'}</td><td style={S.td}><b>DLC</b></td><td style={S.td}>{d.expiry_date ? date(d.expiry_date) : '………………'}</td></tr>
          {d.status === 'termine' && <tr><td style={S.td}><b>Produit réel</b></td><td style={S.td}>{num(d.produced_qty)} (rebut {num(d.rejected_qty)})</td><td style={S.td}><b>Coût unitaire</b></td><td style={S.td}>{money(d.unit_cost)}</td></tr>}
        </tbody></table>
        {r && <>
          <h3 style={{ fontSize: 14 }}>Matières à prélever</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={S.th}>Matière / emballage</th><th style={{ ...S.th, ...S.r }}>Quantité théorique</th><th style={S.th}>Lot utilisé</th><th style={{ ...S.th, ...S.r }}>Quantité réelle</th></tr></thead>
            <tbody>{r.lines.map((l) => <tr key={l.id}><td style={S.td}>{l.item_name}</td><td style={{ ...S.td, ...S.r }}>{num(l.qty * factor)} {l.unit}</td><td style={S.td}>……………</td><td style={{ ...S.td, ...S.r }}>……………</td></tr>)}</tbody>
          </table>
          {r.instructions && <><h3 style={{ fontSize: 14, marginTop: 20 }}>Mode opératoire</h3><p style={{ whiteSpace: 'pre-line' }}>{r.instructions}</p></>}
        </>}
        <h3 style={{ fontSize: 14, marginTop: 20 }}>Enregistrements des points critiques (CCP)</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={S.th}>Heure</th><th style={S.th}>Paramètre</th><th style={S.th}>Valeur</th><th style={S.th}>Conforme</th><th style={S.th}>Visa</th></tr></thead>
          <tbody>{[1, 2, 3, 4, 5].map((i) => <tr key={i}>{[1, 2, 3, 4, 5].map((j) => <td key={j} style={{ ...S.td, height: 28 }} />)}</tr>)}</tbody>
        </table>
        {d.notes && <p style={{ marginTop: 20 }}>{d.notes}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 50 }}><div>Responsable production</div><div>Responsable qualité (libération)</div></div>
      </div>
    );
  }
  return <div style={S.page}>Document inconnu</div>;
}
