-- Persist the visual email-builder structure so edit mode can reopen the
-- exact block layout instead of reconstructing from compiled HTML.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS email_builder_template jsonb;
