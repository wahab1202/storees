-- 0028_campaign_email_sender_details.sql
--
-- Phase 2 — email sender details.
--
-- Adds per-campaign email header fields so campaigns are not limited to the
-- project-wide FROM_EMAIL fallback.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS from_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reply_to_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cc_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bcc_emails JSONB NOT NULL DEFAULT '[]'::jsonb;
