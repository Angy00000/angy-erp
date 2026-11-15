import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { api } from '../lib/client';

export default function Auth() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [d, setD] = useState({ demo: true });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('auth/me').then(() => router.replace('/app')).catch(() => {}); }, [router]);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await api('auth/' + mode, { method: 'POST', body: d });
      router.replace('/app');
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="logo"><div className="logo-mark">A</div>ANGY ERP</div>
        <div>
          <h1>Pilotez toute votre entreprise de production, du champ au client.</h1>
          <p style={{ marginTop: 16 }}>Achats, stocks par lots, fabrication et coûts de revient, ventes, caisse, qualité HACCP, traçabilité, RH et rapports — dans un seul logiciel, sur ordinateur et tablette.</p>
          <div className="pills" style={{ marginTop: 22 }}>
            {['Stock FEFO par lots', 'Ordres de fabrication', 'Coût de revient automatique', 'Point de vente', 'Wave · Orange Money', 'Plan HACCP', 'Traçabilité amont/aval', 'Paie & pointage', 'Compte de résultat'].map((p) => <span key={p} className="pill">{p}</span>)}
          </div>
        </div>
        <div className="small" style={{ color: '#8fb0a0' }}>© Angy Company — Dakar, Sénégal</div>
      </div>
      <div className="auth-form">
        <form className="auth-box" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Connexion' : 'Créer votre entreprise'}</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>{mode === 'login' ? 'Accédez à votre espace de gestion.' : 'Vous serez l\'administrateur du compte.'}</p>
          {err && <div className="err">{err}</div>}
          {mode === 'signup' && <>
            <div className="field"><label>Nom de l'entreprise</label><input className="input" required value={d.company || ''} onChange={set('company')} /></div>
            <div className="field"><label>Secteur d'activité</label><input className="input" placeholder="Ex. Transformation agroalimentaire" value={d.sector || ''} onChange={set('sector')} /></div>
            <div className="field"><label>Votre nom</label><input className="input" required value={d.name || ''} onChange={set('name')} /></div>
            <div className="field"><label>Téléphone</label><input className="input" value={d.phone || ''} onChange={set('phone')} /></div>
          </>}
          <div className="field"><label>Email</label><input className="input" type="email" required autoComplete="email" value={d.email || ''} onChange={set('email')} /></div>
          <div className="field"><label>Mot de passe</label><input className="input" type="password" required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={d.password || ''} onChange={set('password')} /></div>
          {mode === 'signup' && <label className="row small" style={{ margin: '4px 0 14px' }}><input type="checkbox" checked={!!d.demo} onChange={set('demo')} /> Charger des données d'exemple (jus, recettes, HACCP) pour découvrir le logiciel</label>}
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', minHeight: 44 }} disabled={busy}>{busy ? 'Patientez…' : mode === 'login' ? 'Se connecter' : 'Créer mon espace'}</button>
          <div style={{ marginTop: 16, textAlign: 'center' }} className="small">
            {mode === 'login'
              ? <>Nouvelle entreprise ? <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); setErr(null); }}>Créer un compte</a></>
              : <>Déjà un compte ? <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setErr(null); }}>Se connecter</a></>}
          </div>
        </form>
      </div>
    </div>
  );
}
