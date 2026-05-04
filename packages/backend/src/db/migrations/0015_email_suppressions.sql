-- 0015_email_suppressions.sql
-- Phase E2.2 — email suppression list (per-tenant).
--
-- ESPs (Resend, Gmail, Yahoo) treat repeated sends to known-bouncing or
-- complaining addresses as evidence of spammer behavior, and tank sender
-- reputation accordingly. Storing suppressions per-project means we never
-- re-send to an address that already hard-bounced, complained, or
-- unsubscribed for that project — the Black Friday baseline.
--
-- Scoped per project_id (not global) so each tenant manages their own
-- list. An address suppressed for project A may still be valid for B.

CREATE TABLE IF NOT EXISTS email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  reason VARCHAR(20) NOT NULL,
    -- 'hard_bounce' | 'complained' | 'unsubscribed' | 'manual'
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(50),              -- 'resend_webhook' | 'one_click_unsub' | 'admin_panel' | ...
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Lookup index used in the campaign dispatcher's NOT EXISTS check
CREATE UNIQUE INDEX idx_email_suppressions_lookup
  ON email_suppressions (project_id, lower(email));

CREATE INDEX idx_email_suppressions_reason
  ON email_suppressions (project_id, reason);


-- Per-tenant unsubscribe tokens. Used in the List-Unsubscribe header so
-- mailbox providers (Gmail, Yahoo, Outlook) can offer a one-click
-- unsubscribe button. Token decodes to (project_id, customer_id) without
-- needing a session.
CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
  token VARCHAR(64) PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  UNIQUE(project_id, customer_id, channel)
);

CREATE INDEX idx_unsubscribe_tokens_customer
  ON unsubscribe_tokens (project_id, customer_id);
