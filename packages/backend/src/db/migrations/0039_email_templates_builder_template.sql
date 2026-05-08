-- Preserve visual-builder structure for reusable saved email templates.
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS email_builder_template jsonb;
