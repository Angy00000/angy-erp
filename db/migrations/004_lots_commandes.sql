-- Choix du lot à la vente (vide = automatique : le plus ancien / la date limite la plus proche d'abord)
ALTER TABLE sales_lines ADD COLUMN IF NOT EXISTS lot_id int;
