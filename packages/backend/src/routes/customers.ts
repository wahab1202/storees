import { Router } from 'express'
import { eq, and, desc, asc, ilike, or, sql, count, inArray } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, orders, events, customerSegments, segments, flowTrips, flows, messages, campaigns, products } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { evaluateAllSegments } from '../services/segmentService.js'
import { customerScopeFilter, requireRole } from '../middleware/agentScope.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'
import { clampPageSize, calcTotalPages } from '@storees/shared'
import { getCustomerJourney, getActivitySummary } from '../services/customerJourneyService.js'
import { recalculateAllAggregates } from '../services/customerService.js'
import { projectVocabulary, eventIn } from '../services/projectVocabulary.js'
import { isReversedOrderStatus, isOrderStatus, ORDER_STATUS, type OrderStatus } from '../db/orderStatus.js'
import { backfillOrdersFromEvents } from '../services/orderBackfillService.js'
import { listAbandonments, saveAbandonmentReason } from '../services/abandonmentService.js'
import { computeAndUpdateMetrics } from '../workers/metricsWorker.js'
import { getConsentAuditLog, getConsentStatus } from '../services/consentService.js'
import type { JourneyEntryType } from '../services/customerJourneyService.js'

const router = Router()

/** A source's own word for an order's state, translated into ours — or `pending`.
 *
 *  The doors that pull from a shop's API (rather than receiving our events) see that
 *  shop's internal vocabulary: Medusa says `delivered` and `processing`, Shopify says
 *  `fulfilled` and `partially_fulfilled`, the next platform will say something else
 *  again. None of those are Storees statuses, and copying one in is how a column meant
 *  to hold five words ended up holding a dozen.
 *
 *  Only the unambiguous synonyms are accepted. `processing`, `shipped`, `partial` and
 *  anything unrecognised become `pending` — placed, and nothing settled yet — because
 *  guessing at a foreign word is exactly the habit this function exists to end. The
 *  real answer arrives as a fulfilment or reversal EVENT, read through the slots. */
function translateSourceStatus(raw: unknown): OrderStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (isOrderStatus(s)) return s
  switch (s) {
    case 'delivered':
    case 'complete':
    case 'completed':
      return ORDER_STATUS.FULFILLED
    case 'canceled':          // Shopify and Medusa both spell it with one 'l'
    case 'voided':
      return ORDER_STATUS.CANCELLED
    default:
      return ORDER_STATUS.PENDING
  }
}

/**
 * Returns true if the customer is visible under the authenticated user's scope.
 * Used to gate sub-resources (orders/events/trips/messages) — out-of-scope
 * customers 404 the same as nonexistent ones.
 */
async function assertCustomerVisible(
  req: AuthenticatedRequest,
  customerId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), await customerScopeFilter(req, projectId)))
    .limit(1)
  return !!row
}

