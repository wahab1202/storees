-- One-shot: backfill the migrations tracking table on an existing DB
-- whose migrations were applied manually with psql -f.
--
-- Run this ONCE on the server BEFORE deploying the new backend with the
-- runMigrations() boot step:
--
--   psql "$DATABASE_URL" -f src/db/backfill-migrations.sql
--
-- Otherwise the runner would try to re-apply migrations and most would fail
-- with "relation already exists" / "column already exists" errors.
--
-- After running this:
--   1. Run the audit query (see chat history) to confirm which migrations
--      have NOT actually been applied to your DB.
--   2. For each migration that's NOT applied, DELETE its row:
--        DELETE FROM storees_migrations WHERE filename = '0005_race_condition_fixes.sql';
--      That tells the runner to apply it on next boot.
--   3. Deploy. The runner picks up the missing ones automatically.

CREATE TABLE IF NOT EXISTS storees_migrations (
  filename     TEXT PRIMARY KEY,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mark all known migration files as applied. ON CONFLICT no-op so this
-- script is idempotent and safe to re-run.
INSERT INTO storees_migrations (filename) VALUES
  ('0000_init.sql'),
  ('0001_products_collections.sql'),
  ('0002_campaigns.sql'),
  ('0003_unified_platform.sql'),
  ('0004_templates_channel.sql'),
  ('0005_campaign_tracking.sql'),
  ('0005_race_condition_fixes.sql'),
  ('0006_campaign_wizard_fields.sql'),
  ('0007_campaign_multichannel.sql'),
  ('0008_missing_indexes.sql'),
  ('0009_analytics_intelligence.sql'),
  ('0010_campaign_ab_testing.sql'),
  ('0011_admin_auth.sql'),
  ('0012_agents_rbac.sql'),
  ('0013_whatsapp_hardening.sql'),
  ('0014_email_sending_domains.sql'),
  ('0015_email_suppressions.sql'),
  ('0016_email_rate_limit.sql'),
  ('0017_frequency_caps.sql'),
  ('0018_template_lifecycle.sql'),
  ('0019_ctwa_attribution.sql'),
  ('0020_optin_widgets.sql'),
  ('0021_session_resolution.sql'),
  ('0022_campaign_archive.sql'),
  ('0023_data_source_federation.sql'),
  ('0024_template_variables.sql'),
  ('0025_campaign_audience_v2.sql'),
  ('0026_subscription_categories.sql'),
  ('0027_campaign_exclude_filter.sql'),
  ('0028_campaign_email_sender_details.sql'),
  ('0029_campaign_attachments.sql'),
  ('0030_campaign_gmail_annotations.sql'),
  ('0031_project_email_senders.sql'),
  ('0032_campaign_utm_parameters.sql'),
  ('0033_campaign_delivery_controls.sql'),
  ('0034_campaign_send_time_options.sql'),
  ('0035_campaign_send_scheduling.sql'),
  ('0036_email_provider_routing.sql'),
  ('0037_campaign_send_dedupe.sql'),
  ('0038_campaign_email_builder_template.sql'),
  ('0039_email_templates_builder_template.sql'),
  ('0040_events_processed_at.sql'),
  ('0041_drop_fdw_federation.sql'),
  ('0042_products_vertical_agnostic.sql'),
  ('0043_data_source_connectors.sql'),
  ('0044_campaign_conversion_currency.sql'),
  ('0045_campaign_push_platforms.sql'),
  ('0046_ad_conversion_destinations.sql'),
  ('0047_segment_reachable_count.sql'),
  ('0048_in_app_messages.sql'),
  ('0049_unify_in_app_into_templates.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Backfill complete. Rows in storees_migrations:' AS info, COUNT(*) AS count
FROM storees_migrations;
