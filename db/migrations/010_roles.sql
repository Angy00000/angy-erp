-- Rôles modifiables par entreprise (remplacent les rôles par défaut, ou en ajoutent)
CREATE TABLE IF NOT EXISTS company_roles (
  company_id int NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role text NOT NULL,
  label text NOT NULL,
  modules text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (company_id, role)
);
