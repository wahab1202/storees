-- 0040_events_processed_at.sql
--
-- Standardise on event-based customer aggregate maintenance (replaces the
-- FDW federation worker that pulled aggregates every 5min from gwm).
--
-- Adds `processed_at` to track which events the customerAggregateWorker has
-- already folded into customers.total_spent / total_orders / etc. Lets us:
--   1. Mark events idempotently so a worker restart doesn't double-count
--   2. Run a one-shot catch-up over historical events (e.g. after deploying
--      the worker, scan everything WHERE processed_at IS NULL ORDER BY timestamp)
--   3. Reprocess if the aggregation logic changes (set processed_at = NULL +
--      let the worker re-run)
--
-- Partial index keeps the worker's "unprocessed events" query fast even with
-- millions of historical events that have processed_at set.

ALTER TABLE events
  ADD COLUMN processed_at TIMESTAMPTZ;

CREATE INDEX idx_events_unprocessed
  ON events (project_id, timestamp)
  WHERE processed_at IS NULL;
