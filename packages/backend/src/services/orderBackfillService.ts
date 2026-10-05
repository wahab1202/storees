import { sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { statusSqlFromProperties } from '../db/orderStatus.js'
import { projectVocabulary } from './projectVocabulary.js'

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

  // THIS PROJECT'S words: which events are its sales, and which fields hold the id, the
  // amount, the discount and the currency. This read `order_placed` / `order_completed`
  // and `order_id` / `total` / `discount` / `currency` literally, so a shop using its own
  // names rebuilt nothing — or rebuilt from an event its mapping says is not a sale.
  const vocab = await projectVocabulary(projectId)
  if (vocab.purchaseEvents.length === 0) return { materialized }
  const purchaseNames = sql.join(vocab.purchaseEvents.map(n => sql`${n}`), sql`, `)

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await db.execute(sql`
      INSERT INTO orders (project_id, customer_id, external_order_id, status, total, discount, currency, line_items, created_at, fulfilled_at, delivered_at, source_event)
      SELECT DISTINCT ON (order_key)
             project_id, customer_id, order_key, status, total, discount, currency, line_items, ts,
             -- A date only when the payload STATES one. These are purchase events: their
             -- timestamp is when the order was placed, so it is never used as the date it
             -- shipped or arrived. "Delivered, date unknown" beats a delivery on order day.
             CASE WHEN status = 'fulfilled' AND props->>'fulfilled_at' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (props->>'fulfilled_at')::timestamptz END,
             CASE WHEN status = 'delivered' AND props->>'delivered_at' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (props->>'delivered_at')::timestamptz END,
             -- Built from an event, so it can be rebuilt — and retired if the mapping
             -- later says that event is not a sale. NULL meant "provenance unknown",
             -- which the mapping save deliberately never touches.
             event_name
      FROM (
        SELECT
          e.project_id,
          e.customer_id,
          COALESCE(
            NULLIF(e.properties->>${vocab.orderIdKey}, ''),
            NULLIF(e.properties->>'order_id', ''),
            CASE WHEN e.properties->>'display_id' IS NOT NULL THEN '#' || (e.properties->>'display_id') END
          ) AS order_key,
          -- Translated by the shared reader, never copied raw: both facts (order on?
          -- parcel where?) read the same way as every other door. See orderStatus.ts.
          ${statusSqlFromProperties('e.properties')} AS status,
          COALESCE(
            NULLIF(e.properties->>${vocab.amountKey}, '')::numeric,
            (SELECT COALESCE(SUM(
               COALESCE(NULLIF(item->>'price', '')::numeric, NULLIF(item->>'unit_price', '')::numeric, 0)
               * COALESCE(NULLIF(item->>'quantity', '')::numeric, 1)
             ), 0)
             FROM jsonb_array_elements(e.properties->'line_items') item),
            0
          )::numeric(12,2) AS total,
          COALESCE(NULLIF(e.properties->>${vocab.discountKey}, '')::numeric, NULLIF(e.properties->>'discount_total', '')::numeric, 0)::numeric(12,2) AS discount,
          LEFT(COALESCE(NULLIF(e.properties->>${vocab.currencyKey}, ''), 'INR'), 3) AS currency,
          COALESCE(e.properties->'line_items', '[]'::jsonb) AS line_items,
          e.timestamp AS ts,
          e.properties AS props,
          e.event_name
        FROM events e
        WHERE e.project_id = ${projectId}
          AND e.customer_id IS NOT NULL
          AND e.event_name IN (${purchaseNames})
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
