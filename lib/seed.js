import { stockIn } from './stock';

export async function seedCompany(t, user, demo) {
  const cid = user.cid;
  for (const [name, type] of [['Caisse principale', 'caisse'], ['Wave', 'mobile_money'], ['Orange Money', 'mobile_money'], ['Banque', 'banque']]) {
    await t.q('INSERT INTO accounts (company_id,name,type) VALUES ($1,$2,$3)', [cid, name, type]);
  }
  for (const [name, kind, temp] of [['Magasin principal', 'principal', 'Ambiante'], ['Chambre froide', 'froid', '0-4 °C'], ['Zone de quarantaine', 'quarantaine', null]]) {
    await t.q('INSERT INTO warehouses (company_id,name,kind,temperature) VALUES ($1,$2,$3,$4)', [cid, name, kind, temp]);
  }
  const cats = {};
  for (const [name, kind] of [['Matières premières', 'mp'], ['Emballages', 'emballage'], ['Produits finis', 'pf'], ['Consommables', 'consommable'], ['Matériel & équipement', 'materiel']]) {
    cats[kind] = (await t.one('INSERT INTO categories (company_id,name,kind) VALUES ($1,$2,$3) RETURNING id', [cid, name, kind])).id;
  }
  await t.q("INSERT INTO customers (company_id,code,name,type) VALUES ($1,'CLT-0001','Client comptoir','particulier')", [cid]);
  if (!demo) return;

  const mk = async (code, name, type, unit, cost, sale = 0, extra = {}) => {
    const r = await t.one(
      `INSERT INTO items (company_id,code,name,type,category_id,unit,purchase_price,cost_price,sale_price,wholesale_price,min_stock,shelf_life_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11) RETURNING id`,
      [cid, code, name, type, cats[type] || cats.mp, unit, cost, sale, extra.wholesale || 0, extra.min || 0, extra.shelf || null]
    );
    return r.id;
  };
  const sup = (await t.one("INSERT INTO suppliers (company_id,code,name,phone,payment_terms) VALUES ($1,'FRN-0001','Coopérative agricole (exemple)','770000000','30 jours') RETURNING id", [cid])).id;
  const bissap = await mk('MP-BIS', 'Bissap rouge séché', 'mp', 'kg', 2500, 0, { min: 10, shelf: 365 });
  const sucre = await mk('MP-SUC', 'Sucre en poudre', 'mp', 'kg', 650, 0, { min: 25, shelf: 730 });
  const ging = await mk('MP-GIN', 'Gingembre frais', 'mp', 'kg', 1200, 0, { min: 5, shelf: 21 });
  const eau = await mk('MP-EAU', 'Eau traitée', 'mp', 'L', 5, 0, { min: 200 });
  const btl = await mk('EMB-B1L', 'Bouteille PET 1 L', 'emballage', 'unité', 150, 0, { min: 200 });
  const bch = await mk('EMB-BCH', 'Bouchon', 'emballage', 'unité', 15, 0, { min: 200 });
  const eti = await mk('EMB-ETI', 'Étiquette', 'emballage', 'unité', 25, 0, { min: 200 });
  const jb = await mk('PF-JB1', 'Jus de bissap 1 L', 'pf', 'bouteille', 0, 1000, { wholesale: 850, min: 50, shelf: 30 });
  const jg = await mk('PF-JG1', 'Jus de gingembre 1 L', 'pf', 'bouteille', 0, 1000, { wholesale: 850, min: 50, shelf: 30 });

  for (const [item, qty, cost] of [[bissap, 50, 2500], [sucre, 200, 650], [ging, 30, 1200], [eau, 2000, 5], [btl, 1000, 150], [bch, 1000, 15], [eti, 1000, 25]]) {
    await stockIn(t, user, { item_id: item, qty, unit_cost: cost, supplier_id: sup, type: 'entree', ref_type: 'stock_initial', note: 'Stock initial (exemple)' });
  }
  const rec = async (product, name, lines) => {
    const r = await t.one('INSERT INTO recipes (company_id,product_id,name,yield_qty,labor_cost,overhead_cost,duration_min,instructions) VALUES ($1,$2,$3,100,5000,3000,180,$4) RETURNING id',
      [cid, product, name, 'Tri et lavage → infusion/extraction → filtration → sucrage → pasteurisation 85 °C 15 min → embouteillage à chaud → étiquetage → refroidissement']);
    for (const [it, q] of lines) await t.q('INSERT INTO recipe_lines (recipe_id,item_id,qty) VALUES ($1,$2,$3)', [r.id, it, q]);
  };
  await rec(jb, 'Jus de bissap 1 L — lot de 100', [[bissap, 3], [sucre, 10], [eau, 95], [btl, 100], [bch, 100], [eti, 100]]);
  await rec(jg, 'Jus de gingembre 1 L — lot de 100', [[ging, 6], [sucre, 12], [eau, 95], [btl, 100], [bch, 100], [eti, 100]]);

  const haccp = [
    ['Réception des matières premières', 'Biologique / physique (corps étrangers, moisissures)', false, 'Aspect sain, absence de moisissure', 'Contrôle visuel à chaque livraison', 'Chaque réception', 'Refus ou mise en quarantaine du lot'],
    ['Lavage', 'Physique / biologique', false, 'Eau potable, 3 rinçages', 'Contrôle visuel', 'Chaque lot', 'Relaver'],
    ['Pasteurisation', 'Biologique (survie des pathogènes)', true, '≥ 85 °C pendant 15 min', 'Thermomètre + chronomètre, enregistrement', 'Chaque lot', 'Prolonger le traitement ou bloquer le lot'],
    ['Embouteillage à chaud', 'Biologique (recontamination)', true, 'Produit ≥ 80 °C au remplissage', 'Mesure de température', 'Toutes les 30 min', 'Repasteuriser, nettoyer la ligne'],
    ['Stockage produit fini', 'Biologique (prolifération)', false, '0–4 °C pour les jus frais', 'Relevé de température', '2 fois par jour', 'Évaluer et bloquer les lots concernés'],
  ];
  for (const h of haccp) await t.q('INSERT INTO haccp_points (company_id,step,hazard,is_ccp,critical_limit,monitoring,frequency,corrective_action) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [cid, ...h]);
  for (const [code, name, pos, dep, sal] of [['EMP-001', 'Opérateur production (exemple)', 'Opérateur', 'Production', 100000], ['EMP-002', 'Vendeuse (exemple)', 'Vendeuse', 'Commercial', 90000]]) {
    await t.q('INSERT INTO employees (company_id,code,name,position,department,hire_date,base_salary) VALUES ($1,$2,$3,$4,$5,current_date,$6)', [cid, code, name, pos, dep, sal]);
  }
}
