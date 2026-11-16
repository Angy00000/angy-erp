-- Historique des achats payés (« 🛒 Nouvel achat ») : chaque achat devient un document modifiable
CREATE TABLE IF NOT EXISTS purchases (
  id serial PRIMARY KEY,
  company_id int NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number text,
  date date NOT NULL DEFAULT current_date,
  supplier_id int REFERENCES suppliers(id) ON DELETE SET NULL,
  account_id int REFERENCES accounts(id) ON DELETE SET NULL,
  total numeric(14,2) NOT NULL DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT 'ok',        -- ok | annule
  user_id int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS purchases_cid ON purchases(company_id, date DESC);
CREATE TABLE IF NOT EXISTS purchase_items (
  id serial PRIMARY KEY,
  purchase_id int NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  item_id int NOT NULL REFERENCES items(id),
  qty numeric(14,3) NOT NULL,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  lot_id int REFERENCES lots(id) ON DELETE SET NULL
);

-- Reprise des achats déjà faits avec « Nouvel achat » (un achat = une même heure d'enregistrement)
DO $$
DECLARE g record; p int; num int;
BEGIN
  FOR g IN SELECT m.company_id, m.created_at, MIN(m.user_id) AS user_id, MIN(m.note) AS note,
      SUM(m.qty*m.unit_cost) AS total, MIN(l.supplier_id) AS supplier_id
    FROM stock_movements m JOIN lots l ON l.id=m.lot_id
    WHERE m.ref_type='achat_marche' GROUP BY m.company_id, m.created_at ORDER BY m.created_at
  LOOP
    INSERT INTO counters (company_id,key,value) VALUES (g.company_id, 'achat-' || extract(year FROM g.created_at)::int, 1)
      ON CONFLICT (company_id,key) DO UPDATE SET value=counters.value+1 RETURNING value INTO num;
    INSERT INTO purchases (company_id,number,date,supplier_id,account_id,total,note,user_id,created_at)
      VALUES (g.company_id, 'ACH-' || extract(year FROM g.created_at)::int || '-' || lpad(num::text,4,'0'),
        COALESCE((SELECT c.date FROM cash_transactions c WHERE c.ref_type='achat_marche' AND c.company_id=g.company_id AND c.created_at=g.created_at LIMIT 1), g.created_at::date),
        g.supplier_id,
        (SELECT c.account_id FROM cash_transactions c WHERE c.ref_type='achat_marche' AND c.company_id=g.company_id AND c.created_at=g.created_at LIMIT 1),
        round(g.total,2), NULLIF(g.note,'Achat'), g.user_id, g.created_at)
      RETURNING id INTO p;
    INSERT INTO purchase_items (purchase_id,item_id,qty,unit_cost,lot_id)
      SELECT p, m.item_id, m.qty, m.unit_cost, m.lot_id FROM stock_movements m
      WHERE m.ref_type='achat_marche' AND m.company_id=g.company_id AND m.created_at=g.created_at ORDER BY m.id;
    UPDATE lots SET source_type='purchases', source_id=p WHERE id IN (SELECT lot_id FROM purchase_items WHERE purchase_id=p);
    UPDATE stock_movements SET ref_type='purchases', ref_id=p WHERE ref_type='achat_marche' AND company_id=g.company_id AND created_at=g.created_at;
    UPDATE cash_transactions SET ref_type='purchases', ref_id=p WHERE ref_type='achat_marche' AND company_id=g.company_id AND created_at=g.created_at;
  END LOOP;
END $$;
