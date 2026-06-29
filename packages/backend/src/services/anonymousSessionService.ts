import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { anonymousSessions } from '../db/schema.js'
import { identityMergeQueue } from './queue.js'

/**
 * Link a previously-anonymous browser session to a customer and enqueue the
 * back-attribution merge job (which re-attributes the session's prior events —
 * product_viewed, added_to_cart, etc. — to the now-known customer). Idempotent:
 * re-linking the same session to the same customer is a no-op.
 *
 * Shared by /v1/identify, /v1/customers, and the order-ingestion stitch below.
 */
export async function linkAnonymousSession(
  projectId: string,
  sessionId: string,
  customerId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: anonymousSessions.id, customerId: anonymousSessions.customerId })
    .from(anonymousSessions)
    .where(and(
      eq(anonymousSessions.projectId, projectId),
      eq(anonymousSessions.sessionId, sessionId),
    ))
    .limit(1)

  if (existing) {
    if (existing.customerId === customerId) return // already linked to this customer
    // Conflict (rare — usually a shared device): re-point to the new customer
    // and let the back-attribution worker re-process.
    await db.update(anonymousSessions)
      .set({ customerId, linkedAt: new Date(), eventsBackAttributed: null, flowsTriggered: null, resolvedAt: null })
      .where(eq(anonymousSessions.id, existing.id))
  } else {
    await db.insert(anonymousSessions).values({ projectId, sessionId, customerId })
  }

  await identityMergeQueue.add('merge', { projectId, sessionId, customerId })
    .catch(err => console.error('[anon-session] failed to enqueue merge:', err))
}

/**
 * Stitch an order's customer to a prior anonymous browse session via a stitch id
 * the storefront stamped onto the order.
 *
 * Flow: the storefront sets a Shopify cart attribute `storees_sid` = the SDK
 * session id; Shopify (and 3rd-party checkouts like Shopflo that preserve cart
 * attributes) carry it through to `order.note_attributes`. When the order lands,
 * we read it and back-attribute the anonymous browse history to the customer who
 * placed the order — closing the loop even when the visitor never identified
 * on-site (the common Shopflo case).
 */
export async function stitchOrderToSession(
  projectId: string,
  customerId: string,
  orderPayload: Record<string, unknown>,
): Promise<void> {
  const noteAttrs = orderPayload.note_attributes
  if (!Array.isArray(noteAttrs)) return
  const entry = noteAttrs.find(
    (a) => !!a && typeof a === 'object' && (a as { name?: unknown }).name === 'storees_sid',
  ) as { value?: unknown } | undefined
  const sid = entry?.value
  if (typeof sid === 'string' && sid.trim()) {
    await linkAnonymousSession(projectId, sid.trim(), customerId)
  }
}
