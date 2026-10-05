/**
 * What an order's status means for money — in ONE place.
 *
 * An order ends up in one of six states: `pending`, `fulfilled` (shipped), `delivered`,
 * or one of the three reversals — `cancelled`, `returned`, `refunded`. Only the first
 * three are still worth anything, and every figure built on revenue has to say so.
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
  /** SHIPPED — the shop sent it. The stored word stays `fulfilled` (it is what the
   *  rest of the product and every existing row already say); screens show "Shipped".
   *  Moves no money; it only advances the order out of pending. */
  FULFILLED: 'fulfilled',
  /** the customer RECEIVED it. Later than shipped and never earlier. Moves no money. */
  DELIVERED: 'delivered',
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

// ── ONE ORDER, ONE DIRECTION ─────────────────────────────────────────────────
//
// An order only moves forward: placed, shipped, delivered. A reversal ends it, and once
// reversed it stays reversed — no later "shipped" or "delivered" can undo a refund that
// is already on the books. Every door that sets a status asks this one rule, so the same
// order cannot read differently depending on which events arrived in which order.
const PROGRESS: Record<OrderStatus, number> = {
  pending: 0, fulfilled: 1, delivered: 2, cancelled: 3, returned: 3, refunded: 3,
}

/** The status an order should hold once `next` is known, given it holds `current`.
 *  Forward only; a reversal always wins and is never undone. */
export function laterStatus(current: OrderStatus, next: OrderStatus): OrderStatus {
  if (isReversedOrderStatus(current)) return current
  return PROGRESS[next] > PROGRESS[current] ? next : current
}

// ── READING A SOURCE'S OWN WORDS ─────────────────────────────────────────────
//
// A shop's system describes an order with TWO different facts, often in two fields:
//
//   is the order still on?   `status` / `order_status`   — pending, completed, canceled
//   where is the parcel?     `fulfillment_status`, ...    — not_fulfilled, shipped, delivered
//
// They were read as one. Three readers picked whichever field they found first, each in
// its own order, so a delivered order whose order-field still said `pending` showed as
// pending on one screen and delivered on another. Measured on one connector-fed shop:
// about 40,800 delivered or shipped orders showing "pending".
//
// So both are read, separately, here and only here: a reversal in EITHER field ends the
// order; otherwise the furthest progress either field reports is the answer.
//
// These are field names and words from other people's systems, not a project's events —
// there is no slot for them, and the list is the one place to extend when a new source
// says something new. Anything unrecognised is `pending`: guessing at a foreign word is
// the habit this exists to end.
const ORDER_STATE_KEYS = ['order_status', 'status'] as const
const PARCEL_STATE_KEYS = ['fulfillment_status', 'shipment_status', 'delivery_status'] as const
/** Every field an order's status may be stated in — for finding status-bearing events by
 *  what they carry rather than by what they are called. */
export const STATUS_KEYS = [...ORDER_STATE_KEYS, ...PARCEL_STATE_KEYS] as const

const SOURCE_WORDS: Record<string, OrderStatus> = {
  // ours, as-is
  pending: ORDER_STATUS.PENDING,
  fulfilled: ORDER_STATUS.FULFILLED,
  delivered: ORDER_STATUS.DELIVERED,
  cancelled: ORDER_STATUS.CANCELLED,
  returned: ORDER_STATUS.RETURNED,
  refunded: ORDER_STATUS.REFUNDED,
  // shipped, in other words
  shipped: ORDER_STATUS.FULFILLED,
  in_transit: ORDER_STATUS.FULFILLED,
  out_for_delivery: ORDER_STATUS.FULFILLED,
  // "completed" is ambiguous (checkout done? delivered?). It has always meant at least
  // shipped here; it is kept there rather than promoted to delivered on a guess.
  complete: ORDER_STATUS.FULFILLED,
  completed: ORDER_STATUS.FULFILLED,
  // reversals in other spellings
  canceled: ORDER_STATUS.CANCELLED,   // Shopify and Medusa both spell it with one 'l'
  voided: ORDER_STATUS.CANCELLED,
}

/** One source word → ours. Unrecognised (`processing`, `partially_fulfilled`, `''`)
 *  is `pending`: placed, nothing settled yet. */
export function translateSourceStatus(raw: unknown): OrderStatus {
  return SOURCE_WORDS[String(raw ?? '').trim().toLowerCase()] ?? ORDER_STATUS.PENDING
}

/** What an order's own payload says about it, reading both facts. `null` when the
 *  payload states nothing at all — the caller then falls back on the event's meaning. */
export function statusFromProperties(props: Record<string, unknown>): OrderStatus | null {
  const stated = [...ORDER_STATE_KEYS, ...PARCEL_STATE_KEYS]
    .map(k => props[k])
    .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
  if (stated.length === 0) return null
  const read = stated.map(translateSourceStatus)
  // Two fields naming different reversals: refund > return > cancellation, the same
  // order the SQL below and the slot lookup use.
  for (const reversal of REVERSAL_PRIORITY) if (read.includes(reversal)) return reversal
  return read.reduce(laterStatus, ORDER_STATUS.PENDING as OrderStatus)
}

const REVERSAL_PRIORITY = [
  ORDER_STATUS.REFUNDED, ORDER_STATUS.RETURNED, ORDER_STATUS.CANCELLED,
] as const

/** The same reading, as SQL over a JSONB column — for queries that rebuild orders in the
 *  database. Built from the same lists so the two can never disagree. */
export function statusSqlFromProperties(column: string) {
  const fields = [...ORDER_STATE_KEYS, ...PARCEL_STATE_KEYS]
    .map(k => `lower(trim(${column}->>'${k}'))`)
  const anyIs = (status: OrderStatus) => {
    const words = Object.entries(SOURCE_WORDS).filter(([, v]) => v === status).map(([w]) => `'${w}'`)
    return fields.map(f => `${f} IN (${words.join(', ')})`).join(' OR ')
  }
  // Reversals first (they end the order), then the furthest progress.
  return sql.raw(`(CASE
    WHEN ${anyIs(ORDER_STATUS.REFUNDED)} THEN 'refunded'
    WHEN ${anyIs(ORDER_STATUS.RETURNED)} THEN 'returned'
    WHEN ${anyIs(ORDER_STATUS.CANCELLED)} THEN 'cancelled'
    WHEN ${anyIs(ORDER_STATUS.DELIVERED)} THEN 'delivered'
    WHEN ${anyIs(ORDER_STATUS.FULFILLED)} THEN 'fulfilled'
    ELSE 'pending' END)`)
}
