-- 0022_campaign_archive.sql
-- Soft-archive for campaigns. Distinct from status (draft/scheduled/sending/sent/paused)
-- so we don't lose the original lifecycle state when a campaign is archived —
-- a "sent" campaign that's archived is still a sent campaign in analytics,
-- it's just hidden from the default list view.
--
-- archived_at = NULL  → visible in default list (active)
-- archived_at IS NOT NULL → hidden by default; reachable via ?includeArchived=true.

ALTER TABLE campaigns
  ADD COLUMN archived_at TIMESTAMPTZ;

-- Lookup index for the default list query (project + active + recency)
CREATE INDEX idx_campaigns_active_recent
  ON campaigns (project_id, created_at DESC)
  WHERE archived_at IS NULL;
