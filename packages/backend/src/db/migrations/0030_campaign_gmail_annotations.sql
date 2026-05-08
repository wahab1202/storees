-- 0030_campaign_gmail_annotations.sql
--
-- Phase 2 — optional Gmail Promotions Tab annotation config.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS gmail_annotation JSONB;