// GET /api/customers?projectId=...&page=1&pageSize=25&search=...&sortBy=lastSeen&sortOrder=desc&segmentId=...
router.get('/', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = req.projectId!
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = clampPageSize(Number(req.query.pageSize) || undefined)
    const search = req.query.search as string | undefined
    const sortBy = (req.query.sortBy as string) || 'lastSeen'
    const sortOrder = (req.query.sortOrder as string) || 'desc'
    const segmentId = req.query.segmentId as string | undefined
    const rfm = req.query.rfm as string | undefined // e.g. "recent_high", "lapsed_medium"
    const offset = (page - 1) * pageSize

    // Build WHERE conditions. customerScopeFilter already includes project scope
    // and, for agent/manager roles, restricts to their customers.agent_id.
    const conditions = [await customerScopeFilter(req, projectId)]

    if (search) {
      conditions.push(
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.email, `%${search}%`),
          ilike(customers.phone, `%${search}%`),
        )!,
      )
    }

    if (segmentId) {
      conditions.push(
        sql`${customers.id} IN (
          SELECT customer_id FROM customer_segments WHERE segment_id = ${segmentId}
        )`,
      )
    }

    // RFM bucket filter: recency (recent/medium/lapsed) × value (low/medium/high).
    // MUST mirror getLifecycleChart (packages/segments/src/lifecycle.ts) exactly,
    // else clicking a chart cell returns a different — usually empty — set. The
    // chart is buyers-only; recency uses last PURCHASE (fallback last_seen); value
    // is a Frequency+Monetary composite with per-project P50/P90 thresholds
    // (NOT lastSeen recency + NTILE(3) on spend, which is what this used before
    // and why "Potential Loyalists" etc. showed no members).
    if (rfm) {
      const [recency, value] = rfm.split('_')

      // All lifecycle charts are computed over buyers only.
      conditions.push(sql`${customers.totalOrders} > 0`)

      // Recency = days since last purchase (fallback last_seen), matching the chart.
      const daysSince = sql`EXTRACT(EPOCH FROM (NOW() - COALESCE(last_order_date, last_seen))) / 86400.0`
      if (recency === 'recent') {
        conditions.push(sql`${daysSince} <= 30`)
      } else if (recency === 'medium') {
        conditions.push(sql`${daysSince} > 30 AND ${daysSince} <= 90`)
      } else if (recency === 'lapsed') {
        conditions.push(sql`${daysSince} > 90`)
      }

      // Value = composite of Frequency (order count: 6+=high, 2–5=medium, 1=low)
      // and Monetary (total_spent vs project P50/P90), averaged — identical to the
      // chart's value axis.
      if (value === 'low' || value === 'medium' || value === 'high') {
        conditions.push(sql`${customers.id} IN (
          SELECT v.id FROM (
            SELECT b.id,
              CASE
                WHEN ((CASE WHEN b.total_orders >= 6 THEN 3 WHEN b.total_orders >= 2 THEN 2 ELSE 1 END)
                    + (CASE WHEN t.p90 > 0 AND b.total_spent::numeric >= t.p90 THEN 3
                            WHEN t.p50 > 0 AND b.total_spent::numeric >= t.p50 THEN 2 ELSE 1 END)) / 2.0 >= 2.5 THEN 'high'
                WHEN ((CASE WHEN b.total_orders >= 6 THEN 3 WHEN b.total_orders >= 2 THEN 2 ELSE 1 END)
                    + (CASE WHEN t.p90 > 0 AND b.total_spent::numeric >= t.p90 THEN 3
                            WHEN t.p50 > 0 AND b.total_spent::numeric >= t.p50 THEN 2 ELSE 1 END)) / 2.0 >= 1.5 THEN 'medium'
                ELSE 'low'
              END AS value_bucket
            FROM customers b
            CROSS JOIN (
              SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_spent::numeric), 0) AS p50,
                     COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_spent::numeric), 0) AS p90
              FROM customers WHERE project_id = ${projectId} AND total_orders > 0
            ) t
            WHERE b.project_id = ${projectId} AND b.total_orders > 0
          ) v WHERE v.value_bucket = ${value}
        )`)
      }
    }

    const whereClause = and(...conditions)

    // Sort. last_seen is NULL for profile-only customers (no events, no
    // orders); push those to the end (Postgres sorts NULLS FIRST on DESC by
    // default) so the list opens on genuinely-recent customers, not blanks.
    const sortColumn = {
      lastSeen: customers.lastSeen,
      totalSpent: customers.totalSpent,
      clv: customers.clv,
      name: customers.name,
    }[sortBy] ?? customers.lastSeen

    const orderExpr = sortBy === 'lastSeen'
      ? (sortOrder === 'asc'
          ? sql`${customers.lastSeen} ASC NULLS LAST`
          : sql`${customers.lastSeen} DESC NULLS LAST`)
      : (sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn))

    // A SORT WITH TIES IS NOT AN ORDER, AND LIMIT/OFFSET NEEDS AN ORDER.
    //
    // Every column offered here has duplicates — 475 customers share a `last_seen`
    // value in one project alone — and Postgres is free to return tied rows in any
    // order it likes, differently on each query. Paging is two separate queries, so a
    // row tied on page 1 can come back on page 2 while another is never returned at
    // all. Measured before this line existed: paging 25 pages of 50 returned 1,250
    // rows holding only 1,118 distinct customers — 132 shown twice, and by the same
    // count 132 that the operator could not reach at any page number.
    //
    // The id is unique and never null, so appending it makes the order total: ties
    // resolve the same way in every query, and a page boundary lands in one place.
    const pageOrder = [orderExpr, asc(customers.id)]

    // Count total
    const [{ total }] = await db
      .select({ total: count() })
      .from(customers)
      .where(whereClause)

    // Fetch page
    const rows = await db
      .select()
      .from(customers)
      .where(whereClause)
      .orderBy(...pageOrder)
      .limit(pageSize)
      .offset(offset)

    // Fetch segment names for each customer
    const customerIds = rows.map(r => r.id)
    const segmentMemberships = customerIds.length > 0
      ? await db
          .select({
            customerId: customerSegments.customerId,
            segmentId: customerSegments.segmentId,
            segmentName: segments.name,
          })
          .from(customerSegments)
          .innerJoin(segments, eq(customerSegments.segmentId, segments.id))
          .where(sql`${customerSegments.customerId} IN ${customerIds}`)
      : []

    // Group segments by customer
    const segmentsByCustomer = new Map<string, Array<{ id: string; name: string }>>()
    for (const m of segmentMemberships) {
      const list = segmentsByCustomer.get(m.customerId) ?? []
      list.push({ id: m.segmentId, name: m.segmentName })
      segmentsByCustomer.set(m.customerId, list)
    }

    const data = rows.map(row => ({
      ...row,
      totalSpent: Number(row.totalSpent),
      avgOrderValue: Number(row.avgOrderValue),
      clv: Number(row.clv),
      segments: segmentsByCustomer.get(row.id) ?? [],
    }))

    res.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calcTotalPages(total, pageSize),
      },
    })
  } catch (err) {
    console.error('Customer list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch customers' })
  }
})

