-- 0017_frequency_caps.sql
-- Phase F1a — per-project frequency caps for marketing messages.
--
-- Replaces the hardcoded global "5 promotional messages per 24h per channel"
-- check in deliveryService with a per-project, per-channel, per-purpose
-- configuration. Cap counts are enforced cross-channel (a customer can
-- receive 1 WhatsApp marketing message per 7 days AND 3 SMS marketing
-- messages per 7 days; both quotas independent).
--
-- Shape (JSONB):
--   {
--     "whatsapp_marketing": { "perDays": 7,  "max": 1 },
--     "sms_marketing":      { "perDays": 7,  "max": 3 },
--     "email_marketing":    { "perDays": 1,  "max": 3 },
--     "push_marketing":     { "perDays": 1,  "max": 5 }
--   }
--
-- Transactional sends bypass these caps entirely (legitimate must-deliver
-- messages — order receipts, OTPs, password resets).
--
-- Defaults are conservative: WABA quality-rating safe (Meta suggests <=2
-- marketing/week to maintain HIGH quality), sane SMS/email/push baselines.

ALTER TABLE projects
  ADD COLUMN frequency_caps JSONB NOT NULL DEFAULT '{
    "whatsapp_marketing": { "perDays": 7, "max": 1 },
    "sms_marketing":      { "perDays": 7, "max": 3 },
    "email_marketing":    { "perDays": 1, "max": 3 },
    "push_marketing":     { "perDays": 1, "max": 5 }
  }'::jsonb;
