import { and, eq, gte, count } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects, emailSuppressions } from '../db/schema.js'
import { redis } from './redis.js'

/**
 * Deliverability guardrails for marketing email, applied only to project-scoped,
 * non-transactional sends (system email — verification, password reset — is never
 * gated, since it carries no projectId). Two protections:
 *
 *  1. Warm-up ramp — a newly VERIFIED tenant domain starts cold with no reputation.
 *     Blasting full volume on day one gets it spam-foldered or blocklisted, so we
 *     cap daily volume on a ramp keyed to the domain's verified age, widening to
 *     unlimited once warm. Tenants on the shared pool (no own domain) aren't ramped
 *     — that pool is already warm and trial send caps bound their volume.
 *
 *  2. Reputation circuit-breaker — if a tenant's complaint or hard-bounce rate over
 *     the trailing window crosses the mailbox-provider danger thresholds, we pause
 *     their marketing email so one bad list can't drag the shared infra into a
 *     blocklist. Self-healing: as bad events age out of the window, it resumes.
 *
 * Volume is counted via per-project per-day Redis counters (incremented on every
 * gated send) rather than `messages` rows, because email campaigns record against
 * `campaign_sends`, not `messages`.
 */

// Daily send cap by days since the domain was verified (index = age in days).
// Beyond the ramp the domain is considered warm (no cap).
const WARMUP_RAMP = [100, 100, 500, 1000, 2500, 5000, 10000, 20000, 35000, 50000, 75000, 100000, 150000, 200000]

// Mailbox-provider danger thresholds (Gmail/Yahoo bulk-sender guidance: keep spam
// complaints under 0.3%; hard bounces should stay low single digits).
const COMPLAINT_RATE_MAX = 0.003
const HARD_BOUNCE_RATE_MAX = 0.05
const MIN_SAMPLE = 200       // don't judge reputation on a tiny sample
const WINDOW_DAYS = 7
const COUNTER_TTL_SECONDS = 9 * 24 * 60 * 60 // keep day-counters long enough for the window

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}
function counterKey(projectId: string, d: Date): string {
  return `email-sent:${projectId}:${dayKey(d)}`
}

// ── small in-memory caches (per-process) ──
const capCache = new Map<string, { cap: number; exp: number }>()
const repCache = new Map<string, { status: ReputationStatus; exp: number }>()
const CAP_TTL_MS = 60 * 60 * 1000  // domain age changes by the day
const REP_TTL_MS = 10 * 60 * 1000

export type ReputationStatus = {
  healthy: boolean
  reason?: 'high_complaint_rate' | 'high_bounce_rate'
  complaintRate: number
  bounceRate: number
  sample: number
}

