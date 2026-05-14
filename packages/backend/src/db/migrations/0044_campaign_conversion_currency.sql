-- 0044_campaign_conversion_currency.sql
--
-- Gap 10 (Storees → MoEngage): conversion goals + revenue attribution.
--
-- The campaigns table already has conversionGoals (JSONB) and goalTrackingHours.
-- This migration adds a single new column — currency — so revenue figures
-- attributed to a campaign can be surfaced in the right unit (₹ vs $ vs €).
--
-- New per-goal fields (revenueEnabled, revenueAttribute, isPrimary) live
-- inside the conversion_goals JSONB and need no DDL.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3);

-- Backfill: campaigns without a currency get the platform default (INR).
-- Per-project currency override is a Phase-2 concern.
UPDATE campaigns
SET currency = 'INR'
WHERE currency IS NULL;
