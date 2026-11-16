-- Livraisons partielles des commandes et acomptes reçus à la commande
ALTER TABLE sales_lines ADD COLUMN IF NOT EXISTS qty_delivered numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE sales_docs ADD COLUMN IF NOT EXISTS advance_used numeric(14,2) NOT NULL DEFAULT 0;
