import { and, eq, gt, sql, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { events, customers } from '../db/schema.js'
import { readPath } from '@storees/shared'

/**
 * Abandoned-cart friction analysis.
 *
 * HONEST FRAMING: we cannot KNOW why someone abandoned (the reason is often in
 * their head or off-platform). What we CAN do is read the signals that ARE in
 * the data — cart value vs their norm, whether they reached the address step,
 * how many sessions/products they browsed, new-vs-returning — and infer a
 * *likely* friction, labelled as likely, plus a matching nudge. This feeds the
 * NBA so recovery actions are targeted, not generic.
 */

export type CartFrictionSignal =
  | 'checkout_friction'   // dropped at address/payment step
  | 'price_sensitivity'   // high cart / saw offer, didn't convert
  | 'high_intent'         // browsed hard / multi-session — wants it, got distracted
  | 'new_low_trust'       // first-timer hesitation
  | 'generic'

export type CartFriction = {
  hasRecentAbandon: boolean
  abandonedAt?: string
  alreadyRecovered?: boolean
  cart?: {
    productDetails?: string
    image?: string
    totalPrice?: number
    itemCount?: number
    recoveryUrl?: string
  }
  signal?: CartFrictionSignal
  likelyReason?: string      // labelled as *likely*
  suggestedNudge?: string
  recoveryPropensity?: number // 0-100 HEURISTIC (not the ML model)
  browsing?: { productViews: number; sessions: number }
}

const ABANDON_LOOKBACK_DAYS = 14
const BROWSE_WINDOW_DAYS = 7

export async function analyzeCartFriction(projectId: string, customerId: string): Promise<CartFriction> {
  // 1. Most recent abandoned checkout in the lookback window
  const [abandon] = await db
    .select({ properties: events.properties, timestamp: events.timestamp })
    .from(events)
    .where(and(
      eq(events.projectId, projectId),
      eq(events.customerId, customerId),
      eq(events.eventName, 'checkout_abandoned'),
      gt(events.timestamp, sql`now() - make_interval(days => ${ABANDON_LOOKBACK_DAYS})`),
    ))
    .orderBy(desc(events.timestamp))
    .limit(1)

  if (!abandon) return { hasRecentAbandon: false }

  const props = (abandon.properties ?? {}) as Record<string, unknown>
  const abandonedAt = abandon.timestamp

  // 2. Did they buy AFTER the abandon? Then it's recovered — no action needed.
  const [{ recovered }] = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM events
      WHERE project_id = ${projectId} AND customer_id = ${customerId}
        AND event_name IN ('order_placed', 'order_completed')
        AND timestamp > ${abandonedAt}
    ) AS recovered
  `).then(r => r.rows as Array<{ recovered: boolean }>)

  // 3. Cart snapshot — prefer Shopflo's quickReplyMetaData, fall back to raw
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : undefined }
  const cart = {
    productDetails: (readPath(props, 'quickReplyMetaData.product_details') as string)
      ?? (props.cart_product_names as string) ?? undefined,
    image: (readPath(props, 'quickReplyMetaData.image') as string)
      ?? (readPath(props, 'line_items.0.image') as string) ?? undefined,
    totalPrice: num(props.total_price) ?? num(readPath(props, 'quickReplyMetaData.total_price')),
    itemCount: Array.isArray(props.line_items) ? (props.line_items as unknown[]).length : num(readPath(props, 'quickReplyMetaData.quantity')),
    recoveryUrl: (props.abandoned_checkout_url as string)
      ?? (readPath(props, 'quickReplyMetaData.checkout_link') as string) ?? undefined,
  }

  if (recovered) {
    return { hasRecentAbandon: true, abandonedAt: String(abandonedAt), alreadyRecovered: true, cart }
  }

  // 4. Browsing depth in the days before the abandon (stitched history)
  const [{ product_views, sessions }] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE event_name IN ('product_viewed', 'page_viewed'))::int AS product_views,
      COUNT(DISTINCT session_id)::int AS sessions
    FROM events
    WHERE project_id = ${projectId} AND customer_id = ${customerId}
      AND timestamp <= ${abandonedAt}
      AND timestamp > ${abandonedAt}::timestamptz - make_interval(days => ${BROWSE_WINDOW_DAYS})
  `).then(r => r.rows as Array<{ product_views: number; sessions: number }>)

  // 5. Customer norms
  const [cust] = await db
    .select({ totalOrders: customers.totalOrders, avgOrderValue: customers.avgOrderValue })
    .from(customers).where(eq(customers.id, customerId)).limit(1)
  const totalOrders = cust?.totalOrders ?? 0
  const avgOrderValue = Number(cust?.avgOrderValue ?? 0)

  // 6. Address completeness (dropped at the details step?)
  const addr = (props.billing_address ?? props.shipping_address ?? {}) as Record<string, unknown>
  const addressComplete = !!(String(addr.address1 ?? '').trim() && String(addr.zip ?? '').trim())
  const customerType = String(readPath(props, 'utm_params.customer_type') ?? '').toUpperCase()

  // ── Infer the LIKELY friction (ordered by how confidently the data supports it)
  let signal: CartFrictionSignal = 'generic'
  let likelyReason = 'Left items in the cart without a clear signal — a simple reminder may recover it.'
  let suggestedNudge = 'Friendly reminder with the cart contents and an easy way back.'

  const cartValue = cart.totalPrice ?? 0
  const multiSession = (sessions ?? 0) >= 2
  const browsedHard = (product_views ?? 0) >= 4

  if (!addressComplete && cartValue > 0) {
    signal = 'checkout_friction'
    likelyReason = 'Likely dropped at the address/payment step — the checkout didn\'t have full address details.'
    suggestedNudge = 'Make finishing effortless: one-tap back to a pre-filled checkout, offer help/COD, no discount needed.'
  } else if (avgOrderValue > 0 && cartValue > avgOrderValue * 1.3) {
    signal = 'price_sensitivity'
    likelyReason = `Likely price-sensitive — this cart (₹${Math.round(cartValue)}) is well above their usual order (₹${Math.round(avgOrderValue)}).`
    suggestedNudge = 'A modest incentive (₹ off / free shipping) on the abandoned items is likely to tip them over.'
  } else if (multiSession || browsedHard) {
    signal = 'high_intent'
    likelyReason = `Likely high intent, just distracted — browsed ${product_views} product view${product_views === 1 ? '' : 's'} across ${sessions} session${sessions === 1 ? '' : 's'} before abandoning.`
    suggestedNudge = 'A nudge with urgency (low stock / cart expiring) usually works — hold the discount, they want it already.'
  } else if (totalOrders === 0 || customerType === 'NEW') {
    signal = 'new_low_trust'
    likelyReason = 'Likely first-time hesitation — new shopper, no prior orders.'
    suggestedNudge = 'Build trust: reviews, easy returns, free-shipping reassurance; a small first-order offer if needed.'
  }

  // ── Heuristic recovery propensity (NOT the ML model — a transparent 0-100)
  let propensity = 45
  if (multiSession) propensity += 20
  if (browsedHard) propensity += 10
  if (totalOrders > 0) propensity += 15
  if (signal === 'checkout_friction') propensity += 10 // close to converting
  if (signal === 'price_sensitivity') propensity -= 5
  if (customerType === 'NEW' && !multiSession) propensity -= 10
  propensity = Math.max(5, Math.min(95, propensity))

  return {
    hasRecentAbandon: true,
    abandonedAt: String(abandonedAt),
    alreadyRecovered: false,
    cart,
    signal,
    likelyReason,
    suggestedNudge,
    recoveryPropensity: propensity,
    browsing: { productViews: product_views ?? 0, sessions: sessions ?? 0 },
  }
}
