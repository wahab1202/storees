-- 0027_campaign_exclude_filter.sql
--
-- Phase 1 — exclude users.
--
-- Allows campaign builders to define an exclusion filter alongside the
-- inclusion audience. The send pipeline applies it as NOT(<filter SQL>) so
-- merchants can target "all users who match X except users who match Y".

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS exclude_audience_filter JSONB;
