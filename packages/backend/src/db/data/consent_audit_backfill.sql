-- consent_audit_backfill.sql
-- Phase F1a — backfill consent_audit_log from existing consents rows.
--
-- Pre-F1a, consent changes wrote to `consents` but didn't always write to
-- `consent_audit_log` (e.g. customer.email_subscribed flips from Shopify
-- webhooks went straight to the booleans, no audit). This backfill creates
-- one audit row per existing consent state so the customer-detail Consent
-- tab has a starting point.
--
-- Idempotent: skips inserts if an audit row already exists for the same
-- (project, customer, channel, purpose, action, created_at).
-- Safe to re-run.
--
-- Run AFTER migration 0017_frequency_caps.sql.

BEGIN;

-- One audit row per current consent state. consented_at is the best
-- available timestamp; if we have revoked_at we instead emit an opt_out
-- row with that timestamp.
INSERT INTO consent_audit_log (
  project_id, customer_id, channel, message_type, action, source, consent_text, created_at
)
SELECT
  c.project_id,
  c.customer_id,
  c.channel,
  c.purpose,
  CASE WHEN c.status = 'opted_in' THEN 'opt_in' ELSE 'opt_out' END,
  'backfill',
  'Backfilled from consents table at ' || NOW()::text || '. Original source/text not preserved.',
  COALESCE(c.revoked_at, c.consented_at)
FROM consents c
WHERE NOT EXISTS (
  SELECT 1 FROM consent_audit_log a
  WHERE a.project_id = c.project_id
    AND a.customer_id = c.customer_id
    AND a.channel = c.channel
    AND a.message_type = c.purpose
);

-- Verification
SELECT
  (SELECT COUNT(*) FROM consents) AS total_consents,
  (SELECT COUNT(*) FROM consent_audit_log) AS total_audit_rows,
  (SELECT COUNT(*) FROM consent_audit_log WHERE source = 'backfill') AS backfilled_rows;

COMMIT;
