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
  { key: 'admin', label: 'Administration', icon: '⚑', group: 'Équipe & pilotage' },
  { key: 'aide', label: 'Aide & suggestions', icon: '?', group: 'Équipe & pilotage' },
];

export const ROLES = {
  admin: { label: 'Administrateur', modules: '*' },
  gerant: { label: 'Gérant', modules: ['dashboard', 'ventes', 'caisse', 'stock', 'achats', 'production', 'qualite', 'rh', 'rapports'] },
  comptable: { label: 'Comptable', modules: ['dashboard', 'ventes', 'caisse', 'achats', 'rapports', 'rh'] },
  production: { label: 'Responsable production', modules: ['dashboard', 'production', 'stock', 'qualite'] },
  qualite: { label: 'Responsable qualité', modules: ['dashboard', 'qualite', 'production', 'stock'] },
  stock: { label: 'Magasinier', modules: ['dashboard', 'stock', 'achats'] },
  vente: { label: 'Vendeur / Caissier', modules: ['dashboard', 'ventes', 'caisse'] },
  rh: { label: 'Ressources humaines', modules: ['dashboard', 'rh'] },
};

export function can(role, module) {
  if (module === 'aide' || module === 'dashboard' || module === 'imprimes') return true;
  const r = ROLES[role];
  if (!r) return false;
  if (r.modules === '*') return true;
  return r.modules.includes(module);
}
