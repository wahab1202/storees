import { and, eq, count, gte, ne } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects, messages } from '../db/schema.js'

/**
 * Plan entitlements (self-serve trial — Phase 1).
 *
 * Resolves what a project (tenant) may do: which FEATURES are on and the usage
 * LIMITS (-1 = unlimited). Enforced server-side (the source of truth) — the
 * frontend only hides/locks. `resolveEntitlements` is pure + tested; the DB
 * loader caches briefly. Per-project overrides live in `projects.features.entitlements`
 * so a super admin can grant a feature without changing the plan.
 */

export type FeatureKey = 'ai_chatbot' | 'ai_email_designer' | 'predictions' | 'ad_audience_export'
export type LimitKey = 'contacts' | 'whatsapp_messages' | 'email_messages' | 'flows' | 'templates' | 'team_seats' | 'connected_stores'

export type Entitlements = {
  plan: string
  status: string
  trialEndsAt: string | null
  trialDaysLeft: number | null
  features: Record<FeatureKey, boolean>
  limits: Record<LimitKey, number>
}

const ALL_FEATURES: FeatureKey[] = ['ai_chatbot', 'ai_email_designer', 'predictions', 'ad_audience_export']
const UNLIMITED: Record<LimitKey, number> = {
  contacts: -1, whatsapp_messages: -1, email_messages: -1, flows: -1, templates: -1, team_seats: -1, connected_stores: -1,
}
const featureSet = (on: boolean) => Object.fromEntries(ALL_FEATURES.map(f => [f, on])) as Record<FeatureKey, boolean>

// Full access — paid / custom / hand-provisioned tenants.
const FULL = { features: featureSet(true), limits: { ...UNLIMITED } }

// 14-day trial — core sending + a couple of flows, premium features gated.
const TRIAL = {
  features: { ai_chatbot: false, ai_email_designer: true, predictions: false, ad_audience_export: false },
  limits: { contacts: 1000, whatsapp_messages: 100, email_messages: 500, flows: 2, templates: 5, team_seats: 1, connected_stores: 1 },
}

// Expired / suspended — keep data visible, block outbound + premium.
const RESTRICTED = {
  features: featureSet(false),
  limits: { contacts: 1000, whatsapp_messages: 0, email_messages: 0, flows: 0, templates: 0, team_seats: 1, connected_stores: 1 },
}

const PLAN_MAP: Record<string, { features: Record<FeatureKey, boolean>; limits: Record<LimitKey, number> }> = {
  trial: TRIAL,
  starter: FULL, // tiers can diverge later; Phase 1 treats paid/custom as full
  pro: FULL,
  custom: FULL,
}

type Overrides = { features?: Partial<Record<FeatureKey, boolean>>; limits?: Partial<Record<LimitKey, number>> }

/** Pure resolver — plan + status + overrides → entitlements. */
export function resolveEntitlements(input: {
  plan: string
  status: string
  trialEndsAt?: Date | string | null
  overrides?: Overrides | null
}): Entitlements {
  const { plan, status } = input
  const blocked = status === 'expired' || status === 'suspended' || status === 'cancelled'
  const base = blocked ? RESTRICTED : (PLAN_MAP[plan] ?? FULL)

  const features = { ...base.features, ...(input.overrides?.features ?? {}) }
  const limits = { ...base.limits, ...(input.overrides?.limits ?? {}) }

  let trialDaysLeft: number | null = null
  let trialEndsAt: string | null = null
  if (input.trialEndsAt) {
    const end = input.trialEndsAt instanceof Date ? input.trialEndsAt : new Date(input.trialEndsAt)
    if (!Number.isNaN(end.getTime())) {
      trialEndsAt = end.toISOString()
      trialDaysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000))
    }
  }
  return { plan, status, trialEndsAt, trialDaysLeft, features, limits }
}

// ── DB loader (short cache; finite-limit tenants only pay the count) ──
const CACHE = new Map<string, { ent: Entitlements; exp: number }>()
const TTL_MS = 30_000

export function invalidateEntitlements(projectId: string): void { CACHE.delete(projectId) }

export async function getEntitlements(projectId: string): Promise<Entitlements> {
  const now = Date.now()
  const hit = CACHE.get(projectId)
  if (hit && hit.exp > now) return hit.ent
  const [row] = await db
    .select({ plan: projects.plan, status: projects.status, trialEndsAt: projects.trialEndsAt, features: projects.features })
    .from(projects).where(eq(projects.id, projectId)).limit(1)
  const overrides = ((row?.features as Record<string, unknown> | null)?.entitlements ?? null) as Overrides | null
  const ent = resolveEntitlements({
    plan: row?.plan ?? 'custom',
    status: row?.status ?? 'active',
    trialEndsAt: row?.trialEndsAt ?? null,
    overrides,
  })
  if (CACHE.size > 50_000) CACHE.clear()
  CACHE.set(projectId, { ent, exp: now + TTL_MS })
  return ent
}

export async function isFeatureEnabled(projectId: string, key: FeatureKey): Promise<boolean> {
  return (await getEntitlements(projectId)).features[key]
}

/**
 * Can this project still send on `channel`? Unlimited plans short-circuit with no
 * query. Finite (trial) plans count sends in the current trial window against the cap.
 */
export async function checkSendAllowed(
  projectId: string,
  channel: 'whatsapp' | 'email' | 'sms' | 'push',
): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  const ent = await getEntitlements(projectId)
  if (ent.status === 'expired' || ent.status === 'suspended' || ent.status === 'cancelled') {
    return { allowed: false, remaining: 0, reason: `account_${ent.status}` }
  }
  const metric: LimitKey = channel === 'whatsapp' ? 'whatsapp_messages' : channel === 'email' ? 'email_messages' : 'whatsapp_messages'
  const cap = ent.limits[metric]
  if (cap < 0) return { allowed: true, remaining: -1 } // unlimited

  // Count sends in the trial window (fall back to all-time for the project).
  const windowStart = ent.trialEndsAt ? new Date(new Date(ent.trialEndsAt).getTime() - 14 * 86_400_000) : new Date(0)
  const conds = [eq(messages.projectId, projectId), eq(messages.channel, channel), ne(messages.status, 'failed')]
  if (windowStart.getTime() > 0) conds.push(gte(messages.createdAt, windowStart))
  const [{ used }] = await db.select({ used: count() }).from(messages).where(and(...conds))
  const remaining = Math.max(0, cap - Number(used))
  return remaining > 0 ? { allowed: true, remaining } : { allowed: false, remaining: 0, reason: 'trial_limit' }
}
