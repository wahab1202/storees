-- 0063_dealer_hybrid_templates.sql
--
-- B2B dealer RBAC, step 2: HYBRID ownership for templates. Unlike segments/
-- flows/campaigns (strict private), templates use a shared model:
--   created_by_agent_id IS NULL  → admin/shared template (a building block every
--                                  dealer can use; provider-synced WA templates too)
--   created_by_agent_id = <agent> → private to that dealer
-- A dealer sees shared + their own; admin sees all. This is what powers the
-- flow "send message" template picker scoping.
--
-- Idempotent.

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS created_by_agent_id uuid REFERENCES agents(id);

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS created_by_agent_id uuid REFERENCES agents(id);

CREATE INDEX IF NOT EXISTS idx_email_templates_owner
  ON email_templates (project_id, created_by_agent_id);

CREATE INDEX IF NOT EXISTS idx_wa_templates_owner
  ON whatsapp_templates (project_id, created_by_agent_id);
