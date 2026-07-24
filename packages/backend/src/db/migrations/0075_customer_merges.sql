-- Within-brand identity merge (Phase 2, step 2b). OFF by default (env flag).
-- Soft merge: the loser row stays (so no FK breaks) and points at the survivor
-- via merged_into; only the identity-bearing rows (events/orders/sessions/edges)
-- are re-pointed. Every merge is logged in customer_merges and is reversible.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS idx_customers_merged_into ON customers (merged_into) WHERE merged_into IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_merges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  survivor_id uuid NOT NULL,
  merged_id   uuid NOT NULL,
  reason      text,                 -- e.g. the edge type that triggered the merge
  moved       jsonb NOT NULL DEFAULT '{}',  -- {events, orders, sessions, edges} counts
  created_at  timestamptz NOT NULL DEFAULT now(),
  undone_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_customer_merges_project ON customer_merges (project_id, created_at);
