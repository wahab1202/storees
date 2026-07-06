import { and, eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { anonymousSessions } from '../db/schema.js'
import { identityMergeQueue } from './queue.js'

/**
 * Phase F3 — link a previously-anonymous browser session to a customer
 * and enqueue the back-attribution merge job. Idempotent: re-linking the
 * same session to the same customer is a no-op (does not re-queue).
 * (Extracted from v1Events for reuse by the inbound-webhook stitch.)
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
    // Conflict: session previously linked to a different customer (rare —
    // usually shared device). Update to the new customer; back-attribution
    // worker will re-process. Audit-trail this in the future via an event.
    await db.update(anonymousSessions)
      .set({ customerId, linkedAt: new Date(), eventsBackAttributed: null, flowsTriggered: null, resolvedAt: null })
      .where(eq(anonymousSessions.id, existing.id))
  } else {
    await db.insert(anonymousSessions).values({
      projectId,
      sessionId,
      customerId,
    })
  }

  // Enqueue the merge job — non-blocking, fire-and-forget
  await identityMergeQueue.add('merge', {
    projectId,
    sessionId,
    customerId,
  }).catch(err => console.error('[identify] failed to enqueue merge:', err))
}
