-- Phase 5: per-recipient campaign send scheduling, used by email advanced send-time modes.
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_campaign_sends_due
  ON campaign_sends (campaign_id, status, scheduled_at);
