-- Add channel and body_text to email_templates for multi-channel template support
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ALTER COLUMN subject DROP NOT NULL,
  ALTER COLUMN html_body DROP NOT NULL;

-- Index for filtering by channel
CREATE INDEX IF NOT EXISTS idx_email_templates_project_channel
  ON email_templates (project_id, channel);
