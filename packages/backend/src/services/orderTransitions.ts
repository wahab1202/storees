import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm'

import { db } from '../db/connection.js'
import { orders } from '../db/schema.js'
import { ORDER_STATUS } from '../db/orderStatus.js'
import { purchaseAwaitingProcessing } from './orderArrival.js'

/**
 * Move an order forward to SHIPPED or DELIVERED.
 *
 * ONE implementation for every door. The Shopify webhook path and the /v1/events +
 * connector path each had their own copy of this, and they had drifted: one accepted a
 * legacy `unknown` / `processing` row and the other did not; one checked the ledger for
 * a purchase still in the queue and the other did not. The same delivery could mark an
 * order on one path and be silently dropped on the other.
 *
 * Forward only. Shipped may replace pending; delivered may replace pending or shipped.
 * Nothing replaces a reversal — a late "delivered" must not undo a refund already on the
 * books. `unknown` and `processing` are accepted as "not decided yet": they are words an
 * older import stored raw, not decisions.
 *
 * Zero rows updated has three causes, and only one of them is a mistake:
 *   - the order is already where this would move it, or reversed — leave it;
 *   - the order predates this pipeline and no row will ever exist — leave it;
 *   - its purchase is still in the queue — throw, so the queue's retries try again
 *     once the row exists.
 * The row's STATUS separates the first from a lost race; the ledger separates the
 * second from the third.
 */
export async function advanceOrder(opts: {
  projectId: string
  externalOrderId: string
  to: typeof ORDER_STATUS.FULFILLED | typeof ORDER_STATUS.DELIVERED
  /** WHEN IT HAPPENED — the shipment or the delivery itself, never the moment this
   *  message arrived. Stored as the order's shipped or delivered date. `null` when the
   *  source states the status but not when: the status still moves, the date stays
   *  empty rather than invented. */
  at: Date | null
  eventName: string
  purchaseEvents: string[]
  orderIdKey: string
}): Promise<void> {
  const { projectId, externalOrderId, to, at, eventName } = opts
  if (!externalOrderId) return

  const undecided = ['pending', 'unknown', 'processing']
  const movableFrom = to === ORDER_STATUS.DELIVERED
    ? [...undecided, ORDER_STATUS.FULFILLED]
    : undecided

  const moved = await db.update(orders)
    .set(at === null ? { status: to }
      : to === ORDER_STATUS.FULFILLED ? { status: to, fulfilledAt: at }
      : { status: to, deliveredAt: at })
    .where(and(
      eq(orders.projectId, projectId),
      eq(orders.externalOrderId, externalOrderId),
      inArray(orders.status, movableFrom),
    ))
    .returning({ id: orders.id })
  if (moved.length > 0) return

  // A shipment reported AFTER its delivery cannot move the order back — but it is still
  // the only record of when it shipped. Keep the date if the row has none.
  if (to === ORDER_STATUS.FULFILLED && at !== null) {
    const dated = await db.update(orders)
      .set({ fulfilledAt: at })
      .where(and(
        eq(orders.projectId, projectId),
        eq(orders.externalOrderId, externalOrderId),
        eq(orders.status, ORDER_STATUS.DELIVERED),
        isNull(orders.fulfilledAt),
      ))
      .returning({ id: orders.id })
    if (dated.length > 0) return
  }

  const [prior] = await db.select({ status: orders.status }).from(orders)
    .where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId)))
    .limit(1)

  // A status the UPDATE would have taken means the purchase inserted the row between
  // the two statements — the race was lost, nothing else. Retry.
  if (prior && movableFrom.includes(prior.status)) {
    throw new Error(`'${eventName}' for order ${externalOrderId} lost a race with its `
      + `purchase (project ${projectId}) — retrying`)
  }
  if (!prior && await purchaseAwaitingProcessing(
    projectId, externalOrderId, opts.purchaseEvents, opts.orderIdKey,
  )) {
    throw new Error(`'${eventName}' for order ${externalOrderId} arrived before its `
      + `purchase was processed (project ${projectId}) — retrying`)
  }
}

/**
 * Put the source's OWN shipped / delivered dates on an order Storees already holds.
 *
 * `advanceOrder` moves an order forward and never touches a row already at that stage,
 * so a date saved wrong stays wrong for ever. One was: the history pull used to stamp
 * `new Date()` as the shipped date, so every past order it imported looked shipped on
 * the day the pull ran — measured on one shop, 580 orders from May and June all
 * "shipped" on the same day in late June.
 *
 * Only for a date the source STATES (a shipment's own `created_at`, a delivered
 * shipment's `updated_at`) — never a fallback such as the moment a message arrived,
 * which would replace a good date with a worse one. Dates only: status and money are
 * untouched, and a stage the order has not reached is never given a date.
 */
export async function correctOrderDates(opts: {
  projectId: string
  externalOrderId: string
  shippedAt: Date | null
  deliveredAt: Date | null
}): Promise<void> {
  const { projectId, externalOrderId, shippedAt, deliveredAt } = opts
  if (!externalOrderId) return
  const row = and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId))

  if (shippedAt) {
    await db.update(orders).set({ fulfilledAt: shippedAt })
      .where(and(row,
        inArray(orders.status, [ORDER_STATUS.FULFILLED, ORDER_STATUS.DELIVERED]),
        or(isNull(orders.fulfilledAt), ne(orders.fulfilledAt, shippedAt))))
  }
  if (deliveredAt) {
    await db.update(orders).set({ deliveredAt })
      .where(and(row,
        eq(orders.status, ORDER_STATUS.DELIVERED),
        or(isNull(orders.deliveredAt), ne(orders.deliveredAt, deliveredAt))))
  }
}
