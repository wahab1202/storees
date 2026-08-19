import { and, eq, sql, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { events, cartAbandonmentNotes } from '../db/schema.js'
import { readPath } from '@storees/shared'
import type { CustomerAbandonments, AbandonmentInstance, AbandonmentProduct } from '@storees/shared'
import { analyzeCartFriction } from './cartFrictionService.js'

const BROWSE_WINDOW_DAYS = 7
const MAX_ABANDONS = 50

function extractCart(props: Record<string, unknown>): AbandonmentInstance['cart'] {
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : undefined }
  return {
    productDetails: (readPath(props, 'quickReplyMetaData.product_details') as string) ?? (props.cart_product_names as string) ?? null,
    image: (readPath(props, 'quickReplyMetaData.image') as string) ?? (readPath(props, 'line_items.0.image') as string) ?? null,
    totalPrice: num(props.total_price) ?? num(readPath(props, 'quickReplyMetaData.total_price')) ?? null,
    itemCount: Array.isArray(props.line_items) ? (props.line_items as unknown[]).length : (num(readPath(props, 'quickReplyMetaData.quantity')) ?? null),
    recoveryUrl: (props.abandoned_checkout_url as string) ?? (readPath(props, 'quickReplyMetaData.checkout_link') as string) ?? null,
  }
}

/** Distinct products viewed/clicked in the window before an abandon. */
async function productsBefore(projectId: string, customerId: string, abandonedAt: Date): Promise<AbandonmentProduct[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT ON (pid)
      COALESCE(properties->>'product_id', properties->>'productId') AS pid,
      COALESCE(properties->>'product_name', properties->>'name', properties->>'title', properties->>'product_id') AS name,
      timestamp AS at
    FROM events
    WHERE project_id = ${projectId} AND customer_id = ${customerId}
      AND event_name IN ('product_viewed', 'product_clicked', 'element_clicked')
      AND COALESCE(properties->>'product_id', properties->>'productId') IS NOT NULL
      AND timestamp <= ${abandonedAt.toISOString()}::timestamptz
      AND timestamp > ${abandonedAt.toISOString()}::timestamptz - make_interval(days => ${BROWSE_WINDOW_DAYS})
    ORDER BY pid, timestamp DESC
    LIMIT 12
  `)
  return (res.rows as Array<{ pid: string; name: string | null; at: string }>).map(r => ({
    productId: r.pid, name: r.name ?? r.pid, at: String(r.at),
  }))
}

export async function listAbandonments(projectId: string, customerId: string): Promise<CustomerAbandonments> {
  const abandons = await db
    .select({ id: events.id, properties: events.properties, timestamp: events.timestamp })
    .from(events)
    .where(and(
      eq(events.projectId, projectId),
      eq(events.customerId, customerId),
      eq(events.eventName, 'checkout_abandoned'),
    ))
    .orderBy(desc(events.timestamp))
    .limit(MAX_ABANDONS)

  // Latest order timestamp — an abandon is "recovered" if they bought after it.
  const [{ maxorderat } = { maxorderat: null }] = (await db.execute(sql`
    SELECT MAX(timestamp) AS maxorderat FROM events
    WHERE project_id = ${projectId} AND customer_id = ${customerId}
      AND event_name IN ('order_placed', 'order_completed')
  `)).rows as Array<{ maxorderat: string | null }>
  const maxOrderAt = maxorderat ? new Date(maxorderat) : null

  const notes = await db.select().from(cartAbandonmentNotes)
    .where(and(eq(cartAbandonmentNotes.projectId, projectId), eq(cartAbandonmentNotes.customerId, customerId)))
  const noteByEvent = new Map(notes.map(n => [n.eventId, n]))

  let recovered = 0
  const instances: AbandonmentInstance[] = []
  for (const a of abandons) {
    const props = (a.properties ?? {}) as Record<string, unknown>
    const isRecovered = !!maxOrderAt && maxOrderAt > new Date(a.timestamp)
    if (isRecovered) recovered++
    const note = noteByEvent.get(a.id)
    instances.push({
      eventId: a.id,
      abandonedAt: String(a.timestamp),
      recovered: isRecovered,
      cart: extractCart(props),
      productsBefore: await productsBefore(projectId, customerId, new Date(a.timestamp)),
      note: note ? {
        reason: note.reason,
        remarks: note.remarks,
        markedByName: note.markedByName,
        updatedAt: String(note.updatedAt),
      } : null,
    })
  }

  // System-inferred likely reason for the latest abandon (a hint, not the truth).
  const friction = await analyzeCartFriction(projectId, customerId).catch(() => null)

  return {
    total: abandons.length,
    recovered,
    latestLikelyReason: friction?.likelyReason ?? null,
    instances,
  }
}

export async function saveAbandonmentReason(input: {
  projectId: string
  customerId: string
  eventId: string
  reason: string
  remarks?: string | null
  markedBy?: string | null
  markedByName?: string | null
}): Promise<void> {
  await db.insert(cartAbandonmentNotes).values({
    projectId: input.projectId,
    customerId: input.customerId,
    eventId: input.eventId,
    reason: input.reason,
    remarks: input.remarks ?? null,
    markedBy: input.markedBy ?? null,
    markedByName: input.markedByName ?? null,
  }).onConflictDoUpdate({
    target: [cartAbandonmentNotes.projectId, cartAbandonmentNotes.eventId],
    set: {
      reason: input.reason,
      remarks: input.remarks ?? null,
      markedBy: input.markedBy ?? null,
      markedByName: input.markedByName ?? null,
      updatedAt: new Date(),
    },
  })
}
