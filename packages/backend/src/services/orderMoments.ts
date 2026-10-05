/**
 * WHEN things happened to an order, read from the order payload itself.
 *
 * Pure — no database, no queue — so the rules can be tested directly and every door
 * that dates a shipment, a delivery or a reversal reads them the same way.
 *
 * The field names are the ones order payloads carry — Shopify's `cancelled_at` and its
 * `fulfillments[]`, the one-'l' `canceled_at` other platforms use, a `delivered_at` a
 * source may state outright. Never later than now.
 */

/** The moment the payload ITSELF states for this kind of change, or null.
 *
 *  No fallbacks — this is for an order record that only reports its CURRENT status
 *  ("delivered") on an event timestamped at the order's creation. That timestamp is when
 *  it was ordered, not when it arrived; without a stated date the honest answer is
 *  "delivered, date unknown", never the order date. */
export function statedMoment(
  kind: 'reversal' | 'fulfilment' | 'delivery', payload: Record<string, unknown>,
): Date | null {
  const fulfillments = Array.isArray(payload.fulfillments)
    ? payload.fulfillments as Array<Record<string, unknown>> : []
  const own =
    kind === 'reversal'
      ? asDate(payload.cancelled_at) ?? asDate(payload.canceled_at)
        ?? asDate(payload.refunded_at) ?? asDate(payload.returned_at)
    : kind === 'fulfilment'
      ? latest(fulfillments.map(f => asDate(f.created_at))) ?? asDate(payload.fulfilled_at)
    : asDate(payload.delivered_at) ?? asDate(payload.happened_at)
      ?? latest(fulfillments
        .filter(f => String(f.shipment_status ?? '').toLowerCase() === 'delivered')
        .map(f => asDate(f.updated_at)))
  return own ? notFuture(own) : null
}

/** When a shipment, delivery or reversal reported BY ITS OWN MESSAGE happened: the date
 *  the payload states, else the change that produced the message (`updated_at`), else
 *  what the caller already had. For the dedicated event — a "fulfilled" or "cancelled"
 *  webhook — whose arrival is itself the news. */
export function orderEventMoment(
  kind: 'reversal' | 'fulfilment' | 'delivery', payload: Record<string, unknown>, fallback: Date,
): Date {
  return statedMoment(kind, payload) ?? notFuture(asDate(payload.updated_at) ?? fallback)
}

function asDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
function latest(dates: Array<Date | null>): Date | null {
  return dates.filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
}
/** A skewed clock must not date an event in the future. */
function notFuture(d: Date): Date {
  return d.getTime() > Date.now() ? new Date() : d
}

/** The latest shipment's own date, or null when none is reported. Never invented —
 *  this was `new Date()`, so every past order pulled from history looked shipped on the
 *  day the pull ran. */
export function shippedAt(fulfillments: Array<{ created_at?: string | null }> | undefined): Date | null {
  const dates = (fulfillments ?? [])
    .map(f => (f.created_at ? new Date(f.created_at) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
  return dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
}

/** When the order was refunded — its latest refund's own date — or null. Never invented. */
export function refundedAt(
  refunds: Array<{ created_at?: string | null; processed_at?: string | null }> | undefined,
): Date | null {
  return latest((refunds ?? []).map(r => asDate(r.processed_at) ?? asDate(r.created_at)))
}

/** When the courier last marked a shipment delivered (its `updated_at` once the status
 *  reads delivered), or null. Never invented. */
export function deliveredAt(
  fulfillments: Array<{ shipment_status?: string | null; updated_at?: string | null }> | undefined,
): Date | null {
  return latest((fulfillments ?? [])
    .filter(f => ['delivered', 'picked_up'].includes(String(f.shipment_status ?? '').toLowerCase()))
    .map(f => asDate(f.updated_at)))
}
