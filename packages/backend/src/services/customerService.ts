import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, orders, events } from '../db/schema.js'

// ============ CLV CALCULATION ============

type ClvInput = {
  totalSpent: number
  totalOrders: number
  firstOrderDate: Date | null
  lastOrderDate: Date | null
  churnRiskScore?: number // 0-100 from ML, if available
}

type ClvResult = {
  clv_historical: number
  clv_predicted: number
  clv_total: number
  clv_monthly_frequency: number
  clv_retention_months: number
  clv_churn_probability: number
  clv_health: 'growing' | 'stable' | 'declining' | 'at_risk' | 'churned'
}

/**
 * Compute CLV using a retention-adjusted DCF model.
 *
 * CLV = historical (actual spend) + predicted (forward-looking 12-month value)
 *
 * Predicted CLV = AOV × monthly_frequency × retention_months
 *   retention_months = 1 / monthly_churn_rate (capped at 36)
 *   churn = ML score if available, else heuristic based on overdue ratio
 */
export function computeClv(input: ClvInput): ClvResult {
  const { totalSpent, totalOrders, firstOrderDate, lastOrderDate, churnRiskScore } = input
  const now = new Date()

  // No orders → zero CLV
  if (totalOrders === 0 || !firstOrderDate) {
    return {
      clv_historical: 0,
      clv_predicted: 0,
      clv_total: 0,
      clv_monthly_frequency: 0,
      clv_retention_months: 0,
      clv_churn_probability: 1,
      clv_health: 'churned',
    }
  }

  const historical = totalSpent
  const aov = totalSpent / totalOrders

  // Tenure in months (min 1 to avoid division by zero)
  const tenureDays = Math.max(1, (now.getTime() - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24))
  const tenureMonths = Math.max(1, tenureDays / 30.44)

  // Monthly purchase frequency
  const monthlyFrequency = totalOrders / tenureMonths

  // Days since last order
  const daysSinceLastOrder = lastOrderDate
    ? (now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
    : tenureDays

  // Average gap between orders (for repeat buyers)
  const avgGapDays = totalOrders > 1
    ? (((lastOrderDate ?? now).getTime() - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24)) / (totalOrders - 1)
    : tenureDays // single buyers: assume gap = entire tenure

  // Overdue ratio: how far past their expected next order
  const overdueRatio = avgGapDays > 0 ? daysSinceLastOrder / avgGapDays : 999

  // Churn probability
  let churnProb: number
  if (churnRiskScore !== undefined && churnRiskScore > 0) {
    // Use ML score (0-100 → 0-1), but floor at 0.02 for active customers
    churnProb = Math.max(0.02, churnRiskScore / 100)
  } else {
    // Heuristic based on overdue ratio
    if (totalOrders === 1) {
      churnProb = 0.6 // single buyers have high churn
    } else if (overdueRatio <= 1) {
      churnProb = 0.05 // on schedule
    } else if (overdueRatio <= 2) {
      churnProb = 0.15 + (overdueRatio - 1) * 0.2
    } else if (overdueRatio <= 3) {
      churnProb = 0.35 + (overdueRatio - 2) * 0.3
    } else {
      churnProb = Math.min(0.95, 0.65 + (overdueRatio - 3) * 0.1)
    }
  }

  // Monthly churn rate → retention months (capped at 36)
  const monthlyChurnRate = Math.max(0.01, 1 - Math.pow(1 - churnProb, 1 / 12))
  const retentionMonths = Math.min(36, 1 / monthlyChurnRate)

  // Predicted CLV = AOV × monthly_frequency × retention_months
  const predicted = Math.round(aov * monthlyFrequency * retentionMonths * 100) / 100

  // CLV Health
  let health: ClvResult['clv_health']
  if (daysSinceLastOrder > 180) {
    health = 'churned'
  } else if (overdueRatio > 3) {
    health = 'at_risk'
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
  const { projectId, externalId, email, phone, name, emailSubscribed, smsSubscribed } = params

  // 1. Try external_id (has unique index: idx_customers_external)
  if (externalId) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, externalId)))
      .limit(1)

    if (found) {
      await updateLastSeen(found.id, { name, email, phone, emailSubscribed, smsSubscribed })
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
      await updateLastSeen(found.id, { name, externalId, email, emailSubscribed, smsSubscribed })
      return found.id
    }
  }

  // 4. Atomic create — ON CONFLICT prevents duplicate creation race condition
  // Try insert with the best unique key available
  if (email) {
    const result = await db.execute(sql`
      INSERT INTO customers (project_id, external_id, email, phone, name, email_subscribed, sms_subscribed, metrics)
      VALUES (${projectId}, ${externalId ?? null}, ${email}, ${phone ?? null}, ${name ?? null}, ${emailSubscribed ?? false}, ${smsSubscribed ?? false}, '{}'::jsonb)
      ON CONFLICT (project_id, email) WHERE email IS NOT NULL
      DO UPDATE SET
        last_seen = NOW(),
        updated_at = NOW(),
        external_id = COALESCE(EXCLUDED.external_id, customers.external_id),
        phone = COALESCE(EXCLUDED.phone, customers.phone),
        name = COALESCE(EXCLUDED.name, customers.name)
      RETURNING id
    `)
    return (result.rows[0] as { id: string }).id
  }

  if (phone) {
    const result = await db.execute(sql`
      INSERT INTO customers (project_id, external_id, email, phone, name, email_subscribed, sms_subscribed, metrics)
      VALUES (${projectId}, ${externalId ?? null}, ${null}, ${phone}, ${name ?? null}, ${emailSubscribed ?? false}, ${smsSubscribed ?? false}, '{}'::jsonb)
      ON CONFLICT (project_id, phone) WHERE phone IS NOT NULL
      DO UPDATE SET
        last_seen = NOW(),
        updated_at = NOW(),
        external_id = COALESCE(EXCLUDED.external_id, customers.external_id),
        name = COALESCE(EXCLUDED.name, customers.name)
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
    metrics: customers.metrics,
  }).from(customers).where(eq(customers.id, customerId)).limit(1)

  if (row) {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>
    const clvResult = computeClv({
      totalSpent: Number(row.totalSpent),
      totalOrders: row.totalOrders,
      firstOrderDate: row.firstOrderDate,
      lastOrderDate: row.lastOrderDate,
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
    metrics: customers.metrics,
  }).from(customers).where(eq(customers.id, customerId)).limit(1)

  if (row) {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>
    const clvResult = computeClv({
      totalSpent: Number(row.totalSpent),
      totalOrders: row.totalOrders,
      firstOrderDate: row.firstOrderDate,
      lastOrderDate: row.lastOrderDate,
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
        AND e.event_name = 'order_completed'
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
        WHERE project_id = ${projectId} AND event_name = 'order_completed'
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