// GET /api/customers/:id?projectId=...
router.get('/:id', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, req.params.id as string),
          await customerScopeFilter(req, req.projectId!),
        ),
      )
      .limit(1)

    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' })
      return
    }

    // Fetch segments
    const segmentRows = await db
      .select({
        segmentId: customerSegments.segmentId,
        segmentName: segments.name,
        joinedAt: customerSegments.joinedAt,
      })
      .from(customerSegments)
      .innerJoin(segments, eq(customerSegments.segmentId, segments.id))
      .where(eq(customerSegments.customerId, customer.id))

    res.json({
      success: true,
      data: {
        ...customer,
        totalSpent: Number(customer.totalSpent),
        avgOrderValue: Number(customer.avgOrderValue),
        clv: Number(customer.clv),
        segments: segmentRows,
      },
    })
  } catch (err) {
    console.error('Customer detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch customer' })
  }
})

// GET /api/customers/:id/orders?projectId=...
router.get('/:id/orders', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const customerId = req.params.id as string
    const projectId = req.projectId!

    if (!(await assertCustomerVisible(req, customerId, projectId))) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }

    // What THIS project calls its purchase event and its amount / id / currency /
    // discount properties. Everything below read the retail spellings literally, so
    // the event-derived half of this tab was blank for a tenant using its own names.
    const ordersVocab = await projectVocabulary(projectId)

    // Orders live in TWO places depending on the ingestion path: the native
    // Shopify sync writes the `orders` table, while the data-sync connector
    // writes ONLY `order_placed` events. A customer can have a mix (old orders
    // in the table + newer connector orders as events). Read BOTH and merge,
    // deduped by order id — otherwise a connector-only order is invisible
    // whenever the table already has rows (the bug that hid a freshly-synced
    // order behind older table rows).
    const tableRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.projectId, projectId)))
      .orderBy(desc(orders.createdAt))

    const tableData = tableRows.map(row => ({
      id: row.id,
      projectId,
      customerId,
      externalOrderId: row.externalOrderId as string,
      // Translated on the way OUT too. The column is ours, but it already contains
      // words written before it was: rows imported from a shop's own database carry
      // that shop's vocabulary — `processing`, `shipped`, or nothing at all. Reading
      // them through the same translator means the screen speaks one language even
      // while the stored history does not, and a `pending` here is then a placeholder
      // the transition events below can legitimately replace.
      status: translateSourceStatus(row.status),
      total: Number(row.total),
      discount: Number(row.discount),
      currency: row.currency ?? 'INR',
      lineItems: (Array.isArray(row.lineItems) ? row.lineItems : []).map((item: Record<string, unknown>) => ({
        productId: (item.productId as string) ?? (item.product_id as string) ?? '',
        productName: (item.productName as string) ?? (item.product_name as string) ?? 'Unknown Product',
        quantity: Number(item.quantity) || 1,
        price: Number(item.price ?? item.unit_price) || 0,
        imageUrl: (item.imageUrl as string) ?? (item.image_url as string) ?? undefined,
      })),
      createdAt: row.createdAt,
      fulfilledAt: row.fulfilledAt ?? null,
    }))

    // Also derive orders from order events. Both event names are accepted — the
    // data-sync pipeline emits `order_placed`, older bulk imports / Shopify
    // webhooks emit `order_completed`.
    const eventRows = await db
      .select({
        id: events.id,
        properties: events.properties,
        timestamp: events.timestamp,
      })
      .from(events)
      .where(
        and(
          eq(events.customerId, customerId),
          eq(events.projectId, projectId),
          eventIn(sql`${events.eventName}`, ordersVocab.purchaseEvents),
        ),
      )
      .orderBy(desc(events.timestamp))

    const data = eventRows.map(row => {
      const props = (row.properties ?? {}) as Record<string, unknown>
      const lineItems = Array.isArray(props.line_items) ? props.line_items : []

      // Per-item price field is `price` after the connector's field map
      // (line_items.fields maps source `unit_price` → `price`). Bulk-import
      // payloads tend to keep the source `unit_price`. Read both so either
      // shape renders correctly.
      const itemPrice = (item: Record<string, unknown>): number =>
        Number(item.price ?? item.unit_price) || 0

      // Prefer the authoritative top-level amount, under whatever this project calls
      // it (the connector stores summary.current_order_total there for Medusa orders;
      // bulk imports store the canonical order total). Fall back to line-item math
      // when missing — older imports relied on that path.
      const lineItemTotal = lineItems.reduce((sum: number, item: Record<string, unknown>) =>
        sum + itemPrice(item) * (Number(item.quantity) || 1), 0)
      const rawTotal = props[ordersVocab.amountKey] ?? props.total
      const total = rawTotal !== undefined && rawTotal !== null
        ? Number(rawTotal)
        : lineItemTotal

      return {
        id: row.id,
        projectId,
        customerId,
        externalOrderId: (props[ordersVocab.orderIdKey] as string) ?? (props.order_id as string)
          ?? (props.display_id ? `#${props.display_id}` : null),
        // TRANSLATED into our vocabulary, never copied.
        //
        // This used to pass the source's own word straight through — `shipped`,
        // `processing`, whatever that shop's system happened to call it — into a field
        // the rest of the product reads as a Storees status. Our rules understand five
        // words; anything else matched nothing and silently did nothing. It also invented
        // `unknown`, a sixth word belonging to no vocabulary at all.
        //
        // A word we cannot place is not a status. It becomes `pending` — placed, and we
        // have not been told otherwise — and the transition events below, which speak
        // through the slots, supply the real answer.
        status: translateSourceStatus(props.fulfillment_status ?? props.status),
        total,
        // `discount_total` appeared exactly once in the codebase — here, being read.
        // Nothing has ever written it: Shopify sends `total_discounts` and the event
        // processor normalises that to `discount`, so this column showed 0 for every
        // tenant, including ones using entirely default names.
        discount: Number(props[ordersVocab.discountKey] ?? props.discount ?? 0) || 0,
        currency: (props[ordersVocab.currencyKey] as string) ?? (props.currency as string) ?? 'INR',
        lineItems: lineItems.map((item: Record<string, unknown>) => ({
          productId: (item.product_id as string) ?? '',
          productName: (item.product_name as string) ?? 'Unknown Product',
          quantity: Number(item.quantity) || 1,
          price: itemPrice(item),
          imageUrl: (item.image_url as string) ?? undefined,
        })),
        createdAt: row.timestamp,
        fulfilledAt: props.fulfillment_status === 'delivered' ? row.timestamp : null,
      }
    })

    // Dedupe by order id. The connector emits one event per sync / status
    // change, so the same order recurs (e.g. a pending sync, then a delivered
    // one). Rows are DESC by timestamp, so the first time we see an order id is
    // its latest event — keep that, and promote the status to 'delivered' if any
    // of the order's events was delivered (delivered wins over pending).
    // Merge table rows FIRST (authoritative for sources that write the table),
    // then event-derived orders fill in any order ids the table doesn't have
    // (e.g. connector-only orders). Dedup by order id; delivered wins over
    // pending. Re-sort since two sources were combined.
    type OrderRow = (typeof data)[number]
    const seen = new Map<string, OrderRow>()
    const deduped: OrderRow[] = []
    for (const order of [...tableData, ...data]) {
      const key = order.externalOrderId ?? order.id
      const existing = seen.get(key)
      if (!existing) {
        const entry = { ...order }
        seen.set(key, entry)
        deduped.push(entry)
      } else if (
        // ANY settled status beats the placeholder. Both sides are Storees vocabulary
        // by this point, so there is one comparison rather than a growing list of other
        // people's words — this branch used to test for the literal `delivered`, which
        // is Medusa's word and not one of ours at all.
        existing.status === ORDER_STATUS.PENDING && order.status !== ORDER_STATUS.PENDING
      ) {
        existing.status = order.status
        if (order.status === ORDER_STATUS.FULFILLED) {
          existing.fulfilledAt = existing.fulfilledAt ?? order.createdAt
        }
      }
    }
    // ── OVERLAY THE TRANSITION EVENTS ───────────────────────────────────────
    //
    // Everything above answers "what does the order RECORD say". This answers "what
    // has the shop since told us", and the two are not the same when the record was
    // never built.
    //
    // Most of a connector-fed project's orders can exist only as events. A delivery or
    // cancellation arriving later updates the orders TABLE — so it never reaches an
    // order with no row, and that order reads `pending` or `unknown` for ever. On
    // GoWelmart that is 83,000 events against 1,800 rows: their orders had been
    // delivered, they said so, and the screen showed `unknown` because it only ever
    // consulted the table.
    //
    // Read the transition events directly and lay them over the top, matched by order
    // id, latest winning. Independent of whether a row exists.
    //
    // THE NAMES COME FROM THE PROJECT'S MAPPING, not a fixed list. A hardcoded
    // ['order_fulfilled','order_cancelled'] works for a shop using our spelling and
    // silently does nothing for Viranacart's `purchase_delivered` — the exact failure
    // the mapping screen exists to prevent, reintroduced one layer down.
    // The PUBLISHED names are included alongside, for the same reason the aggregate
    // worker keeps them: a project that has not filled in its Delivered box yet still
    // sends `order_fulfilled`, and refusing to look would leave its orders reading
    // `unknown` until somebody visits the mapping screen. GoWelmart is exactly that
    // case — 2,994 delivery events, an empty box, and every order showing `unknown`.
    // Mapping stays authoritative; these are the floor, not the answer.
    const STANDARD_TRANSITIONS = [
      'order_fulfilled', 'order_cancelled', 'order_returned', 'order_refunded',
    ]
    // A transition event is not the only place a status can arrive. Plenty of sources
    // never emit one at all and instead stamp the current status onto the ORDER event
    // itself — GoWelmart does exactly this: 65,398 of its orders state `delivered` in
    // an `order_placed` payload and never send `order_fulfilled`. Those events are read
    // here too, but ONLY for a status they state outright: a purchase name means "a
    // purchase happened", never a status, so `statusOf` must not speak for it. Ignoring
    // them leaves an order the shop has already delivered reading `unknown` for ever.
    const transitionNames = [...new Set([
      ...ordersVocab.fulfilmentEvents,
      ...ordersVocab.cancellationEvents,   // the union of cancelled / returned / refunded
      ...STANDARD_TRANSITIONS,
      'order_status_updated',              // a pure status carrier; no meaning box owns it
      ...ordersVocab.purchaseEvents,       // stated status only — see statusOf below
      // The purchase names a project has NOT mapped still carry status for its
      // orders; GoWelmart's `purchase` box holds `order_completed`, and it is
      // `order_placed` that states the status.
      'order_placed', 'order_completed',
    ])].filter(Boolean)

    if (transitionNames.length) {
      const statusEvents = await db
        .select({
          eventName: events.eventName,
          properties: events.properties,
          timestamp: events.timestamp,
        })
        .from(events)
        .where(and(
          eq(events.customerId, customerId),
          eq(events.projectId, projectId),
          inArray(events.eventName, transitionNames),
        ))
        .orderBy(desc(events.timestamp))

      // Which Storees status each name means, from the slots — so a shop's own word
      // lands on the right one rather than being flattened to "reversed". The slots
      // answer for the client's language; the five constants are what comes back.
      const statusOf = (name: string): OrderStatus | null =>
        ordersVocab.refundEvents.includes(name) ? ORDER_STATUS.REFUNDED
        : ordersVocab.returnEvents.includes(name) ? ORDER_STATUS.RETURNED
        : ordersVocab.fulfilmentEvents.includes(name) ? ORDER_STATUS.FULFILLED
        : ordersVocab.cancellationEvents.includes(name) ? ORDER_STATUS.CANCELLED
        : null

      const latestByOrder = new Map<string, OrderStatus>()
      for (const ev of statusEvents) {
        const props = (ev.properties ?? {}) as Record<string, unknown>
        const orderId = String(
          props[ordersVocab.orderIdKey] ?? props.order_id ?? '',
        ).trim()
        if (!orderId || latestByOrder.has(orderId)) continue  // DESC, so first is latest
        // What the event itself says wins; the meaning of its name is the fallback.
        //
        // Both arrive as OUR vocabulary. The stated value is a source's word and goes
        // through the translator; the name's meaning comes from the slots. Nothing
        // reaches the screen in a language the rest of the product cannot read.
        const stated = props.status ?? props.fulfillment_status ?? props.order_status
        const status = stated != null && String(stated).trim()
          ? translateSourceStatus(stated)
          : statusOf(ev.eventName)
        if (status) latestByOrder.set(orderId, status)
      }

      if (latestByOrder.size) {
        for (const order of deduped) {
          const override = order.externalOrderId
            ? latestByOrder.get(order.externalOrderId) : undefined
          if (!override) continue
          // A reversal already on the RECORD is never undone by an event. Reading the
          // order events for a stated status means a purchase payload saying
          // `delivered` can now be the newest thing an order has — and a cancellation
          // that arrived by any other door (a sync, an import, the aggregate worker)
          // lives only in the row. Letting the overlay win there would show money as
          // collected that the books have already reversed.
          if (isReversedOrderStatus(order.status) && !isReversedOrderStatus(override)) continue
          order.status = override
          if (override === ORDER_STATUS.FULFILLED) {
            order.fulfilledAt = order.fulfilledAt ?? order.createdAt
          }
        }
      }
    }

    deduped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    res.json({ success: true, data: deduped })
  } catch (err) {
    console.error('Customer orders error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch orders' })
  }
})

