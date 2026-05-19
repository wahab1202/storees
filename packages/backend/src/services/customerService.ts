import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, orders, events } from '../db/schema.js'

// ============ CLV CALCULATION ============

type ClvInput = {
  totalSpent: number
  totalOrders: number
  firstOrderDate: Date | null
  lastOrderDate: Date | null
  // Last engagement of any kind (page view, product view, login). Lets us
  // distinguish "lapsed but engaging" (re-engagement opportunity) from
  // "truly gone" (write-off). Falls back to lastOrderDate when null.
  lastSeenDate: Date | null
  churnRiskScore?: number // 0-100 from ML, if available
}

export type ClvHealth =
  | 'new'              // signed up recently, no orders yet but engaging
  | 'growing'          // active, ordering at or ahead of schedule
  | 'stable'           // active, ordering on schedule
  | 'declining'        // overdue 1.5–3× their normal gap
  | 'at_risk'          // overdue 3+× their normal gap AND still engaging
  | 'lapsed_engaged'   // no order in 180+ days BUT engaging recently — re-engagement target
  | 'churned'          // gone — no orders 180+ days AND no engagement 60+ days

type ClvResult = {
  clv_historical: number
  clv_predicted: number
  clv_total: number
  clv_monthly_frequency: number
  clv_retention_months: number
  clv_churn_probability: number
  clv_health: ClvHealth
  // Diagnostic fields the Lifecycle card on the customer detail reads
  days_since_last_order: number | null
  days_since_last_seen: number | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Compute CLV using a retention-adjusted DCF model with engagement signal.
 *
 *   CLV = historical (actual spend)
 *       + predicted (AOV × monthly_freq × retention_months × engagement_mult)
 *
 * The engagement multiplier rewards customers who are still active on the
 * site even if they haven't purchased recently, and dampens predicted value
 * for customers who've gone quiet across all channels.
 *
 * Health is bucketed by combining ORDER recency and SITE recency. The model
 * deliberately separates "purchase lapsed" (still browsing, worth a nudge)
 * from "truly churned" (nothing happening on either axis) — these warrant
 * very different marketing actions.
 */
export function computeClv(input: ClvInput): ClvResult {
  const { totalSpent, totalOrders, firstOrderDate, lastOrderDate, lastSeenDate, churnRiskScore } = input
  const now = new Date()

  const daysSinceLastSeen = lastSeenDate
    ? Math.max(0, (now.getTime() - lastSeenDate.getTime()) / MS_PER_DAY)
    : null

  // No orders yet — they may still be brand-new and engaging.
  if (totalOrders === 0 || !firstOrderDate) {
    return {
      clv_historical: 0,
      clv_predicted: 0,
      clv_total: 0,
      clv_monthly_frequency: 0,
      clv_retention_months: 0,
      clv_churn_probability: 1,
      clv_health: daysSinceLastSeen != null && daysSinceLastSeen <= 30 ? 'new' : 'churned',
      days_since_last_order: null,
      days_since_last_seen: daysSinceLastSeen != null ? Math.round(daysSinceLastSeen) : null,
    }
  }

  const historical = totalSpent
  const aov = totalSpent / totalOrders

  // Tenure in months (min 1 to avoid division by zero)
  const tenureDays = Math.max(1, (now.getTime() - firstOrderDate.getTime()) / MS_PER_DAY)
  const tenureMonths = Math.max(1, tenureDays / 30.44)

  const monthlyFrequency = totalOrders / tenureMonths

  // Days since last order. If lastOrderDate is missing (the worker hasn't
  // populated it yet), fall back to last_seen — that's a tighter bound than
  // using tenureDays, which would mark a fresh import "churned" by default.
  const daysSinceLastOrder = lastOrderDate
    ? Math.max(0, (now.getTime() - lastOrderDate.getTime()) / MS_PER_DAY)
    : daysSinceLastSeen ?? tenureDays

  // Average gap between orders. Floor-clamped to 1 so same-day-multi-order
  // customers don't blow up downstream divisions.
  const avgGapDays = Math.max(
    1,
    totalOrders > 1
      ? ((lastOrderDate ?? now).getTime() - firstOrderDate.getTime()) / MS_PER_DAY / (totalOrders - 1)
      : tenureDays,
  )

  const overdueRatio = daysSinceLastOrder / avgGapDays

  let churnProb: number
  if (churnRiskScore !== undefined && churnRiskScore > 0) {
    churnProb = Math.max(0.02, churnRiskScore / 100)
  } else {
    if (totalOrders === 1) {
      churnProb = 0.6
    } else if (overdueRatio <= 1) {
      churnProb = 0.05
    } else if (overdueRatio <= 2) {
      churnProb = 0.15 + (overdueRatio - 1) * 0.2
    } else if (overdueRatio <= 3) {
      churnProb = 0.35 + (overdueRatio - 2) * 0.3
    } else {
      churnProb = Math.min(0.95, 0.65 + (overdueRatio - 3) * 0.1)
    }
  }

  // Engagement multiplier — recently-active customers earn a CLV bump,
  // disengaged ones get dampened. Floor at 0.5 so we don't zero out value
  // entirely; that's what 'churned' classification is for.
  let engagementMultiplier = 1.0
  if (daysSinceLastSeen != null) {
    if (daysSinceLastSeen <= 7)        engagementMultiplier = 1.15
    else if (daysSinceLastSeen <= 30)  engagementMultiplier = 1.0
    else if (daysSinceLastSeen <= 90)  engagementMultiplier = 0.75
    else                                engagementMultiplier = 0.5
  }

  const monthlyChurnRate = Math.max(0.01, 1 - Math.pow(1 - churnProb, 1 / 12))
  const retentionMonths = Math.min(36, 1 / monthlyChurnRate)

  const predicted = Math.round(aov * monthlyFrequency * retentionMonths * engagementMultiplier * 100) / 100

  // Health categorization — combines order recency with site engagement.
  // The key insight is that a customer who hasn't ordered in 6 months but
  // who's still viewing products this week is a re-engagement opportunity,
  // not a lost cause. The old model collapsed both into "churned".
  const hasRecentEngagement = daysSinceLastSeen != null && daysSinceLastSeen <= 60
  let health: ClvHealth
  if (daysSinceLastOrder > 180) {
    health = hasRecentEngagement ? 'lapsed_engaged' : 'churned'
  } else if (overdueRatio > 3) {
    health = hasRecentEngagement ? 'at_risk' : 'churned'
  } else if (overdueRatio > 1.5) {
    health = 'declining'
  } else if (overdueRatio > 0.8) {
    health = 'stable'
  } else {
    health = 'growing'
  }

  return {
    clv_historical: Math.round(historical * 100) / 100,
    clv_predicted: Math.max(0, predicted),
    clv_total: Math.round((historical + Math.max(0, predicted)) * 100) / 100,
    clv_monthly_frequency: Math.round(monthlyFrequency * 100) / 100,
    clv_retention_months: Math.round(retentionMonths * 10) / 10,
    clv_churn_probability: Math.round(churnProb * 1000) / 1000,
    clv_health: health,
    days_since_last_order: Math.round(daysSinceLastOrder),
    days_since_last_seen: daysSinceLastSeen != null ? Math.round(daysSinceLastSeen) : null,
  }
}

// ============ IDENTITY RESOLUTION ============

type ResolveParams = {
  projectId: string
  externalId?: string
  email?: string | null
  phone?: string | null
  name?: string | null
  emailSubscribed?: boolean
  smsSubscribed?: boolean
  region?: string | null
  city?: string | null
}

/**
 * Identity resolution: find existing customer or create new one.
 *
 * Resolution order:
 * 1. external_id (Shopify customer ID)
 * 2. email
 * 3. phone
 * 4. Create new if not found (atomic INSERT ... ON CONFLICT)
 *
 * Race-condition safe: uses unique partial indexes + ON CONFLICT.
 * Always updates last_seen.
 */
export async function resolveCustomer(params: ResolveParams): Promise<string> {
  const { projectId, externalId, email, phone, name, emailSubscribed, smsSubscribed, region, city } = params

  // 1. Try external_id (has unique index: idx_customers_external)
  if (externalId) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, externalId)))
      .limit(1)

    if (found) {
      await updateLastSeen(found.id, { name, email, phone, emailSubscribed, smsSubscribed, region, city })
      return found.id
    }
  }

  // 2. Try email (has unique partial index: idx_customers_email_unique)
  if (email) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.email, email)))
      .limit(1)

    if (found) {
      const updates: Record<string, unknown> = { lastSeen: new Date(), updatedAt: new Date() }
      if (externalId) updates.externalId = externalId
      if (name) updates.name = name
      if (phone) updates.phone = phone
      if (emailSubscribed !== undefined) updates.emailSubscribed = emailSubscribed
      if (smsSubscribed !== undefined) updates.smsSubscribed = smsSubscribed
      // Region/city: only fill if currently NULL (don't clobber other-source data like B2B dealer assignment)
      if (region) updates.region = sql`COALESCE(${customers.region}, ${region})`
      if (city) updates.city = sql`COALESCE(${customers.city}, ${city})`
      await db.update(customers).set(updates).where(eq(customers.id, found.id))
      return found.id
    }
  }

  // 3. Try phone (has unique partial index: idx_customers_phone_unique)
  if (phone) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.phone, phone)))
      .limit(1)

    if (found) {
      await updateLastSeen(found.id, { name, externalId, email, emailSubscribed, smsSubscribed, region, city })
      return found.id
    }
  }

  // 4. Atomic create — ON CONFLICT prevents duplicate creation race condition
  // Try insert with the best unique key available
  if (email) {
    const result = await db.execute(sql`
      INSERT INTO customers (project_id, external_id, email, phone, name, email_subscribed, sms_subscribed, region, city, metrics)
      VALUES (${projectId}, ${externalId ?? null}, ${email}, ${phone ?? null}, ${name ?? null}, ${emailSubscribed ?? false}, ${smsSubscribed ?? false}, ${region ?? null}, ${city ?? null}, '{}'::jsonb)
      ON CONFLICT (project_id, email) WHERE email IS NOT NULL
      DO UPDATE SET
        last_seen = NOW(),
        updated_at = NOW(),
        external_id = COALESCE(EXCLUDED.external_id, customers.external_id),
        phone = COALESCE(EXCLUDED.phone, customers.phone),
        name = COALESCE(EXCLUDED.name, customers.name),
        region = COALESCE(customers.region, EXCLUDED.region),
        city = COALESCE(customers.city, EXCLUDED.city)
      RETURNING id
    `)
    return (result.rows[0] as { id: string }).id
  }

  if (phone) {
    const result = await db.execute(sql`
      INSERT INTO customers (project_id, external_id, email, phone, name, email_subscribed, sms_subscribed, region, city, metrics)
      VALUES (${projectId}, ${externalId ?? null}, ${null}, ${phone}, ${name ?? null}, ${emailSubscribed ?? false}, ${smsSubscribed ?? false}, ${region ?? null}, ${city ?? null}, '{}'::jsonb)
      ON CONFLICT (project_id, phone) WHERE phone IS NOT NULL
      DO UPDATE SET
        last_seen = NOW(),
        updated_at = NOW(),
        external_id = COALESCE(EXCLUDED.external_id, customers.external_id),
        name = COALESCE(EXCLUDED.name, customers.name),
        region = COALESCE(customers.region, EXCLUDED.region),
        city = COALESCE(customers.city, EXCLUDED.city)
      RETURNING id
    `)
    return (result.rows[0] as { id: string }).id
  }

  // Fallback: no email or phone, just insert (external_id unique constraint protects)
  const [created] = await db.insert(customers).values({
    projectId,
    externalId: externalId ?? null,
    email: null,
    phone: null,
    name: name ?? null,
    emailSubscribed: emailSubscribed ?? false,
    smsSubscribed: smsSubscribed ?? false,
    region: region ?? null,
    city: city ?? null,
    metrics: {},
  }).returning({ id: customers.id })

  return created.id
}

