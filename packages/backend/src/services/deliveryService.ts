import { eq, and, sql, gte } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { messages, consents, customers, whatsappTemplates, projects } from '../db/schema.js'
import { deliveryQueue } from './queue.js'
import { buildBodyParams } from './providers/whatsappUtils.js'
import { redis } from './redis.js'
import type { SendCommand, MessageChannel } from '@storees/shared'

import { getChannelProvider } from './channelProviderRegistry.js'
import { mirrorCampaignReceipt } from './messageStatusService.js'

type DeliveryProvider = {
  name: string
  send(command: SendCommand): Promise<{ messageId: string; status: string; error?: string }>
  getStatus?(providerMessageId: string): Promise<string>
}

const providers = new Map<string, DeliveryProvider>()

export function registerProvider(name: string, provider: DeliveryProvider): void {
  providers.set(name, provider)
}

/**
 * Pre-send pipeline: consent → frequency → quiet hours → rate limit → queue.
 * Returns the message ID or null if blocked.
 */
export async function send(command: SendCommand): Promise<string | null> {
  // 0. WhatsApp category drives marketing-vs-transactional treatment. Meta/Pinnacle
  // classify each approved template: MARKETING (promotional — subject to consent +
  // the per-user marketing frequency cap, and can be silently dropped by Meta error
  // 131049) vs UTILITY/AUTHENTICATION (transactional — order/shipping/OTP, always
  // allowed, no marketing cap). Derive messageType from the template's category so
  // callers (flows, campaigns) don't have to, and a UTILITY template is never
  // wrongly marketing-capped.
  if (command.channel === 'whatsapp' && command.templateId) {
    const category = await getWhatsappTemplateCategory(command.projectId, command.templateId)
    if (category) {
      command.messageType = category === 'MARKETING' ? 'promotional' : 'transactional'
    }
  }

  // 1. Consent check
  const consented = await checkConsent(
    command.projectId,
    command.userId,
    command.channel,
    command.messageType,
  )
  if (!consented) {
    await recordMessage(command, 'blocked', 'consent_blocked')
    return null
  }

  // 2. Frequency cap check — marketing-only. Transactional sends (UTILITY/AUTH
  // WhatsApp, and any transactional email/sms) bypass it by design.
  if (!command.ignoreFrequencyCap && command.messageType !== 'transactional') {
    const capped = await checkFrequencyCap(command.projectId, command.userId, command.channel)
    if (capped) {
      await recordMessage(command, 'blocked', 'frequency_capped')
      return null
    }
  }

  // 3. Channel reachability check
  const reachable = await checkReachability(command.projectId, command.userId, command.channel)
  if (!reachable) {
    await recordMessage(command, 'blocked', 'no_channel_reachability')
    return null
  }

  // 4. Record as queued and add to delivery queue
  const messageId = await recordMessage(command, 'queued')

  await deliveryQueue.add('send', {
    messageId,
    ...command,
    scheduledAt: command.scheduledAt?.toISOString(),
  }, {
    delay: command.scheduledAt
      ? Math.max(0, command.scheduledAt.getTime() - Date.now())
      : undefined,
  })

  return messageId
}

/**
 * Actually send via provider — called by deliveryWorker.
 */
