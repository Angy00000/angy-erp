// Nouveautés d'ANGY ERP, de la plus récente à la plus ancienne.
// Ajouter une entrée en haut à chaque mise en ligne importante : elle s'affiche une fois à chaque utilisateur.
export const CHANGELOG = [
  {
    v: '2026-11-17a', date: '17 novembre 2026', title: '📝 La liste d\'achats se fait toute seule',
    items: [
      'Achats → 📝 À acheter : pour chaque matière et emballage, ce que vous utilisez par jour, combien de jours il reste et combien acheter (pour 1 semaine, 2 semaines ou 1 mois).',
      'Budget estimé au dernier prix d\'achat ; envoyez la liste sur WhatsApp à la personne qui va au marché.',
      'Au retour : « J\'ai acheté » ouvre l\'achat déjà rempli, il suffit de corriger les prix payés.',
      '🧮 Préparer une production : tapez combien de sachets / bouteilles vous voulez faire, le logiciel dit ce qui manque d\'après les recettes.',
      'La cloche prévient quand un article va manquer dans 5 jours ou moins.',
    ],
  },
  {
    v: '2026-11-16k', date: '16 novembre 2026', title: '⚡ Production : nombre ou litres, au choix',
    items: [
      'Pour chaque format, deux cases côte à côte : le nombre (sachets, bouteilles) et les litres. Tapez l\'un, l\'autre se calcule (ex. 30 L = 240 sachets, 5 L = 20 bouteilles de 25 cl).',
    ],
  },
  {
    v: '2026-11-16j', date: '16 novembre 2026', title: '⚡ Production : choisissez le jus, tapez le nombre par format',
    items: [
      'Production rapide : on choisit le jus (bissap, bouye…), puis on tape le nombre de sachets 12,5 cl, de bouteilles 25 cl et de bouteilles 1 L obtenus.',
      'Les litres, les matières, les emballages, le coût et la marge de chaque format se calculent tout seuls.',
      'Plusieurs jus le même jour : « + Ajouter un autre jus ».',
      'Les produits sont classés par jus (catégories Jus de bissap, Jus de bouye…) dans Stock & Articles.',
    ],
  },
  {
    v: '2026-11-16i', date: '16 novembre 2026', title: '⚡ Production : tapez juste le nombre de sachets ou de bouteilles',
    items: [
      'Dans Production rapide, tapez le nombre obtenu (ex. 240 sachets) : les litres, les matières, les emballages, le coût et la marge se remplissent tout seuls.',
      'Recettes des 5 jus créées pour les 3 formats, à partir des dernières productions enregistrées (Production → Recettes pour les ajuster).',
    ],
  },
  {
    v: '2026-11-16h', date: '16 novembre 2026', title: 'Affichage plus clair partout',
    items: [
      'Production : chaque production est une carte (date, jus, litres, coût, bénéfice prévu) avec ses formats en dessous — plus de colonnes écrasées.',
      'En haut de Production : ce qui a été produit sur la période, le coût et le bénéfice prévu.',
      'Tous les tableaux : les boutons ne sont plus coupés à droite, les dates et numéros restent sur une ligne, les noms ne sont plus écrasés.',
      'Lots et mouvements de stock plus compacts : le n° de lot et la personne sont affichés sous l\'article et la date.',
    ],
  },
  {
    v: '2026-11-16g', date: '16 novembre 2026', title: '✏️ Corriger une production',
    items: [
      'Production → Ordres de fabrication (ou Rentabilité) → ✏️ Modifier sur une production terminée.',
      'On peut corriger les litres, ajouter ou retirer un format, changer ce qui a été pris dans le magasin, les dépenses, la caisse et la date.',
      'Le stock, la caisse, le coût par sachet ou bouteille et le bénéfice (même des ventes déjà faites) sont recalculés automatiquement.',
      'Bouton « Supprimer cette production » si elle a été enregistrée par erreur.',
      'Sécurité : impossible de descendre en dessous de ce qui a déjà été vendu ; le Gardien signale chaque correction.',
    ],
  },
  {
    v: '2026-11-16f', date: '16 novembre 2026', title: 'Produits plus faciles à lire',
    items: [
      'Point de vente : les produits sont rangés par jus (bissap, bouye, gingembre…) avec un bouton par format — sachet, bouteille 25 cl, bouteille 1 L — le prix et le stock.',
      'Stock & Articles : des onglets par type (Produits finis, Matières premières, Emballages…) avec leur nombre.',
      'Produits finis : un résumé par jus en litres (tous formats confondus) et ce que le stock vaut à la vente.',
      'Chaque article affiche son état : En stock, Bientôt fini ou Épuisé.',
      'Nouveaux formats : bouteilles de 25 cl à 200 F pour chaque jus.',
    ],
  },
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
