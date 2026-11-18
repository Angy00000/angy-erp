// Shared by client and server
export const MODULES = [
  { key: 'dashboard', label: 'Tableau de bord', icon: '◧', group: null },
  { key: 'ventes', label: 'Ventes & Clients', icon: '◈', group: 'Commerce' },
  { key: 'caisse', label: 'Caisse & Trésorerie', icon: '◉', group: 'Commerce' },
  { key: 'achats', label: 'Achats & Fournisseurs', icon: '⬇', group: 'Commerce' },
  { key: 'production', label: 'Production', icon: '⚙', group: 'Opérations' },
  { key: 'stock', label: 'Stock & Articles', icon: '▦', group: 'Opérations' },
  { key: 'qualite', label: 'Qualité & HACCP', icon: '✓', group: 'Opérations' },
  { key: 'rh', label: 'RH & Planning', icon: '☺', group: 'Équipe & pilotage' },
  { key: 'rapports', label: 'Rapports', icon: '▤', group: 'Équipe & pilotage' },
  { key: 'imprimes', label: 'Imprimés & fiches', icon: '⎙', group: 'Équipe & pilotage' },
  { key: 'gardien', label: 'Le Gardien', icon: '⛨', group: 'Équipe & pilotage' },
  { key: 'admin', label: 'Administration', icon: '⚑', group: 'Équipe & pilotage' },
  { key: 'aide', label: 'Aide & suggestions', icon: '?', group: 'Équipe & pilotage' },
  // Pas un menu : droit de voir l'argent (soldes des comptes, chiffre d'affaires, bénéfices, valeur du stock, coûts)
  { key: 'argent', label: "Voir l'argent", icon: '💰', group: null, nav: false },
];

export const ROLES = {
  admin: { label: 'Administrateur', modules: '*' },
  gerant: { label: 'Gérant', modules: ['dashboard', 'ventes', 'caisse', 'stock', 'achats', 'production', 'qualite', 'rh', 'rapports', 'gardien', 'argent'] },
  comptable: { label: 'Comptable', modules: ['dashboard', 'ventes', 'caisse', 'achats', 'rapports', 'rh', 'argent'] },
  production: { label: 'Responsable production', modules: ['dashboard', 'production', 'stock', 'qualite', 'argent'] },
  qualite: { label: 'Responsable qualité', modules: ['dashboard', 'qualite', 'production', 'stock', 'argent'] },
  stock: { label: 'Magasinier', modules: ['dashboard', 'stock', 'achats'] },
  vente: { label: 'Vendeur', modules: ['dashboard', 'ventes'] },
  rh: { label: 'Ressources humaines', modules: ['dashboard', 'rh', 'argent'] },
};

// Menus qu'on peut donner à un rôle (le tableau de bord, l'aide et les imprimés sont pour tout le monde)
export const ASSIGNABLE = MODULES.filter((m) => !['dashboard', 'aide', 'imprimes', 'admin'].includes(m.key));

// Rôles de l'entreprise : les rôles par défaut, modifiés ou complétés par ceux enregistrés par l'administrateur
export function mergeRoles(custom) {
  const out = {};
  for (const [k, r] of Object.entries(ROLES)) out[k] = { ...r, builtin: true };
  for (const c of custom || []) {
    if (c.role === 'admin') continue;
    out[c.role] = { label: c.label, modules: c.modules || [], builtin: !!ROLES[c.role], custom: true };
  }
  return out;
}

// can(role, module) ou can(user, module) — user.modules (résolu au serveur) a priorité
export function can(who, module) {
  if (module === 'aide' || module === 'dashboard' || module === 'imprimes') return true;
  if (who && typeof who === 'object') {
    if (who.role === 'admin') return true;
    if (Array.isArray(who.modules)) return who.modules.includes(module);
    who = who.role;
  }
  const r = ROLES[who];
  if (!r) return false;
  if (r.modules === '*') return true;
  return r.modules.includes(module);
}
