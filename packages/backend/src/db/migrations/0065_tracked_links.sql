-- Durable click tracking / short links. Replaces the old in-memory URL map so
-- links survive restarts and work across processes — required because a WhatsApp
-- template's button base URL is baked at Meta approval and must resolve forever.
CREATE TABLE IF NOT EXISTS tracked_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  slug varchar(32) NOT NULL UNIQUE,
  original_url text NOT NULL,
  channel varchar(20),
  message_id uuid,
  campaign_id uuid,
  customer_id uuid,
  click_count integer NOT NULL DEFAULT 0,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracked_links_project_campaign ON tracked_links (project_id, campaign_id);
