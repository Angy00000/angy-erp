import { useState } from 'react';
import { api, datetime } from '../../lib/client';
import { useData, toast } from '../ui';
import { Ic } from './Dashboard';
import { waLink } from '../Chrome';

export const REQ_TYPES = { probleme: ['Un problème', 'red'], suggestion: ['Une suggestion', 'blue'], question: ['Une question', 'amber'] };
export const REQ_STATUS = { nouvelle: ['Envoyée', 'amber'], en_cours: ['En cours', 'blue'], faite: ['Réglée', 'green'], refusee: ['Non retenue', 'gray'] };

const GUIDE = [
  ['Enregistrer une production', 'Production → ⚡ Production rapide → 1) le jus et les litres (+ Ajouter un autre format pour les bouteilles) → 2) ce qu\'on a pris dans le magasin (bissap, sucre, sachets…) : c\'est retiré du stock automatiquement → 3) les autres dépenses (gaz, transport…) → Enregistrer.'],
  ['Enregistrer un achat de matières', 'Stock & Articles → ⬇ Entrée stock → l\'article, la quantité et le prix payé. Le stock augmente.'],
  ['Vendre', 'Ventes & Clients → Point de vente → toucher les produits → choisir Caisse / Wave / Orange Money → Encaisser la vente.'],
  ['Créer une recette', 'Production → Recettes → + Nouvelle recette → le jus, la quantité obtenue (ex. 80 sachets = 10 L) et les matières (bissap, sucre, sachets…). Ensuite la Production rapide se remplit toute seule.'],
  ['Confier des jus à une vendeuse', 'Ventes & Clients → Vendeurs & dépôts → + Confier des produits le matin. Le soir : Retour & argent → ce qu\'elle rapporte et l\'argent remis. Le logiciel calcule ce qui a été vendu et ce qu\'elle doit encore.'],
  ['Envoyer le résumé du jour', 'Tableau de bord → Résumé du jour → Envoyer sur WhatsApp (ventes, argent reçu, dépenses, production, stock, commandes).'],
  ['Imprimer des étiquettes', 'Imprimés & fiches → Étiquettes produits (ou Production → Étiquettes sur une production) → choisir le lot, la taille, le nombre → Imprimer.'],
  ['Recevoir un acompte', 'Ventes & Clients → Commandes clients → Acompte sur la commande. Il sera déduit de la facture à la livraison.'],
  ['Relancer un client qui doit de l\'argent', 'Ventes & Clients → Dettes clients → Rappel (WhatsApp) ou Encaisser quand il paie.'],
  ['Installer l\'application sur le téléphone', 'Bouton « Installer l\'application » en bas du menu (Android / ordinateur). Sur iPhone : Safari → Partager → Sur l\'écran d\'accueil.'],
  ['Enregistrer une commande client', 'Ventes & Clients → Commandes clients → + Nouvelle commande → client, date de livraison, produits. Le logiciel montre ce qui est prêt et ce qu\'il faut produire (bouton ⚡ Produire). Quand tout est prêt : Livrer → la facture est créée, le stock et la caisse sont mis à jour.'],
  ['Choisir le lot vendu', 'Par défaut, le logiciel vend le lot le plus ancien. Au point de vente, sous le produit du panier, vous pouvez choisir un autre lot. À la livraison d\'une commande aussi.'],
  ['Enregistrer une dépense', 'Caisse & Trésorerie → Dépenses → + Nouvelle dépense. Vous pouvez la rattacher à une production.'],
  ['Voir le bénéfice d\'une production', 'Production → Rentabilité par production → Détail.'],
  ['Déclarer une perte ou casse', 'Stock & Articles → ⬆ Sortie / perte → motif « Perte » ou « Casse ».'],
  ['Ajouter un employé au logiciel', 'Administration → Utilisateurs & rôles → + Nouvel utilisateur, en choisissant son rôle.'],
  ['Imprimer une fiche vierge', 'Imprimés & fiches → choisir la fiche (production, hygiène, stock, caisse…) → Imprimer. Votre logo apparaît automatiquement.'],
  ['Ajouter le logo de l\'entreprise', 'Administration → Entreprise → Ajouter un logo → Enregistrer.'],
  ['Rechercher rapidement', 'Appuyez sur Ctrl + K (ou la barre « Rechercher » en haut) pour trouver un produit, un client, une facture ou un lot.'],
];

