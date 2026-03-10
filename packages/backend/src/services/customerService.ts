import { eq, and } from 'drizzle-orm'
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
 * 4. Create new if not found
 *
 * Always updates last_seen.
 */
export async function resolveCustomer(params: ResolveParams): Promise<string> {
  const { projectId, externalId, email, phone, name, emailSubscribed, smsSubscribed } = params

  // 1. Try external_id
  if (externalId) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, externalId)))
      .limit(1)

    if (found) {
      await updateLastSeen(found.id, { name, emailSubscribed, smsSubscribed })
      return found.id
    }
  }

  // 2. Try email
  if (email) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.email, email)))
      .limit(1)

    if (found) {
      // Backfill external_id if we now have it
      const updates: Record<string, unknown> = { lastSeen: new Date() }
      if (externalId) updates.externalId = externalId
      if (name) updates.name = name
      if (emailSubscribed !== undefined) updates.emailSubscribed = emailSubscribed
      if (smsSubscribed !== undefined) updates.smsSubscribed = smsSubscribed
      await db.update(customers).set(updates).where(eq(customers.id, found.id))
      return found.id
    }
  }

  // 3. Try phone
  if (phone) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.phone, phone)))
      .limit(1)

    if (found) {
      await updateLastSeen(found.id, { name, externalId, emailSubscribed, smsSubscribed })
      return found.id
    }
  }

  // 4. Create new customer
  const [created] = await db.insert(customers).values({
    projectId,
    externalId: externalId ?? null,
    email: email ?? null,
    phone: phone ?? null,
    name: name ?? null,
    emailSubscribed: emailSubscribed ?? false,
    smsSubscribed: smsSubscribed ?? false,
  }).returning({ id: customers.id })

  return created.id
}

async function updateLastSeen(
  customerId: string,
  extra?: {
    name?: string | null
    externalId?: string
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
  if (extra?.emailSubscribed !== undefined) updates.emailSubscribed = extra.emailSubscribed
  if (extra?.smsSubscribed !== undefined) updates.smsSubscribed = extra.smsSubscribed

  await db.update(customers).set(updates).where(eq(customers.id, customerId))
}

/**
 * Update customer aggregates after an order event.
 */
export async function updateCustomerAggregates(
  customerId: string,
  orderTotal: number,
): Promise<void> {
  const [customer] = await db
    .select({
      totalOrders: customers.totalOrders,
      totalSpent: customers.totalSpent,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer) return

  const newTotalOrders = customer.totalOrders + 1
  const newTotalSpent = Number(customer.totalSpent) + orderTotal
  const newAvg = newTotalSpent / newTotalOrders

  await db.update(customers).set({
    totalOrders: newTotalOrders,
    totalSpent: String(newTotalSpent),
    avgOrderValue: String(newAvg),
    clv: String(newTotalSpent),
    lastSeen: new Date(),
    updatedAt: new Date(),
  }).where(eq(customers.id, customerId))
}

/**
 * Recalculate aggregates after order cancellation.
 */
export async function recalculateAggregates(
  customerId: string,
  orderTotal: number,
): Promise<void> {
  const [customer] = await db
    .select({
      totalOrders: customers.totalOrders,
      totalSpent: customers.totalSpent,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer) return

  const newTotalOrders = Math.max(0, customer.totalOrders - 1)
  const newTotalSpent = Math.max(0, Number(customer.totalSpent) - orderTotal)
  const newAvg = newTotalOrders > 0 ? newTotalSpent / newTotalOrders : 0

  await db.update(customers).set({
    totalOrders: newTotalOrders,
    totalSpent: String(newTotalSpent),
    avgOrderValue: String(newAvg),
    clv: String(newTotalSpent),
    updatedAt: new Date(),
  }).where(eq(customers.id, customerId))
}