export async function executeSend(messageId: string, command: SendCommand): Promise<void> {
  try {
    // Try channel provider registry first (project-level config)
    const channelResult = await getChannelProvider(command.projectId, command.channel)

    let providerName: string
    let sendResult: { messageId: string; status: string; error?: string }

    if (channelResult) {
      providerName = channelResult.provider.name
      // Route through sendTemplate when channel=whatsapp + templateId resolves to a synced WhatsApp template
      // for this provider. Falls through to plain text send otherwise.
      const waTemplate = await resolveWhatsappTemplate(command, providerName)
      if (waTemplate && channelResult.provider.sendTemplate) {
        // Never send an empty body param — Meta rejects with #131008. Empties
        // fall back to "-" (the variable's defaultValue is already applied
        // upstream by resolveTemplateVariables; set one to avoid the dash).
        const params = buildBodyParams(waTemplate.parameterCount ?? 0, i => command.variables?.[String(i)])
        sendResult = await channelResult.provider.sendTemplate(
          {
            ...command,
            templateName: waTemplate.providerTemplateId,
            templateLanguage: waTemplate.language,
            templateParams: params,
            templateHeader: waTemplate.header,
            templateButtons: waTemplate.buttons,
          },
          channelResult.config,
        )
      } else {
        sendResult = await channelResult.provider.send(command, channelResult.config)
      }
    } else {
      // Fallback to legacy registered providers
      const legacy = providers.get('pinnacle') ?? providers.get('resend')
      if (!legacy) throw new Error(`No provider configured for channel ${command.channel}`)
      providerName = legacy.name
      sendResult = await legacy.send(command)
    }

    if (sendResult.error) {
      console.error(`Delivery failed for message ${messageId}:`, sendResult.error)
      await db.update(messages).set({
        status: 'failed',
        failedAt: new Date(),
        failureReason: String(sendResult.error).slice(0, 2000),
      }).where(eq(messages.id, messageId))
      await mirrorCampaignProviderFailure(command, String(sendResult.error))
      return
    }

    await db.update(messages).set({
      status: 'sent',
      provider: providerName,
      providerMessageId: sendResult.messageId,
      sentAt: new Date(),
    }).where(eq(messages.id, messageId))
  } catch (err) {
    console.error(`Delivery failed for message ${messageId}:`, err)
    await db.update(messages).set({
      status: 'failed',
      failedAt: new Date(),
      failureReason: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
    }).where(eq(messages.id, messageId))
    await mirrorCampaignProviderFailure(command, err instanceof Error ? err.message : String(err))
  }
}

async function mirrorCampaignProviderFailure(command: SendCommand, reason?: string | null): Promise<void> {
  if (!command.campaignId) return
  await mirrorCampaignReceipt(command.campaignId, command.userId, 'failed', reason)
}

/**
 * If the command targets WhatsApp and templateId points at a synced whatsapp_templates row
 * for this provider, return it. Returns null for plain-text sends or unknown templates.
 */
async function resolveWhatsappTemplate(
  command: SendCommand,
  providerName: string,
): Promise<{ providerTemplateId: string; name: string; language: string; parameterCount: number; header: unknown; buttons: unknown } | null> {
  if (command.channel !== 'whatsapp' || !command.templateId) return null
  const [selected] = await db
    .select({
      id: whatsappTemplates.id,
      name: whatsappTemplates.name,
      providerTemplateId: whatsappTemplates.providerTemplateId,
      language: whatsappTemplates.language,
      parameterCount: whatsappTemplates.parameterCount,
      status: whatsappTemplates.status,
      header: whatsappTemplates.header,
      buttons: whatsappTemplates.buttons,
    })
    .from(whatsappTemplates)
    .where(and(
      eq(whatsappTemplates.id, command.templateId),
      eq(whatsappTemplates.projectId, command.projectId),
      eq(whatsappTemplates.provider, providerName),
    ))
    .limit(1)
  if (!selected || selected.status !== 'APPROVED') return null

  const [customer] = await db
    .select({ customAttributes: customers.customAttributes })
    .from(customers)
    .where(eq(customers.id, command.userId))
    .limit(1)
  const attrs = (customer?.customAttributes ?? {}) as Record<string, unknown>
  const preferredLanguage = String(attrs.language ?? attrs.locale ?? '').trim()
  if (!preferredLanguage || preferredLanguage === selected.language) return selected

  const [localized] = await db
    .select({
      providerTemplateId: whatsappTemplates.providerTemplateId,
      name: whatsappTemplates.name,
      language: whatsappTemplates.language,
      parameterCount: whatsappTemplates.parameterCount,
      header: whatsappTemplates.header,
      buttons: whatsappTemplates.buttons,
    })
    .from(whatsappTemplates)
    .where(and(
      eq(whatsappTemplates.projectId, command.projectId),
      eq(whatsappTemplates.provider, providerName),
      eq(whatsappTemplates.name, selected.name),
      eq(whatsappTemplates.language, preferredLanguage),
      eq(whatsappTemplates.status, 'APPROVED'),
    ))
    .limit(1)
  return localized ?? selected
}

