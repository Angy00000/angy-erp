// Utilitaires côté navigateur
export async function api(path, { method = 'GET', body, params } = {}) {
  let url = path.startsWith('/api') ? path : '/api/' + path;
  if (params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 401 && typeof window !== 'undefined' && !path.includes('auth/')) {
    window.location.href = '/';
    throw new Error('Session expirée');
  }
  if (!res.ok) throw new Error((data && data.error) || 'Erreur serveur');
  return data;
}

export const crud = {
  list: (e, params) => api(`crud/${e}`, { params }),
  get: (e, id) => api(`crud/${e}/${id}`),
  create: (e, body) => api(`crud/${e}`, { method: 'POST', body }),
  update: (e, id, body) => api(`crud/${e}/${id}`, { method: 'PUT', body }),
  remove: (e, id) => api(`crud/${e}/${id}`, { method: 'DELETE' }),
};
export const op = (name, body) => api(`ops/${name}`, { method: 'POST', body });
export const report = (name, params) => api(`reports/${name}`, { params });

let CURRENCY = 'FCFA';
export const setCurrency = (c) => { CURRENCY = c || 'FCFA'; };
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf3 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
export const money = (v) => `${nf0.format(Math.round(Number(v) || 0))} ${CURRENCY}`;
export const num = (v) => nf3.format(Number(v) || 0);
export const date = (v) => {
  if (!v) return '';
  const s = String(v);
  const d = s.length === 10 ? new Date(s + 'T00:00:00') : new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('fr-FR');
};
export const datetime = (v) => (v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const monthStart = () => today().slice(0, 8) + '01';
export const daysUntil = (d) => (d ? Math.ceil((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000) : null);

export function exportCSV(filename, columns, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.l)).join(';');
  const body = rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : c.t === 'money' || c.t === 'qty' ? (r[c.k] ?? '') : c.fmt ? strip(c.fmt(r)) : r[c.k])).join(';')).join('\n');
  const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function strip(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return v;
  return '';
}

export const LABELS = {
  item_type: { mp: 'Matière première', pf: 'Produit fini', semi_fini: 'Semi-fini', emballage: 'Emballage', consommable: 'Consommable', materiel: 'Matériel & équipement', service: 'Service' },
  lot_status: { ok: 'Disponible', quarantaine: 'Quarantaine', bloque: 'Bloqué', perime: 'Périmé' },
  po_status: { brouillon: 'Brouillon', envoye: 'Envoyée', partiel: 'Reçue partiellement', recu: 'Reçue', annule: 'Annulée' },
  prod_status: { planifie: 'Planifié', en_cours: 'En cours', termine: 'Terminé', annule: 'Annulé' },
  sale_status: { brouillon: 'Brouillon', valide: 'Validé', partiel: 'Payé partiellement', paye: 'Payé', annule: 'Annulé', transforme: 'Transformé' },
  sale_type: { devis: 'Devis', commande: 'Bon de commande', facture: 'Facture' },
  move_type: { entree: 'Entrée', sortie: 'Sortie', achat: 'Réception achat', vente: 'Vente', production: 'Production', perte: 'Perte', casse: 'Casse', peremption: 'Péremption', inventaire: 'Inventaire', transfert: 'Transfert', annulation: 'Annulation', echantillon: 'Échantillon', don: 'Don', depot: 'Confié à un vendeur', retour: 'Retour vendeur' },
  account_type: { caisse: 'Caisse', banque: 'Banque', mobile_money: 'Mobile money' },
  nc_status: { ouverte: 'Ouverte', en_cours: 'En cours', cloturee: 'Clôturée' },
  severity: { mineure: 'Mineure', majeure: 'Majeure', critique: 'Critique' },
  qc_type: { reception: 'Réception MP', en_cours: 'En cours de fabrication', produit_fini: 'Produit fini', hygiene: 'Hygiène / nettoyage', temperature: 'Température', autre: 'Autre' },
  qc_result: { conforme: 'Conforme', non_conforme: 'Non conforme' },
  attendance: { present: 'Présent', absent: 'Absent', retard: 'Retard', conge: 'Congé', maladie: 'Maladie' },
  customer_type: { particulier: 'Particulier', vendeur: 'Vendeur / vendeuse', revendeur: 'Revendeur / boutique', supermarche: 'Supermarché', hotel_restaurant: 'Hôtel / restaurant', entreprise: 'Entreprise', distributeur: 'Distributeur', institution: 'École / institution' },
  payroll_status: { brouillon: 'À payer', paye: 'Payé' },
  channel: { comptoir: 'Comptoir', boutique_en_ligne: 'Boutique en ligne', livraison: 'Livraison', grossiste: 'Grossiste', whatsapp: 'WhatsApp', depot: 'Vendeur / dépôt' },
};
export const opts = (key) => Object.entries(LABELS[key]);

export const TONE = {
  ok: 'green', paye: 'green', termine: 'green', recu: 'green', conforme: 'green', cloturee: 'green', present: 'green', valide: 'blue',
  en_cours: 'blue', envoye: 'blue', partiel: 'amber', planifie: 'gray', brouillon: 'gray', transforme: 'gray',
  quarantaine: 'amber', retard: 'amber', ouverte: 'red', bloque: 'red', perime: 'red', annule: 'red', non_conforme: 'red', absent: 'red',
  mineure: 'amber', majeure: 'red', critique: 'red', conge: 'blue', maladie: 'amber', ouvert: 'blue', regle: 'green',
};
