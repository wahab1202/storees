-- 0043_data_source_connectors.sql
-- Generic HTTP-pull connector framework.
--
-- One connector type works for every client (VirpanAI, custom BFSI/sporttech/
-- edtech stacks, anything that exposes paginated REST endpoints). The
-- per-client config (endpoints, auth, field-mapping) lives in the
-- data_source_connectors row. Templates in services/connectors/templates/*.json
-- pre-fill the mapping for popular platforms; everything else is "custom"
-- where the onboarding team writes the mapping from the client's API docs.
--
-- Three tables:
--   data_source_connectors  — per-project connector config + last_synced_at
--   data_source_syncs       — run history per connector
--   data_source_sync_logs   — line-level logs for debugging failed batches

CREATE TABLE IF NOT EXISTS data_source_connectors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Template identifier — points at services/connectors/templates/<template>.json
  -- 'virpanai' = the GWM-style VirpanAI stack; 'custom' = blank, mapping
  -- written by hand. Future templates (shopify, woocommerce, stripe) add new
  -- values here without touching the schema.
  template        TEXT NOT NULL,

  name            TEXT NOT NULL,
  base_url        TEXT NOT NULL,

  -- Encrypted via services/encryption.ts. Decrypted only at sync time.
  -- Shape: { type: 'bearer'|'api_key'|'basic', value: '...', header?: '...' }
  auth_config     TEXT NOT NULL,

  -- Field mapping spec. See services/connectors/genericHttpConnector.ts for the
  -- full schema. At minimum: endpoints + pagination + field_map for each of
  -- customers/products/orders.
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Optional per-entity timestamps marking the last *successful* sync.
  -- Shape: { customers: ISO, products: ISO, orders: ISO }. NULL keys mean
  -- "never synced this entity yet" → next run does a full pull.
  last_synced_at  JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 'active' = available; 'paused' = manual disable; 'error' = repeated
  -- failures (set by the worker after N consecutive failed runs).
  status          TEXT NOT NULL DEFAULT 'active',

  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_source_connectors_project
  ON data_source_connectors (project_id, status);


CREATE TABLE IF NOT EXISTS data_source_syncs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id    UUID NOT NULL REFERENCES data_source_connectors(id) ON DELETE CASCADE,

  -- 'full' = pull everything (used on first sync + the "Force full sync"
  -- emergency button). 'incremental' = pull only since last_synced_at.
  kind            TEXT NOT NULL,

  -- 'queued'     — sat in BullMQ, not picked up yet
  -- 'running'    — worker has it; updated_at advances
  -- 'success'    — all three entities pulled cleanly
  -- 'partial'    — one or two entities failed but at least one succeeded
  -- 'failed'     — entire run failed (auth error, network down, etc.)
  -- 'cancelled'  — manually cancelled mid-run
  status          TEXT NOT NULL DEFAULT 'queued',

  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,

  -- Counts of records seen / imported / failed per entity.
  -- Shape: { customers: {fetched, imported, failed}, products: {...}, orders: {...} }
  stats           JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- One-line summary of the worst error in this run (for the history table).
  -- Full details live in data_source_sync_logs.
  error_summary   TEXT,

  triggered_by    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_source_syncs_connector
  ON data_source_syncs (connector_id, created_at DESC);

CREATE INDEX idx_data_source_syncs_running
  ON data_source_syncs (status) WHERE status IN ('queued', 'running');


CREATE TABLE IF NOT EXISTS data_source_sync_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id         UUID NOT NULL REFERENCES data_source_syncs(id) ON DELETE CASCADE,

  level           TEXT NOT NULL,  -- 'info' | 'warn' | 'error'
  entity_type     TEXT,           -- 'customer' | 'product' | 'order' | 'meta' (sync-level)
  entity_id       TEXT,           -- source-side id (e.g. "cus_xxx")

  message         TEXT NOT NULL,

  -- Optional context: the source payload that failed, the field-mapping
  -- result, the HTTP response body. JSONB so we can query later.
  payload         JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_source_sync_logs_sync
  ON data_source_sync_logs (sync_id, created_at DESC);

CREATE INDEX idx_data_source_sync_logs_errors
  ON data_source_sync_logs (sync_id) WHERE level = 'error';
