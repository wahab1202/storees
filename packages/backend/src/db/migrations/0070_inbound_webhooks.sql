-- Phase 3 (CleverSend parity): user-created inbound webhooks as data sources.
-- A named endpoint (token-authed URL) receives arbitrary JSON; event
-- definitions extract named events + customer-attribute mappings from the
-- payloads and feed them into the existing event pipeline.

CREATE TABLE IF NOT EXISTS inbound_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  -- URL-embedded secret: POST /api/hooks/<token>. Rotatable by delete+recreate.
  token varchar(64) NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'active',   -- active | paused
  last_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inbound_webhooks_project ON inbound_webhooks(project_id);

-- Raw receipt log — the webhook detail page's history + schema-inference source.
CREATE TABLE IF NOT EXISTS inbound_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  webhook_id uuid NOT NULL REFERENCES inbound_webhooks(id) ON DELETE CASCADE,
  headers jsonb DEFAULT '{}',
  payload jsonb NOT NULL,
  -- [{definitionId, eventName}] for each definition that matched this payload
  matched_definitions jsonb NOT NULL DEFAULT '[]',
  status varchar(20) NOT NULL DEFAULT 'received', -- processed | no_match | error
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inbound_events_webhook ON inbound_webhook_events(webhook_id, received_at DESC);

-- User-defined event extraction: filters over the payload decide WHETHER this
-- payload is the event; mappings shape the resulting event + customer profile.
CREATE TABLE IF NOT EXISTS event_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES inbound_webhooks(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,                     -- emitted event_name
  filters jsonb,                                  -- FilterConfig over {body, headers} (dot-paths)
  property_mappings jsonb NOT NULL DEFAULT '[]',  -- [{path, property}] payload → event properties
  attribute_mappings jsonb NOT NULL DEFAULT '[]', -- [{path, attribute}] payload → customer profile
  identity_paths jsonb,                           -- {email?, phone?, externalId?, sessionId?, name?}
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_definitions_webhook ON event_definitions(webhook_id);
