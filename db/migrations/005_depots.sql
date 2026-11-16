-- Produits confiés aux vendeurs / revendeurs (dépôt-vente) : sortie le matin, retour et règlement le soir
CREATE TABLE IF NOT EXISTS consignments (
  id serial PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number text NOT NULL, customer_id int REFERENCES customers(id), date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'ouvert', tier text DEFAULT 'detail', notes text,
  sale_id int, settled_at timestamptz, user_id int, created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consignments_company ON consignments(company_id, status);
CREATE TABLE IF NOT EXISTS consignment_lines (
  id serial PRIMARY KEY, consignment_id int NOT NULL REFERENCES consignments(id) ON DELETE CASCADE,
  item_id int NOT NULL REFERENCES items(id), qty_out numeric(14,3) NOT NULL, unit_price numeric(14,2) NOT NULL DEFAULT 0,
  qty_returned numeric(14,3) NOT NULL DEFAULT 0, qty_lost numeric(14,3) NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS consignment_lots (
  id serial PRIMARY KEY, consignment_id int NOT NULL REFERENCES consignments(id) ON DELETE CASCADE,
  line_id int NOT NULL REFERENCES consignment_lines(id) ON DELETE CASCADE, item_id int NOT NULL, lot_id int NOT NULL,
  qty numeric(14,3) NOT NULL, unit_cost numeric(14,4) NOT NULL DEFAULT 0
);
