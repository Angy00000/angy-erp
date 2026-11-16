import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/client';
import { useData, Stat, toast } from '../ui';
import { Ic } from './Dashboard';

// LE GARDIEN : tout ce qui mérite l'œil de la direction — annulations, remises, pertes, argent, vendeurs, accès.
const LEVELS = [['', 'Tout'], ['grave', '🔴 Grave'], ['attention', '🟠 Attention'], ['info', '🔵 Info']];
const KINDS = {
  annulation: 'Ventes annulées', remboursement: 'Remboursements', remise: 'Remises', prix: 'Prix baissés', credit: 'Ventes à crédit', doublon: 'Doublons',
  stock: 'Stock (pertes, inventaires)', vendeur: 'Vendeurs & dépôts', caisse: 'Caisse & argent', suppression: 'Suppressions', modif: 'Modifications',
  antidate: 'Dates anciennes', acces: 'Accès & connexions', production: 'Production', paie: 'Paie', resume: 'Résumés du jour',
};
const WATCH = [
  ['🧾', 'Ventes', 'vente annulée, argent rendu, remise, prix plus bas que le tarif, vente à crédit, même vente saisie deux fois'],
  ['🚶', 'Vendeurs', 'produits déclarés perdus, argent pas entièrement versé, dépôt pas réglé après 2 jours'],
  ['📦', 'Stock', 'sortie manuelle, perte, casse, inventaire où il manque de la marchandise, lot bloqué ou périmé'],
  ['💰', 'Argent', 'sortie de caisse, transfert, grosse dépense, dépense modifiée ou supprimée, compte dans le rouge'],
  ['🗓️', 'Dates', 'paiement, dépense ou achat enregistré avec une date de plus de 3 jours'],
  ['🔑', 'Accès', 'nouvel utilisateur, rôle changé, compte désactivé, mot de passe réinitialisé, 3 mauvais mots de passe, connexion la nuit'],
];
const ago = (v) => {
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 172800) return `hier à ${new Date(v).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  return new Date(v).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function Gardien({ go }) {
  const [days, setDays] = useState(30);
  const { data } = useData(() => api(`app/guardian?days=${days}`), [days]);
  const [level, setLevel] = useState('');
  const [kind, setKind] = useState('');
  const [who, setWho] = useState('');
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (!data) return;
    api('app/guardian_seen', { method: 'POST' }).then(() => window.dispatchEvent(new Event('guardian-seen'))).catch(() => {});
  }, [data]);

  const list = data?.list || [];
  const people = useMemo(() => [...new Set(list.map((a) => a.actor_name).filter(Boolean))].sort(), [list]);
  const kinds = useMemo(() => [...new Set(list.map((a) => a.kind))], [list]);
  if (!data) return <div className="spinner">Chargement…</div>;

  const shown = list.filter((a) => (!level || a.level === level) && (!kind || a.kind === kind) && (!who || a.actor_name === who));
  const week = list.filter((a) => Date.now() - new Date(a.created_at).getTime() < 7 * 86400000);
  const cnt = (l) => week.filter((a) => a.level === l).length;
  const enable = async () => {
    if (typeof Notification === 'undefined') { toast('Ce navigateur ne gère pas les notifications', 'error'); return; }
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') { toast('Notifications activées : vous serez prévenu même quand l\'onglet est en arrière-plan'); new Notification('Le Gardien est activé ✅', { body: 'Vous recevrez ici les alertes importantes.', icon: '/icon-192.png' }); }
    else toast('Notifications refusées — autorisez-les dans les réglages du navigateur', 'error');
  };

  return (
    <div>
      <div className="guard-hero">
        <div className="guard-shield"><Ic n="shield" s={30} /></div>
        <div style={{ flex: 1 }}>
          <b>Le Gardien veille sur votre entreprise</b>
          <p>Chaque action sensible des vendeurs et du personnel est notée ici, avec le nom de la personne et l'heure. Rien n'est bloqué : vous êtes simplement prévenu.</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => setHelp(!help)}>{help ? 'Masquer' : 'Ce qui est surveillé'}</button>
          {perm === 'granted'
            ? <span className="chip-ok">🔔 Notifications activées</span>
            : <button className="btn sm primary" onClick={enable}>🔔 Recevoir les notifications</button>}
        </div>
      </div>

      {help && <div className="card guard-watch">{WATCH.map(([i, t, d]) => <div key={t}><span>{i}</span><div><b>{t}</b><p>{d}</p></div></div>)}</div>}

      <div className="grid g3" style={{ margin: '16px 0' }}>
        <Stat k="🔴 Graves (7 jours)" v={cnt('grave')} s="annulations, remboursements, pertes, suppressions" accent={cnt('grave') > 0} />
        <Stat k="🟠 À vérifier (7 jours)" v={cnt('attention')} s="remises, crédits, sorties de stock ou d'argent" />
        <Stat k="🔵 Pour info (7 jours)" v={cnt('info')} s="résumés, transferts, petites sorties" />
      </div>

      <div className="card">
        <div className="row guard-filters">
          <div className="seg">{LEVELS.map(([k, l]) => <button key={k} className={level === k ? 'on' : ''} onClick={() => setLevel(k)}>{l}</button>)}</div>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tous les sujets</option>{kinds.map((k) => <option key={k} value={k}>{KINDS[k] || k}</option>)}</select>
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}><option value="">Toutes les personnes</option>{people.map((p) => <option key={p}>{p}</option>)}</select>
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 derniers jours</option><option value={30}>30 derniers jours</option><option value={90}>3 mois</option><option value={365}>1 an</option></select>
        </div>
        {!shown.length && <div className="empty">{list.length ? 'Aucune alerte avec ces filtres.' : 'Rien à signaler pour le moment. Le Gardien veille 👌'}</div>}
        <div className="guard-list">
          {shown.map((a) => (
            <div key={a.id} className={'guard-item ' + a.level + (a.new ? ' new' : '')}>
              <span className={'guard-dot ' + a.level} />
              <div className="guard-body">
                <div className="guard-t"><b>{a.title}</b>{a.new && <span className="guard-new">Nouveau</span>}</div>
                {a.message && <p>{a.message}</p>}
                <small>{a.actor_name ? <>par <b>{a.actor_name}</b> · </> : 'Le Gardien · '}{ago(a.created_at)}{KINDS[a.kind] ? ` · ${KINDS[a.kind]}` : ''}</small>
              </div>
              {a.link_mod && <button className="btn sm" onClick={() => go(a.link_mod)}>Voir</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
