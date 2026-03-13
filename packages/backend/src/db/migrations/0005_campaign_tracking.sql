-- Campaign email tracking: opens, clicks, bounces, complaints
-- Adds tracking columns to campaign_sends and aggregate counters to campaigns

-- Aggregate tracking counters on campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS delivered_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS opened_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS clicked_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bounced_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS complained_count INTEGER NOT NULL DEFAULT 0;

-- Per-recipient tracking timestamps on campaign_sends
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ;

-- Index for Resend webhook lookups by message ID
CREATE INDEX IF NOT EXISTS idx_campaign_sends_resend_id ON campaign_sends (resend_message_id) WHERE resend_message_id IS NOT NULL;
