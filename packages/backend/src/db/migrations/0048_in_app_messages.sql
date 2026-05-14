-- 0048_in_app_messages.sql
--
-- Gap 1 (Storees → MoEngage): in-app + on-site messaging.
--
-- An in_app_message is a piece of content rendered inside the client's
-- storefront / web app via the SDK. Unlike push/email, delivery is
-- PULL-based — the SDK fetches active messages for the current customer
-- via /api/v1/in-app-messages and renders matching ones. This commit
-- ships the storage + admin authoring + SDK fetch path; the actual
-- storefront rendering is a small extension of the existing Storees.js
-- widget bundle.
--
-- Display positions:
--   modal  — center overlay (highest attention, blocks interaction)
--   banner — top of page strip (passive, dismissible)
--   toast  — corner snackbar (brief, auto-dismiss)
--   inbox  — persistent card in a notification feed (no auto-dismiss)
--
-- Audience filter reuses the segment FilterConfig shape so anything
-- segment-builder can express is targetable.

CREATE TABLE IF NOT EXISTS in_app_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  name              TEXT NOT NULL,                -- admin label
  status            TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'active' | 'paused' | 'archived'

  -- Content
  title             TEXT NOT NULL,
  body              TEXT,
  image_url         TEXT,
  cta_label         TEXT,
  cta_url           TEXT,

  -- Display rules
  position          TEXT NOT NULL DEFAULT 'modal',   -- 'modal' | 'banner' | 'toast' | 'inbox'
  -- 'always' → show every page-load until dismissed
  -- 'once'   → show once per customer
  -- 'daily'  → show at most once per customer per UTC day
  frequency         TEXT NOT NULL DEFAULT 'once',

  -- Page-targeting allowlist. NULL/empty = match every page.
  -- Examples: ["/cart", "/checkout/*"]
  target_pages      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Audience filter — uses the same FilterConfig shape as segments.
  -- NULL = no audience restriction (all customers).
  audience_filter   JSONB,

  -- Schedule. NULL start = live as soon as status='active'. NULL end = no expiry.
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,

  -- Counters surfaced in the admin UI.
  impressions       INTEGER NOT NULL DEFAULT 0,
  dismissals        INTEGER NOT NULL DEFAULT 0,
  cta_clicks        INTEGER NOT NULL DEFAULT 0,

  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_in_app_msg_project_active
  ON in_app_messages (project_id, status)
  WHERE status = 'active';

-- Per-customer view + dismissal log. Lets the SDK route dedup ("don't
-- show again if dismissed") + powers the frequency cap.
CREATE TABLE IF NOT EXISTS in_app_message_views (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        UUID NOT NULL REFERENCES in_app_messages(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  shown_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at      TIMESTAMPTZ,
  cta_clicked_at    TIMESTAMPTZ
);

CREATE INDEX idx_in_app_views_lookup
  ON in_app_message_views (message_id, customer_id);

CREATE INDEX idx_in_app_views_customer_recent
  ON in_app_message_views (customer_id, shown_at DESC);
