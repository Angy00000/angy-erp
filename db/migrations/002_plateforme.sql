-- Plateforme Angy Company : abonnements des entreprises, console, annonces, demandes d'aide
ALTER TABLE companies ADD COLUMN IF NOT EXISTS status text DEFAULT 'essai';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sub_end date;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS price numeric(14,2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS periodicity text DEFAULT 'mois';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE TABLE IF NOT EXISTS platform_admins (
  id serial PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, password_hash text NOT NULL,
  last_login timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS announcements (
  id serial PRIMARY KEY, title text NOT NULL, body text, level text DEFAULT 'info', active boolean DEFAULT true,
  ends_at date, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_requests (
  id serial PRIMARY KEY, company_id int REFERENCES companies(id) ON DELETE CASCADE, user_id int, user_name text,
  type text DEFAULT 'question', message text NOT NULL, status text DEFAULT 'nouvelle', reply text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_logs (
  id bigserial PRIMARY KEY, admin_name text, action text, company_id int, data jsonb, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscription_payments (
  id serial PRIMARY KEY, company_id int REFERENCES companies(id) ON DELETE CASCADE, amount numeric(14,2) NOT NULL,
  date date DEFAULT current_date, method text, period_label text, new_end date, note text, created_at timestamptz DEFAULT now()
);
