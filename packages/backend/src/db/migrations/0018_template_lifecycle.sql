-- 0018_template_lifecycle.sql
-- Phase F1b — track template submission lifecycle and detect re-categorisation.
--
-- Meta routinely re-categorises approved WhatsApp templates (Marketing → Utility
-- and back) without notice. When this happens, campaigns built against a now-
-- different category silently fail or get billed differently. We record the
-- previous category so cron + webhook handlers can detect the change and
-- alert the merchant.
--
-- New columns are nullable; existing template rows (synced from providers)
-- keep their state. submitted_at = NULL means the template was synced FROM
-- the provider, not submitted THROUGH Storees.

ALTER TABLE whatsapp_templates
  ADD COLUMN submitted_at        TIMESTAMPTZ,                          -- when the merchant submitted via Storees
  ADD COLUMN last_status_check_at TIMESTAMPTZ,                         -- last poll/webhook update
  ADD COLUMN rejection_reason     TEXT,                                -- Meta's reason if status='REJECTED'
  ADD COLUMN previous_category    VARCHAR(50);                         -- set when category changes; NULL if never changed

-- Worker reads this to find rows that need a status refresh.
CREATE INDEX idx_wa_templates_pending_check
  ON whatsapp_templates (project_id, status, last_status_check_at)
  WHERE status IN ('PENDING', 'IN_APPEAL');
