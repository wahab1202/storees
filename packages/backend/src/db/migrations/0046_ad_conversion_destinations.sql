-- 0046_ad_conversion_destinations.sql
--
-- Gap 9 (Storees → MoEngage): server-side Conversion API integrations.
-- Each row stores the credentials for a single ad-platform destination
-- the project wants to relay conversion events to (Meta CAPI, Google
-- Enhanced Conversions, TikTok Events API, Snap CAPI).
--
-- The access token is encrypted at rest via services/encryption.ts —
-- same pattern as data_source_connectors and email-provider creds.
--
-- A single project can have multiple destinations of the same platform
-- (e.g. two Meta pixels for A/B regions) — unique constraint scopes by
-- (project_id, platform, pixel_id).

CREATE TABLE IF NOT EXISTS ad_conversion_destinations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  platform          TEXT NOT NULL,          -- 'meta' | 'google' | 'tiktok' | 'snap'
  name              TEXT NOT NULL,          -- admin label

  pixel_id          TEXT NOT NULL,          -- platform-specific id (Meta pixel id, TikTok pixel code, etc.)
  access_token      TEXT NOT NULL,          -- encrypted via services/encryption.ts

  -- Test-event identifier — Meta uses test_event_code, TikTok uses
  -- test_event_code, Snap uses test_event_code. When non-null, the
  -- platform marks the event as a test (won't drive optimization but
  -- appears in their Events Manager debug view). Production setups
  -- leave this NULL.
  test_event_code   TEXT,

  -- 'active' = events relay; 'paused' = manual disable; 'error' = the
  -- platform rejected the last N attempts (set by the relay worker).
  status            TEXT NOT NULL DEFAULT 'active',

  -- Lightweight counters surfaced in the admin UI so onboarding can
  -- confirm events are landing on the platform side.
  events_sent       INTEGER NOT NULL DEFAULT 0,
  events_failed     INTEGER NOT NULL DEFAULT 0,
  last_sent_at      TIMESTAMPTZ,
  last_error        TEXT,
  last_error_at     TIMESTAMPTZ,

  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ad_conv_dest_unique
  ON ad_conversion_destinations (project_id, platform, pixel_id);

CREATE INDEX idx_ad_conv_dest_project_active
  ON ad_conversion_destinations (project_id, status) WHERE status = 'active';
