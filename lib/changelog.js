// Nouveautés d'ANGY ERP, de la plus récente à la plus ancienne.
// Ajouter une entrée en haut à chaque mise en ligne importante : elle s'affiche une fois à chaque utilisateur.
export const CHANGELOG = [
  {
    v: '2026-11-16e', date: '16 novembre 2026', title: '🛒 Historique des achats, modifiables',
    items: [
      'Chaque « Nouvel achat » a maintenant son numéro (ACH-2026-0001…) et apparaît dans Achats → 🛒 Achats payés et dans Stock → 🛒 Achats.',
      'Bouton ✏️ Modifier : corrigez une quantité, un prix, un article, la caisse ou la date — le stock et la caisse sont corrigés tout seuls.',
      'Bouton Annuler : les articles sortent du stock et l\'argent revient dans la caisse.',
      'Sécurité : ce qui a déjà été utilisé en production ne peut pas être retiré, et le Gardien signale chaque modification ou annulation.',
    ],
  },
  {
    v: '2026-11-16d', date: '16 novembre 2026', title: '⛨ Le Gardien surveille pour vous',
    items: [
      'Nouveau menu « Le Gardien » (administrateur et gérant) : chaque action sensible est notée avec le nom de la personne et l\'heure.',
      'Ventes : vente annulée, argent rendu, remise, prix plus bas que le tarif, vente à crédit, même vente saisie deux fois.',
      'Vendeurs : produits déclarés perdus, argent pas entièrement versé, dépôt non réglé après 2 jours.',
      'Stock et argent : pertes, inventaire où il manque, sorties de caisse, dépenses modifiées ou supprimées, compte dans le rouge, dates anciennes.',
      'Accès : nouvel utilisateur, rôle changé, mauvais mots de passe répétés, connexion la nuit.',
      'Le bouclier en haut de l\'écran affiche les nouvelles alertes ; cliquez « Recevoir les notifications » pour être prévenu sur l\'ordinateur ou le téléphone.',
    ],
  },
  {
    v: '2026-11-16c', date: '16 novembre 2026', title: 'Achats : stock et caisse ensemble',
    items: [
      'Nouveau bouton « 🛒 Nouvel achat » (Stock & Articles ou Achats) : marché, boutique, grossiste ou fournisseur, plusieurs articles en une fois.',
      'Chaque article entre dans le stock et le total sort de la caisse choisie (Caisse, Wave, Orange Money…).',
      'L\'Entrée stock a aussi une case « Payé via » pour retirer l\'argent de la caisse.',
      'Le résumé du jour affiche les achats de matières et emballages.',
    ],
  },
  {
    v: '2026-11-16b', date: '16 novembre 2026', title: 'Plus simple pour les achats et les articles',
    items: [
      'Bon de commande : le fournisseur n\'est plus obligatoire (achat au marché = « Fournisseur divers »).',
      'Nouveau fournisseur : tapez son nom directement dans la liste avec « + Nouveau fournisseur… ».',
      'Fiche article : seules les cases utiles s\'affichent selon le type (pas de prix de vente pour les matières, emballages et consommables).',
      'Mises à jour : un bandeau vous prévient quand une nouvelle version est disponible.',
    ],
  },
  {
    v: '2026-11-16', date: '16 novembre 2026', title: 'Commandes, vendeuses, étiquettes et plus',
    items: [
      'Commandes clients : acomptes, ce qu\'il faut produire, livraison en plusieurs fois.',
      'Vendeurs & dépôts : confier des jus le matin, retour et argent le soir.',
      'Dettes clients : qui doit combien, rappel WhatsApp, encaissement en un clic.',
      'Recettes : la production rapide se remplit toute seule.',
      'Étiquettes produits avec lot, dates et code-barres.',
      'Résumé du jour à envoyer sur WhatsApp, depuis le tableau de bord.',
      'Choix du lot vendu, application installable sur le téléphone.',
    ],
  },
];
