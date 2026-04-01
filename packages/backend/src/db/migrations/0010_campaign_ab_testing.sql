-- A/B testing support for campaigns
-- Adds variant tracking to campaign_sends and A/B config to campaigns

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS ab_test_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_split_pct integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS ab_variant_b_subject varchar(500),
  ADD COLUMN IF NOT EXISTS ab_variant_b_html_body text,
  ADD COLUMN IF NOT EXISTS ab_variant_b_body_text text,
  ADD COLUMN IF NOT EXISTS ab_winner varchar(1),
  ADD COLUMN IF NOT EXISTS ab_winner_metric varchar(20) DEFAULT 'open_rate',
  ADD COLUMN IF NOT EXISTS ab_auto_send_winner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_test_duration_hours integer NOT NULL DEFAULT 4;

ALTER TABLE campaign_sends
  ADD COLUMN IF NOT EXISTS variant varchar(1) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_variant
  ON campaign_sends (campaign_id, variant);

-- Conversion tracking: add converted_count to campaigns for quick reads
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS converted_count integer NOT NULL DEFAULT 0;
