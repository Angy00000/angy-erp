// Nouveautés d'ANGY ERP, de la plus récente à la plus ancienne.
// Ajouter une entrée en haut à chaque mise en ligne importante : elle s'affiche une fois à chaque utilisateur.
export const CHANGELOG = [
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
