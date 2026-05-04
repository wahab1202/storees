-- 0020_optin_widgets.sql
-- Phase F2b — on-site opt-in widgets.
--
-- Configurable popup/inline form the merchant drops on their storefront via
-- the Storees JS SDK. Triggers (exit-intent, time-on-page, scroll-depth),
-- collects phone (and optionally email/name), records consent (with the
-- exact text shown — DPDP requirement), and fires a flow trigger event so
-- a welcome message can land immediately.
--
-- The admin panel CRUDs these rows; the SDK reads them via a public
-- /v1/widgets endpoint (filtered to is_active=true) and renders the modal
-- with the config inline. consent_text is mandatory — without it, the row
-- is unusable.

CREATE TABLE IF NOT EXISTS optin_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Display
  name VARCHAR(255) NOT NULL,                  -- internal label (admin only)
  headline VARCHAR(255) NOT NULL,              -- "Get ₹150 off your first order"
  body TEXT,                                   -- supporting copy
  button_label VARCHAR(80) NOT NULL DEFAULT 'Get the discount',
  consent_text TEXT NOT NULL,                  -- exact wording on the consent checkbox/disclosure

  -- Trigger
  trigger_type VARCHAR(30) NOT NULL,           -- 'exit_intent' | 'time_on_page' | 'scroll_depth' | 'manual'
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- shape varies per trigger_type:
    --   time_on_page: { seconds: 30 }
    --   scroll_depth: { percent: 50 }
    --   exit_intent:  {} (no params; mouse-leave at top)
    --   manual:       {} (rendered only when Storees('widget','show', id) called)

  -- Audience / placement
  target_pages JSONB NOT NULL DEFAULT '[]'::jsonb,    -- array of url-glob strings; empty = any page
  show_once BOOLEAN NOT NULL DEFAULT TRUE,            -- localStorage flag — don't pester the same visitor

  -- Form fields (controls which inputs render)
  collect_email BOOLEAN NOT NULL DEFAULT FALSE,
  collect_name BOOLEAN NOT NULL DEFAULT FALSE,
  phone_required BOOLEAN NOT NULL DEFAULT TRUE,
  -- pre_check_consent: legal under DPDP if disclosed (consent_text must mention it).
  pre_check_consent BOOLEAN NOT NULL DEFAULT FALSE,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_optin_widgets_project ON optin_widgets(project_id);
CREATE INDEX idx_optin_widgets_active ON optin_widgets(project_id, is_active) WHERE is_active = TRUE;
