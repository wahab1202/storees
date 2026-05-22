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
-- last_seen has no meaningful value. NULL it out.
--
-- BUT: the column was originally NOT NULL with a default of NOW(). We
-- have to drop the NOT NULL constraint BEFORE the UPDATE can succeed,
-- otherwise Postgres rejects the SET NULL clause. The Drizzle schema is
-- updated in the same commit so future types reflect Date | null.
--
-- Future-proofing: deployed code (2536f3e) sets skipLastSeenBump:true on
-- all connector-driven resolveCustomer calls, so this artefact can't
-- accumulate again. first_seen will correct on next Full Resync via the
-- source_created_at field map.

BEGIN;

-- Drop the NOT NULL constraint so the UPDATE can succeed.
ALTER TABLE customers ALTER COLUMN last_seen DROP NOT NULL;

-- NULL out customers with no activity signal at all.
UPDATE customers c
SET last_seen  = NULL,
    updated_at = NOW()
WHERE c.last_seen IS NOT NULL
  AND c.last_order_date IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM events e WHERE e.customer_id = c.id
  );

COMMIT;
