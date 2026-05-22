-- 0059: backfill customers.last_seen + customers.first_seen from event data
--
-- Bug context: every connector sync bumped customers.last_seen to NOW() via
-- updateLastSeen, regardless of whether the customer had any real activity.
-- customers.first_seen also defaulted to the row's createdAt (= ingest time)
-- rather than the source system's actual customer.created_at.
--
-- Net effect on dashboards:
--   Active (7d)       → inflated to ~total customers after any sync
--   New Customers (7d) → inflated to ~all customers after Full Resync
--
-- Forward fix: code changes in dataSyncService + customerService stop the
-- pipeline from masquerading as customer activity. But existing customer
-- rows have wrong dates that need correcting once.
--
-- Backfill strategy: derive last_seen from the most recent event timestamp
-- (any event_name), falling back to last_order_date / first_seen / NOW()
-- if no events exist. Derive first_seen from the earliest event timestamp,
-- falling back to first_order_date / customer.created_at. Both fields
-- only ever move backward in time (LEAST/GREATEST guards) so re-running
-- the migration is idempotent.

BEGIN;

-- last_seen: latest event timestamp per customer
WITH max_event_ts AS (
  SELECT customer_id, MAX(timestamp) AS ts
  FROM events
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
)
UPDATE customers c
SET last_seen = COALESCE(m.ts, c.last_order_date, c.first_seen, c.last_seen),
    updated_at = NOW()
FROM max_event_ts m
WHERE c.id = m.customer_id
  AND m.ts IS NOT NULL
  AND m.ts < c.last_seen;     -- only correct rows where last_seen is in the future relative to actual events

-- Customers with NO events but some order history: pull last_seen back to last_order_date
UPDATE customers c
SET last_seen = c.last_order_date,
    updated_at = NOW()
WHERE c.last_order_date IS NOT NULL
  AND c.last_order_date < c.last_seen
  AND NOT EXISTS (
    SELECT 1 FROM events e WHERE e.customer_id = c.id
  );

-- first_seen: earliest event timestamp (only move backward)
WITH min_event_ts AS (
  SELECT customer_id, MIN(timestamp) AS ts
  FROM events
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
)
UPDATE customers c
SET first_seen = m.ts,
    updated_at = NOW()
FROM min_event_ts m
WHERE c.id = m.customer_id
  AND m.ts IS NOT NULL
  AND m.ts < c.first_seen;

-- Customers with no events but order history: pull first_seen back to first_order_date
UPDATE customers c
SET first_seen = c.first_order_date,
    updated_at = NOW()
WHERE c.first_order_date IS NOT NULL
  AND c.first_order_date < c.first_seen;

COMMIT;
