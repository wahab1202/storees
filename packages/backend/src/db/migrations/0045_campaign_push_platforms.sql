-- 0045_campaign_push_platforms.sql
--
-- Gap 2 (Storees → MoEngage): multi-platform push. A single push campaign
-- can now target Android + iOS + Web simultaneously with separate content
-- authored per platform. Mirror of MoEngage's "Target Platforms" step.
--
-- push_platforms — JSONB array of enabled platforms, e.g. ['android', 'ios', 'web']
-- push_content   — JSONB map keyed by platform:
--   {
--     android: { title, body, imageUrl?, clickUrl? },
--     ios:     { title, body, imageUrl?, clickUrl?, subtitle?, badge? },
--     web:     { title, body, imageUrl?, clickUrl?, actions? }
--   }
--
-- Backwards compatibility: existing push campaigns left subject + bodyText
-- + previewText (imageUrl) on the campaigns row. The delivery path falls
-- back to those when push_content is empty / missing for a given platform.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS push_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS push_content   JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index on push_platforms to speed up "campaigns targeting iOS in the last
-- 30 days" style analytics queries.
CREATE INDEX IF NOT EXISTS idx_campaigns_push_platforms
  ON campaigns USING GIN (push_platforms);
