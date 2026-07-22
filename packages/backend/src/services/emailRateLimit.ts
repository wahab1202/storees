import { redis } from './redis.js'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'

/**
 * Per-tenant rate limiter for email sends.
 *
 * Why per-tenant rather than global: at Black Friday scale, multiple
 * vendors run high-volume campaigns simultaneously. With only a global
 * cap, one tenant's 2M-row campaign starves the queue for everyone else.
 *
 * Design: fixed-window counter per (project_id, minute). Cheap (one INCR),
 * good enough for the Storees scale (60-300K mail/min per tenant; we don't
 * need sliding-window precision). Boundary effects at minute rollover are
 * acceptable — providers see traffic at sec resolution and the limiter
 * floor (60/min default) is conservative anyway.
 *
 * Key: rate:email:${projectId}:${minuteEpoch}
 * TTL: 120s (auto-cleanup; enough for "in-progress minute" to drain)
 */

const DEFAULT_RATE_PER_MINUTE = 60
const KEY_PREFIX = 'rate:email:'
const KEY_TTL_S = 120

// Cache the per-project limit for 60s — projects.email_rate_per_minute is
// changed via the settings UI, not on the hot path. Avoids hitting Postgres
// on every send job.
const limitCache = new Map<string, { limit: number; expiresAt: number }>()
const LIMIT_CACHE_TTL_MS = 60_000

async function getProjectRateLimit(projectId: string): Promise<number> {
  const cached = limitCache.get(projectId)
  if (cached && cached.expiresAt > Date.now()) return cached.limit

  const [row] = await db
    .select({ rate: projects.emailRatePerMinute })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  const limit = row?.rate ?? DEFAULT_RATE_PER_MINUTE
  limitCache.set(projectId, { limit, expiresAt: Date.now() + LIMIT_CACHE_TTL_MS })
  return limit
}

export type AcquireResult =
  | { ok: true; limit: number; current: number }
  | { ok: false; limit: number; current: number; retryAfterMs: number }

/**
 * Try to consume one send slot for this project. Returns { ok: true } if the
 * project is under its per-minute limit; otherwise returns { ok: false, retryAfterMs }
 * indicating how long to wait before the next minute window opens.
 */
export async function acquireEmailSlot(projectId: string): Promise<AcquireResult> {
  const limit = await getProjectRateLimit(projectId)
  const nowMs = Date.now()
  const minuteEpoch = Math.floor(nowMs / 60_000)
  const key = `${KEY_PREFIX}${projectId}:${minuteEpoch}`

  // INCR returns the value AFTER incrementing. EXPIRE separately so we
  // don't extend the TTL on every call.
  const current = await redis.incr(key)
  if (current === 1) {
    await redis.expire(key, KEY_TTL_S)
  }

  if (current <= limit) {
    return { ok: true, limit, current }
  }

  // Over budget — calculate ms until next minute window
  const retryAfterMs = (minuteEpoch + 1) * 60_000 - nowMs + 50 // +50ms cushion
  return { ok: false, limit, current, retryAfterMs }
}