export default function Aide({ contact }) {
  const ct = contact || {};
  const { data, reload } = useData(() => api('app/support'), []);
  const [v, setV] = useState({ type: 'probleme', message: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api('app/support', { method: 'POST', body: v }); setV({ ...v, message: '' }); toast('Demande envoyée à Angy Company'); reload(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const list = data || [];
  return (
    <div className="dgrid" style={{ alignItems: 'start' }}>
      <div>
        <form className="panel" onSubmit={send}>
          <div className="panel-h"><span className="panel-ic"><Ic n="help" s={16} /></span><h3>Nouvelle demande</h3></div>
          {err && <div className="err">{err}</div>}
          <div className="seg">
            {Object.entries(REQ_TYPES).map(([k, [l]]) => <button type="button" key={k} className={v.type === k ? 'on' : ''} onClick={() => setV({ ...v, type: k })}>{l}</button>)}
          </div>
          <textarea className="input" style={{ minHeight: 130, marginTop: 12 }} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })}
            placeholder={v.type === 'probleme' ? 'Décrivez ce qui ne marche pas : dans quel écran, ce que vous avez fait, ce qui s\'est passé…' : v.type === 'suggestion' ? 'Quelle amélioration aimeriez-vous ?' : 'Votre question…'} />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <span className="muted small">L'équipe Angy Company vous répond ici.</span>
            <button className="btn primary" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer'}</button>
          </div>
        </form>
        <div className="space" />
        <div className="panel">
          <div className="panel-h"><span className="panel-ic"><Ic n="clock" s={16} /></span><h3>Mes demandes</h3></div>
          {!list.length && <div className="empty-s">Aucune demande pour le moment</div>}
          {list.map((r) => (
            <div key={r.id} className="req">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="row"><span className={'badge ' + (REQ_TYPES[r.type]?.[1] || 'gray')}>{REQ_TYPES[r.type]?.[0] || r.type}</span><span className="muted small">{datetime(r.created_at)} · {r.user_name}</span></span>
                <span className={'badge ' + (REQ_STATUS[r.status]?.[1] || 'gray')}>{REQ_STATUS[r.status]?.[0] || r.status}</span>
              </div>
              <p className="req-m">{r.message}</p>
              {r.reply && <div className="req-r"><b>Réponse d'Angy Company</b><p>{r.reply}</p></div>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="panel">
          <div className="panel-h"><span className="panel-ic"><Ic n="star" s={16} /></span><h3>Guide rapide</h3></div>
          {GUIDE.map(([t, d]) => (
            <details key={t} className="guide"><summary>{t}</summary><p>{d}</p></details>
          ))}
        </div>
        {ct.whatsapp && <a className="panel wa" href={waLink(ct.whatsapp, 'Bonjour Angy Company, j\'ai besoin d\'aide sur ANGY ERP.')} target="_blank" rel="noreferrer">
          <Ic n="whatsapp" s={22} /><span><b>Écrire sur WhatsApp</b><small>Réponse rapide de l'équipe Angy Company · {ct.whatsapp}</small></span></a>}
        {(ct.telephone || ct.email) && <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-h"><span className="panel-ic"><Ic n="phone" s={16} /></span><h3>Contacter Angy Company</h3></div>
          {ct.telephone && <p style={{ margin: '4px 0' }}>Téléphone : <a href={'tel:' + ct.telephone.replace(/\s/g, '')}><b>{ct.telephone}</b></a></p>}
          {ct.email && <p style={{ margin: '4px 0' }}>Email : <a href={'mailto:' + ct.email}><b>{ct.email}</b></a></p>}
          {ct.adresse && <p className="muted small" style={{ margin: '4px 0' }}>{ct.adresse}</p>}
        </div>}
      </div>
    </div>
  );
}