// GET /api/customers/:id/events?projectId=...&limit=50
router.get('/:id/events', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const customerId = req.params.id as string
    const projectId = req.projectId!

    if (!(await assertCustomerVisible(req, customerId, projectId))) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200)

    const rows = await db
      .select()
      .from(events)
      .where(
        and(eq(events.customerId, customerId), eq(events.projectId, projectId)),
      )
      .orderBy(desc(events.timestamp))
      .limit(limit)

    // Enrich events that only carry product_id with the product's title from
    // the products table — so "product_viewed" etc. show "iPhone 15" instead
    // of a raw external id in the activity timeline. Single batch lookup
    // keyed on products.shopify_product_id (the external id column).
    const productIds = new Set<string>()
    for (const row of rows) {
      const props = (row.properties ?? {}) as Record<string, unknown>
      const pid = props.product_id
      if (typeof pid === 'string' && pid && !props.product_name) productIds.add(pid)
    }

    let productNameById = new Map<string, string>()
    if (productIds.size > 0) {
      const productRows = await db
        .select({ extId: products.shopifyProductId, title: products.title })
        .from(products)
        .where(
          and(
            eq(products.projectId, projectId),
            inArray(products.shopifyProductId, Array.from(productIds)),
          ),
        )
      productNameById = new Map(productRows.map(p => [p.extId, p.title]))
    }

    const enriched = rows.map(row => {
      const props = (row.properties ?? {}) as Record<string, unknown>
      const pid = props.product_id
      if (typeof pid === 'string' && pid && !props.product_name) {
        const title = productNameById.get(pid)
        if (title) {
          return { ...row, properties: { ...props, product_name: title } }
        }
      }
      return row
    })

    res.json({ success: true, data: enriched })
  } catch (err) {
    console.error('Customer events error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch events' })
  }
})

