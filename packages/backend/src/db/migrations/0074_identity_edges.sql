-- Deterministic identity graph substrate (Phase 2, step 2a).
-- Additive: `customers` remains the resolved cluster. Populated by the backfill
-- + graph service in SHADOW MODE — no merge is applied to customer_id yet.
-- Multiple customers may share an edge_hash; that collision IS the would-merge
-- signal the shadow report surfaces. Uniqueness is only per (customer, edge).
CREATE TABLE IF NOT EXISTS identity_edges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  edge_type     varchar(20) NOT NULL,   -- device_id | session_id | phone | email | external_id
  edge_value    text,                   -- raw value for device/session/external; NULL for hashed PII
  edge_hash     varchar(64) NOT NULL,   -- sha256 of the normalised value
  source        varchar(20) NOT NULL DEFAULT 'backfill',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per (customer, edge) — re-records just bump last_seen_at.
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_edges_unique
  ON identity_edges (project_id, customer_id, edge_type, edge_hash);

-- Resolve an identifier → customer(s). >1 distinct customer for a hash = a
-- would-merge cluster.
CREATE INDEX IF NOT EXISTS idx_identity_edges_hash
  ON identity_edges (project_id, edge_type, edge_hash);

CREATE INDEX IF NOT EXISTS idx_identity_edges_customer
  ON identity_edges (project_id, customer_id);
