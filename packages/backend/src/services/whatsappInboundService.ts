import { eq, and, sql, inArray } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { consents, customers, events, whatsappInboundMessages } from '../db/schema.js'
import type { InboundMessage } from './channelProviderRegistry.js'

// Compliance-standard opt-out / opt-in keywords (case-insensitive, exact match after trim)
const OPT_OUT_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'OPT OUT', 'STOP ALL'])
const OPT_IN_KEYWORDS = new Set(['START', 'YES', 'SUBSCRIBE', 'OPTIN', 'OPT IN', 'UNSTOP'])

function classifyConsentIntent(content?: string): 'opt_out' | 'opt_in' | null {
  if (!content) return null
  const normalized = content.trim().toUpperCase()
  if (OPT_OUT_KEYWORDS.has(normalized)) return 'opt_out'
  if (OPT_IN_KEYWORDS.has(normalized)) return 'opt_in'
  return null
}

/**
 * Resolve a project ID from a Meta WhatsApp phone_number_id by scanning project settings.
 * Returns null if no project has this phone_number_id configured.
 */
export async function findProjectByMetaPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT id FROM projects
    WHERE settings->'channels'->'whatsapp'->'config'->>'phoneNumberId' = ${phoneNumberId}
    LIMIT 1
  `)
  const row = (result as unknown as { rows: Array<{ id: string }> }).rows[0]
  return row?.id ?? null
}

/**
 * Resolve a project ID from a Gupshup app name.
 */
export async function findProjectByGupshupApp(appName: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT id FROM projects
    WHERE settings->'channels'->'whatsapp'->'config'->>'appName' = ${appName}
    LIMIT 1
  `)
  const row = (result as unknown as { rows: Array<{ id: string }> }).rows[0]
  return row?.id ?? null
}

/**
 * Resolve a project ID from a business phone number (Twilio/Bird/Vonage WhatsApp From number).
 * Strips any 'whatsapp:' prefix before matching.
 */
export async function findProjectByWhatsappFromNumber(fromNumber: string): Promise<string | null> {
  const normalized = fromNumber.replace(/^whatsapp:/, '')
  const result = await db.execute(sql`
    SELECT id FROM projects
    WHERE settings->'channels'->'whatsapp'->'config'->>'fromNumber' = ${normalized}
    LIMIT 1
  `)
  const row = (result as unknown as { rows: Array<{ id: string }> }).rows[0]
  return row?.id ?? null
}

/**
 * Persist a batch of parsed inbound messages: lookup customer by phone, insert into
 * whatsapp_inbound_messages (idempotent on provider+providerMessageId), emit a
 * `whatsapp_inbound` event for flow conditions to evaluate.
 */
export async function persistInboundMessages(
  projectId: string,
  provider: string,
  inbound: InboundMessage[],
): Promise<{ persisted: number; matched: number }> {
  let persisted = 0
  let matched = 0

  for (const m of inbound) {
    // Try the phone as-is first, then normalize (`+` prefix added if missing) to handle providers
    // that strip the leading `+` (Vonage Messages API does this).
    const candidates = [m.fromPhone]
    if (!m.fromPhone.startsWith('+')) candidates.push(`+${m.fromPhone}`)
    else candidates.push(m.fromPhone.slice(1))
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(
        eq(customers.projectId, projectId),
        inArray(customers.phone, candidates),
      ))
      .limit(1)

    if (customer) matched++

    const inserted = await db.insert(whatsappInboundMessages).values({
      projectId,
      customerId: customer?.id ?? null,
      fromPhone: m.fromPhone,
      provider,
      providerMessageId: m.providerMessageId,
      content: m.content,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      replyTo: m.replyTo,
      rawPayload: m.rawPayload as object | null,
    }).onConflictDoNothing().returning({ id: whatsappInboundMessages.id })

    if (inserted.length > 0) persisted++

    // Emit `whatsapp_inbound` event so flow conditions can branch on replies.
    // Skip if customer wasn't matched (event_occurred conditions need customerId).
    if (inserted.length > 0 && customer) {
      await db.insert(events).values({
        projectId,
        customerId: customer.id,
        eventName: 'whatsapp_inbound',
        properties: {
          provider,
          message_id: m.providerMessageId,
          from_phone: m.fromPhone,
          content: m.content,
          media_type: m.mediaType,
          reply_to: m.replyTo,
        },
        platform: 'whatsapp',
        source: `${provider}_webhook`,
        idempotencyKey: `whatsapp_inbound_${provider}_${m.providerMessageId}`,
        timestamp: new Date(),
      }).onConflictDoNothing()

      // Compliance: STOP/UNSUBSCRIBE → flip consent + customer flag; START/YES → opt back in.
      const intent = classifyConsentIntent(m.content)
      if (intent) {
        await applyConsentChange(projectId, customer.id, provider, intent, m.providerMessageId)
      }
    }
  }

  return { persisted, matched }
}

/**
 * Update consents row + customer.whatsapp_subscribed in lockstep, attribute to the provider
 * that observed the change, and emit a tracking event for audit/reporting.
 */
async function applyConsentChange(
  projectId: string,
  customerId: string,
  provider: string,
  intent: 'opt_out' | 'opt_in',
  triggeringMessageId: string,
): Promise<void> {
  const status = intent === 'opt_out' ? 'opted_out' : 'opted_in'
  const subscribed = intent === 'opt_in'
  const now = new Date()

  // Upsert consent row keyed by (project, customer, channel, purpose). Promotional is the gate
  // for marketing sends; we record both to be safe.
  for (const purpose of ['promotional', 'transactional'] as const) {
    const [existing] = await db
      .select({ id: consents.id })
      .from(consents)
      .where(and(
        eq(consents.projectId, projectId),
        eq(consents.customerId, customerId),
        eq(consents.channel, 'whatsapp'),
        eq(consents.purpose, purpose),
      ))
      .limit(1)

    if (existing) {
      await db.update(consents).set({
        status,
        provider,
        source: 'sms',  // user-initiated keyword
        revokedAt: intent === 'opt_out' ? now : null,
        consentedAt: intent === 'opt_in' ? now : consents.consentedAt,
      }).where(eq(consents.id, existing.id))
    } else {
      await db.insert(consents).values({
        projectId,
        customerId,
        channel: 'whatsapp',
        purpose,
        status,
        provider,
        source: 'sms',
        revokedAt: intent === 'opt_out' ? now : null,
      })
    }
  }

  // Mirror to the legacy boolean flag that pre-send checkConsent() falls back to
  await db.update(customers).set({ whatsappSubscribed: subscribed, updatedAt: now }).where(eq(customers.id, customerId))

  // Emit tracking event for funnel/audit
  await db.insert(events).values({
    projectId,
    customerId,
    eventName: intent === 'opt_out' ? 'whatsapp_opted_out' : 'whatsapp_opted_in',
    properties: { provider, triggering_message_id: triggeringMessageId },
    platform: 'whatsapp',
    source: `${provider}_webhook`,
    idempotencyKey: `whatsapp_${intent}_${provider}_${triggeringMessageId}`,
    timestamp: now,
  }).onConflictDoNothing()
}
