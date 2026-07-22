import crypto from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { webhookSubscriptions, webhookDeliveries } from '../db/schema.js'
import { webhookDeliveryQueue } from './queue.js'
import { decrypt } from './encryption.js'
import { assertPublicUrl } from './ssrfGuard.js'

// Outbound webhook delivery. emitWebhookEvent() fans a domain event out to every
// active subscription that listens for it (persisting a delivery row + enqueuing
// a job); deliverWebhook() signs and POSTs one delivery, recording the result and
// scheduling the next retry per the subscription's retry policy. See
// docs (STOREES_WEBHOOK_SPEC) for the envelope + Gowelmart contract.

const USER_AGENT = 'Storees/1.0'
const REQUEST_TIMEOUT_MS = 12_000
// Permanent/config failures — retrying loops nowhere useful (spec §3).
const NO_RETRY_CODES = new Set([400, 401, 403, 404, 410])

type RetryPolicy = { max_attempts: number; schedule_seconds: number[] }
const DEFAULT_RETRY: RetryPolicy = { max_attempts: 5, schedule_seconds: [1, 4, 16, 64, 256] }

function delayForAttempt(policy: RetryPolicy, justFailedAttempt: number): number {
  const s = policy.schedule_seconds?.length ? policy.schedule_seconds : DEFAULT_RETRY.schedule_seconds
  return s[justFailedAttempt - 1] ?? s[s.length - 1] ?? 60
}

/**
 * Fan a domain event out to every active subscription in the project that lists
 * `eventType`. Builds the canonical envelope, persists one delivery row per
 * subscription, and enqueues it. Returns how many deliveries were queued.
 * Cheap no-op (single indexed query) for projects with no subscriptions.
 */
export async function emitWebhookEvent(input: {
  projectId: string
  eventType: string
  data: Record<string, unknown>
}): Promise<number> {
  const subs = await db
    .select({ id: webhookSubscriptions.id })
    .from(webhookSubscriptions)
    .where(and(
      eq(webhookSubscriptions.projectId, input.projectId),
      eq(webhookSubscriptions.isActive, true),
      sql`${webhookSubscriptions.events} @> ${JSON.stringify([input.eventType])}::jsonb`,
    ))

  let enqueued = 0
  for (const sub of subs) {
    const deliveryId = crypto.randomUUID()
    const envelope = {
      id: `evt_${crypto.randomUUID()}`,
      event_type: input.eventType,
      occurred_at: new Date().toISOString(),
      delivery_id: `del_${deliveryId}`,
      project_id: input.projectId,
      data: input.data,
    }
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      subscriptionId: sub.id,
      eventId: input.eventType,
      eventData: envelope,
      attempt: 1,
      final: false,
    })
    await webhookDeliveryQueue.add('deliver', { deliveryId })
    enqueued++
  }
  return enqueued
}

function buildHeaders(
  sub: { authMethod: string; customHeaders: unknown },
  delivery: { id: string; eventId: string },
  rawBody: string,
  secret: string,
): Record<string, string> {
  const t = Math.floor(Date.now() / 1000)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'X-Storees-Event': delivery.eventId,
    'X-Storees-Delivery': `del_${delivery.id}`,
    'X-Storees-Timestamp': String(t),
    ...((sub.customHeaders as Record<string, string> | null) ?? {}),
  }
  if (sub.authMethod === 'bearer') {
    headers['Authorization'] = `Bearer ${secret}`
  } else {
    // HMAC-SHA256 over "<timestamp>.<raw body>" (spec §4).
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
    headers['X-Storees-Signature'] = `t=${t},v1=${sig}`
  }
  return headers
}

/** Sign + POST a single delivery, record the outcome, and schedule the next retry. */
export async function deliverWebhook(deliveryId: string): Promise<void> {
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1)
  if (!delivery || delivery.final) return

  const [sub] = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, delivery.subscriptionId)).limit(1)
  if (!sub || !sub.isActive) {
    await db.update(webhookDeliveries)
      .set({ final: true, attemptedAt: new Date(), error: 'Subscription missing or inactive' })
      .where(eq(webhookDeliveries.id, deliveryId))
    return
  }

  const rawBody = JSON.stringify(delivery.eventData)
  const secret = decrypt(sub.signingSecret)
  const headers = buildHeaders(sub, delivery, rawBody, secret)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let statusCode: number | null = null
  let responseBody: string | null = null
  let responseHeaders: Record<string, string> | null = null
  let error: string | null = null
  try {
    await assertPublicUrl(sub.url)
    const res = await fetch(sub.url, { method: 'POST', headers, body: rawBody, signal: controller.signal })
    statusCode = res.status
    responseBody = (await res.text().catch(() => '')).slice(0, 2000)
    responseHeaders = Object.fromEntries(res.headers.entries())
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  } finally {
    clearTimeout(timer)
  }

  const ok = statusCode !== null && statusCode >= 200 && statusCode < 300
  const permanent = statusCode !== null && NO_RETRY_CODES.has(statusCode)
  const policy = (sub.retryPolicy as RetryPolicy) ?? DEFAULT_RETRY
  const canRetry = !ok && !permanent && delivery.attempt < policy.max_attempts

  await db.update(webhookDeliveries).set({
    attemptedAt: new Date(),
    statusCode,
    responseBody,
    responseHeaders,
    error,
    final: !canRetry,
    nextRetryAt: canRetry ? new Date(Date.now() + delayForAttempt(policy, delivery.attempt) * 1000) : null,
    attempt: canRetry ? delivery.attempt + 1 : delivery.attempt,
  }).where(eq(webhookDeliveries.id, deliveryId))

  if (canRetry) {
    await webhookDeliveryQueue.add('deliver', { deliveryId }, { delay: delayForAttempt(policy, delivery.attempt) * 1000 })
  }
}
