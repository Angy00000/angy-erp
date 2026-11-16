import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/client';
import { Modal, toast } from './ui';
import { Ic } from './modules/Dashboard';

// ---------- Recherche globale (Ctrl K) ----------
export function SearchPalette({ onClose, go }) {
  const [qv, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const inp = useRef(null);
  useEffect(() => { inp.current?.focus(); }, []);
  useEffect(() => {
    if (qv.trim().length < 2) { setRows([]); return; }
    setBusy(true);
    const t = setTimeout(() => api('app/search', { params: { q: qv } }).then((r) => { setRows(r); setSel(0); }).catch(() => {}).finally(() => setBusy(false)), 220);
    return () => clearTimeout(t);
  }, [qv]);
  const open = (r) => { if (!r) return; if (r.link) window.open(r.link, '_blank'); else go(r.mod); onClose(); };
  const key = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') open(rows[sel]);
  };
  return (
    <div className="overlay pal-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pal">
        <div className="pal-in"><Ic n="search" s={18} /><input ref={inp} value={qv} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Rechercher un produit, client, facture, lot, production…" /><span className="kbd">Échap</span></div>
        <div className="pal-list">
          {qv.trim().length < 2 && <div className="pal-hint">Tapez au moins 2 lettres. Astuce : <span className="kbd">Ctrl</span> + <span className="kbd">K</span> ouvre cette recherche partout.</div>}
          {qv.trim().length >= 2 && !busy && !rows.length && <div className="pal-hint">Aucun résultat pour « {qv} »</div>}
          {rows.map((r, i) => (
            <button key={i} className={'pal-row' + (i === sel ? ' on' : '')} onMouseEnter={() => setSel(i)} onClick={() => open(r)}>
              <span className="pal-type">{r.type}</span>
              <span className="pal-l">{r.label}<small>{r.sub}</small></span>
              <Ic n="arrow" s={15} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Cloche de notifications ----------
export function Bell({ go }) {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const load = () => api('app/alerts').then(setList).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 120000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" onClick={() => { setOpen(!open); if (!open) load(); }} aria-label="Notifications">
        <Ic n="bell" s={19} />{list.length > 0 && <span className="bell-n">{list.length}</span>}
      </button>
      {open && (
        <div className="bell-pop">
          <div className="bell-h">Notifications<span>{list.length}</span></div>
          {!list.length && <div className="pal-hint">Rien à signaler 👌</div>}
          {list.map((a, i) => (
            <button key={i} className="bell-row" onClick={() => { go(a.mod); setOpen(false); }}>
              <span className={'dot ' + a.level} /><span><b>{a.title}</b><small>{a.text}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Bandeau d'annonces Angy Company ----------
export function Announcements() {
  const [list, setList] = useState([]);
  const [hidden, setHidden] = useState(() => { try { return JSON.parse(localStorage.getItem('erp_ann_hidden') || '[]'); } catch { return []; } });
  useEffect(() => { api('app/announcements').then(setList).catch(() => {}); }, []);
  const hide = (id) => { const h = [...hidden, id]; setHidden(h); try { localStorage.setItem('erp_ann_hidden', JSON.stringify(h)); } catch { /* */ } };
  return list.filter((a) => !hidden.includes(a.id)).map((a) => (
    <div key={a.id} className={'banner ann ' + a.level}>
      <Ic n="megaphone" s={17} /><span><b>{a.title}</b>{a.body ? ` — ${a.body}` : ''}</span>
      <button className="x" onClick={() => hide(a.id)} aria-label="Masquer">×</button>
    </div>
  ));
}

// ---------- Changer mon mot de passe ----------
export function PasswordModal({ onClose }) {
  const [d, setD] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null);
    if (d.next !== d.confirm) return setErr('Les deux nouveaux mots de passe ne correspondent pas');
    setBusy(true);
    try { await api('auth/password', { method: 'POST', body: d }); toast('Mot de passe modifié'); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const f = (k, l) => <div className="field"><label>{l}</label><input className="input" type="password" value={d[k] || ''} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></div>;
  return (
    <Modal title="Changer mon mot de passe" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>Enregistrer</button></>}>
      {err && <div className="err">{err}</div>}
      <div className="form" style={{ gridTemplateColumns: '1fr' }}>{f('current', 'Mot de passe actuel')}{f('next', 'Nouveau mot de passe (6 caractères min.)')}{f('confirm', 'Confirmer le nouveau mot de passe')}</div>
    </Modal>
  );
}

// ---------- Thème clair / sombre ----------
export function useTheme() {
  const [theme, setTheme] = useState('light');
  useEffect(() => { try { setTheme(localStorage.getItem('erp_theme') || 'light'); } catch { /* */ } }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('erp_theme', theme); } catch { /* */ } }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

// ---------- Partage WhatsApp ----------
export function waLink(phone, text) {
  let num = String(phone || '').replace(/\D/g, '');
  if (num.length === 9) num = '221' + num;
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

// ---------- Installer l'application sur le téléphone / l'ordinateur ----------
export function InstallApp() {
  const [evt, setEvt] = useState(null);
  const [ios, setIos] = useState(false);
  const [tip, setTip] = useState(false);
  const [done, setDone] = useState(true);
  useEffect(() => {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
    if (standalone) return;
    setDone(false);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const h = (e) => { e.preventDefault(); setEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    const ok = () => setDone(true);
    window.addEventListener('appinstalled', ok);
    return () => { window.removeEventListener('beforeinstallprompt', h); window.removeEventListener('appinstalled', ok); };
  }, []);
  if (done || (!evt && !ios)) return null;
  const click = async () => {
    if (evt) { evt.prompt(); const r = await evt.userChoice.catch(() => null); if (r?.outcome === 'accepted') setDone(true); setEvt(null); } else setTip(true);
  };
  return (
    <>
      <button className="install-btn" onClick={click}>📲 Installer l'application</button>
      {tip && (
        <Modal title="Installer ANGY ERP sur l'iPhone" onClose={() => setTip(false)} footer={<button className="btn primary" onClick={() => setTip(false)}>Compris</button>}>
          <ol className="install-steps">
            <li>Ouvrez ANGY ERP dans <b>Safari</b>.</li>
            <li>Touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li>
            <li>Choisissez <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</li>
          </ol>
          <p className="muted small">L'icône ANGY ERP apparaît sur votre écran : le logiciel s'ouvre comme une application.</p>
        </Modal>
      )}
    </>
  );
}

// ---------- Mise à jour : nouvelle version disponible ----------
// Chaque mise en ligne change l'identifiant de version de Next.js : on le compare régulièrement
// à celui de la page ouverte et on propose de recharger.
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const mine = window.__NEXT_DATA__?.buildId;
    if (!mine || mine === 'development') return undefined;
    const check = async () => {
      try {
        const html = await (await fetch('/?v=' + Date.now(), { cache: 'no-store' })).text();
        const m = html.match(/"buildId":"([^"]+)"/);
        if (m && m[1] !== mine) setReady(true);
      } catch { /* hors connexion : on réessaiera */ }
    };
    const t = setInterval(check, 5 * 60e3);
    const vis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', vis);
    check();
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  if (!ready) return null;
  const update = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs || []).map((r) => r.update()));
      const keys = await caches?.keys?.();
      await Promise.all((keys || []).map((k) => caches.delete(k)));
    } catch { /* */ }
    location.reload();
  };
  return (
    <div className="maj">
      <span className="maj-ic">⟳</span>
      <span><b>Nouvelle version d'ANGY ERP disponible.</b> Terminez ce que vous faites, puis mettez à jour.</span>
      <button className="btn sm accent" onClick={update}>Mettre à jour</button>
    </div>
  );
}

// ---------- Nouveautés : affichées une fois après chaque mise à jour ----------
export function WhatsNew({ list }) {
  const [show, setShow] = useState(null);
  useEffect(() => {
    if (!list?.length) return;
    let seen = null;
    try { seen = localStorage.getItem('erp_seen_version'); } catch { /* */ }
    if (seen !== list[0].v) { // jamais vu (ex. utilisateurs existants) : on montre la dernière nouveauté
      const idx = list.findIndex((x) => x.v === seen);
      setShow(idx === -1 ? list.slice(0, 1) : list.slice(0, idx));
    }
  }, [list]);
  if (!show?.length) return null;
  const close = () => { try { localStorage.setItem('erp_seen_version', list[0].v); } catch { /* */ } setShow(null); };
  return (
    <Modal title="✨ Nouveautés d'ANGY ERP" onClose={close} footer={<button className="btn primary" onClick={close}>Compris</button>}>
      {show.map((e) => (
        <div key={e.v} className="news">
          <div className="news-h"><b>{e.title}</b><span>{e.date}</span></div>
          <ul>{e.items.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ))}
      <p className="muted small" style={{ margin: '6px 0 0' }}>Toutes les nouveautés sont dans <b>Aide & suggestions</b>.</p>
    </Modal>
  );
}