async function updateLastSeen(
  customerId: string,
  extra?: {
    name?: string | null
    externalId?: string
    email?: string | null
    phone?: string | null
    emailSubscribed?: boolean
    smsSubscribed?: boolean
    region?: string | null
    city?: string | null
  },
): Promise<void> {
  const updates: Record<string, unknown> = {
    lastSeen: new Date(),
    updatedAt: new Date(),
  }
  if (extra?.name) updates.name = extra.name
  if (extra?.externalId) updates.externalId = extra.externalId
  if (extra?.email) updates.email = extra.email
  if (extra?.phone) updates.phone = extra.phone
  if (extra?.emailSubscribed !== undefined) updates.emailSubscribed = extra.emailSubscribed
  if (extra?.smsSubscribed !== undefined) updates.smsSubscribed = extra.smsSubscribed
  // Region/city: only fill if currently NULL — see resolveCustomer for rationale
  if (extra?.region) updates.region = sql`COALESCE(${customers.region}, ${extra.region})`
  if (extra?.city) updates.city = sql`COALESCE(${customers.city}, ${extra.city})`

  await db.update(customers).set(updates).where(eq(customers.id, customerId))
}

/**
 * Update customer aggregates after an order event.
 * Uses atomic SQL increment to prevent lost-update race conditions.
 */