/**
 * Update message status from provider receipt webhook.
 */
export async function handleReceipt(
  providerMessageId: string,
  status: 'delivered' | 'read' | 'clicked' | 'failed',
): Promise<void> {
  const timestampField = {
    delivered: 'deliveredAt',
    read: 'readAt',
    clicked: 'clickedAt',
    failed: 'failedAt',
  }[status] as string

  await db.update(messages).set({
    status,
    [timestampField]: new Date(),
  }).where(eq(messages.providerMessageId, providerMessageId))
}

// ============ PRE-SEND CHECKS ============

async function checkConsent(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
  messageType: string,
): Promise<boolean> {
  // Transactional defaults to allowed unless explicitly opted out
  const cacheKey = `consent:${projectId}:${customerId}:${channel}:${messageType}`
  const cached = await redis.get(cacheKey)
  if (cached !== null) return cached === '1'

  const [record] = await db
    .select({ status: consents.status })
    .from(consents)
    .where(and(
      eq(consents.projectId, projectId),
      eq(consents.customerId, customerId),
      eq(consents.channel, channel),
      eq(consents.purpose, messageType),
    ))
    .limit(1)

  // No consent record: check customer subscription flags as fallback
  let allowed: boolean
  if (record) {
    allowed = record.status === 'opted_in'
  } else if (messageType === 'transactional') {
    allowed = true // transactional always allowed
  } else if (channel === 'push') {
    // Push is gated by the OS notification permission, which is implied by the
    // presence of a device (FCM) token. So treat "has a token OR push_subscribed"
    // as consent — explicit opt-out is the `consents` row handled above. This
    // lets push work when a third-party app only relays the token (and not a
    // separate consent flag), while dead-token pruning removes the token on
    // uninstall, which correctly revokes consent here.
    const [cust] = await db
      .select({
        sub: customers.pushSubscribed,
        token: sql<string | null>`${customers.customAttributes}->>'fcm_token'`,
      })
      .from(customers).where(eq(customers.id, customerId)).limit(1)
    allowed = cust?.sub === true || !!(cust?.token && cust.token.trim())
  } else if (channel === 'whatsapp') {
    // Opt-out model for WhatsApp (product decision): marketing is allowed by
    // default and is only blocked by an explicit opt-out. Explicit opt-outs
    // (e.g. an inbound STOP) always write an `opted_out` row to `consents`,
    // which is checked above — so the absence of a record implies consent.
    // NOTE: This is more permissive than Meta's opt-in policy. The number's
    // quality rating now depends on prompt STOP handling + dead-number pruning.
    allowed = true
  } else {
    // Fallback: check customer.{channel}_subscribed flag. Email/SMS stay opt-in
    // because their opt-out state is synced from Shopify into these flags.
    const subField: Record<string, string> = { email: 'email_subscribed', sms: 'sms_subscribed' }
    const col = subField[channel]
    if (col) {
      const [cust] = await db.select({ subscribed: sql<boolean>`${sql.raw(col)}` }).from(customers).where(eq(customers.id, customerId)).limit(1)
      allowed = cust?.subscribed ?? false
    } else {
      allowed = false
    }
  }

  await redis.set(cacheKey, allowed ? '1' : '0', 'EX', 300) // 5 min TTL
  return allowed
}

// Per-project frequency-cap config cached for 60s. Capped values rarely
// change (admin tweaks them once during onboarding) but the hot path runs
// per-send, so a DB lookup every time is wasteful.
type FreqCapConfig = { perDays: number; max: number }
const FREQ_CAP_CACHE_TTL_MS = 60_000
const freqCapCache = new Map<string, { caps: Record<string, FreqCapConfig>; expiresAt: number }>()

