-- Une « Production rapide » peut créer plusieurs ordres (un par format) : batch_id les relie pour pouvoir les modifier ensemble
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS batch_id int;
UPDATE production_orders p SET batch_id = s.first_id
  FROM (SELECT id, MIN(id) OVER (PARTITION BY company_id, created_at, user_id) AS first_id FROM production_orders) s
  WHERE s.id = p.id AND p.batch_id IS NULL;
CREATE INDEX IF NOT EXISTS production_orders_batch ON production_orders(batch_id);
