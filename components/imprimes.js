import { money, num, date, today, LABELS } from '../lib/client';

// Imprimés vierges (à remplir à la main) et états pré-remplis, avec le logo et l'en-tête de l'entreprise.
// Chaque fiche est une page A4 (ou A5) prête à imprimer ou à enregistrer en PDF.

export function EnTete({ c, title, sub }) {
  return (
    <header className="d-head">
      <div className="d-id">
        {c.logo && <img src={c.logo} alt="" />}
        <div>
          <b>{c.name}</b>
          {c.slogan && <i>{c.slogan}</i>}
          <span>{[c.address, c.city].filter(Boolean).join(', ')}</span>
          <span>{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
          {(c.ninea || c.rccm) && <span>{[c.ninea && `NINEA ${c.ninea}`, c.rccm && `RCCM ${c.rccm}`].filter(Boolean).join(' · ')}</span>}
        </div>
      </div>
      <div className="d-tt"><h1>{title}</h1>{sub && <span>{sub}</span>}</div>
    </header>
  );
}

const F = ({ l, w }) => <div className="v-f" style={w ? { flex: w } : undefined}><span>{l}</span><i /></div>;
const Row = ({ children }) => <div className="v-row">{children}</div>;
const Box = ({ l }) => <span className="v-case"><b />{l}</span>;
const Sigs = ({ items }) => <div className="v-sigs" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>{items.map((x) => <div key={x}><span>{x}</span></div>)}</div>;
const Fait = ({ c }) => <p className="v-fait">Fait à {c.city || '……………………'}, le ……………………………</p>;

// Tableau à lignes vides (ou pré-remplies via rows)
function Grid({ cols, n = 10, rows, foot, small }) {
  const body = rows || Array.from({ length: n }, () => cols.map(() => ''));
  return (
    <table className={'v-t' + (small ? ' sm' : '')}>
      <thead><tr>{cols.map((h, i) => <th key={i} style={typeof h === 'object' ? { width: h.w } : undefined}>{typeof h === 'object' ? h.l : h}</th>)}</tr></thead>
      <tbody>{body.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
      {foot && <tfoot><tr>{foot.map((v, j) => <td key={j}>{v}</td>)}</tr></tfoot>}
    </table>
  );
}
const Doc = ({ a5, children, dense }) => <article className={'doc ' + (a5 ? 'a5' : 'a4') + (dense ? ' dense' : '')}>{children}</article>;
const Sec = ({ t, children }) => <section className="d-sec"><h3>{t}</h3>{children}</section>;
const pf = (d) => (d.items || []).filter((i) => i.type === 'pf' && i.active !== false);

// ---------------- Production & qualité ----------------
function FicheProduction({ c }) {
  return (
    <Doc dense>
      <EnTete c={c} title="Fiche de production" sub="N° ………………" />
      <Row><F l="Date" /><F l="Produit / parfum" w={1.6} /><F l="N° de lot" /></Row>
      <Row><F l="Responsable" w={1.4} /><F l="Équipe présente" w={1.6} /><F l="Heure début" w={0.7} /><F l="Heure fin" w={0.7} /></Row>
      <Sec t="1. Matières premières utilisées">
        <Grid small cols={[{ l: 'Désignation', w: '34%' }, 'Fournisseur / lot', 'Quantité', 'Unité', 'Prix unitaire', 'Coût']} n={10} foot={['Total matières', '', '', '', '', '']} />
      </Sec>
      <Sec t="2. Emballages utilisés">
        <Grid small cols={[{ l: 'Désignation (sachets, bouteilles, bouchons, étiquettes…)', w: '44%' }, 'Quantité', 'Prix unitaire', 'Coût']} n={6} foot={['Total emballages', '', '', '']} />
      </Sec>
      <Sec t="3. Autres dépenses de la production">
        <Grid small cols={[{ l: 'Nature (gaz, eau, électricité, transport, main d\'œuvre…)', w: '60%' }, 'Montant']} n={5} foot={['Total autres dépenses', '']} />
      </Sec>
      <Sec t="4. Résultat">
        <Row><F l="Litres produits" /><F l="Sachets 12,5 cl" /><F l="Bouteilles 1 L" /><F l="Autre format" /></Row>
        <Row><F l="Pertes / rebuts" /><F l="Date limite (DLC)" /><F l="Coût total de la production" w={1.4} /></Row>
        <Row><span className="v-lab">Contrôle final</span><Box l="Goût" /><Box l="Couleur" /><Box l="Étanchéité" /><Box l="Étiquetage" /><Box l="Conforme" /><Box l="Non conforme" /></Row>
        <Row><F l="Observations" /></Row>
      </Sec>
      <Sigs items={['Responsable production', 'Contrôle qualité', 'Gérant(e)']} />
    </Doc>
  );
}

function ReceptionMP({ c }) {
  return (
    <Doc>
      <EnTete c={c} title="Réception des matières premières" sub="Contrôle à la livraison" />
      <Row><F l="Mois" /><F l="Responsable réception" w={1.6} /></Row>
      <Grid small cols={['Date', { l: 'Fournisseur', w: '15%' }, { l: 'Produit', w: '15%' }, 'Quantité', 'Aspect / odeur', 'Emballage intact', 'T° (si froid)', 'DLC / lot', 'Décision (A/R)', 'Visa']} n={20} />
      <p className="v-note">Décision : A = accepté · R = refusé (noter le motif au verso et prévenir le fournisseur). Ne jamais accepter un produit abîmé, moisi, mal emballé ou à la date dépassée.</p>
    </Doc>
  );
}

const ZONES = ['Sol de la salle de production', 'Plans de travail / tables', 'Marmites, casseroles, ustensiles', 'Presse / extracteur / mixeur', 'Filtres et tamis', 'Machine de conditionnement', 'Bidons et seaux', 'Réfrigérateur / congélateur', 'Lave-mains, savon, essuie-mains', 'Toilettes', 'Poubelles', 'Magasin de stockage'];
function Nettoyage({ c }) {
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  return (
    <Doc>
      <EnTete c={c} title="Plan de nettoyage et désinfection" sub="Fiche hebdomadaire" />
      <Row><F l="Semaine du" /><F l="au" /><F l="Produit utilisé (détergent / désinfectant)" w={1.8} /></Row>
      <Grid cols={[{ l: 'Zone / équipement', w: '38%' }, ...days, 'Visa']} rows={[...ZONES, '', ''].map((z) => [z, ...days.map(() => ''), ''])} />
      <p className="v-note">Cocher ✓ chaque nettoyage effectué. Ordre : 1. retirer les déchets — 2. laver au détergent — 3. rincer — 4. désinfecter — 5. laisser sécher.</p>
      <Sigs items={['Responsable hygiène', 'Vérifié par']} />
    </Doc>
  );
}

function Temperatures({ c }) {
  return (
    <Doc dense>
      <EnTete c={c} title="Relevé des températures" sub="Réfrigérateur / chambre froide" />
      <Row><F l="Équipement" w={1.5} /><F l="Mois" /><F l="Température cible" /></Row>
      <Grid small cols={['Jour', 'Matin (°C)', 'Heure', 'Visa', 'Soir (°C)', 'Heure', 'Visa', { l: 'Action si écart', w: '26%' }]} rows={Array.from({ length: 31 }, (_, i) => [i + 1, '', '', '', '', '', '', ''])} />
      <p className="v-note">Produits frais et jus réfrigérés : entre 0 et +4 °C. Congelés : −18 °C ou moins. En cas d'écart, noter l'action (réglage, transfert des produits…).</p>
    </Doc>
  );
}

function HygienePersonnel({ c }) {
  return (
    <Doc>
      <EnTete c={c} title="Contrôle hygiène du personnel" sub="À remplir avant l'entrée en production" />
      <Row><F l="Date" /><F l="Contrôlé par" w={1.6} /></Row>
      <Grid cols={[{ l: 'Nom et prénom', w: '26%' }, 'Tenue propre', 'Charlotte / coiffe', 'Mains / ongles', 'Sans bijoux', 'Bonne santé', 'Masque / gants', 'Visa']} n={14} />
      <p className="v-note">Une personne malade (fièvre, diarrhée, plaie infectée…) ne doit pas manipuler les aliments. Lavage des mains obligatoire à l'entrée, après les toilettes et après chaque pause.</p>
    </Doc>
  );
}

function NonConformite({ c }) {
  return (
    <Doc>
      <EnTete c={c} title="Fiche de non-conformité" sub="N° ………………" />
      <Row><F l="Date" /><F l="Déclarée par" w={1.6} /></Row>
      <Row><span className="v-lab">Concerne</span><Box l="Matière première" /><Box l="Produit fini" /><Box l="Emballage" /><Box l="Hygiène" /><Box l="Équipement" /><Box l="Réclamation client" /></Row>
      <Row><F l="Produit / article" w={1.5} /><F l="N° de lot" /><F l="Quantité concernée" /></Row>
      <Sec t="1. Description du problème"><Row><F l="" /></Row><Row><F l="" /></Row><Row><F l="" /></Row></Sec>
      <Sec t="2. Cause identifiée"><Row><F l="" /></Row><Row><F l="" /></Row></Sec>
      <Sec t="3. Décision immédiate">
        <Row><Box l="Retravailler" /><Box l="Déclasser" /><Box l="Détruire" /><Box l="Retourner au fournisseur" /><Box l="Libérer après contrôle" /></Row>
      </Sec>
      <Sec t="4. Action corrective (pour que ça ne se reproduise pas)">
        <Row><F l="" /></Row><Row><F l="" /></Row>
        <Row><F l="Responsable" w={1.5} /><F l="Délai" /></Row>
      </Sec>
      <Sec t="5. Vérification de l'efficacité"><Row><F l="Date" /><F l="Résultat" w={2} /></Row></Sec>
      <Sigs items={['Déclarant', 'Responsable qualité', 'Direction']} />
    </Doc>
  );
}

// ---------------- Stock ----------------
function FicheStock({ c }) {
  return (
    <Doc dense>
      <EnTete c={c} title="Fiche de stock" sub="Une fiche par article" />
      <Row><F l="Article" w={2} /><F l="Unité" /><F l="Stock minimum" /></Row>
      <Grid small cols={['Date', { l: 'Libellé (réception, production, vente, perte…)', w: '34%' }, 'N° bon / lot', 'Entrée', 'Sortie', 'Stock', 'Visa']} n={26} />
    </Doc>
  );
}

function BonSortie({ c }) {
  return (
    <Doc a5>
      <EnTete c={c} title="Bon de sortie magasin" sub="N° ………………" />
      <Row><F l="Date" /><F l="Demandeur" w={1.4} /></Row>
      <Row><span className="v-lab">Motif</span><Box l="Production" /><Box l="Vente" /><Box l="Perte / casse" /><Box l="Autre" /></Row>
      <Grid small cols={[{ l: 'Article', w: '50%' }, 'Unité', 'Quantité', 'Lot']} n={8} />
      <Sigs items={['Demandeur', 'Magasinier']} />
    </Doc>
  );
}

function Inventaire({ c, data }) {
  const items = (data.items || []).filter((i) => i.active !== false && i.type !== 'service');
  const rows = items.length ? items.map((i) => [i.code || '', i.name, LABELS.item_type[i.type] || i.type, i.unit || '', '', '', '']) : null;
  return (
    <Doc dense>
      <EnTete c={c} title="Feuille d'inventaire" sub="Comptage physique du stock" />
      <Row><F l="Date de l'inventaire" /><F l="Compté par" w={1.4} /><F l="Vérifié par" w={1.4} /></Row>
      <Grid small cols={['Code', { l: 'Article', w: '30%' }, 'Type', 'Unité', 'Quantité comptée', 'Lot / DLC', 'Observation']} rows={rows ? [...rows, ...Array.from({ length: 4 }, () => ['', '', '', '', '', '', ''])] : undefined} n={28} />
    </Doc>
  );
}

// ---------------- Ventes & caisse ----------------
function BonCommande({ c, data }) {
  const prods = pf(data);
  const rows = prods.length ? [...prods.map((p) => [p.name, money(p.sale_price), '', '']), ['', '', '', ''], ['', '', '', '']] : undefined;
  return (
    <Doc>
      <EnTete c={c} title="Bon de commande" sub="N° ………………" />
      <Row><F l="Client" w={2} /><F l="Téléphone" /></Row>
      <Row><F l="Adresse de livraison" w={2} /><F l="Date de livraison souhaitée" /></Row>
      <Grid cols={[{ l: 'Produit', w: '46%' }, 'Prix unitaire', 'Quantité', 'Montant']} rows={rows} n={12} foot={['', '', 'TOTAL', '']} />
      <Row><span className="v-lab">Paiement</span><Box l="Espèces" /><Box l="Wave" /><Box l="Orange Money" /><Box l="Virement" /><Box l="À la livraison" /></Row>
      <Row><F l="Acompte versé" /><F l="Reste à payer" /></Row>
      <Fait c={c} />
      <Sigs items={['Le client', 'Pour l\'entreprise']} />
    </Doc>
  );
}

function FactureVierge({ c }) {
  return (
    <Doc>
      <EnTete c={c} title="Facture" sub="N° ………………   Date : ………………" />
      <div className="v-client"><Row><F l="Client" /></Row><Row><F l="Adresse" /></Row><Row><F l="Téléphone" /></Row></div>
      <Grid cols={[{ l: 'Désignation', w: '50%' }, 'Quantité', 'Prix unitaire', 'Montant']} n={14} />
      <table className="v-tot"><tbody>
        <tr><td>Total</td><td /></tr><tr><td>Remise</td><td /></tr><tr><td><b>Net à payer</b></td><td /></tr><tr><td>Déjà payé</td><td /></tr><tr><td>Reste à payer</td><td /></tr>
      </tbody></table>
      <Row><F l="Arrêtée la présente facture à la somme de (en lettres)" /></Row>
      <Row><F l="" /></Row>
      {c.invoice_footer && <p className="v-note">{c.invoice_footer}</p>}
      <Sigs items={['Le client', 'Cachet et signature']} />
    </Doc>
  );
}

function BonLivraison({ c }) {
  return (
    <Doc>
      <EnTete c={c} title="Bon de livraison" sub="N° ………………" />
      <Row><F l="Date" /><F l="Commande / facture N°" /></Row>
      <Row><F l="Client" w={2} /><F l="Téléphone" /></Row>
      <Row><F l="Lieu de livraison" w={2} /><F l="Livreur" /></Row>
      <Grid cols={[{ l: 'Produit', w: '50%' }, 'Format', 'Quantité livrée', 'N° de lot']} n={14} />
      <Row><F l="Observations / réserves du client" /></Row>
      <p className="v-note">Merci de vérifier les produits à la réception. Toute réserve doit être notée ci-dessus avant signature.</p>
      <Sigs items={['Livré par', 'Reçu par (nom et signature)']} />
    </Doc>
  );
}

function RecuVierge({ c }) {
  return (
    <Doc a5>
      <EnTete c={c} title="Reçu" sub="N° ………………" />
      <Row><F l="Date" /><F l="Montant" w={1.2} /></Row>
      <Row><F l="Reçu de M./Mme" /></Row>
      <Row><F l="La somme de (en lettres)" /></Row>
      <Row><F l="" /></Row>
      <Row><F l="Pour (objet)" /></Row>
      <Row><span className="v-lab">Mode</span><Box l="Espèces" /><Box l="Wave" /><Box l="Orange Money" /><Box l="Chèque" /><Box l="Virement" /></Row>
      <Row><F l="Reste à payer" /></Row>
      <Sigs items={['Le client', 'Le caissier']} />
    </Doc>
  );
}

function CaisseJour({ c }) {
  const billets = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 10, 5];
  return (
    <Doc dense>
      <EnTete c={c} title="Fiche de caisse journalière" sub="Date : ………………" />
      <Row><F l="Caissier(ère)" w={1.6} /><F l="Fond de caisse (début)" /></Row>
      <div className="d-grid2">
        <Sec t="Entrées du jour">
          <Grid small cols={[{ l: 'Nature', w: '60%' }, 'Montant']} rows={[['Ventes en espèces', ''], ['Ventes Wave', ''], ['Ventes Orange Money', ''], ['Encaissements de créances', ''], ['Autres entrées', ''], ['', '']]} foot={['Total entrées', '']} />
        </Sec>
        <Sec t="Billetage (comptage espèces)">
          <Grid small cols={['Billet / pièce', 'Nombre', 'Montant']} rows={billets.map((b) => [num(b), '', ''])} foot={['Total compté', '', '']} />
        </Sec>
      </div>
      <Sec t="Sorties / dépenses du jour">
        <Grid small cols={[{ l: 'Nature de la dépense', w: '50%' }, 'Bénéficiaire', 'N° pièce', 'Montant']} n={13} foot={['Total sorties', '', '', '']} />
      </Sec>
      <Row><F l="Solde théorique (fond + entrées espèces − sorties)" w={2} /><F l="Espèces comptées" /><F l="Écart" w={0.7} /></Row>
      <Sigs items={['Caissier(ère)', 'Contrôlé par']} />
    </Doc>
  );
}

function BonDepense({ c }) {
  return (
    <Doc a5>
      <EnTete c={c} title="Bon de dépense" sub="Pièce de caisse N° ………" />
      <Row><F l="Date" /><F l="Montant" w={1.2} /></Row>
      <Row><F l="Bénéficiaire" /></Row>
      <Row><F l="Objet de la dépense" /></Row>
      <Row><F l="" /></Row>
      <Row><span className="v-lab">Catégorie</span><Box l="Matières" /><Box l="Emballages" /><Box l="Transport" /><Box l="Énergie" /><Box l="Salaires" /><Box l="Autre" /></Row>
      <Row><F l="Production concernée (lot)" /></Row>
      <Row><span className="v-lab">Payé par</span><Box l="Caisse" /><Box l="Wave" /><Box l="Orange Money" /><Box l="Banque" /></Row>
      <Sigs items={['Demandé par', 'Approuvé par', 'Bénéficiaire']} />
    </Doc>
  );
}

// ---------------- Personnel ----------------
function Presence({ c, data }) {
  const emps = (data.employees || []).filter((e) => e.active !== false);
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const rows = (emps.length ? [...emps.map((e) => e.name), '', ''] : Array.from({ length: 14 }, () => '')).map((n) => [n, ...days.map(() => '')]);
  return (
    <Doc>
      <EnTete c={c} title="Feuille de présence du personnel" sub="Semaine du ……………… au ………………" />
      <Grid cols={[{ l: 'Nom et prénom', w: '28%' }, ...days]} rows={rows} />
      <p className="v-note">Dans chaque case : heure d'arrivée / heure de départ et signature. A = absent · R = retard · C = congé · M = maladie.</p>
      <Sigs items={['Responsable', 'Direction']} />
    </Doc>
  );
}

function Permission({ c }) {
  return (
    <Doc a5>
      <EnTete c={c} title="Demande de permission / congé" />
      <Row><F l="Nom et prénom" w={2} /><F l="Poste" /></Row>
      <Row><span className="v-lab">Type</span><Box l="Permission" /><Box l="Congé annuel" /><Box l="Maladie" /><Box l="Événement familial" /><Box l="Autre" /></Row>
      <Row><F l="Du" /><F l="Au" /><F l="Nombre de jours" /></Row>
      <Row><F l="Motif" /></Row>
      <Row><F l="" /></Row>
      <Row><span className="v-lab">Décision</span><Box l="Accordée" /><Box l="Refusée" /><F l="Remplacé(e) par" /></Row>
      <Sigs items={['L\'employé(e)', 'Le responsable']} />
    </Doc>
  );
}

// ---------------- États pré-remplis ----------------
function Tarifs({ c, data }) {
  const prods = pf(data);
  return (
    <Doc>
      <EnTete c={c} title="Liste des prix" sub={`Tarifs en vigueur au ${date(today())}`} />
      <Grid cols={[{ l: 'Produit', w: '55%' }, 'Unité', 'Prix de vente', 'Prix de gros']} rows={prods.length ? prods.map((p) => [p.name, p.unit || '', money(p.sale_price), Number(p.wholesale_price) ? money(p.wholesale_price) : '—']) : [['Aucun produit fini enregistré (Stock & Articles)', '', '', '']]} />
      <p className="v-note">Prix TTC. Pour toute commande : {[c.phone, c.email].filter(Boolean).join(' · ') || '……………………'}</p>
    </Doc>
  );
}

function EtatStock({ c, data }) {
  const items = (data.items || []).filter((i) => i.active !== false && i.type !== 'service');
  const total = items.reduce((s, i) => s + Number(i.stock || 0) * Number(i.cost_price || i.purchase_price || 0), 0);
  return (
    <Doc dense>
      <EnTete c={c} title="État du stock" sub={`Au ${date(today())}`} />
      <Grid small cols={[{ l: 'Article', w: '34%' }, 'Type', 'Stock', 'Unité', 'Minimum', 'Valeur', 'Alerte']}
        rows={items.length ? items.map((i) => [i.name, LABELS.item_type[i.type] || i.type, num(i.stock), i.unit || '', Number(i.min_stock) ? num(i.min_stock) : '', money(Number(i.stock || 0) * Number(i.cost_price || i.purchase_price || 0)), Number(i.min_stock) && Number(i.stock) <= Number(i.min_stock) ? 'À commander' : '']) : [['Aucun article', '', '', '', '', '', '']]}
        foot={['Valeur totale du stock', '', '', '', '', money(total), '']} />
    </Doc>
  );
}

export const DOC_GROUPS = [
  ['Production & qualité', ['fiche_production', 'reception_mp', 'nettoyage', 'temperatures', 'hygiene', 'non_conformite']],
  ['Stock', ['fiche_stock', 'bon_sortie', 'inventaire', 'etat_stock']],
  ['Ventes & caisse', ['bon_commande', 'facture', 'bon_livraison', 'recu', 'caisse_jour', 'bon_depense', 'tarifs']],
  ['Personnel', ['presence', 'permission']],
];

export const DOCS = {
  fiche_production: { t: 'Fiche de production', s: 'Matières, emballages, dépenses, litres, sachets et bouteilles produits, contrôle final', f: 'A4', C: FicheProduction },
  reception_mp: { t: 'Réception des matières premières', s: 'Contrôle de chaque livraison fournisseur (aspect, DLC, décision)', f: 'A4', C: ReceptionMP },
  nettoyage: { t: 'Plan de nettoyage et désinfection', s: 'Fiche hebdomadaire par zone et équipement', f: 'A4', C: Nettoyage },
  temperatures: { t: 'Relevé des températures', s: 'Réfrigérateur ou chambre froide, matin et soir, sur un mois', f: 'A4', C: Temperatures },
  hygiene: { t: 'Contrôle hygiène du personnel', s: 'Tenue, coiffe, mains, bijoux, état de santé', f: 'A4', C: HygienePersonnel },
  non_conformite: { t: 'Fiche de non-conformité', s: 'Problème, cause, décision, action corrective', f: 'A4', C: NonConformite },
  fiche_stock: { t: 'Fiche de stock', s: 'Entrées, sorties et solde d\'un article', f: 'A4', C: FicheStock },
  bon_sortie: { t: 'Bon de sortie magasin', s: 'Sortie de matières ou de produits', f: 'A5', C: BonSortie },
  inventaire: { t: 'Feuille d\'inventaire', s: 'Liste de vos articles à compter (pré-remplie)', f: 'A4', C: Inventaire, need: ['items'], etat: true },
  etat_stock: { t: 'État du stock', s: 'Quantités, valeurs et alertes du jour', f: 'A4', C: EtatStock, need: ['items'], etat: true },
  bon_commande: { t: 'Bon de commande client', s: 'Avec vos produits et prix déjà inscrits', f: 'A4', C: BonCommande, need: ['items'] },
  facture: { t: 'Facture manuelle', s: 'En cas de coupure d\'internet ou de vente hors boutique', f: 'A4', C: FactureVierge },
  bon_livraison: { t: 'Bon de livraison', s: 'Signé par le client à la réception', f: 'A4', C: BonLivraison },
  recu: { t: 'Reçu de paiement', s: 'Reçu manuel à remettre au client', f: 'A5', C: RecuVierge },
  caisse_jour: { t: 'Fiche de caisse journalière', s: 'Entrées, dépenses, billetage et écart de caisse', f: 'A4', C: CaisseJour },
  bon_depense: { t: 'Bon de dépense', s: 'Pièce justificative pour chaque sortie d\'argent', f: 'A5', C: BonDepense },
  tarifs: { t: 'Liste des prix', s: 'Vos produits finis et leurs prix (pré-remplie)', f: 'A4', C: Tarifs, need: ['items'], etat: true },
  presence: { t: 'Feuille de présence', s: 'Vos employés pour la semaine (pré-remplie)', f: 'A4', C: Presence, need: ['employees'] },
  permission: { t: 'Demande de permission / congé', s: 'À remplir par l\'employé', f: 'A5', C: Permission },
};
