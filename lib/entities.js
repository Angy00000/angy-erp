import { n, r2 } from './api';

// Configuration du moteur CRUD générique (côté serveur)
// fields : colonnes modifiables ; filters : filtres autorisés en query string
export const ENTITIES = {
  categories: { table: 'categories', module: 'stock', fields: ['name', 'kind'], search: ['name'], filters: ['kind'], order: 'name' },
  warehouses: { table: 'warehouses', module: 'stock', fields: ['name', 'kind', 'temperature'], order: 'name' },

  items: {
    table: 'items', module: 'stock', alias: 'i',
    fields: ['code', 'name', 'type', 'category_id', 'unit', 'unit_volume', 'purchase_price', 'sale_price', 'wholesale_price', 'cost_price', 'min_stock', 'shelf_life_days', 'barcode', 'description', 'active'],
    search: ['i.name', 'i.code', 'i.barcode'], filters: ['type', 'category_id', 'active'],
    select: `SELECT i.*, c.name AS category_name,
      COALESCE((SELECT SUM(l.qty) FROM lots l WHERE l.item_id=i.id AND l.status='ok'),0) AS stock,
      COALESCE((SELECT SUM(l.qty) FROM lots l WHERE l.item_id=i.id AND l.status<>'ok'),0) AS stock_blocked
      FROM items i LEFT JOIN categories c ON c.id=i.category_id`,
    order: 'i.name',
    readModules: ['ventes', 'caisse', 'achats', 'production', 'qualite'],
  },

  lots: {
    table: 'lots', module: 'stock', alias: 'l', noCreate: true,
    fields: ['lot_number', 'status', 'expiry_date', 'warehouse_id'],
    search: ['l.lot_number', 'i.name'], filters: ['item_id', 'status', 'warehouse_id'],
    select: `SELECT l.*, i.name AS item_name, i.unit, i.type AS item_type, w.name AS warehouse_name, s.name AS supplier_name
      FROM lots l JOIN items i ON i.id=l.item_id LEFT JOIN warehouses w ON w.id=l.warehouse_id LEFT JOIN suppliers s ON s.id=l.supplier_id`,
    order: 'l.created_at DESC', extraWhere: { instock: 'l.qty>0' },
    readModules: ['qualite', 'production', 'ventes'],
  },

  stock_movements: {
    table: 'stock_movements', module: 'stock', alias: 'm', readOnly: true,
    search: ['i.name', 'l.lot_number', 'm.note'], filters: ['item_id', 'type', 'lot_id'],
    select: `SELECT m.*, i.name AS item_name, i.unit, l.lot_number, u.name AS user_name
      FROM stock_movements m JOIN items i ON i.id=m.item_id LEFT JOIN lots l ON l.id=m.lot_id LEFT JOIN users u ON u.id=m.user_id`,
    order: 'm.created_at DESC, m.id DESC', readModules: ['qualite', 'production'],
  },

  suppliers: {
    table: 'suppliers', module: 'achats', alias: 's',
    fields: ['code', 'name', 'contact', 'phone', 'email', 'address', 'ninea', 'payment_terms', 'approved', 'rating', 'notes'],
    search: ['s.name', 's.phone', 's.code'],
    select: `SELECT s.*,
      COALESCE((SELECT SUM(pl.received_qty*pl.unit_price) FROM purchase_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE po.supplier_id=s.id AND po.status<>'annule'),0)
      - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.party_type='supplier' AND p.party_id=s.id),0) AS balance
      FROM suppliers s`,
    order: 's.name', readModules: ['stock', 'qualite', 'caisse'],
  },

  customers: {
    table: 'customers', module: 'ventes', alias: 'c',
    fields: ['code', 'name', 'type', 'phone', 'email', 'address', 'credit_limit', 'notes'],
    search: ['c.name', 'c.phone', 'c.code'], filters: ['type'],
    select: `SELECT c.*,
      COALESCE((SELECT SUM(d.total-d.paid) FROM sales_docs d WHERE d.customer_id=c.id AND d.type='facture' AND d.status IN ('valide','partiel','paye')),0) AS balance,
      COALESCE((SELECT SUM(d.total) FROM sales_docs d WHERE d.customer_id=c.id AND d.type='facture' AND d.status IN ('valide','partiel','paye')),0) AS revenue
      FROM customers c`,
    order: 'c.name', readModules: ['caisse'],
  },

  accounts: {
    table: 'accounts', module: 'caisse', alias: 'a',
    fields: ['name', 'type', 'initial_balance', 'active'],
    select: `SELECT a.*, a.initial_balance + COALESCE((SELECT SUM(t.amount) FROM cash_transactions t WHERE t.account_id=a.id),0) AS balance FROM accounts a`,
    order: 'a.id', readModules: ['ventes', 'achats', 'rh'],
  },

  cash_transactions: {
    table: 'cash_transactions', module: 'caisse', alias: 't', readOnly: true,
    search: ['t.label', 't.category'], filters: ['account_id', 'category', 'ref_type'],
    select: `SELECT t.*, a.name AS account_name, u.name AS user_name FROM cash_transactions t
      LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN users u ON u.id=t.user_id`,
    order: 't.date DESC, t.id DESC', dateCol: 't.date',
  },

  payments: {
    table: 'payments', module: 'caisse', alias: 'p', readOnly: true,
    filters: ['direction', 'party_type', 'party_id', 'doc_type', 'doc_id'],
    select: `SELECT p.*, a.name AS account_name FROM payments p LEFT JOIN accounts a ON a.id=p.account_id`,
    order: 'p.date DESC, p.id DESC', readModules: ['ventes', 'achats'], dateCol: 'p.date',
  },

  expenses: {
    table: 'expenses', module: 'caisse', alias: 'e',
    fields: ['date', 'category', 'label', 'amount', 'account_id', 'supplier_id', 'reference', 'production_id'],
    search: ['e.label', 'e.category', 'e.reference'], filters: ['category', 'account_id', 'production_id'],
    select: `SELECT e.*, a.name AS account_name, s.name AS supplier_name, po.number AS production_number FROM expenses e
      LEFT JOIN accounts a ON a.id=e.account_id LEFT JOIN suppliers s ON s.id=e.supplier_id LEFT JOIN production_orders po ON po.id=e.production_id`,
    order: 'e.date DESC, e.id DESC', dateCol: 'e.date', readModules: ['production'],
    cash: (row) => row.account_id ? { account_id: row.account_id, amount: -n(row.amount), category: 'Dépense: ' + (row.category || 'Divers'), label: row.label, date: row.date } : null,
  },

  recipes: {
    table: 'recipes', module: 'production', alias: 'r',
    fields: ['product_id', 'name', 'yield_qty', 'labor_cost', 'overhead_cost', 'duration_min', 'instructions', 'active'],
    search: ['r.name', 'i.name'], filters: ['product_id', 'active'],
    select: `SELECT r.*, i.name AS product_name, i.unit AS product_unit,
      COALESCE((SELECT SUM(rl.qty*it.cost_price) FROM recipe_lines rl JOIN items it ON it.id=rl.item_id WHERE rl.recipe_id=r.id),0) AS material_cost
      FROM recipes r LEFT JOIN items i ON i.id=r.product_id`,
    order: 'r.name',
    lines: { table: 'recipe_lines', fk: 'recipe_id', fields: ['item_id', 'qty'],
      select: 'SELECT rl.*, it.name AS item_name, it.unit, it.cost_price FROM recipe_lines rl JOIN items it ON it.id=rl.item_id WHERE rl.recipe_id=$1 ORDER BY rl.id' },
    readModules: ['qualite'],
  },

  production_orders: {
    table: 'production_orders', module: 'production', alias: 'po',
    fields: ['recipe_id', 'product_id', 'planned_qty', 'planned_date', 'labor_cost', 'overhead_cost', 'expense_cost', 'team', 'notes', 'expiry_date', 'lot_number'],
    search: ['po.number', 'i.name', 'po.lot_number'], filters: ['status', 'product_id'],
    select: `SELECT po.*, i.name AS product_name, i.unit AS product_unit, i.unit_volume, i.sale_price AS product_price, r.name AS recipe_name, r.yield_qty,
        lo.qty AS lot_qty, lo.initial_qty AS lot_initial, u.name AS user_name
      FROM production_orders po LEFT JOIN items i ON i.id=po.product_id LEFT JOIN recipes r ON r.id=po.recipe_id
      LEFT JOIN lots lo ON lo.id=po.lot_id LEFT JOIN users u ON u.id=po.user_id`,
    order: 'po.created_at DESC', dateCol: 'po.planned_date',
    numbering: () => ({ key: 'OF', prefix: 'OF' }),
    lockedWhen: (row) => (['termine', 'annule'].includes(row.status) ? 'Ordre clôturé, modification impossible' : null),
    beforeSave: async (t, data, user) => {
      if (data.recipe_id && !data.product_id) {
        const r = await t.one('SELECT product_id FROM recipes WHERE id=$1 AND company_id=$2', [data.recipe_id, user.cid]);
        if (r) data.product_id = r.product_id;
      }
    },
    readModules: ['qualite', 'rh'],
  },

  purchase_orders: {
    table: 'purchase_orders', module: 'achats', alias: 'po',
    fields: ['supplier_id', 'date', 'expected_date', 'notes'],
    search: ['po.number', 's.name'], filters: ['status', 'supplier_id'],
    select: `SELECT po.*, s.name AS supplier_name,
      COALESCE((SELECT SUM(pl.received_qty*pl.unit_price) FROM purchase_lines pl WHERE pl.po_id=po.id),0) AS received_value
      FROM purchase_orders po LEFT JOIN suppliers s ON s.id=po.supplier_id`,
    order: 'po.created_at DESC', dateCol: 'po.date',
    numbering: () => ({ key: 'BC', prefix: 'BC' }),
    // Achat au marché ou sans fournisseur habituel : « Fournisseur divers » est utilisé (créé au besoin)
    beforeSave: async (t, data, user, existing) => {
      if (!data.supplier_id && !(existing && existing.supplier_id)) {
        let s = await t.one("SELECT id FROM suppliers WHERE company_id=$1 AND name='Fournisseur divers (marché)' LIMIT 1", [user.cid]);
        if (!s) s = await t.one("INSERT INTO suppliers (company_id,name,notes) VALUES ($1,'Fournisseur divers (marché)','Achats au marché ou sans fournisseur habituel') RETURNING id", [user.cid]);
        data.supplier_id = s.id;
      }
    },
    lockedWhen: (row) => (!['brouillon', 'envoye'].includes(row.status) ? 'Commande déjà réceptionnée ou annulée' : null),
    lines: { table: 'purchase_lines', fk: 'po_id', fields: ['item_id', 'qty', 'unit_price'],
      select: 'SELECT pl.*, it.name AS item_name, it.unit FROM purchase_lines pl LEFT JOIN items it ON it.id=pl.item_id WHERE pl.po_id=$1 ORDER BY pl.id' },
    compute: (row, lines) => ({ total: r2(lines.reduce((s, l) => s + n(l.qty) * n(l.unit_price), 0)) }),
    readModules: ['stock', 'caisse'],
  },

  sales_docs: {
    table: 'sales_docs', module: 'ventes', alias: 'd',
    fields: ['type', 'customer_id', 'date', 'due_date', 'discount', 'tax', 'channel', 'notes'],
    search: ['d.number', 'c.name'], filters: ['type', 'status', 'customer_id', 'channel'],
    select: `SELECT d.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS user_name
      FROM sales_docs d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN users u ON u.id=d.user_id`,
    order: 'd.created_at DESC', dateCol: 'd.date',
    numbering: (row) => ({ key: row.type || 'facture', prefix: { devis: 'DEV', commande: 'CMD', facture: 'FAC' }[row.type] || 'FAC' }),
    lockedWhen: (row) => (row.status !== 'brouillon' ? 'Document validé : annulez-le pour le modifier' : null),
    lines: { table: 'sales_lines', fk: 'doc_id', fields: ['item_id', 'description', 'qty', 'unit_price', 'discount', 'lot_id'],
      select: 'SELECT sl.*, it.name AS item_name, it.unit, lo.lot_number, lo.expiry_date AS lot_expiry FROM sales_lines sl LEFT JOIN items it ON it.id=sl.item_id LEFT JOIN lots lo ON lo.id=sl.lot_id WHERE sl.doc_id=$1 ORDER BY sl.id' },
    compute: (row, lines) => {
      const subtotal = r2(lines.reduce((s, l) => s + (n(l.qty) * n(l.unit_price) - n(l.discount)), 0));
      return { subtotal, total: r2(subtotal - n(row.discount) + n(row.tax)) };
    },
    lineCompute: (l) => ({ total: r2(n(l.qty) * n(l.unit_price) - n(l.discount)) }),
    readModules: ['caisse'],
  },

  quality_controls: {
    table: 'quality_controls', module: 'qualite', alias: 'qc',
    fields: ['date', 'type', 'lot_id', 'item_id', 'production_id', 'parameter', 'value', 'target', 'result', 'controller', 'notes'],
    search: ['qc.parameter', 'i.name', 'l.lot_number'], filters: ['type', 'result', 'lot_id', 'production_id'],
    select: `SELECT qc.*, i.name AS item_name, l.lot_number, po.number AS production_number FROM quality_controls qc
      LEFT JOIN items i ON i.id=qc.item_id LEFT JOIN lots l ON l.id=qc.lot_id LEFT JOIN production_orders po ON po.id=qc.production_id`,
    order: 'qc.date DESC', readModules: ['production'],
  },
  nonconformities: {
    table: 'nonconformities', module: 'qualite', alias: 'nc',
    fields: ['date', 'source', 'lot_id', 'description', 'severity', 'root_cause', 'corrective_action', 'responsible', 'due_date', 'status', 'closed_at'],
    search: ['nc.number', 'nc.description'], filters: ['status', 'severity'],
    select: `SELECT nc.*, l.lot_number FROM nonconformities nc LEFT JOIN lots l ON l.id=nc.lot_id`,
    order: 'nc.date DESC, nc.id DESC', numbering: () => ({ key: 'NC', prefix: 'NC' }),
    readModules: ['production'],
  },
  haccp_points: {
    table: 'haccp_points', module: 'qualite',
    fields: ['step', 'hazard', 'is_ccp', 'critical_limit', 'monitoring', 'frequency', 'corrective_action', 'responsible'],
    search: ['step', 'hazard'], order: 'id', readModules: ['production'],
  },

  employees: {
    table: 'employees', module: 'rh', alias: 'e',
    fields: ['code', 'name', 'position', 'department', 'phone', 'address', 'hire_date', 'contract_type', 'base_salary', 'active', 'notes'],
    search: ['e.name', 'e.position', 'e.department'], filters: ['department', 'active'],
    order: 'e.name', readModules: ['production'],
  },
  attendance: {
    table: 'attendance', module: 'rh', alias: 'a',
    fields: ['employee_id', 'date', 'status', 'hours', 'note'], filters: ['employee_id', 'date', 'status'],
    select: 'SELECT a.*, e.name AS employee_name FROM attendance a JOIN employees e ON e.id=a.employee_id',
    order: 'a.date DESC, e.name', dateCol: 'a.date',
  },
  schedules: {
    table: 'schedules', module: 'rh', alias: 's',
    fields: ['employee_id', 'date', 'shift', 'task', 'production_id'], filters: ['employee_id', 'date'],
    select: `SELECT s.*, e.name AS employee_name, po.number AS production_number FROM schedules s
      JOIN employees e ON e.id=s.employee_id LEFT JOIN production_orders po ON po.id=s.production_id`,
    order: 's.date, s.shift', dateCol: 's.date', readModules: ['production'],
  },
  payrolls: {
    table: 'payrolls', module: 'rh', alias: 'p',
    fields: ['employee_id', 'period', 'base', 'bonus', 'deductions', 'advance'], filters: ['period', 'status', 'employee_id'],
    select: 'SELECT p.*, e.name AS employee_name, e.position FROM payrolls p JOIN employees e ON e.id=p.employee_id',
    order: 'p.period DESC, e.name',
    lockedWhen: (row) => (row.status === 'paye' ? 'Bulletin déjà payé' : null),
    compute: (row) => ({ net: r2(n(row.base) + n(row.bonus) - n(row.deductions) - n(row.advance)) }),
    readModules: ['caisse'],
  },

  users: {
    table: 'users', module: 'admin',
    fields: ['name', 'email', 'role', 'active'], search: ['name', 'email'],
    select: 'SELECT id,company_id,name,email,role,active,last_login,created_at FROM users',
    order: 'name',
  },
  audit_logs: {
    table: 'audit_logs', module: 'admin', alias: 'al', readOnly: true,
    search: ['al.user_name', 'al.entity', 'al.action'], filters: ['entity', 'user_id'],
    order: 'al.created_at DESC',
  },
};
