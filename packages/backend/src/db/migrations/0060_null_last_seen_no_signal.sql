-- 0060: NULL out last_seen for customers with no activity signal
--
-- Migration 0059 corrected last_seen for customers WITH events or orders
-- by pulling it back to the actual activity timestamp. But customers that
-- exist purely as profiles in Medusa (ingested via /admin/customers, never
-- placed an order, never emitted an event) had their last_seen set to the
-- sync time by the old resolveCustomer code path — and 0059 left those
-- rows alone because there was no event to derive from.
--
-- Net effect: ~13K profile-only customers all clustered on the most recent
-- sync date, inflating the dashboard's "Active (7d)" metric.
--
-- The honest answer for a customer with zero observable activity is:
-- last_seen has no meaningful value. NULL it out. The schema already
-- allows NULL, and the dashboard's `WHERE last_seen >= now-7d` filter
-- naturally excludes NULL rows.
--
-- Future-proofing: the deployed code (commit 2536f3e) sets
-- skipLastSeenBump:true on all connector-driven resolveCustomer calls, so
-- this kind of artefact can't accumulate again. first_seen will be
-- corrected on the next Full Resync via the source_created_at field map.

UPDATE customers c
SET last_seen  = NULL,
    updated_at = NOW()
WHERE c.last_seen IS NOT NULL
  AND c.last_order_date IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM events e WHERE e.customer_id = c.id
  );