export async function updateCustomerAggregates(
  customerId: string,
  orderTotal: number,
  orderDate?: Date,
): Promise<void> {
  const ts = orderDate ?? new Date()
  // Update order stats first, then recompute CLV from the updated row
  await db.execute(sql`
    UPDATE customers SET
      total_orders = total_orders + 1,
      total_spent = total_spent + ${orderTotal},
      avg_order_value = (total_spent + ${orderTotal}) / NULLIF(total_orders + 1, 0),
      last_seen = NOW(),
      first_order_date = CASE WHEN first_order_date IS NULL THEN ${ts}::timestamptz ELSE LEAST(first_order_date, ${ts}::timestamptz) END,
      last_order_date = CASE WHEN last_order_date IS NULL THEN ${ts}::timestamptz ELSE GREATEST(last_order_date, ${ts}::timestamptz) END,
      updated_at = NOW()
    WHERE id = ${customerId}
  `)

  // Recompute CLV from updated data using the JS model
  const [row] = await db.select({
    totalSpent: customers.totalSpent,
    totalOrders: customers.totalOrders,
    firstOrderDate: customers.firstOrderDate,
    lastOrderDate: customers.lastOrderDate,
    lastSeen: customers.lastSeen,
    metrics: customers.metrics,
  }).from(customers).where(eq(customers.id, customerId)).limit(1)

  if (row) {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>
    const clvResult = computeClv({
      totalSpent: Number(row.totalSpent),
      totalOrders: row.totalOrders,
      firstOrderDate: row.firstOrderDate,
      lastOrderDate: row.lastOrderDate,
      lastSeenDate: row.lastSeen,
      churnRiskScore: metrics.churn_risk ? Number(metrics.churn_risk) : undefined,
    })
    await db.update(customers).set({
      clv: String(clvResult.clv_total),
      metrics: { ...metrics, ...clvResult },
      updatedAt: new Date(),
    }).where(eq(customers.id, customerId))
  }
}

