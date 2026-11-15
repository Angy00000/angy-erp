// Shared by client and server
export const MODULES = [
  { key: 'dashboard', label: 'Tableau de bord', icon: '◧' },
  { key: 'ventes', label: 'Ventes & Clients', icon: '◈' },
  { key: 'caisse', label: 'Caisse & Trésorerie', icon: '◉' },
  { key: 'stock', label: 'Stock & Articles', icon: '▦' },
  { key: 'achats', label: 'Achats & Fournisseurs', icon: '⬇' },
  { key: 'production', label: 'Production', icon: '⚙' },
  { key: 'qualite', label: 'Qualité & HACCP', icon: '✓' },
  { key: 'rh', label: 'RH & Planning', icon: '☺' },
  { key: 'rapports', label: 'Rapports', icon: '▤' },
  { key: 'admin', label: 'Administration', icon: '⚑' },
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
  const r = ROLES[role];
  if (!r) return false;
  if (r.modules === '*') return true;
  return r.modules.includes(module);
}
