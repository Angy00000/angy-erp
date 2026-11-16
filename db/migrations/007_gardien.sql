-- Le Gardien : alertes automatiques sur les actions sensibles (annulations, remises, pertes, sorties de caisse…)
CREATE TABLE IF NOT EXISTS guardian_alerts (
  id serial PRIMARY KEY,
  company_id int NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL,
  level text NOT NULL DEFAULT 'info',          -- grave | attention | info
  title text NOT NULL,
  message text,
  link_mod text,
  actor_id int,
  actor_name text,
  key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_alerts_cid ON guardian_alerts(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS guardian_seen (
  user_id int PRIMARY KEY,
  seen_until timestamptz NOT NULL DEFAULT now()
);
