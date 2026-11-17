import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { money, date } from '../../lib/client';
import { waLink } from '../../components/Chrome';

// Reçu d'abonnement ERP (console Angy Company), numéroté ERP-AAAA-0001 (les reçus émis avant gardent « ANGY-AAAA-0001 »).
const MODES = { wave: 'Wave', orange_money: 'Orange Money', especes: 'Espèces', virement: 'Virement', autre: 'Autre' };
const S = {
  page: { maxWidth: 760, margin: '0 auto', padding: '36px 40px', background: '#fff', minHeight: '100vh', fontSize: 13, color: '#17221d' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #e2231a', paddingBottom: 16, marginBottom: 24 },
  box: { border: '1px solid #e4e2d9', borderRadius: 8, padding: 14 },
  td: { padding: '10px 6px', borderBottom: '1px solid #eee' },
};

export default function Recu() {
  const { query } = useRouter();
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!query.id) return;
    fetch(`/api/console/receipt?id=${encodeURIComponent(query.id)}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erreur'); setP(j); }).catch((e) => setErr(e.message));
  }, [query.id]);
  if (err) return <div style={S.page}>{err === 'Connexion requise' ? 'Connectez-vous d\'abord à la console Angy Company.' : err}</div>;
  if (!p) return <div style={S.page}>Chargement…</div>;
  const a = p.angy || {};
  const msg = `Bonjour ${p.contact_name || ''},\n\nAngy Company confirme la réception de votre paiement ERP :\nReçu ${p.number || ''} du ${date(p.date)}\nEntreprise : ${p.company}\nMontant : ${money(p.amount)}${p.period_label ? `\nPériode : ${p.period_label}` : ''}${p.new_end ? `\nAbonnement valable jusqu'au ${date(p.new_end)}` : ''}\n\nMerci de votre confiance !`;
  return (
    <div style={S.page}>
      <Head><title>{`Reçu ${p.number || ''} — Angy Company`}</title></Head>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        {p.company_phone && <a className="btn" href={waLink(p.company_phone, msg)} target="_blank" rel="noreferrer">Envoyer par WhatsApp</a>}
        <button className="btn primary" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button>
      </div>
      <div style={S.head}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><img src="/img/logo.webp" alt="ERP" height={30} /></div>
          <div style={{ color: '#4b5a52', marginTop: 6, lineHeight: 1.5 }}>
            <div><b>Angy Company</b></div>
            {a.adresse && <div>{a.adresse}</div>}
            {[a.telephone || a.whatsapp, a.email].filter(Boolean).length > 0 && <div>{[a.telephone || a.whatsapp, a.email].filter(Boolean).join(' · ')}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 800, textTransform: 'uppercase' }}>Reçu de paiement</div>
          <div style={{ fontFamily: 'monospace', fontSize: 15, marginTop: 4 }}>{p.number || `#${p.id}`}</div>
          <div style={{ marginTop: 6 }}>Date : {date(p.date)}</div>
        </div>
      </div>
      <div style={{ ...S.box, marginBottom: 22 }}>
        <div style={{ fontSize: 11, color: '#85918a', fontWeight: 700 }}>REÇU DE</div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{p.company}</div>
        {p.contact_name && <div>{p.contact_name}</div>}{p.company_address && <div>{p.company_address}</div>}{p.company_phone && <div>{p.company_phone}</div>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
        <tr><td style={S.td}>Objet</td><td style={{ ...S.td, fontWeight: 700 }}>Abonnement au logiciel ERP{p.period_label ? ` — ${p.period_label}` : ''}</td></tr>
        <tr><td style={S.td}>Mode de paiement</td><td style={S.td}>{MODES[p.method] || p.method || '—'}</td></tr>
        {p.new_end && <tr><td style={S.td}>Abonnement valable jusqu'au</td><td style={S.td}>{date(p.new_end)}</td></tr>}
        {p.note && <tr><td style={S.td}>Note</td><td style={S.td}>{p.note}</td></tr>}
        <tr><td style={{ ...S.td, fontSize: 16, fontWeight: 800, borderBottom: '2px solid #17221d' }}>Montant reçu</td><td style={{ ...S.td, fontSize: 20, fontWeight: 900, borderBottom: '2px solid #17221d' }}>{money(p.amount)}</td></tr>
      </tbody></table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, alignItems: 'flex-end' }}>
        <div style={{ color: '#85918a', fontSize: 12 }}>Merci de votre confiance.{p.admin_name ? <><br />Encaissé par {p.admin_name}</> : null}</div>
        <div style={{ textAlign: 'center', minWidth: 200 }}><div style={{ height: 60 }} /><div style={{ borderTop: '1px solid #17221d', paddingTop: 6 }}>Cachet et signature</div></div>
      </div>
    </div>
  );
}
