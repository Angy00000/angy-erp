import { useEffect, useState } from 'react';
import Head from 'next/head';
import { api } from '../lib/client';
import { waLink } from '../components/Chrome';

// Page commerciale d'ANGY ERP (Angy Company) : ce que fait le logiciel, pour qui, et comment l'essayer.
const FEATURES = [
  ['⚡', 'Production en 1 minute', 'Tapez les litres produits : les matières et emballages sont retirés du stock selon vos recettes, le coût par sachet ou bouteille est calculé tout seul.'],
  ['💰', 'Bénéfice de chaque production', 'Ce que chaque production a coûté, ce qu\'elle va rapporter et ce qu\'elle a déjà rapporté, lot par lot.'],
  ['📦', 'Stock par lots et dates limites', 'Matières premières, emballages, matériel et produits finis. Le plus ancien sort en premier, alertes avant péremption.'],
  ['🧾', 'Point de vente rapide', 'Un clic par produit, encaissement en espèces, Wave, Orange Money ou banque. Reçu imprimable ou envoyé sur WhatsApp.'],
  ['📋', 'Commandes clients', 'Le logiciel dit ce qui est prêt et ce qu\'il faut produire. Acomptes, livraisons en plusieurs fois, facture automatique.'],
  ['🚶', 'Vendeurs et revendeurs', 'Produits confiés le matin, retours et argent le soir : ce qui a été vendu et ce que chacun doit est calculé pour vous.'],
  ['📲', 'Résumé du jour sur WhatsApp', 'Ventes, argent reçu, dépenses, production, stock et commandes : un message prêt à envoyer à la direction.'],
  ['✅', 'Qualité & HACCP', 'Contrôles, libération des lots, non-conformités, traçabilité du fournisseur au client, étiquettes produits.'],
  ['🖨️', 'Fiches et étiquettes à votre logo', 'Fiches de production, d\'hygiène, de caisse, bons de commande, factures et étiquettes, prêts à imprimer.'],
  ['👥', 'Équipe, rôles et paie', 'Chaque employé a son accès et ne voit que ce qui le concerne. Pointage, planning et paie.'],
  ['📊', 'Rapports clairs', 'Ventes, marges, trésorerie, rentabilité, stock, qualité — exportables.'],
  ['⛨', 'Le Gardien', 'Annulations, remises, pertes, sorties d\'argent, vendeurs qui doivent : chaque action sensible est signalée à la direction, avec le nom et l\'heure.'],
  ['🔒', 'Sécurisé, sur tous vos appareils', 'Ordinateur, tablette et téléphone (installable comme une application). Vos données sauvegardées en ligne.'],
];
const FOR = ['Transformation de fruits et jus', 'Boulangeries & pâtisseries', 'Savonneries & cosmétiques', 'Ateliers & petites usines', 'GIE & coopératives', 'Restauration & traiteurs'];
const STEPS = [
  ['1', 'Créez votre espace', 'Nom de l\'entreprise, logo, vos produits et leurs prix. Nous vous accompagnons.'],
  ['2', 'Enregistrez au quotidien', 'Achats, productions, ventes et dépenses — en quelques clics, même sur téléphone.'],
  ['3', 'Pilotez', 'Bénéfice de chaque production, argent en caisse, stock, commandes : tout est à jour en temps réel.'],
];

