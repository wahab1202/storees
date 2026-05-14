-- 0049_unify_in_app_into_templates.sql
--
-- Architectural cleanup. In-app messages now live in the same templates +
-- campaigns tables as every other channel, instead of in a parallel
-- in_app_messages table.
--
-- Before: standalone in_app_messages table → standalone admin page →
-- duplicates the audience/schedule/status concepts that campaigns already
-- own; templates table excludes 'in_app' as a channel.
--
-- After:
--   - email_templates gains image_url / cta_label / cta_url + 3 in_app_*
--     fields (NULL for non-in_app templates).
--   - email_templates.channel accepts 'in_app' alongside the existing
--     email/sms/push/whatsapp.
--   - campaigns.channel accepts 'in_app' too; an in-app campaign points
--     at an in_app template via campaigns.template_id, carries the
--     audience filter, and uses scheduled_at/ends_at as the live window.
--   - Existing in_app_messages rows are migrated to one template + one
--     campaign pair each, preserving their counters, audience, status.
--   - The old in_app_messages + in_app_message_views tables are dropped.
--
-- After this lands the standalone "In-App Messages" admin section can
-- be removed; everything is reachable via Templates + Campaigns like
-- every other channel.

-- 1. Extend email_templates with in-app-specific columns
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS image_url           TEXT,
  ADD COLUMN IF NOT EXISTS cta_label           TEXT,
  ADD COLUMN IF NOT EXISTS cta_url             TEXT,
  ADD COLUMN IF NOT EXISTS in_app_position     TEXT,        -- modal | banner | toast | inbox
  ADD COLUMN IF NOT EXISTS in_app_frequency    TEXT,        -- always | once | daily
  ADD COLUMN IF NOT EXISTS in_app_target_pages JSONB;       -- ["/cart", "/checkout/*"]

-- 2. Backfill from in_app_messages — if the table exists (it was added
--    in 0048; in a fresh install this block becomes a no-op).
DO $$
DECLARE
  msg RECORD;
  new_template_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'in_app_messages') THEN
    RAISE NOTICE 'in_app_messages does not exist; skipping backfill';
    RETURN;
  END IF;

  FOR msg IN SELECT * FROM in_app_messages LOOP
    INSERT INTO email_templates (
      project_id, name, channel, subject, body_text,
      image_url, cta_label, cta_url,
      in_app_position, in_app_frequency, in_app_target_pages,
      created_at, updated_at
    ) VALUES (
      msg.project_id,
      msg.name || ' (template)',
      'in_app',
      msg.title,
      msg.body,
      msg.image_url,
      msg.cta_label,
      msg.cta_url,
      msg.position,
      msg.frequency,
      msg.target_pages,
      msg.created_at,
      msg.updated_at
    )
    RETURNING id INTO new_template_id;

    INSERT INTO campaigns (
      project_id, name, channel, delivery_type, status, content_type,
      template_id, audience_filter, scheduled_at,
      total_recipients, sent_count, failed_count,
      created_at, updated_at
    ) VALUES (
      msg.project_id,
      msg.name,
      'in_app',
      'one-time',
      msg.status,
      'promotional',
      new_template_id,
      msg.audience_filter,
      msg.starts_at,
      0, 0, 0,
      msg.created_at,
      msg.updated_at
    );
  END LOOP;
END $$;

-- 3. Drop the old tables. in_app_message_views first (FK → in_app_messages).
DROP TABLE IF EXISTS in_app_message_views;
DROP TABLE IF EXISTS in_app_messages;
