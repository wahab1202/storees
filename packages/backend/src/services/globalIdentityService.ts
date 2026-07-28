import { and, eq, or, isNull, isNotNull, type SQL } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { globalIdentities, globalIdentityKeys, globalIdentityLinks, consents, consentAuditLog } from '../db/schema.js'
import { hashIdentityKey } from './identityGraphService.js'
import { crossBrandEnabled } from '../config/features.js'

const CB_CHANNEL = 'network'
const CB_PURPOSE = 'cross_brand'
export type CrossBrandConsentSource = 'sdk' | 'api' | 'admin' | 'webhook' | 'one_click_unsub'

/**
 * Cross-brand recognition network (Phase 2, step 2d-1). Storees-OWNED, cross-
 * tenant. Recognition crosses brands; DATA never does — this plane holds only
 * the person + the keys that resolve to them, plus which per-brand customer
 * they map to. OFF by default (crossBrandEnabled).
 */

export type NetworkIdentifiers = { phone?: string | null; email?: string | null }
export type RecognitionResult = {
  inNetwork: boolean
  globalId: string | null
  /** The caller-brand's own customer id for this person, if already linked. */
  customerId: string | null
  returning: boolean
}

type Key = { type: 'phone' | 'email'; hash: string }

function keysFor(identifiers: NetworkIdentifiers): Key[] {
  const out: Key[] = []
  if (identifiers.phone?.trim()) out.push({ type: 'phone', hash: hashIdentityKey('phone', identifiers.phone) })
  if (identifiers.email?.trim()) out.push({ type: 'email', hash: hashIdentityKey('email', identifiers.email) })
  return out
}

function keyMatch(keys: Key[]): SQL | undefined {
  if (keys.length === 0) return undefined
  return or(...keys.map(k => and(eq(globalIdentityKeys.keyType, k.type), eq(globalIdentityKeys.keyHash, k.hash))))
}

/** Any global identity these keys already belong to (ignores consent — used for dedup). */
async function findGlobalId(keys: Key[]): Promise<string | null> {
  const match = keyMatch(keys)
  if (!match) return null
  const [row] = await db.select({ globalId: globalIdentityKeys.globalId }).from(globalIdentityKeys).where(match).limit(1)
  return row?.globalId ?? null
}

/**
 * Register a brand's customer into the network. Requires cross-brand consent.
 * Upserts the person's keys and links this brand's customer to them. No-op
 * unless the feature is enabled. Returns the global id (or null).
 */
export async function registerToNetwork(
  projectId: string,
  customerId: string,
  identifiers: NetworkIdentifiers,
  consented: boolean,
): Promise<string | null> {
  if (!crossBrandEnabled() || !consented) return null
  const keys = keysFor(identifiers)
  if (keys.length === 0) return null

  let globalId = await findGlobalId(keys)
  if (!globalId) {
    const [gi] = await db.insert(globalIdentities).values({}).returning({ id: globalIdentities.id })
    globalId = gi.id
  }

  for (const k of keys) {
    await db.insert(globalIdentityKeys)
      .values({ keyType: k.type, keyHash: k.hash, globalId, consentAt: new Date() })
      .onConflictDoUpdate({
        target: [globalIdentityKeys.keyType, globalIdentityKeys.keyHash],
        set: { consentAt: new Date(), withdrawnAt: null }, // re-consent clears a prior withdrawal; keeps the original global_id
      })
  }

  await db.insert(globalIdentityLinks)
    .values({ globalId, projectId, customerId })
    .onConflictDoUpdate({
      target: [globalIdentityLinks.globalId, globalIdentityLinks.projectId],
      set: { customerId, linkedAt: new Date() },
    })

  return globalId
}

/**
 * Recognise a visitor at a brand from a key they provided (phone/email). Returns
 * whether they're a consented member of the network and, if so, this brand's own
 * customer id for them (returning) or null (known person, new to this brand).
 * No-op (inNetwork:false) unless the feature is enabled.
 */
export async function recognize(projectId: string, identifiers: NetworkIdentifiers): Promise<RecognitionResult> {
  const miss: RecognitionResult = { inNetwork: false, globalId: null, customerId: null, returning: false }
  if (!crossBrandEnabled()) return miss
  const keys = keysFor(identifiers)
  const match = keyMatch(keys)
  if (!match) return miss

  const [active] = await db.select({ globalId: globalIdentityKeys.globalId })
    .from(globalIdentityKeys)
    .where(and(match, isNotNull(globalIdentityKeys.consentAt), isNull(globalIdentityKeys.withdrawnAt)))
    .limit(1)
  if (!active) return miss

  const [link] = await db.select({ customerId: globalIdentityLinks.customerId })
    .from(globalIdentityLinks)
    .where(and(eq(globalIdentityLinks.globalId, active.globalId), eq(globalIdentityLinks.projectId, projectId)))
    .limit(1)

  return { inNetwork: true, globalId: active.globalId, customerId: link?.customerId ?? null, returning: !!link }
}

/**
 * Withdraw a person from the network — recognition stops everywhere immediately.
 * Resolves the global id from whatever key was supplied and withdraws ALL of the
 * person's keys, not just the one they happened to unsubscribe with: a phone-only
 * opt-out must also stop email recognition, or the right-to-withdraw is silently
 * incomplete. Never gated on the feature flag — a withdrawal is always honoured.
 */
export async function withdrawFromNetwork(identifiers: NetworkIdentifiers): Promise<void> {
  const globalId = await findGlobalId(keysFor(identifiers))
  if (!globalId) return
  await db.update(globalIdentityKeys).set({ withdrawnAt: new Date() }).where(eq(globalIdentityKeys.globalId, globalId))
}

/**
 * Record a cross-brand recognition consent decision (queryable consents row +
 * audit trail) and act on it: opt-in registers the person into the network;
 * opt-out withdraws them (recognition stops network-wide). The single entry
 * point for cross-brand consent — no bare payload flags. No-op unless enabled.
 */
export async function setCrossBrandConsent(
  projectId: string,
  customerId: string,
  identifiers: NetworkIdentifiers,
  optIn: boolean,
  source: CrossBrandConsentSource = 'sdk',
): Promise<void> {
  if (!crossBrandEnabled()) return
  const now = new Date()

  const [existing] = await db.select({ id: consents.id }).from(consents)
    .where(and(
      eq(consents.projectId, projectId), eq(consents.customerId, customerId),
      eq(consents.channel, CB_CHANNEL), eq(consents.purpose, CB_PURPOSE),
    )).limit(1)
  if (existing) {
    await db.update(consents)
      .set({ status: optIn ? 'opted_in' : 'opted_out', revokedAt: optIn ? null : now, source })
      .where(eq(consents.id, existing.id))
  } else {
    await db.insert(consents).values({
      projectId, customerId, channel: CB_CHANNEL, purpose: CB_PURPOSE,
      status: optIn ? 'opted_in' : 'opted_out', source, revokedAt: optIn ? null : now,
    })
  }

  await db.insert(consentAuditLog).values({
    projectId, customerId, channel: CB_CHANNEL, messageType: CB_PURPOSE,
    action: optIn ? 'opt_in' : 'opt_out', source,
  })

  if (optIn) await registerToNetwork(projectId, customerId, identifiers, true)
  else await withdrawFromNetwork(identifiers)
}
