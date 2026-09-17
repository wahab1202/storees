import { Worker } from 'bullmq'
import { eq, and, sql, isNull, asc } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { isReversedOrderStatus, ORDER_STATUS } from '../db/orderStatus.js'
import { customers, events, orders } from '../db/schema.js'
import { upsertProductsFromLineItems } from '../services/productCatalogService.js'
import { relayConversionEvent } from '../services/conversionApiService.js'
import { computeClv, updateCustomerAggregates, mlChurnScore } from '../services/customerService.js'
import { normalizeLineItemFields } from '@storees/shared'
import { purchaseAwaitingProcessing } from '../services/orderArrival.js'
import { projectVocabulary } from '../services/projectVocabulary.js'

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
  /** Re-running an event that was already aggregated, because the mapping changed
   *  underneath it. Bypasses the processed-at guard — and ONLY for the one branch
   *  that can survive it. See the handler. */
  replay?: boolean
}

type ResolvedAggregateInput = {
  projectId: string
  customerId: string
  eventName: string
  properties: Record<string, unknown>
  /** re-running stored history rather than reacting to something that just happened */
  replay?: boolean
}

/** Reversal statuses this one is allowed to overwrite ON REPLAY, and no others.
 *
 * Live events arrive in the order they happened, so the last one written is the right
 * one. Replayed events do not: the queue drains concurrently, and an order that was
 * returned and then refunded can have the two land either way round. Four Viranacart
 * orders came back as `returned` when the shop said `refunded` — and both events
 * carried the SAME timestamp, to the second, so ordering the replay could not have
 * settled it either.
 *
 * So replay settles it by finality instead of by arrival. A refund is the end of the
 * story — goods back, money back — and a cancellation is the start. Money never moves
 * differently for any of the three, so this decides the LABEL only; what it protects is
 * return rate, which is the number the three separate boxes exist to make answerable.
 */
