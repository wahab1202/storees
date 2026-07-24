-- Row-level record of what a merge re-pointed, so it can be undone (Phase 2·2b).
-- Only the non-derivable rows (events/orders/sessions) are tracked; identity
-- edges are rebuilt from the customer + sessions on undo.
CREATE TABLE IF NOT EXISTS customer_merge_rows (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_id uuid NOT NULL REFERENCES customer_merges(id) ON DELETE CASCADE,
  entity   varchar(20) NOT NULL,   -- 'event' | 'order' | 'session'
  row_id   uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_merge_rows_merge ON customer_merge_rows (merge_id);