const DEFAULT_FREQ_CAPS: Record<string, FreqCapConfig> = {
  whatsapp_marketing: { perDays: 7, max: 1 },
  sms_marketing: { perDays: 7, max: 3 },
  email_marketing: { perDays: 1, max: 3 },
  push_marketing: { perDays: 1, max: 5 },
}

async function getProjectFreqCaps(projectId: string): Promise<Record<string, FreqCapConfig>> {
  const cached = freqCapCache.get(projectId)
  if (cached && cached.expiresAt > Date.now()) return cached.caps

  const [row] = await db
    .select({ caps: projects.frequencyCaps })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  const caps = (row?.caps as Record<string, FreqCapConfig> | null) ?? DEFAULT_FREQ_CAPS
  freqCapCache.set(projectId, { caps, expiresAt: Date.now() + FREQ_CAP_CACHE_TTL_MS })
  return caps
}

/** Resolve a WhatsApp template's Meta category (MARKETING | UTILITY |
 *  AUTHENTICATION) by its id, so the send pipeline can treat it correctly.
 *  Returns null if the template isn't found (caller keeps the given messageType). */
async function getWhatsappTemplateCategory(projectId: string, templateId: string): Promise<string | null> {
  const [row] = await db
    .select({ category: whatsappTemplates.category })
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.projectId, projectId)))
    .limit(1)
  return row?.category ?? null
}

/** Returns true if this customer has hit (or exceeded) the marketing cap on
 *  this channel. Transactional sends never reach this check — bypass is at
 *  the caller. Returning true blocks the send and flags it as `frequency_capped`. */
async function checkFrequencyCap(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
): Promise<boolean> {
  const caps = await getProjectFreqCaps(projectId)
  const cap = caps[`${channel}_marketing`]
  if (!cap || cap.max <= 0) return false // no cap configured = no limit

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(
      eq(messages.projectId, projectId),
      eq(messages.customerId, customerId),
      eq(messages.channel, channel),
      eq(messages.messageType, 'promotional'),
      eq(messages.countsTowardFrequencyCap, true),
      // Only messages that actually went out count toward the cap. Failed/blocked
      // sends never reached the customer, so they must not consume the budget
      // (otherwise a burst of failed test sends silently caps a real one).
      sql`${messages.status} NOT IN ('failed', 'blocked')`,
      gte(messages.createdAt, sql`NOW() - (${cap.perDays}::int * INTERVAL '1 day')`),
    ))

  return count >= cap.max
}

/** Test-only: clears the freq-cap cache for a project (admin UI calls this when caps change). */
export function invalidateFreqCapCache(projectId: string): void {
  freqCapCache.delete(projectId)
}

async function checkReachability(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
): Promise<boolean> {
  const [customer] = await db
    .select({
      email: customers.email,
      phone: customers.phone,
      pushSubscribed: customers.pushSubscribed,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId)))
    .limit(1)

  if (!customer) return false

  switch (channel) {
    case 'email':
      return !!customer.email
    case 'sms':
    case 'whatsapp':
      return !!customer.phone
    case 'push':
      return customer.pushSubscribed
    case 'inapp':
      return true // always reachable
    default:
      return false
  }
}

async function recordMessage(
  command: SendCommand,
  status: string,
  blockReason?: string,
): Promise<string> {
  const [msg] = await db.insert(messages).values({
    projectId: command.projectId,
    customerId: command.userId,
    channel: command.channel,
    messageType: command.messageType,
    templateId: command.templateId,
    variables: command.variables,
    status,
    blockReason: blockReason ?? null,
    countsTowardFrequencyCap: command.countForFrequencyCap ?? true,
    flowTripId: command.flowTripId ?? null,
    campaignId: command.campaignId ?? null,
    scheduledAt: command.scheduledAt ?? null,
  }).returning()

  return msg.id
}