/**
 * Recalculate aggregates after order cancellation.
 * Uses atomic SQL decrement to prevent lost-update race conditions.
 */
export async function recalculateAggregates(
  customerId: string,
  orderTotal: number,
): Promise<void> {
  await db.execute(sql`
    UPDATE customers SET
      total_orders = GREATEST(0, total_orders - 1),
      total_spent = GREATEST(0, total_spent - ${orderTotal}),
      avg_order_value = CASE
        WHEN GREATEST(0, total_orders - 1) > 0
        THEN GREATEST(0, total_spent - ${orderTotal}) / GREATEST(1, total_orders - 1)
        ELSE 0
      END,
      updated_at = NOW()
    WHERE id = ${customerId}
  `)

  // Recompute CLV from updated data
  const [row] = await db.select({
    totalSpent: customers.totalSpent,
    totalOrders: customers.totalOrders,
    firstOrderDate: customers.firstOrderDate,
    lastOrderDate: customers.lastOrderDate,
    lastSeen: customers.lastSeen,
    metrics: customers.metrics,
  }).from(customers).where(eq(customers.id, customerId)).limit(1)

  if (row) {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>
    const clvResult = computeClv({
      totalSpent: Number(row.totalSpent),
      totalOrders: row.totalOrders,
      firstOrderDate: row.firstOrderDate,
      lastOrderDate: row.lastOrderDate,
      lastSeenDate: row.lastSeen,
      churnRiskScore: metrics.churn_risk ? Number(metrics.churn_risk) : undefined,
    })
    await db.update(customers).set({
      clv: String(clvResult.clv_total),
      metrics: { ...metrics, ...clvResult },
      updatedAt: new Date(),
    }).where(eq(customers.id, customerId))
  }
}

/**
 * Recalculate all customer aggregates from real data.
 * Uses order_completed events (which contain line_items with unit_price)
 * as the source of truth, falling back to orders table if no events exist.
 */
