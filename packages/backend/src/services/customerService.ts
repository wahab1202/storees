import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers } from '../db/schema.js'

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
): Promise<void> {
  await db.execute(sql`
    UPDATE customers SET
      total_orders = total_orders + 1,
      total_spent = total_spent + ${orderTotal},
      avg_order_value = (total_spent + ${orderTotal}) / NULLIF(total_orders + 1, 0),
      clv = total_spent + ${orderTotal},
      last_seen = NOW(),
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
