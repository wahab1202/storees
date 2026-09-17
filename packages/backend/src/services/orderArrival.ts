import { sql } from 'drizzle-orm'

import { db } from '../db/connection.js'

/**
 * Is a purchase for this order id already in the event ledger, waiting to become an
 * order row?
 *
 * WHY THIS QUESTION EXISTS.
 *
 * A reversal or a fulfilment that finds no order row has two completely different
 * causes, and they need opposite handling:
 *
 *   THE SALE PREDATES THIS PIPELINE. The order came in over a direct database link
 *   or an import that wrote no event, and the refund is arriving by webhook now.
 *   There will never be an order row. The caller must carry on and adjust the
 *   customer's totals by hand — retrying would only fail five times and bury a real
 *   refund in the failed set.
 *
 *   THE SALE IS STILL IN THE QUEUE. Aggregate jobs run eight at a time, so an order
 *   and its cancellation are routinely handed to different workers in the same
 *   instant. The order row is seconds away. The caller must retry, not adjust.
 *
 * Told apart by the ledger: every event-borne purchase is written to `events` before
 * any aggregate job is queued for it, so a purchase carrying this order id being
 * present means the row is coming. Absent means it never will.
 *
 * Getting this wrong is not a rounding error. Treating the race as the legacy case
 * left the order live for ever while quietly taking the money off the customer, so
 * the orders table and the customer totals disagreed permanently: two projects fed
 * byte-identical data reported Rs2,162,925 and Rs2,212,160 against a true
 * Rs1,975,087, each having lost a different arbitrary subset of 68 reversals.
 *
 * `purchaseEvents` comes from the project's own vocabulary — a shop whose word for
 * a sale is `sale_rung_up` is asked about `sale_rung_up`. The published names are
 * only ever the fallback the vocabulary itself supplies.
 */
export async function purchaseAwaitingProcessing(
  projectId: string,
  externalOrderId: string,
  purchaseEvents: string[],
  orderIdKey: string,
): Promise<boolean> {
  if (!externalOrderId || purchaseEvents.length === 0) return false

  const names = sql.join(purchaseEvents.map(n => sql`${n}`), sql`, `)
  const res = await db.execute<{ one: number }>(sql`
    SELECT 1 AS one
    FROM events
    WHERE project_id = ${projectId}
      AND event_name IN (${names})
      AND COALESCE(
            properties->>${orderIdKey},
            properties->>'order_id',
            properties->>'id'
          ) = ${externalOrderId}
    LIMIT 1
  `)
  return res.rows.length > 0
}
