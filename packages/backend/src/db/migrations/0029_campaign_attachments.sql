-- 0029_campaign_attachments.sql
--
-- Phase 2 — email attachments.
-- The column remains named s3_key so the storage backend can later move from
-- local disk to S3 without changing campaign-facing APIs.

CREATE TABLE IF NOT EXISTS campaign_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  mime VARCHAR(255) NOT NULL,
  size_bytes INTEGER NOT NULL,
  s3_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_attachments_campaign
  ON campaign_attachments(campaign_id);
