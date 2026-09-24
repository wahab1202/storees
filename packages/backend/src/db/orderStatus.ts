/**
 * What an order's status means for money — in ONE place.
 *
 * An order ends up in one of five states: `pending`, `fulfilled`, or one of the three
 * reversals — `cancelled`, `returned`, `refunded`. Only the first two are still worth
 * anything, and every figure built on revenue has to say so.
 *
 * They did not say the same thing. The dashboard excluded all three reversals; the
 * customer aggregates excluded only `cancelled`, so a returned or refunded order stayed
 * in the customer's lifetime spend. It was invisible because the reversal path also
 * subtracts the amount directly, which happens to leave the right number — until the
 * customer places their NEXT order. That recomputes the total from this table, and the
 * returned order's value walks back in. Measured: a customer with a ₹1,749 return and a
 * ₹1,899 refund was ₹3,648 too rich the moment they bought again, and nothing on any
 * screen said why the two halves of the same ledger disagreed.
 *
 * Splitting the mapping's single "undo" box into cancellation / return / refund is what
 * brought this out of hiding: before it, a shop using its own words had every reversal
 * stored as `cancelled`, which this predicate happened to catch.
 *
 * `pending` counts. An order placed and not yet shipped is real revenue — excluding it
 * would make every shop's takings drop until fulfilment webhooks caught up.
 */

import { sql } from 'drizzle-orm'

/**
 * THE five states an order can be in. Storees' own words, and the only words this
 * column may ever hold.
 *
 * This is the counterpart to the seven vocabulary slots, and the two must not be
 * confused. The SLOTS are the client's language — a shop calls a sale `order_placed`,
 * a lender `loan_disbursed`, some shop yet to sign up calls it something nobody has
 * thought of, and the slots translate all of it. What lands INSIDE is always one of
 * these five. Many languages in, one language within.
 *
 * They are deliberately NOT configurable. Every rule in the product is written once
 * against them — revenue excludes the reversals, segments ask for delivered orders,
 * the models decide which orders count. If each project named its own states, not one
 * of those rules could be written a single time; you would look up a project's word
 * for "cancelled" before you could exclude it, which is the slot problem moved a layer
 * down for no gain.
 *
 * The failure this prevents is a source's word being stored raw. Two doors used to copy
 * whatever the shop's own system said — `shipped`, `processing`, or nothing — into this
 * column. Our rules understand five words, so anything else silently matched nothing:
 * 2,870 orders that had genuinely been delivered could not be marked delivered, because
 * they held a word from someone else's system. No error, no symptom, just a number that
 * was quietly too low.
 */
export const ORDER_STATUS = {
  /** placed, and nothing has happened to it yet. Counts as revenue — an order awaiting
   *  fulfilment is real money, and excluding it would make every shop's takings sag
   *  until the delivery webhooks caught up. */
  PENDING: 'pending',
  /** reached the customer. Moves no money; it only advances the order out of pending. */
  FULFILLED: 'fulfilled',
  /** never shipped. */
  CANCELLED: 'cancelled',
  /** shipped, and came back. */
  RETURNED: 'returned',
  /** the money went back, with or without a return. */
  REFUNDED: 'refunded',
} as const

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]

/** Every legal value, for validating anything arriving from outside. */
export const ORDER_STATUSES = Object.values(ORDER_STATUS) as readonly OrderStatus[]

/** Is this one of ours? Use before writing anything that came from a source payload. */
export const isOrderStatus = (s: unknown): s is OrderStatus =>
  typeof s === 'string' && (ORDER_STATUSES as readonly string[]).includes(s)

/** The three ways a sale comes back off. Our own state names, not a client's event
 *  names — nothing configurable, which is why no vocabulary lookup is needed here. */
export const REVERSED_ORDER_STATUSES = [
  ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURNED, ORDER_STATUS.REFUNDED,
] as const

export const isReversedOrderStatus = (status: string): boolean =>
  (REVERSED_ORDER_STATUSES as readonly string[]).includes(status)

/** `WHERE ... AND ${LIVE_ORDERS}` — the orders that still count as revenue. */
export const LIVE_ORDERS = sql`status NOT IN ('cancelled', 'returned', 'refunded')`

/** The same test, qualified, for queries that join more than one table. */
export const liveOrders = (alias: string) =>
  sql.raw(`${alias}.status NOT IN ('cancelled', 'returned', 'refunded')`)
