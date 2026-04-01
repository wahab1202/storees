import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, orders, events } from '../db/schema.js'

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
  await db.execute(sql`
    UPDATE customers SET
      total_orders = total_orders + 1,
      total_spent = total_spent + ${orderTotal},
      avg_order_value = (total_spent + ${orderTotal}) / NULLIF(total_orders + 1, 0),
      clv = total_spent + ${orderTotal},
      last_seen = NOW(),
      first_order_date = CASE WHEN first_order_date IS NULL THEN ${ts}::timestamptz ELSE LEAST(first_order_date, ${ts}::timestamptz) END,
      last_order_date = CASE WHEN last_order_date IS NULL THEN ${ts}::timestamptz ELSE GREATEST(last_order_date, ${ts}::timestamptz) END,
      updated_at = NOW()
    WHERE id = ${customerId}
  `)
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
      clv = GREATEST(0, total_spent - ${orderTotal}),
      updated_at = NOW()
    WHERE id = ${customerId}
  `)
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

  // Sync metrics JSONB with corrected column values
  // (import scripts may have written stale total_spent/total_orders into metrics)
  await db.execute(sql`
    UPDATE customers SET
      metrics = jsonb_set(
        jsonb_set(
          COALESCE(metrics, '{}'::jsonb),
          '{total_orders}',
          to_jsonb(total_orders)
        ),
        '{total_spent}',
        to_jsonb(total_spent::numeric)
      )
    WHERE project_id = ${projectId}
      AND metrics IS NOT NULL
      AND (
        (metrics->>'total_orders')::int IS DISTINCT FROM total_orders
        OR (metrics->>'total_spent')::numeric IS DISTINCT FROM total_spent::numeric
      )
  `)

  return eventUpdated
}