/** Daily send cap for a project's current domain age. -1 = unlimited (warm or shared pool). */
export async function getWarmupCap(projectId: string): Promise<number> {
  const hit = capCache.get(projectId)
  if (hit && hit.exp > Date.now()) return hit.cap

  const [row] = await db
    .select({ verifiedAt: projects.emailDomainVerifiedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  let cap = -1
  if (row?.verifiedAt) {
    const days = Math.floor((Date.now() - new Date(row.verifiedAt).getTime()) / 86_400_000)
    cap = days >= WARMUP_RAMP.length ? -1 : WARMUP_RAMP[Math.max(0, days)]
  }
  // No verified domain → shared pool, no warm-up cap (trial caps bound volume).

  capCache.set(projectId, { cap, exp: Date.now() + CAP_TTL_MS })
  return cap
}

/** How many gated emails this project has sent today (UTC). */
async function getTodayCount(projectId: string): Promise<number> {
  try {
    const n = await redis.get(counterKey(projectId, new Date()))
    return n ? parseInt(n, 10) || 0 : 0
  } catch {
    return 0 // Redis down → don't block sends on the counter
  }
}

/** Record one gated email send against today's counter. Call after a successful send. */
export async function recordEmailSent(projectId: string): Promise<void> {
  try {
    const key = counterKey(projectId, new Date())
    const n = await redis.incr(key)
    if (n === 1) await redis.expire(key, COUNTER_TTL_SECONDS)
    capCache.delete(projectId) // let a near-cap decision re-read sooner
  } catch {
    // best-effort — a missed increment only slightly loosens the warm-up cap
  }
}

/** Complaint + hard-bounce rates over the trailing window → health verdict. */
export async function getReputationStatus(projectId: string): Promise<ReputationStatus> {
  const hit = repCache.get(projectId)
  if (hit && hit.exp > Date.now()) return hit.status

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000)

  // Denominator: emails sent over the window (sum of day-counters).
  let sample = 0
  try {
    const keys: string[] = []
    for (let i = 0; i < WINDOW_DAYS; i++) {
      keys.push(counterKey(projectId, new Date(Date.now() - i * 86_400_000)))
    }
    const vals = await redis.mget(...keys)
    sample = vals.reduce<number>((sum, v) => sum + (v ? parseInt(v, 10) || 0 : 0), 0)
  } catch {
    sample = 0
  }

  // Numerators: complaints + hard bounces recorded in the window.
  const [complaints, bounces] = await Promise.all([
    db.select({ c: count() }).from(emailSuppressions).where(and(
      eq(emailSuppressions.projectId, projectId),
      eq(emailSuppressions.reason, 'complained'),
      gte(emailSuppressions.suppressedAt, windowStart),
    )),
    db.select({ c: count() }).from(emailSuppressions).where(and(
      eq(emailSuppressions.projectId, projectId),
      eq(emailSuppressions.reason, 'hard_bounce'),
      gte(emailSuppressions.suppressedAt, windowStart),
    )),
  ])

  const complaintCount = Number(complaints[0]?.c ?? 0)
  const bounceCount = Number(bounces[0]?.c ?? 0)
  const denom = Math.max(sample, 1)
  const complaintRate = complaintCount / denom
  const bounceRate = bounceCount / denom

  let status: ReputationStatus
  if (sample >= MIN_SAMPLE && complaintRate > COMPLAINT_RATE_MAX) {
    status = { healthy: false, reason: 'high_complaint_rate', complaintRate, bounceRate, sample }
  } else if (sample >= MIN_SAMPLE && bounceRate > HARD_BOUNCE_RATE_MAX) {
    status = { healthy: false, reason: 'high_bounce_rate', complaintRate, bounceRate, sample }
  } else {
    status = { healthy: true, complaintRate, bounceRate, sample }
  }

  repCache.set(projectId, { status, exp: Date.now() + REP_TTL_MS })
  return status
}

export type EmailGate = { allowed: boolean; reason?: 'reputation_paused' | 'warmup_limit' }

/**
 * Should this project send one more marketing email right now? Combines the
 * reputation circuit-breaker and the warm-up daily cap. Call before sending;
 * on allow + successful send, call recordEmailSent().
 */
export async function checkEmailReputationAllowed(projectId: string): Promise<EmailGate> {
  const rep = await getReputationStatus(projectId)
  if (!rep.healthy) {
    return { allowed: false, reason: 'reputation_paused' }
  }
  const cap = await getWarmupCap(projectId)
  if (cap < 0) return { allowed: true }
  const sentToday = await getTodayCount(projectId)
  return sentToday < cap ? { allowed: true } : { allowed: false, reason: 'warmup_limit' }
}

export type WarmupInfo = {
  domainVerified: boolean
  verifiedAt: string | null
  ageDays: number | null
  dailyCap: number   // -1 = unlimited
  sentToday: number
}

/** Warm-up snapshot for admin visibility (domain age, today's volume vs cap). */
export async function getWarmupInfo(projectId: string): Promise<WarmupInfo> {
  const [row] = await db
    .select({ verifiedAt: projects.emailDomainVerifiedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  const verifiedAt = row?.verifiedAt ?? null
  const [dailyCap, sentToday] = await Promise.all([getWarmupCap(projectId), getTodayCount(projectId)])
  return {
    domainVerified: !!verifiedAt,
    verifiedAt: verifiedAt ? new Date(verifiedAt).toISOString() : null,
    ageDays: verifiedAt ? Math.floor((Date.now() - new Date(verifiedAt).getTime()) / 86_400_000) : null,
    dailyCap,
    sentToday,
  }
}

export function invalidateEmailReputationCaches(projectId: string): void {
  capCache.delete(projectId)
  repCache.delete(projectId)
}
