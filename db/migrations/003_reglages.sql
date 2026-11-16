-- Réglages de la plateforme (coordonnées Angy Company, durée d'essai), équipe console, reçus numérotés
CREATE TABLE IF NOT EXISTS platform_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz DEFAULT now());
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS role text DEFAULT 'proprietaire';
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS number text;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS admin_name text;
-- Logo de chaque entreprise (image réduite, stockée en data URL) et ville pour les documents
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slogan text;