export async function recalculateAllAggregates(projectId: string): Promise<number> {
  // Primary: compute from order_completed events (real GoWelmart data)
  const result = await db.execute(sql`
    UPDATE customers c SET
      total_orders = agg.order_count,
      total_spent  = agg.total_revenue,
      avg_order_value = CASE
        WHEN agg.order_count > 0 THEN agg.total_revenue / agg.order_count
        ELSE 0
      END,
      clv = agg.total_revenue,
      updated_at = NOW()
    FROM (
      SELECT
        e.customer_id,
        COUNT(*)::integer AS order_count,
        COALESCE(SUM(
          (SELECT COALESCE(SUM((item->>'unit_price')::numeric), 0)
           FROM jsonb_array_elements(e.properties->'line_items') item)
        ), 0)::numeric(12,2) AS total_revenue
      FROM events e
      WHERE e.project_id = ${projectId}
        AND e.event_name IN ('order_placed', 'order_completed')
      GROUP BY e.customer_id
      HAVING COALESCE(SUM(
        (SELECT COALESCE(SUM((item->>'unit_price')::numeric), 0)
         FROM jsonb_array_elements(e.properties->'line_items') item)
      ), 0) > 0
    ) agg
    WHERE c.id = agg.customer_id
      AND c.project_id = ${projectId}
  `)

  const eventUpdated = Number((result as { rowCount?: number }).rowCount ?? 0)

  // Fallback: for customers not covered by events, use orders table
  if (eventUpdated === 0) {
    await db.execute(sql`
      UPDATE customers c SET
        total_orders = COALESCE(agg.order_count, 0),
        total_spent  = COALESCE(agg.total_spent, 0),
        avg_order_value = CASE
          WHEN COALESCE(agg.order_count, 0) > 0
          THEN COALESCE(agg.total_spent, 0) / agg.order_count
          ELSE 0
        END,
        clv = COALESCE(agg.total_spent, 0),
        updated_at = NOW()
      FROM (
        SELECT
          customer_id,
          COUNT(*)::integer AS order_count,
          SUM(total::numeric)::numeric(12,2) AS total_spent
        FROM orders
        WHERE project_id = ${projectId}
          AND status != 'cancelled'
        GROUP BY customer_id
      ) agg
      WHERE c.id = agg.customer_id
        AND c.project_id = ${projectId}
    `)
  }

  // Backfill first_order_date and last_order_date from orders table
  await db.execute(sql`
    UPDATE customers c SET
      first_order_date = agg.first_order_at,
      last_order_date = agg.last_order_at
    FROM (
      SELECT
        customer_id,
        MIN(created_at) AS first_order_at,
        MAX(created_at) AS last_order_at
      FROM orders
      WHERE project_id = ${projectId} AND status != 'cancelled'
      GROUP BY customer_id
    ) agg
    WHERE c.id = agg.customer_id
      AND c.project_id = ${projectId}
  `)

  // Zero out customers with no orders from either source
  await db.execute(sql`
    UPDATE customers SET
      total_orders = 0,
      total_spent = 0,
      avg_order_value = 0,
      clv = 0,
      first_order_date = NULL,
      last_order_date = NULL,
      updated_at = NOW()
    WHERE project_id = ${projectId}
      AND id NOT IN (
        SELECT DISTINCT customer_id FROM events
        WHERE project_id = ${projectId} AND event_name IN ('order_placed', 'order_completed')
        UNION
        SELECT DISTINCT customer_id FROM orders
        WHERE project_id = ${projectId} AND status != 'cancelled'
      )
      AND (total_orders != 0 OR total_spent::numeric != 0)
  `)

  // Recompute CLV for all buyers using the JS model
  const buyers = await db.select({
    id: customers.id,
    totalSpent: customers.totalSpent,
    totalOrders: customers.totalOrders,
    firstOrderDate: customers.firstOrderDate,
    lastOrderDate: customers.lastOrderDate,
    lastSeen: customers.lastSeen,
    metrics: customers.metrics,
  }).from(customers).where(
    and(eq(customers.projectId, projectId), sql`total_orders > 0`),
  )

  for (const row of buyers) {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>
    const clvResult = computeClv({
      totalSpent: Number(row.totalSpent),
      totalOrders: row.totalOrders,
      firstOrderDate: row.firstOrderDate,
      lastOrderDate: row.lastOrderDate,
      lastSeenDate: row.lastSeen,
      churnRiskScore: metrics.churn_risk ? Number(metrics.churn_risk) : undefined,
    })
    await db.update(customers).set({
      clv: String(clvResult.clv_total),
      metrics: { ...metrics, ...clvResult, total_orders: row.totalOrders, total_spent: Number(row.totalSpent) },
      updatedAt: new Date(),
    }).where(eq(customers.id, row.id))
  }

  return eventUpdated
}