export default function Presentation() {
  const [ct, setCt] = useState({});
  useEffect(() => { api('auth/contact').then(setCt).catch(() => {}); }, []);
  const wa = ct.whatsapp ? waLink(ct.whatsapp, 'Bonjour Angy Company, je souhaite une démonstration d\'ANGY ERP pour mon entreprise.') : null;
  return (
    <div className="pr">
      <Head>
        <title>ANGY ERP — Logiciel de gestion de production | Angy Company</title>
        <meta name="description" content="ANGY ERP : production, stock par lots, coût et bénéfice de chaque production, ventes, caisse Wave / Orange Money, commandes, qualité HACCP. Un produit Angy Company, Dakar." />
      </Head>
      <header className="pr-top">
        <a href="/" className="logo"><span className="logo-word">ANGY</span><img src="/img/logo.webp" alt="ERP" height={30} /></a>
        <nav>
          <a href="#fonctions">Fonctions</a><a href="#comment">Comment ça marche</a><a href="#contact">Contact</a>
          <a className="lp-btn ghost sm" href="/">Connexion</a>
        </nav>
      </header>

      <section className="pr-hero" style={{ backgroundImage: 'linear-gradient(100deg, rgba(6,10,16,.92) 0%, rgba(6,10,16,.75) 45%, rgba(6,10,16,.35) 100%), url(/img/usine-1.webp)' }}>
        <div className="pr-in">
          <span className="lp-badge"><span className="flag" aria-hidden><i /><i /><i /></span>Fait au Sénégal · pour les entreprises de production</span>
          <h1>Sachez enfin <span className="lp-grad">combien rapporte</span> chaque production.</h1>
          <p>ANGY ERP rassemble votre stock, vos productions, vos ventes, votre caisse et votre qualité dans un seul logiciel simple, en français, pensé pour les entreprises d'ici — Wave, Orange Money, vendeurs, commandes, WhatsApp.</p>
          <div className="lp-cta">
            <a className="lp-btn lg" href="/?signup=1&demo=1">Essayer gratuitement</a>
            {wa ? <a className="lp-btn ghost lg" href={wa} target="_blank" rel="noreferrer">Demander une démo</a> : <a className="lp-btn ghost lg" href="#contact">Nous contacter</a>}
          </div>
          <p className="pr-note">Essai gratuit{ct.essai_jours ? ` de ${ct.essai_jours} jours` : ''}, avec des données d'exemple pour tout découvrir. Sans engagement.</p>
        </div>
      </section>

      <section className="pr-sec" id="fonctions">
        <h2>Tout ce qu'il faut pour gérer une entreprise de production</h2>
        <p className="pr-lead">Du sac de matière première au client qui paie : chaque étape est enregistrée, chaque franc est suivi.</p>
        <div className="pr-grid">{FEATURES.map(([i, t, d]) => <div key={t} className="pr-card"><span className="pr-ic">{i}</span><h3>{t}</h3><p>{d}</p></div>)}</div>
      </section>

      <section className="pr-sec pr-alt">
        <div className="pr-split">
          <div>
            <h2>Un exemple concret : un GIE de jus locaux</h2>
            <ul className="pr-list">
              <li>Le matin, la responsable enregistre <b>60 litres de bissap</b> : le logiciel retire le bissap, le sucre et 480 sachets du stock et calcule le <b>coût du sachet</b>.</li>
              <li>Trois vendeuses partent avec des sachets ; le soir, elles rendent les invendus et l'argent : <b>chacune sait ce qu'elle doit</b>.</li>
              <li>Un hôtel commande 30 bouteilles pour vendredi : le logiciel indique <b>qu'il faut en produire 12</b>.</li>
              <li>À 20 h, la présidente reçoit sur WhatsApp le <b>résumé de la journée</b> : ventes, caisse, production, stock.</li>
            </ul>
          </div>
          <img src="/img/erp.webp" alt="" className="pr-img" />
        </div>
      </section>

      <section className="pr-sec">
        <h2>Pour qui ?</h2>
        <div className="pr-chips">{FOR.map((x) => <span key={x}>{x}</span>)}</div>
      </section>

      <section className="pr-sec pr-alt" id="comment">
        <h2>Comment ça marche</h2>
        <div className="pr-steps">{STEPS.map(([n, t, d]) => <div key={n} className="pr-step"><b>{n}</b><h3>{t}</h3><p>{d}</p></div>)}</div>
      </section>

      <section className="pr-sec pr-final" id="contact">
        <h2>Prêt à essayer ?</h2>
        <p className="pr-lead">Créez votre espace en 2 minutes ou contactez l'équipe Angy Company pour une démonstration et un tarif adapté à votre entreprise.</p>
        <div className="lp-cta" style={{ justifyContent: 'center' }}>
          <a className="lp-btn lg" href="/?signup=1&demo=1">Essayer gratuitement</a>
          {wa && <a className="lp-btn ghost lg" href={wa} target="_blank" rel="noreferrer">WhatsApp {ct.whatsapp}</a>}
        </div>
        <p className="pr-contact">{[ct.telephone && `Tél. ${ct.telephone}`, ct.email, ct.adresse].filter(Boolean).join(' · ')}</p>
      </section>
      <footer className="pr-foot">© Angy Company — ANGY ERP · {ct.adresse || 'Dakar, Sénégal'}</footer>
    </div>
  );
}