// GET /api/customers/:id/trips?projectId=...
router.get('/:id/trips', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const customerId = req.params.id as string
    const projectId = req.projectId!

    if (!(await assertCustomerVisible(req, customerId, projectId))) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }

    const rows = await db
      .select({
        id: flowTrips.id,
        flowId: flowTrips.flowId,
        flowName: flows.name,
        status: flowTrips.status,
        currentNodeId: flowTrips.currentNodeId,
        enteredAt: flowTrips.enteredAt,
        exitedAt: flowTrips.exitedAt,
        context: flowTrips.context,
      })
      .from(flowTrips)
      .innerJoin(flows, eq(flowTrips.flowId, flows.id))
      .where(
        and(eq(flowTrips.customerId, customerId), eq(flows.projectId, projectId)),
      )
      .orderBy(desc(flowTrips.enteredAt))

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Customer trips error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch trips' })
  }
})

// GET /api/customers/:id/messages?projectId=...
router.get('/:id/messages', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const customerId = req.params.id as string
    const projectId = req.projectId!

    if (!(await assertCustomerVisible(req, customerId, projectId))) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }

    const rows = await db
      .select({
        id: messages.id,
        channel: messages.channel,
        messageType: messages.messageType,
        status: messages.status,
        sentAt: messages.sentAt,
        deliveredAt: messages.deliveredAt,
        readAt: messages.readAt,
        campaignName: campaigns.name,
        flowName: flows.name,
        blockReason: messages.blockReason,
      })
      .from(messages)
      .leftJoin(campaigns, eq(messages.campaignId, campaigns.id))
      .leftJoin(flowTrips, eq(messages.flowTripId, flowTrips.id))
      .leftJoin(flows, eq(flowTrips.flowId, flows.id))
      .where(
        and(eq(messages.customerId, customerId), eq(messages.projectId, projectId)),
      )
      .orderBy(desc(messages.sentAt))
      .limit(50)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Customer messages error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch messages' })
  }
})