const OUTRANKED_BY: Record<string, string[]> = {
  refunded: [],                            // nothing outranks money going back
  returned: ['refunded'],
  cancelled: ['refunded', 'returned'],
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
// Repeat payments against an existing commitment. NOT purchases: no id of their own,
// so they never create an order row, and they are a category every vertical can emit
// rather than one industry's vocabulary.
const RECURRING_REVENUE_EVENTS = new Set([
  'subscription_renewed',
  'emi_paid',
  'premium_paid',
])

const REVENUE_DECREMENT_EVENTS = new Set([
  'order_refunded',
  'order_returned',
  'order_cancelled',
  'claim_settled',
])


/** Postgres codes for "your write lost a race" — 40P01 deadlock, 40001 serialisation.
 *
 *  These are the one class of error where retrying is not hope but arithmetic: the
 *  transaction that beat us has committed by the time we come back, so the collision
 *  cannot recur identically. Treating them like ordinary failures is what silently
 *  lost orders during a replay — three quick attempts all landed inside the same
 *  contention window, and the event was dropped with the row never written. */
const isLostRace = (err: unknown): boolean => {
  const code = (err as { code?: string })?.code
  return code === '40P01' || code === '40001'
}

/** Retry a lost race with widening backoff. Anything else is a real error and is
 *  rethrown immediately — this must not paper over a genuine failure. */
async function withLostRaceRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  const DELAYS = [50, 200, 600, 1_500, 4_000]
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (err) {
      if (!isLostRace(err) || i >= DELAYS.length) throw err
      await new Promise(r => setTimeout(r, DELAYS[i] + Math.random() * DELAYS[i]))
      console.warn(`[customer-aggregate] ${what}: lost a write race, retry ${i + 1}`)
    }
  }
}

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
      // REPLAY: the mapping changed, so an event judged meaningless when it arrived
      // may well carry a meaning now. The guard below would skip it forever.
      //
      // Bypassing that guard is only safe for branches that LAND ON THE SAME ANSWER
      // when run twice. `applyEvent` mostly ADDS — `total_orders++, total_spent+=` —
      // and a second pass over those double-counts, which is exactly what
      // `processed_at` exists to prevent. Three branches are exceptions, and all
      // three need an order id to find the row they act on:
      //
      //   PURCHASE   inserts ON CONFLICT DO NOTHING, then recomputes the customer's
      //              totals from the orders table.
      //   FULFILMENT moves the order pending -> fulfilled and touches no money.
      //   REVERSAL   marks the order, then recomputes from the orders table. This one
      //              only became replayable today: it used to subtract the amount by
      //              hand, which a second pass would have applied twice.
      //
      // The last two were the reason mapping a shop's own word for "delivered" or
      // "cancelled" fixed the future and abandoned the past — every event already
      // stored under that name stayed unrecognised, so a cancelled order kept its
      // revenue for good. Only the purchase box was ever replayed.
      //
      // A replay job that would not take one of those three branches is dropped
      // rather than risked.
      if (evt.replay) {
        const v = await projectVocabulary(evt.projectId)
        const orderId = String(
          evt.properties[v.orderIdKey] ?? evt.properties.order_id ?? evt.properties.id ?? '',
        ).trim()
        if (!orderId) return
        const replayable = v.purchaseEvents.includes(evt.eventName)
          || v.fulfilmentEvents.includes(evt.eventName)
          || v.cancellationEvents.includes(evt.eventName)
        if (!replayable) return

        // A reversal needs its order to exist before it can be applied idempotently.
        // Replayed jobs drain concurrently, so a cancellation can reach the worker
        // ahead of the purchase that creates its row — and with no row, the reversal
        // branch falls through to subtracting the amount directly, which is the one
        // path that double-counts. Skipping is safe: the mapping save re-enqueues
        // purchases first, and a reversal whose order genuinely never arrived has
        // nothing to reverse.
        if (!v.purchaseEvents.includes(evt.eventName)) {
          const [existing] = await db
            .select({ id: orders.id })
            .from(orders)
            .where(and(
              eq(orders.projectId, evt.projectId),
              eq(orders.externalOrderId, orderId),
            ))
            .limit(1)
          if (!existing) return
        }
      } else if (evtRow.processedAt) {
        // Already aggregated.
        return
      }

      const ts = new Date(evt.timestamp)
      // Bound outside the closure: the early `if (!evt.customerId) return` narrows the
      // field, but a callback re-widens it.
      const customerId = evt.customerId
      await withLostRaceRetry(`event ${evt.eventId}`, () => applyEvent({
        projectId: evt.projectId,
        customerId,
        eventName: evt.eventName,
        properties: evt.properties,
        replay: evt.replay,
      }, ts))
      await markProcessed(evt.eventId)

      // Gap 9: fan a server-side conversion event out to configured ad
      // platforms. Only relays REVENUE-increment events (Purchase /
      // Subscribe / etc. — see META_EVENT_NAME_MAP in
      // conversionApiService). Backfilled historical:true events are
      // skipped so initial-import doesn't blast a year of orders to
      // Meta. Failures are logged inside the service and never bubble.
      const isHistorical = (evt.properties as { historical?: unknown }).historical === true
      // Same union as applyEvent: a project whose purchase event is not on the
      // hardcoded set (edtech's `course_enrolled`) would otherwise never relay a
      // conversion either.
      const relayVocab = await projectVocabulary(evt.projectId)
      const isRevenue = relayVocab.purchaseEvents.includes(evt.eventName)
        || RECURRING_REVENUE_EVENTS.has(evt.eventName)
      if (!isHistorical && isRevenue) {
        relayConversionEvent({
          projectId: evt.projectId,
          customerId: evt.customerId,
          eventName: evt.eventName,
          eventTime: ts,
          properties: evt.properties,
        }).catch((err) => {
          console.error(`[customer-aggregate] conversion-api relay failed for event ${evt.eventId}:`, (err as Error).message)
        })
      }
    },
    {
      connection: redisConnection,
      // Concurrency is bounded because every job UPDATEs the customer row.
      //
      // 20 was chosen for live traffic, where events for one customer arrive minutes
      // apart. A mapping replay is the opposite shape: 88,722 events for 16,322
      // customers, dumped at once, so twenty workers routinely hold twenty writes
      // against the SAME customer row and its order rows. That is a deadlock factory —
      // and every collision used to lose an order outright.
      //
      // Eight still saturates a replay (the bottleneck is Postgres, not the queue) and
      // cuts the collision rate roughly fourfold. `withLostRaceRetry` catches whatever
      // still collides.
      concurrency: Number(process.env.AGGREGATE_CONCURRENCY ?? 8),
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
  // LAST SEEN CANNOT BE IN THE FUTURE.
  //
  // `last_seen` means "the last time we observed this person". `ts` is whatever the
  // caller put on the event, and nothing upstream checks it against the clock — a
  // shop with a skewed clock, a backfill that dates follow-ups forward, or a broken
  // integration can all send one. `GREATEST(last_seen, ts)` then walks the field
  // forward and it never comes back, because every later real event is smaller.
  //
  // Observed here: seeded fulfilment and review events dated up to 18 days ahead put
  // 25 customers' `last_seen` into the future, the furthest reading Sep 22 while the
  // newest event in the whole project was Sep 7.
  //
  // That is not a cosmetic date on a table. Recency is an input: `days_since_last_seen`
  // goes negative and is clamped to 0 (customerService), so those customers look like
  // they were active moments ago. Churn and dormancy read recency, "Active (7d)" counts
  // it, and every segment with a recency filter matches on it.
  //
  // The EVENT is still stored and still aggregated with its own `ts` — order dates
  // included, since a future-dated order is the caller's claim to keep. Only the
  // "when did we last see them" reading is held to now, because that one is ours.
  const seenAt = ts > new Date() ? new Date() : ts

  const customerId = evt.customerId
  const eventName = evt.eventName

  // What THIS project calls a purchase, and where it puts the amount.
  //
  // Both were hardcoded: the event had to appear in `REVENUE_INCREMENT_EVENTS`, and
  // the money had to be in `properties.total`. Those are a shop's words, and the two
  // failures they produce are different sizes:
  //
  //   lending   `loan_disbursed` IS on the list, but the amount is in `amount`
  //             -> a ₹5,00,000 loan recorded as total_orders=1, total_spent=0.00
  //   edtech    `course_enrolled` is on no list at all
  //             -> not even the count registers
  //
  // Nothing errors either way, so a client sees "47 loans · ₹0" and assumes the sync
  // is still catching up. Meanwhile the models train on the correct figures, because
  // the pipeline has read the project's mapping since it was wired up — the thinking
  // layer was made generic and the showing layer never was.
  //
  // The project's purchase events are UNIONED with the existing set rather than
  // replacing it: the set also holds recurring-revenue events that are not a first
  // purchase — `subscription_renewed`, `emi_paid`, `premium_paid` — and those must
  // keep counting.
  const vocab = await projectVocabulary(evt.projectId)
  // A project that stated its vocabulary is judged by that alone — unioning retail's
  // names back in is the shop leaking into every vertical. `RECURRING_REVENUE_EVENTS`
  // is different: those are not purchases at all but repeat payments with no
  // transaction id of their own, a category rather than an industry's word, and they
  // must keep counting for whichever vertical emits them.
  const isRevenueIncrement = vocab.purchaseEvents.includes(eventName)
    || RECURRING_REVENUE_EVENTS.has(eventName)
  // `amount` is read last, and it is not an alias anyone invented — it is the name
  // OUR OWN dictionary publishes for the two reversal events:
  //
  //     order_placed / order_cancelled  ->  total
  //     order_returned / order_refunded ->  amount
  //
  // and EVENT_SPEC says so out loud: "order_refunded and order_returned may send
  // `amount` instead of `total` where the refund is partial". They have to — a ₹2,000
  // refund against a ₹4,499 order cannot call itself the total.
  //
  // Reading only `total` meant a client who followed that documentation exactly had
  // every return and refund deduct ZERO. Measured on two identical shoppers: the one
  // who cancelled (payload carried `total`) went to ₹0, the one who returned and was
  // refunded (payload carried `amount`) kept their full ₹4,499.
  const amountOf = (props: Record<string, unknown>) =>
    Number(props[vocab.amountKey] ?? props.total ?? props.amount ?? 0)

  // Side-effect: keep the product catalog fresh from line items.
  // Best-effort — failures are logged but don't fail the customer-aggregate
  // contract. The aggregator's primary job is customer totals; catalogue
  // maintenance is bonus.
  if (isRevenueIncrement) {
    const lineItems = evt.properties.line_items as unknown[] | undefined
    if (lineItems && lineItems.length > 0) {
      try {
        await upsertProductsFromLineItems(evt.projectId, lineItems)
      } catch (err) {
        console.error('[customer-aggregate] product catalog upsert failed (non-fatal):', (err as Error).message)
      }
    }
  }

  if (isRevenueIncrement) {
    const total = amountOf(evt.properties)

    // ORDER-ID DEDUPE — the same order can reach us through several paths
    // (Shopify webhook, historical sync, connector pull, /v1/events push,
    // Event Source definitions). The webhook + sync paths already dedupe via
    // the orders table's (project, external_order_id) unique index and bump
    // aggregates only on first insert; this worker previously counted
    // blindly, double-counting cross-path orders (1 real order → Orders: 2 →
    // fake "Repeat Buyers"). Same rule now: insert-or-skip, bump only on
    // first insert. Non-order revenue events (subscriptions, EMIs, premiums)
    // have no order id and keep per-event counting — they ARE per-event.
    // The transaction's own id, under whatever this project calls it -- `loan_id` for
    // a lender, `enrollment_id` for a course platform, `subscription_id` for SaaS.
    const externalOrderId = String(
      evt.properties[vocab.orderIdKey] ?? evt.properties.order_id ?? evt.properties.id ?? '').trim()
    // Materialise an order row for THIS PROJECT'S purchase event, not only for
    // `order_placed`. The orders table backs the revenue tiles, the customer's order
    // history and order-based segment filters; gated on one retail name it stayed
    // empty for every other vertical, and the dashboard's fallback -- count the events
    // instead -- was gated on the same name, so both paths failed together.
    //
    // The recurring-revenue events (`emi_paid`, `subscription_renewed`,
    // `premium_paid`) are deliberately NOT included: they are not transactions with
    // their own id, and they keep the per-event counting the branch below applies.
    if (vocab.purchaseEvents.includes(eventName) && externalOrderId) {
      // Materialise the order row (deduped on project+external_order_id), then
      // recompute total_orders/total_spent FROM the orders table. This is
      // idempotent and immune to multi-path double counting — the same order
      // arriving through the webhook, historical sync, /v1/events and this
      // worker all converge on one order row and one recomputed count.
      const rawItems = Array.isArray(evt.properties.line_items) ? evt.properties.line_items as Record<string, unknown>[] : []
      await db.insert(orders).values({
        projectId: evt.projectId,
        customerId,
        externalOrderId,
        status: ORDER_STATUS.PENDING,
        total: String(Number.isFinite(total) && total >= 0 ? total : 0),
        discount: String(Number(evt.properties[vocab.discountKey] ?? evt.properties.discount ?? 0) || 0),
        // Under whatever this project calls it. Read as the literal `currency`, a shop
        // sending `order_currency_code` fell through to the INR default and a $50 order
        // was stored as ₹50 — the amount right, the unit silently wrong, which is worse
        // than a missing figure because nothing looks broken.
        currency: String(
          evt.properties[vocab.currencyKey] ?? evt.properties.currency ?? 'INR',
        ).toUpperCase().slice(0, 3),
        lineItems: rawItems.map(item => ({
          ...normalizeLineItemFields(item),
          imageUrl: (item.image_url as string) ?? undefined,
        })),
        // Which door built this row. Only event-sourced orders may be removed when a
        // mapping changes, because only they can be rebuilt from the event ledger.
        sourceEvent: eventName,
        createdAt: ts,
      }).onConflictDoUpdate({
        // CLAIM THE ROW — do not skip it.
        //
        // `onConflictDoNothing` left an existing row wearing whichever purchase event
        // built it LAST time. A mapping save retires rows stamped with the PREVIOUS
        // purchase name, so a row this rebuild had just re-read — but skipped — still
        // wore the old stamp and was deleted as leftover. Measured on GoWelmart:
        // 2,621 rows retired, 2,600 of them orders the current mapping covers.
        //
        // Only `source_event` is written. Amount, currency and line items belong to
        // whoever recorded them; a re-read must not overwrite a fuller record with a
        // thinner one.
        //
        // AND ONLY ON A ROW THAT WAS ALREADY EVENT-BUILT. Stamping is what makes a row
        // deletable by a later mapping change, so it must never be applied to a row
        // that could not be rebuilt afterwards:
        //   NULL              predates this column — migration 0082 says never touched
        //   shopify_sync      pulled from Shopify's API; no event behind it
        //   historical_import a bulk upload; same
        // Without this clause the rebuild would have claimed all 7,094 of GoWelmart's
        // unknown-provenance rows, arming a future save to delete them for good.
        target: [orders.projectId, orders.externalOrderId],
        set: { sourceEvent: eventName },
        setWhere: sql`${orders.sourceEvent} IS NOT NULL
                      AND ${orders.sourceEvent} NOT IN ('shopify_sync', 'historical_import')`,
      })

      // `ts` is the event's own timestamp — so a replayed order does not mark this
      // customer as active today. See the `last_seen` note in updateCustomerAggregates.
      await updateCustomerAggregates(customerId, undefined, undefined, ts)
      return
    }

    // ── Non-order revenue events below (subscriptions, EMIs, premiums, or
    //    order_placed with no id) keep per-event counting — they ARE per-event.

    if (!Number.isFinite(total) || total < 0) {
      // Bad payload — still bump last_seen + counter, skip revenue.
      await db.execute(sql`
        UPDATE customers
        SET total_orders     = total_orders + 1,
            first_order_date = COALESCE(first_order_date, ${ts}),
            last_order_date  = GREATEST(last_order_date, ${ts}),
            last_seen        = GREATEST(last_seen, ${seenAt}),
            updated_at       = NOW()
        WHERE id = ${customerId}
      `)
      return
    }

    // Two-step: atomic SQL increment, then recompute CLV (historical +
    // predicted + health) in JS via the same model the bulk-sync path uses.
    // The atomic step prevents lost-update under concurrent order events;
    // the recompute step keeps clv + metrics.clv_* in sync with total_spent.
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
          last_seen        = GREATEST(last_seen, ${seenAt}),
          updated_at       = NOW()
      WHERE id = ${customerId}
    `)
    await refreshClv(customerId)
    return
  }

  // Fulfilment moves the order on without touching the money.
  //
  // The Shopify path has handled this since it was written (eventProcessor's
  // `order_fulfilled` case, one line from the `order_cancelled` case that was
  // already here). This path never did, so an order that reached the customer
  // stayed `pending` for ever — and two shipped flow templates trigger on it
  // (`Post-Purchase & Review`, `Replenishment Reminder`), which means neither
  // could fire for any shop that is not on Shopify.
  // Under THIS PROJECT'S name for it, from the mapping screen's Delivered box. The
  // published name stays in the test for the same reason the reversals keep theirs —
  // one project can receive both — but only when the project has not claimed it for
  // something else, which `projectVocabulary` has already resolved by precedence.
  const isFulfilment = vocab.fulfilmentEvents.includes(eventName)
    || (eventName === 'order_fulfilled' && !vocab.cancellationEvents.includes(eventName))

  if (isFulfilment) {
    const fulfilledOrderId = String(
      evt.properties[vocab.orderIdKey] ?? evt.properties.order_id ?? '',
    ).trim()
    if (fulfilledOrderId) {
      // Only from `pending`. A refund can land before a late fulfilment webhook,
      // and "delivered" must not overwrite the fact that the money went back.
      const marked = await db.update(orders)
        .set({ status: ORDER_STATUS.FULFILLED, fulfilledAt: ts })
        .where(and(
          eq(orders.projectId, evt.projectId),
          eq(orders.externalOrderId, fulfilledOrderId),
          eq(orders.status, 'pending'),
        ))
        .returning({ id: orders.id })

      // Same race as the reversal branch: a delivery can be handed to a worker before
      // the purchase it belongs to has become a row, and then quietly mark nothing.
      //
      // Zero rows here has three causes and only one of them is a mistake. The order
      // is already reversed and the guard above is correctly refusing to overwrite a
      // refund with a delivery — leave it. The order predates this pipeline and no row
      // will ever exist — leave it. Or the purchase is still in the queue — retry.
      // The ledger separates the third from the second, and reading the row separates
      // both from the first.
      if (marked.length === 0) {
        const [prior] = await db
          .select({ status: orders.status })
          .from(orders)
          .where(and(
            eq(orders.projectId, evt.projectId),
            eq(orders.externalOrderId, fulfilledOrderId),
          ))
          .limit(1)

        // JUDGE THE ROW'S STATUS, NOT ITS EXISTENCE.
        //
        // Asking only "does the row exist?" reads the wrong moment. The UPDATE ran
        // when there was no row; by the time this SELECT runs a few milliseconds
        // later the purchase has inserted one, so existence says "the row is there,
        // the guard above must have refused it" — and the delivery is dropped for a
        // reason that was never true. That misread cost 48 of 504 deliveries on a
        // single import, every one of them an order whose fulfilment happened to be
        // dequeued before its purchase.
        //
        // `pending` is the status the UPDATE would have taken, so finding it here
        // means the race was lost and nothing else. Anything already fulfilled or
        // reversed is a real refusal and is left exactly as it stands.
        if (prior?.status === 'pending') {
          throw new Error(
            `Fulfilment '${eventName}' for order ${fulfilledOrderId} lost a race with its `
            + `purchase (project ${evt.projectId}) — retrying`)
        }
        if (!prior && await purchaseAwaitingProcessing(
          evt.projectId, fulfilledOrderId, vocab.purchaseEvents, vocab.orderIdKey,
        )) {
          throw new Error(
            `Fulfilment '${eventName}' for order ${fulfilledOrderId} arrived before its `
            + `purchase was processed (project ${evt.projectId}) — retrying`)
        }
      }
    }
    await db.execute(sql`
      UPDATE customers SET last_seen = GREATEST(last_seen, ${seenAt}), updated_at = NOW()
      WHERE id = ${customerId}
    `)
    return
  }

  // Reversals, under THIS PROJECT'S names.
  //
  // The increment above already asks the vocabulary; this asked a hardcoded set, so
  // the two halves of the same ledger disagreed. A shop calling its refund
  // `money_returned` had the purchase counted and the reversal ignored — money in,
  // never out. Storees marked the order `pending` and kept the revenue, while the
  // shop's own screen said `refunded`.
  //
  // The standard names stay in the test as well as the declared ones: a project can
  // receive both, for instance its own events through /v1/events and `order_cancelled`
  // from a Shopify webhook on the same account.
  const isRevenueDecrement = vocab.cancellationEvents.includes(eventName)
    || REVENUE_DECREMENT_EVENTS.has(eventName)

  if (isRevenueDecrement) {
    const total = amountOf(evt.properties)
    const safeTotal = Number.isFinite(total) && total >= 0 ? total : 0

    // Mark the order itself, not just the customer's running total.
    //
    // This branch only ever adjusted `customers`, so the order row kept whatever
    // status it was inserted with — `pending`, forever. The Shopify path has done
    // this since it was written (eventProcessor's `order_cancelled` case); the
    // /v1/events and connector paths never did, so the same cancellation produced
    // two different outcomes depending on which door it came through.
    //
    // It matters because the revenue tile sums this table: a cancelled order kept
    // contributing its full value. Measured on Girinacart, ₹1,199 of cancelled
    // revenue sat in the headline figure with nothing to show it was cancelled.
    const reversedOrderId = String(
      evt.properties[vocab.orderIdKey] ?? evt.properties.order_id ?? '',
    ).trim()

    // DEDUCT ONCE PER ORDER.
    //
    // A return and its refund are two events about the SAME money — "the goods came
    // back" and "we paid them back" — and both were subtracted. One ₹7,499 order sent
    // `purchase_sent_back` (₹7,499) and then `money_returned` (₹3,000): ₹10,499 taken
    // off an order worth ₹7,499.
    //
    // It has been invisible because `GREATEST(..., 0)` floors the customer at zero, so
    // a single-order customer absorbs it silently. Someone with several orders is not
    // protected: the excess eats the revenue from the OTHER orders and their total is
    // simply wrong, with nothing on any screen to show why.
    //
    // The order's own status is the guard — already written above, already resolved
    // through the project's vocabulary, so this needs no name matching of its own. An
    // order carrying no id cannot be checked and keeps the old behaviour; the spec
    // requires `order_id` on all three reversals, so that is the malformed case.
    let alreadyReversed = false
    /** whether an order row actually took the new status — decides between recomputing
     *  from the orders table and the hand-rolled subtraction below */
    let matchedOrder = false
    if (reversedOrderId) {
      const [prior] = await db
        .select({ status: orders.status })
        .from(orders)
        .where(and(
          eq(orders.projectId, evt.projectId),
          eq(orders.externalOrderId, reversedOrderId),
        ))
        .limit(1)
      alreadyReversed = !!prior && isReversedOrderStatus(prior.status)
    }

    if (reversedOrderId) {
      // `returned` and `refunded` are kept distinct from `cancelled`: one never
      // shipped, the others came back. All three stop counting as revenue, but a
      // report that cannot tell them apart cannot measure return rate.
      //
      // WHICH kind comes from the mapping, not from the string.
      //
      // It used to come only from the published names, because the mapping had a
      // single "undo" bucket that said an event reverses revenue and never which
      // kind — so every shop using its own words had all three land as `cancelled`,
      // and return rate was not a number this product could produce. Guessing from
      // the string is worse than not knowing: `money_returned` is a refund but
      // contains "return", and `purchase_sent_back` is a return and contains neither.
      //
      // Three boxes on the mapping screen is what makes this answerable. The published
      // names remain the fallback for a project that has not filled them in, and for
      // Shopify events arriving on an account whose own vocabulary never mentions them.
      const reversalStatus =
        vocab.refundEvents.includes(eventName) ? 'refunded'
        : vocab.returnEvents.includes(eventName) ? 'returned'
        // Named in the Cancelled box specifically. A project that puts `order_refunded`
        // there is telling us it does not separate the two, and its own answer outranks
        // what the name happens to say.
        //
        // `reversalsDeclared`, NOT `declared`: the wider flag is true as soon as a
        // project declares anything at all, including a field path. Reading it here
        // treated every shop still on its industry's starter mapping as having chosen
        // one reversal bucket, and Girinacart's returns and refunds — sent under the
        // published names — all came back as `cancelled`.
        : (vocab.reversalsDeclared && vocab.cancellationEvents.includes(eventName)) ? 'cancelled'
        : eventName === 'order_refunded' ? 'refunded'
        : eventName === 'order_returned' ? 'returned'
        : 'cancelled'
      // On replay, refuse to demote a more final reversal — see OUTRANKED_BY.
      const cannotOverwrite = evt.replay ? (OUTRANKED_BY[reversalStatus] ?? []) : []
      const marked = await db.update(orders)
        .set({ status: reversalStatus })
        .where(and(
          eq(orders.projectId, evt.projectId),
          eq(orders.externalOrderId, reversedOrderId),
          ...(cannotOverwrite.length
            ? [sql`${orders.status} NOT IN (${sql.join(cannotOverwrite.map(s => sql`${s}`), sql`, `)})`]
            : []),
        ))
        .returning({ id: orders.id })

      // A refused overwrite still means the order is there and already reversed — the
      // customer's totals need no further work, and treating it as "no such order"
      // would send the money down the blind-subtraction path below.
      matchedOrder = marked.length > 0 || alreadyReversed
    }
    // The second reversal of the same order still marks the status above — a refund
    // following a return is worth recording — but it takes no money off again.
    if (alreadyReversed) {
      await db.execute(sql`
        UPDATE customers SET last_seen = GREATEST(last_seen, ${seenAt}), updated_at = NOW()
        WHERE id = ${customerId}
      `)
      return
    }

    // The order row exists and now carries a reversed status, so the orders table is
    // the truth and the same recompute the purchase branch uses gives the right answer.
    //
    // Subtracting by hand did not. It took the money off `total_spent` but never
    // touched `total_orders`, so a customer with three reversals kept counting them as
    // orders: ₹19,045 over five live orders was reported as an average of ₹2,380
    // against a count of eight. `total_spent` looked right, which is why it survived —
    // the count and the average beside it were the ones that were wrong.
    if (matchedOrder) {
      await updateCustomerAggregates(customerId, undefined, undefined, ts)
      return
    }

    // NOT EVERY MISSING ORDER IS AN OLD ONE.
    //
    // Falling straight through to the subtraction below assumed that no order row
    // means no order row will ever exist. That is true for a sale made before this
    // pipeline existed. It is false, several dozen times per import, for a sale still
    // sitting in the queue: aggregate jobs run eight at a time, so an order and its
    // cancellation are routinely handed to different workers in the same instant.
    //
    // When the reversal won that race the money came off the customer, the order was
    // never marked, and the job reported success. The order stayed a live sale for
    // ever, and the two halves of the ledger disagreed for good. Two projects fed
    // byte-identical data lost a DIFFERENT arbitrary subset of the same 68 reversals
    // — Rs2,162,925 and Rs2,212,160 against a true Rs1,975,087 — which is the
    // signature of a race and not of a rule.
    //
    // The ledger tells the two apart: an event-borne purchase is written to `events`
    // before its aggregate job is queued, so if one carrying this order id is there,
    // the row is seconds away. Hand the job back and let it come.
    if (reversedOrderId && await purchaseAwaitingProcessing(
      evt.projectId, reversedOrderId, vocab.purchaseEvents, vocab.orderIdKey,
    )) {
      throw new Error(
        `Reversal '${eventName}' for order ${reversedOrderId} arrived before its purchase `
        + `was processed (project ${evt.projectId}) — retrying`)
    }

    // No order row to reverse, and none is coming. Reaches here when the sale predates
    // this pipeline (the order placed via FDW, the refund arriving by webhook) or the
    // event carries no order id. Nothing to recompute from, so the amount is taken off
    // directly, with GREATEST(..., 0) so a reversal with no matching sale cannot drive
    // it negative.
    await db.execute(sql`
      UPDATE customers
      SET total_spent      = GREATEST(total_spent - ${safeTotal}::numeric, 0),
          avg_order_value  = CASE
            WHEN total_orders > 0
            THEN GREATEST(total_spent - ${safeTotal}::numeric, 0) / total_orders
            ELSE 0
          END,
          last_seen        = GREATEST(last_seen, ${seenAt}),
          updated_at       = NOW()
      WHERE id = ${customerId}
    `)
    await refreshClv(customerId)
    return
  }

  // Any other event — just bump last_seen.
  await db.execute(sql`
    UPDATE customers
    SET last_seen = GREATEST(last_seen, ${seenAt}),
        updated_at = NOW()
    WHERE id = ${customerId}
  `)
}

async function markProcessed(eventId: string): Promise<void> {
  await db.update(events).set({ processedAt: new Date() }).where(eq(events.id, eventId))
}

/**
 * Re-derive customers.clv (the column) and customers.metrics.clv_* (the JSONB
 * structure) from the customer's current total_spent / total_orders /
 * first_order_date / last_order_date. Called after every revenue event the
 * aggregate worker handles, so all three CLV storage points stay consistent
 * with the underlying counters.
 *
 * customers.clv (column) now means total CLV (historical + predicted),
 * matching the field's label everywhere in the UI. metrics.clv_historical is
 * lifetime spend; metrics.clv_predicted is the model's forward-looking
 * estimate; metrics.clv_health is the categorical signal.
 */
async function refreshClv(customerId: string): Promise<void> {
  const [row] = await db
    .select({
      totalSpent: customers.totalSpent,
      totalOrders: customers.totalOrders,
      firstOrderDate: customers.firstOrderDate,
      lastOrderDate: customers.lastOrderDate,
      lastSeen: customers.lastSeen,
      metrics: customers.metrics,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)
  if (!row) return

  const metrics = (row.metrics ?? {}) as Record<string, unknown>
  const clv = computeClv({
    totalSpent: Number(row.totalSpent),
    totalOrders: row.totalOrders,
    firstOrderDate: row.firstOrderDate,
    lastOrderDate: row.lastOrderDate,
    lastSeenDate: row.lastSeen,
    churnRiskScore: mlChurnScore(metrics),
  })

  await db
    .update(customers)
    .set({
      clv: String(clv.clv_total),
      metrics: { ...metrics, ...clv },
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId))
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
