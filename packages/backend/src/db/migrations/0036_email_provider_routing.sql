-- 0036_email_provider_routing.sql
-- Phase 7 prep: make email provider selection explicit while preserving Resend
-- as the default provider for every existing project.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS email_marketing_provider VARCHAR(20) NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS email_transactional_provider VARCHAR(20) NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS email_domain_provider VARCHAR(20) NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS email_domain_provider_id VARCHAR(255);

UPDATE projects
SET email_domain_provider_id = resend_domain_id
WHERE email_domain_provider_id IS NULL
  AND resend_domain_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_email_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  display_name VARCHAR(255),
  credentials_encrypted TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_email_connector_provider
  ON project_email_connectors(project_id, provider);

CREATE INDEX IF NOT EXISTS idx_project_email_connectors_project
  ON project_email_connectors(project_id);
