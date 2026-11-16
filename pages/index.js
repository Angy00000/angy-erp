import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { api } from '../lib/client';
import { waLink } from '../components/Chrome';

const SLIDES = [
  { src: '/img/usine-1.webp', k: 'Production', t: 'Recettes, lots et coût de revient' },
  { src: '/img/usine-2.webp', k: 'Qualité & traçabilité', t: 'Chaque bouteille suivie, du champ au client' },
  { src: '/img/erp.webp', k: 'Pilotage', t: 'Ventes, stock, caisse et rapports en temps réel' },
];
const CHIPS = ['📦 Stock par lots', '⚙️ Ordres de fabrication', '💰 Coût & bénéfice par production', '🧾 Point de vente', '📱 Wave · Orange Money', '✅ HACCP & traçabilité', '👥 Paie & pointage'];

export default function Auth() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [d, setD] = useState({ demo: false });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  const [ct, setCt] = useState({});
  useEffect(() => { api('auth/contact').then(setCt).catch(() => {}); }, []);
  useEffect(() => { api('auth/me').then(() => router.replace('/app')).catch(() => {}); }, [router]);
  useEffect(() => { const t = setTimeout(() => setSlide((x) => (x + 1) % SLIDES.length), 6500); return () => clearTimeout(t); }, [slide]);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const go = (m) => { setMode(m); setErr(null); if (typeof window !== 'undefined' && window.innerWidth < 980) document.getElementById('acces')?.scrollIntoView({ behavior: 'smooth' }); };
  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await api('auth/' + mode, { method: 'POST', body: d });
      router.replace('/app');
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  const cur = SLIDES[slide];
  return (
    <div className="lp">
      {SLIDES.map((s, i) => <div key={s.src} className={'lp-bg' + (i === slide ? ' on' : '')} style={{ backgroundImage: `url(${s.src})` }} />)}
      <div className="lp-shade" />
      <div className="lp-stars" aria-hidden>{Array.from({ length: 18 }).map((_, i) => <i key={i} style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.9}s` }} />)}</div>

      <header className="lp-top">
        <div className="logo"><span className="logo-word">ANGY</span><img src="/img/logo.webp" alt="ERP" height={34} /></div>
        <div className="lp-top-r">
          <button className={'lp-btn ghost sm' + (mode === 'login' ? ' act' : '')} onClick={() => go('login')}>Connexion</button>
          <button className="lp-btn sm" onClick={() => go('signup')}>Créer mon espace</button>
        </div>
      </header>

      <main className="lp-main">
        <section className="lp-hero">
          <div className="lp-badge"><span className="flag" aria-hidden><i /><i /><i /></span>Sénégal · Logiciel de gestion de production · 2026</div>
          <h1>Pilotez votre production,<br /><span className="lp-grad">du champ au client.</span></h1>
          <p>Achats, stock par lots, fabrication, coût de revient et bénéfice de chaque production, ventes, caisse, qualité HACCP, RH et rapports — dans un seul logiciel, sur ordinateur, tablette et téléphone.</p>
          <div className="lp-cta">
            <button className="lp-btn lg" onClick={() => go('signup')}>Créer mon espace</button>
            <button className="lp-btn ghost lg" onClick={() => go('login')}>Se connecter</button>
          </div>
          <div className="lp-chips">{CHIPS.map((c) => <span key={c}>{c}</span>)}</div>
        </section>

        <section className="lp-card" id="acces">
          <div className="lp-tabs">
            <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setErr(null); }}>Connexion</button>
            <button className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setErr(null); }}>Nouvelle entreprise</button>
          </div>
          <form onSubmit={submit}>
            <h2>{mode === 'login' ? 'Bon retour 👋' : 'Créez votre espace'}</h2>
            <p className="lp-sub">{mode === 'login' ? 'Accédez à votre espace de gestion.' : 'Vous serez l\'administrateur du compte.'}</p>
            {err && <div className="lp-err">{err}</div>}
            {mode === 'signup' && <>
              <label>Nom de l'entreprise<input required value={d.company || ''} onChange={set('company')} placeholder="Ex. GIE FAJAR" /></label>
              <label>Secteur d'activité<input value={d.sector || ''} onChange={set('sector')} placeholder="Ex. Transformation agroalimentaire" /></label>
              <div className="lp-2">
                <label>Votre nom<input required value={d.name || ''} onChange={set('name')} /></label>
                <label>Téléphone<input value={d.phone || ''} onChange={set('phone')} /></label>
              </div>
            </>}
            <label>Email<input type="email" required autoComplete="email" value={d.email || ''} onChange={set('email')} placeholder="vous@entreprise.sn" /></label>
            <label>Mot de passe<input type="password" required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={d.password || ''} onChange={set('password')} placeholder="6 caractères minimum" /></label>
            {mode === 'signup' && <label className="lp-check"><input type="checkbox" checked={!!d.demo} onChange={set('demo')} /> Charger des données d'exemple pour découvrir le logiciel</label>}
            <button className="lp-btn lg full" disabled={busy}>{busy ? 'Patientez…' : mode === 'login' ? 'Se connecter' : 'Créer mon espace'}</button>
          </form>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-cap" key={slide}>
          <div><div className="lp-cap-k">{cur.k}</div><div className="lp-cap-t">{cur.t}</div></div>
        </div>
        <div className="lp-bars">{SLIDES.map((_, i) => <button key={i} aria-label={`Image ${i + 1}`} onClick={() => setSlide(i)} className={i === slide ? 'on' : i < slide ? 'done' : ''}><i key={i === slide ? slide : 'x'} /></button>)}</div>
        <div className="lp-copy">
          {ct.whatsapp && <a className="lp-wa" href={waLink(ct.whatsapp, 'Bonjour Angy Company, je souhaite en savoir plus sur ANGY ERP.')} target="_blank" rel="noreferrer">WhatsApp {ct.whatsapp}</a>}
          © Angy Company — {ct.adresse || 'Dakar, Sénégal'}
        </div>
      </footer>
    </div>
  );
}
