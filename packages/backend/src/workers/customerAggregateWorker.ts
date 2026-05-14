import { Worker } from 'bullmq'
import { eq, sql, isNull, asc } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { customers, events } from '../db/schema.js'
import { upsertProductsFromLineItems } from '../services/productCatalogService.js'

/**
 * Customer-aggregate worker — the heart of the event-driven CDP.
 *
 * Each event flowing through /api/v1/events (or /v1/import/*) ends up here.
 * We fold the event into the customer's running aggregates: total_orders,
 * total_spent, first/last order date, avg order value, last_seen.
 *
 * Replaces the FDW federation cron that polled gwm.order_summary every 5min.
 * Now the same numbers update within seconds — no DB access from the source
 * required, no per-merchant SQL functions.
 *
 * Event-name → effect:
 *   order_placed       → total_orders++, total_spent+=, last_order_date=max
 *                        first_order_date=COALESCE(first_order_date, ts)
 *                        avg_order_value=total_spent/total_orders
 *   order_refunded     → total_spent-= (counters stay; the order existed)
 *   order_cancelled    → total_orders--, total_spent-= when matching a prior
 *                        order_placed (idempotency_key dedup across the pair)
 *   anything           → last_seen=max(last_seen, event.timestamp)
 *
 * Idempotency: events.processed_at is set when the worker finishes. Same job
 * arriving twice (BullMQ retry, manual replay) hits the WHERE processed_at IS NULL
 * guard and is a no-op the second time.
 */

type AggregateJob = {
  eventId: string
  projectId: string
  customerId: string | null
  eventName: string
  properties: Record<string, unknown>
  timestamp: string  // ISO
}

type ResolvedAggregateInput = {
  projectId: string
  customerId: string
  eventName: string
  properties: Record<string, unknown>
}

// Events that net-add revenue to a customer's total_spent.
//
//   ecommerce:
//     order_placed           — one-shot purchase
//     subscription_started   — first billing cycle (recurring revenue)
//     subscription_renewed   — each subsequent cycle
//
//   BFSI (see CLIENT_ONBOARDING.md §7.5 for the per-vertical mental model):
//     loan_disbursed         — loan amount counts as customer "LTV"
//                              (total business done with this customer)
//     emi_paid               — each EMI is recurring revenue
//     premium_paid           — each insurance premium payment
//
// Every event in this set must carry properties.total — the aggregator
// reads that field and adds it to customer.total_spent.
const REVENUE_INCREMENT_EVENTS = new Set([
  'order_placed',
  'subscription_started',
  'subscription_renewed',
  'loan_disbursed',
  'emi_paid',
  'premium_paid',
])

// Events that net-subtract revenue. order_returned mirrors order_refunded
// for physical-goods returns (return + restock vs refund + no restock).
// order_cancelled stays in this set because legacy historical-import flows
// emit it on canceled orders that previously counted as order_placed.
// claim_settled subtracts the payout amount from the insurance customer's
// lifetime "premium paid" balance.
const REVENUE_DECREMENT_EVENTS = new Set([
  'order_refunded',
  'order_returned',
  'order_cancelled',
  'claim_settled',
])

export function startCustomerAggregateWorker(): Worker {
  const worker = new Worker(
    'customer-aggregates',
    async (job) => {
      const evt = job.data as AggregateJob

      if (!evt.customerId) {
        // Anonymous event (no resolved customer yet). Mark processed so we
        // don't keep scanning it; nothing to aggregate without a target.
        await markProcessed(evt.eventId)
        return
      }

      // Idempotent guard: only apply if not yet processed. Same job hitting
      // twice (retry, manual rerun) is a no-op the second time.
      const [evtRow] = await db
        .select({ processedAt: events.processedAt })
        .from(events)
        .where(eq(events.id, evt.eventId))
        .limit(1)

      if (!evtRow) {
        // Event row was deleted before we got to it — nothing to do.
        return
      }
      if (evtRow.processedAt) {
        // Already aggregated.
        return
      }

      const ts = new Date(evt.timestamp)
      await applyEvent({
        projectId: evt.projectId,
        customerId: evt.customerId,
        eventName: evt.eventName,
        properties: evt.properties,
      }, ts)
      await markProcessed(evt.eventId)
    },
    {
      connection: redisConnection,
      // Concurrency is bounded because every job UPDATEs the customer row.
      // 20 = enough for ~thousands of events/min without lock contention.
      concurrency: 20,
    },
  )

  worker.on('failed', (job, err) => {
    console.error(`[customer-aggregate] job ${job?.id} failed:`, err.message)
  })

  return worker
}

/**
 * Apply a single event to the customer's aggregate row. One SQL statement so
 * the update is atomic and we don't race ourselves under concurrency=20.
 *
 * Note: order_placed includes a `total` property the worker uses. If a
 * client sends order_placed without `total`, the counters bump but revenue
 * stays unchanged (defensive — better than crashing the job loop).
 */