// GET /api/customers/:id/journey?projectId=...&limit=100&offset=0&types=event,order
router.get('/:id/journey', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const customerId = req.params.id as string

    if (!(await assertCustomerVisible(req, customerId, req.projectId!))) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }

    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const offset = Number(req.query.offset) || 0
    const typesParam = req.query.types as string | undefined
    const types = typesParam
      ? typesParam.split(',').filter(Boolean) as JourneyEntryType[]
      : undefined

    const entries = await getCustomerJourney(customerId, { limit, offset, types })
    res.json({ success: true, data: entries })
  } catch (err) {
    console.error('Customer journey error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch customer journey' })
  }
})

// GET /api/customers/:id/activity-summary?projectId=...
router.get('/:id/activity-summary', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const customerId = req.params.id as string

    if (!(await assertCustomerVisible(req, customerId, req.projectId!))) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }

    const summary = await getActivitySummary(customerId)
    res.json({ success: true, data: summary })
  } catch (err) {
    console.error('Activity summary error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch activity summary' })
  }
})

// POST /api/customers/recalculate?projectId=...
// Recalculates all customer aggregates (totalOrders, totalSpent, avgOrderValue, clv) from actual order data
// GET /api/customers/:id/consent-history?projectId=...
// Per-customer DPDP-compliance trail: when did they opt in/out, from where,
// what text did they see. Admin/manager only — agents shouldn't see PII trails
// for customers outside their dealer scope (handled by assertCustomerVisible).
router.get('/:id/consent-history', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const customerId = req.params.id as string
    const projectId = req.projectId!

    if (!(await assertCustomerVisible(req, customerId, projectId))) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }

    const limit = Math.min(Number(req.query.limit ?? 100), 500)
    const [history, currentStatus] = await Promise.all([
      getConsentAuditLog(projectId, customerId, limit),
      getConsentStatus(projectId, customerId),
    ])

    res.json({ success: true, data: { history, currentStatus } })
  } catch (err) {
    console.error('Consent history error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch consent history' })
  }
})

