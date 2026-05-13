-- gwm_one_time_event_backfill.sql
--
-- ONE-TIME SCRIPT. Run once on GWM prod, then never again.
--
-- Purpose: convert all historical gwm.order rows into Storees events so the
-- customerAggregateWorker can rebuild customers.total_spent / total_orders /
-- first_order_date / last_order_date from the event log. This is what makes
-- it safe to retire the FDW federation cron — all the data it was syncing
-- gets replayed into the standard event pipeline.
--
-- After this runs:
--   - events table has one `order_placed` row per historical gwm.order
--     (idempotency_key = 'order_placed_historical:<gwm_order_id>')
--   - All flagged `historical: true` so the trigger worker skips them
--     (no welcome-email-from-6-months-ago spam)
--   - customerAggregateWorker's startup catch-up rolls them all up
--   - Aggregates converge to match what FDW was producing
--
-- Requirements:
--   - gwm.* foreign tables still imported (the script reads from them one
--     final time before they're removed)
--   - Storees customers.external_id already populated for matching gwm
--     customers (FDW's mv_gwm_customer_attrs sync handled this; check that
--     storees has rows for the customers you're about to import orders for)
--
-- Idempotent: INSERT ... ON CONFLICT (project_id, idempotency_key) DO NOTHING.
-- Re-running drops duplicates silently.

\set project_id '\'a3fe60d4-aa5f-4db1-b775-ee926de78611\''

-- ── 1. Pre-flight check: how many orders will be backfilled? ──────────────
SELECT
  (SELECT COUNT(*) FROM gwm."order" o
     WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = FALSE)
    AS gwm_orders_eligible,
  (SELECT COUNT(*) FROM gwm."order" o
     JOIN customers c ON c.project_id = :project_id::uuid AND c.external_id = o.customer_id
     WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = FALSE)
    AS orders_with_matching_storees_customer,
  (SELECT COUNT(*) FROM events
     WHERE project_id = :project_id::uuid
       AND event_name = 'order_placed'
       AND idempotency_key LIKE 'order_placed_historical:%')
    AS already_backfilled;

-- ── 2. Generate synthetic order_placed events ────────────────────────────
-- One per historical gwm.order with a matching Storees customer. Properties
-- carry total, currency, line items, and `historical: true` so trigger
-- worker skips them.

INSERT INTO events (
  project_id, customer_id, event_name, properties,
  platform, source, idempotency_key, timestamp, received_at
)
SELECT
  :project_id::uuid,
  c.id,
  'order_placed',
  jsonb_build_object(
    'order_id', o.id,
    'total', COALESCE((osu.totals->>'total')::numeric, 0),
    'currency', COALESCE(o.currency_code, 'INR'),
    'historical', true,
    'line_items', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'product_id', oli.product_id,
         'product_name', COALESCE(NULLIF(TRIM(oli.product_title), ''), 'Item'),
         'product_type', oli.product_type,
         'product_collection', oli.product_collection,
         'quantity', oi.quantity,
         'price', oi.unit_price
       ))
       FROM gwm.order_item oi
       JOIN gwm.order_line_item oli ON oli.id = oi.item_id
       WHERE oi.order_id = o.id AND oi.deleted_at IS NULL),
      '[]'::jsonb
    )
  ),
  'api',
  'gwm_backfill',
  'order_placed_historical:' || o.id,
  o.created_at,
  NOW()
FROM gwm."order" o
JOIN customers c
  ON c.project_id = :project_id::uuid
  AND c.external_id = o.customer_id
LEFT JOIN gwm.order_summary osu ON osu.order_id = o.id
WHERE o.deleted_at IS NULL
  AND o.canceled_at IS NULL
  AND o.is_draft_order = FALSE
ON CONFLICT (project_id, idempotency_key) DO NOTHING;

-- ── 3. Report what happened ──────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM events
     WHERE project_id = :project_id::uuid
       AND event_name = 'order_placed'
       AND idempotency_key LIKE 'order_placed_historical:%')
    AS historical_orders_now_in_events,
  (SELECT COUNT(*) FROM events
     WHERE project_id = :project_id::uuid
       AND event_name = 'order_placed'
       AND idempotency_key LIKE 'order_placed_historical:%'
       AND processed_at IS NULL)
    AS pending_aggregation;

-- After this runs, the customerAggregateWorker's startup catch-up (or
-- subsequent ticks) will fold these into customers.total_spent etc.
-- Verify with:
--   SELECT total_orders, total_spent FROM customers
--   WHERE project_id = :project_id AND total_spent > 0
--   ORDER BY total_spent DESC LIMIT 10;