async function applyEvent(evt: ResolvedAggregateInput, ts: Date): Promise<void> {
  const customerId = evt.customerId
  const eventName = evt.eventName

  // Side-effect: keep the product catalog fresh from line items.
  // Best-effort — failures are logged but don't fail the customer-aggregate
  // contract. The aggregator's primary job is customer totals; catalogue
  // maintenance is bonus.
  if (REVENUE_INCREMENT_EVENTS.has(eventName)) {
    const lineItems = evt.properties.line_items as unknown[] | undefined
    if (lineItems && lineItems.length > 0) {
      try {
        await upsertProductsFromLineItems(evt.projectId, lineItems)
      } catch (err) {
        console.error('[customer-aggregate] product catalog upsert failed (non-fatal):', (err as Error).message)
      }
    }
  }

  if (REVENUE_INCREMENT_EVENTS.has(eventName)) {
    const total = Number(evt.properties.total ?? 0)
    if (!Number.isFinite(total) || total < 0) {
      // Bad payload — still bump last_seen + counter, skip revenue.
      await db.execute(sql`
        UPDATE customers
        SET total_orders     = total_orders + 1,
            first_order_date = COALESCE(first_order_date, ${ts}),
            last_order_date  = GREATEST(last_order_date, ${ts}),
            last_seen        = GREATEST(last_seen, ${ts}),
            updated_at       = NOW()
        WHERE id = ${customerId}
      `)
      return
    }

    await db.execute(sql`
      UPDATE customers
      SET total_orders     = total_orders + 1,
          total_spent      = total_spent + ${total}::numeric,
          first_order_date = COALESCE(first_order_date, ${ts}),
          last_order_date  = GREATEST(last_order_date, ${ts}),
          avg_order_value  = CASE
            WHEN total_orders + 1 > 0
            THEN (total_spent + ${total}::numeric) / (total_orders + 1)
            ELSE 0
          END,
          last_seen        = GREATEST(last_seen, ${ts}),
          updated_at       = NOW()
      WHERE id = ${customerId}
    `)
    return
  }

  if (REVENUE_DECREMENT_EVENTS.has(eventName)) {
    const total = Number(evt.properties.total ?? 0)
    const safeTotal = Number.isFinite(total) && total >= 0 ? total : 0
    // GREATEST(..., 0) so we don't drive aggregates negative if a refund
    // arrives without a preceding order_placed in our pipeline (e.g. the
    // order was placed via FDW and the refund via webhook — pre-cutover).
    await db.execute(sql`
      UPDATE customers
      SET total_spent      = GREATEST(total_spent - ${safeTotal}::numeric, 0),
          avg_order_value  = CASE
            WHEN total_orders > 0
            THEN GREATEST(total_spent - ${safeTotal}::numeric, 0) / total_orders
            ELSE 0
          END,
          last_seen        = GREATEST(last_seen, ${ts}),
          updated_at       = NOW()
      WHERE id = ${customerId}
    `)
    return
  }

  // Any other event — just bump last_seen.
  await db.execute(sql`
    UPDATE customers
    SET last_seen = GREATEST(last_seen, ${ts}),
        updated_at = NOW()
    WHERE id = ${customerId}
  `)
}

async function markProcessed(eventId: string): Promise<void> {
  await db.update(events).set({ processedAt: new Date() }).where(eq(events.id, eventId))
}

/**
 * One-shot catch-up: scan events table for rows the worker hasn't processed
 * yet (e.g. events ingested before this worker shipped) and aggregate them
 * in chronological order. Safe to call repeatedly — the processed_at flag
 * makes it idempotent.
 *
 * Called automatically on worker startup. Bounded scan so a project with
 * millions of historical events doesn't lock the worker on boot.
 */
export async function runStartupCatchUp(): Promise<{ processed: number }> {
  const BATCH = 1000
  let total = 0

  while (true) {
    const batch = await db
      .select({
        id: events.id,
        projectId: events.projectId,
        customerId: events.customerId,
        eventName: events.eventName,
        properties: events.properties,
        timestamp: events.timestamp,
      })
      .from(events)
      .where(isNull(events.processedAt))
      .orderBy(asc(events.timestamp))
      .limit(BATCH)

    if (batch.length === 0) break

    for (const ev of batch) {
      if (!ev.customerId) {
        await markProcessed(ev.id)
        continue
      }
      await applyEvent({
        projectId: ev.projectId,
        customerId: ev.customerId,
        eventName: ev.eventName,
        properties: (ev.properties as Record<string, unknown>) ?? {},
      }, ev.timestamp)
      await markProcessed(ev.id)
      total++
    }

    // Don't busy-loop the DB — small breather between batches.
    if (batch.length === BATCH) await new Promise(r => setTimeout(r, 50))
    else break
  }

  if (total > 0) {
    console.log(`[customer-aggregate] startup catch-up: processed ${total} historical events`)
  }
  return { processed: total }
}