// GET /api/customers/:id/abandonments?projectId=...
// Abandonment instances (checkout_abandoned) with cart, products browsed before,
// recovery status, and any human-captured reason.
router.get('/:id/abandonments', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const customerId = req.params.id as string
    const projectId = req.projectId!
    if (!(await assertCustomerVisible(req, customerId, projectId))) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }
    const data = await listAbandonments(projectId, customerId)
    res.json({ success: true, data })
  } catch (err) {
    console.error('Abandonments error:', err)
    res.status(500).json({ success: false, error: 'Failed to load abandonments' })
  }
})

// POST /api/customers/:id/abandonments/reason?projectId=...
// Record the exec team's reason + remarks for one abandonment. (Permissions will
// be governed by the roles system when it lands; any project member can capture now.)
router.post('/:id/abandonments/reason', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const customerId = req.params.id as string
    const projectId = req.projectId!
    if (!(await assertCustomerVisible(req, customerId, projectId))) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }
    const { eventId, reason, remarks, transcriptUrl, transcriptName } = req.body as {
      eventId?: string; reason?: string; remarks?: string; transcriptUrl?: string; transcriptName?: string
    }
    if (!eventId || !reason) {
      return res.status(400).json({ success: false, error: 'eventId and reason are required' })
    }
    await saveAbandonmentReason({
      projectId, customerId, eventId, reason, remarks,
      transcriptUrl: transcriptUrl ?? null,
      transcriptName: transcriptName ?? null,
      markedBy: req.adminUser?.userId ?? null,
      markedByName: req.adminUser?.email ?? null,
    })
    res.json({ success: true })
  } catch (err) {
    console.error('Save abandonment reason error:', err)
    res.status(500).json({ success: false, error: 'Failed to save reason' })
  }
})

