import { sql } from 'drizzle-orm'
import { db } from '../db/connection.js'

/**
 * Materialise event-only orders into the `orders` table.
 *
 * Orders arrive two ways: live/connector-incremental order events get a table
 * row (the aggregate worker materialises them), but HISTORICAL-import events
 * (`platform: 'historical_sync'`, deliberately not queued) and any
 * `order_completed`-only orders never do — they exist solely in the events
 * stream. That split means anything reading the `orders` table directly
 * (segments, revenue metrics, exports, ad audiences) undercounts.
 *
 * This closes the gap durably: for every order event with an order id that has
 * no matching row, insert one — deduped on (project, external_order_id), so it's
 * idempotent and safe to re-run. Batched to bound each statement. After this the
 * orders table is the complete source of truth and callers no longer need the
 * events fallback.
 */
export async function backfillOrdersFromEvents(projectId: string): Promise<{ materialized: number }> {
  const BATCH = 2000
  const MAX_ITERATIONS = 1000 // safety cap (2M orders); real projects finish far sooner
  let materialized = 0

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await db.execute(sql`
      INSERT INTO orders (project_id, customer_id, external_order_id, status, total, discount, currency, line_items, created_at, fulfilled_at)
      SELECT DISTINCT ON (order_key)
             project_id, customer_id, order_key, status, total, discount, currency, line_items, ts, fulfilled_at
      FROM (
        SELECT
          e.project_id,
          e.customer_id,
          COALESCE(
            NULLIF(e.properties->>'order_id', ''),
            CASE WHEN e.properties->>'display_id' IS NOT NULL THEN '#' || (e.properties->>'display_id') END
          ) AS order_key,
          LEFT(COALESCE(NULLIF(e.properties->>'fulfillment_status', ''), NULLIF(e.properties->>'status', ''), 'pending'), 20) AS status,
          COALESCE(
            NULLIF(e.properties->>'total', '')::numeric,
            (SELECT COALESCE(SUM(
               COALESCE(NULLIF(item->>'price', '')::numeric, NULLIF(item->>'unit_price', '')::numeric, 0)
               * COALESCE(NULLIF(item->>'quantity', '')::numeric, 1)
             ), 0)
             FROM jsonb_array_elements(e.properties->'line_items') item),
            0
          )::numeric(12,2) AS total,
          COALESCE(NULLIF(e.properties->>'discount', '')::numeric, NULLIF(e.properties->>'discount_total', '')::numeric, 0)::numeric(12,2) AS discount,
          LEFT(COALESCE(NULLIF(e.properties->>'currency', ''), 'INR'), 3) AS currency,
          COALESCE(e.properties->'line_items', '[]'::jsonb) AS line_items,
          e.timestamp AS ts,
          CASE WHEN e.properties->>'fulfillment_status' = 'delivered' THEN e.timestamp ELSE NULL END AS fulfilled_at
        FROM events e
        WHERE e.project_id = ${projectId}
          AND e.customer_id IS NOT NULL
          AND e.event_name IN ('order_placed', 'order_completed')
      ) mapped
      WHERE order_key IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.project_id = mapped.project_id AND o.external_order_id = mapped.order_key
        )
      ORDER BY order_key, ts DESC   -- one row per order, latest event's state wins
      LIMIT ${BATCH}
      ON CONFLICT (project_id, external_order_id) DO NOTHING
    `)

    const n = Number((res as { rowCount?: number }).rowCount ?? 0)
    materialized += n
    if (n < BATCH) break
  }

  return { materialized }
}
