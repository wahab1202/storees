-- 0031_project_email_senders.sql
--
-- Phase 2 — verified sender addresses for campaign From dropdowns.

CREATE TABLE IF NOT EXISTS project_email_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  address VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uniq_project_email_sender_address UNIQUE (project_id, address)
);

CREATE INDEX IF NOT EXISTS idx_project_email_senders_project
  ON project_email_senders(project_id);

INSERT INTO project_email_senders (project_id, address, display_name, verified_at)
SELECT id, email_from_address, email_from_name, email_domain_verified_at
FROM projects
WHERE email_from_address IS NOT NULL
ON CONFLICT (project_id, address) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  verified_at = EXCLUDED.verified_at,
  updated_at = NOW();