// Admin-only: this mutates every customer in the project.
router.post('/recalculate', requireRole('admin'), requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const updated = await recalculateAllAggregates(projectId)
    // Segment memberships (Repeat Buyers etc.) depend on the recomputed
    // counters — re-evaluate now so the fix is visible immediately.
    await evaluateAllSegments(projectId)
    res.json({ success: true, data: { updated, message: `Recalculated aggregates for ${updated} customers; segments re-evaluated` } })
  } catch (err) {
    console.error('Recalculate error:', err)
    res.status(500).json({ success: false, error: 'Failed to recalculate aggregates' })
  }
})

// Admin-only: materialise event-only orders (historical import / connector /
// order_completed) into the orders table, so table-reading consumers stop
// undercounting. Idempotent. Recomputes aggregates + segments afterwards.
router.post('/backfill-orders', requireRole('admin'), requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const { materialized } = await backfillOrdersFromEvents(projectId)
    const updated = await recalculateAllAggregates(projectId)
    await evaluateAllSegments(projectId)
    res.json({
      success: true,
      data: { materialized, updated, message: `Materialised ${materialized} event-only orders; recalculated ${updated} customers; segments re-evaluated` },
    })
  } catch (err) {
    console.error('Backfill orders error:', err)
    res.status(500).json({ success: false, error: 'Failed to backfill orders from events' })
  }
})

// Admin-only: re-run the metrics worker for every customer in the project.
// Use after a metricsWorker / evaluator change to refresh customers.metrics
// immediately instead of waiting for the next event per customer. Processes
// in parallel chunks so large projects (15k+) complete in seconds, not
// hours; per-customer failures are logged and skipped, never abort the run.
router.post('/refresh-metrics', requireRole('admin'), requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const rows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.projectId, projectId))

    const CONCURRENCY = 10
    let refreshed = 0
    let failed = 0
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        chunk.map(r => computeAndUpdateMetrics(projectId, r.id)),
      )
      for (const r of results) {
        if (r.status === 'fulfilled') refreshed++
        else { failed++; console.error('[refresh-metrics] customer failed:', r.reason instanceof Error ? r.reason.message : r.reason) }
      }
    }
    res.json({
      success: true,
      data: {
        refreshed,
        failed,
        message: `Refreshed metrics for ${refreshed} customers${failed ? ` (${failed} failed)` : ''}`,
      },
    })
  } catch (err) {
    console.error('Refresh metrics error:', err)
    res.status(500).json({ success: false, error: 'Failed to refresh metrics' })
  }
})

export default router
