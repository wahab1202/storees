import crypto from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { unsubscribeTokens, emailSuppressions } from '../db/schema.js'
import { updateConsent, type ConsentChannel } from './consentService.js'

/**
 * Per-(project, customer, channel) unsubscribe tokens. Used in the
 * List-Unsubscribe header so Gmail/Yahoo can offer a one-click unsubscribe
 * button (RFC 8058, required Feb 2024+ for senders >5K/day).
 *
 * Tokens are 32-byte URL-safe random; we store them server-side rather than
 * encoding (project_id, customer_id) into a signed payload so we can revoke
 * a token by deleting the row.
 */

export async function getOrCreateToken(
  projectId: string,
  customerId: string,
  channel = 'email',
): Promise<string> {
  // Reuse existing token if one exists — avoids growing the table on every send
  const [existing] = await db
    .select({ token: unsubscribeTokens.token })
    .from(unsubscribeTokens)
    .where(and(
      eq(unsubscribeTokens.projectId, projectId),
      eq(unsubscribeTokens.customerId, customerId),
      eq(unsubscribeTokens.channel, channel),
    ))
    .limit(1)

  if (existing) return existing.token

  const token = crypto.randomBytes(32).toString('base64url')
  await db.insert(unsubscribeTokens).values({
    token,
    projectId,
    customerId,
    channel,
  })
  return token
}

/**
 * Apply an unsubscribe action: route through the unified consent service
 * (which writes to consents + customers.<channel>Subscribed + consent_audit_log
 * in one transaction) AND add the email to the suppression list.
 *
 * Defense in depth: consents tracks the customer's wishes; the suppression
 * list is the dispatcher's last-line safeguard, independent of consents (so
 * a future schema change can't accidentally re-include an unsubscribed user).
 */
export async function applyUnsubscribe(
  token: string,
  customerEmail: string | null,
  ipAddress: string | null = null,
): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await db
    .select()
    .from(unsubscribeTokens)
    .where(eq(unsubscribeTokens.token, token))
    .limit(1)

  if (!row) return { ok: false, reason: 'invalid_token' }

  const now = new Date()

  // Mark token used (idempotent — used_at only set first time)
  await db
    .update(unsubscribeTokens)
    .set({ usedAt: now })
    .where(and(eq(unsubscribeTokens.token, token), isNull(unsubscribeTokens.usedAt)))

  // Route through the consent service so the audit log gets the row that
  // DPDP / Meta WABA defence requires. Source 'one_click_unsub' makes the
  // origin clear in the audit history.
  await updateConsent(
    row.projectId,
    row.customerId,
    row.channel as ConsentChannel,
    'opt_out',
    'one_click_unsub',
    {
      purpose: 'promotional',
      consentText: 'User clicked the unsubscribe link in an email footer or used the List-Unsubscribe header (RFC 8058 one-click).',
      ipAddress: ipAddress ?? undefined,
    },
  )

  // Belt-and-braces: also drop the email into the suppression list.
  if (customerEmail) {
    await db.insert(emailSuppressions).values({
      projectId: row.projectId,
      email: customerEmail.toLowerCase().trim(),
      reason: 'unsubscribed',
      source: 'one_click_unsub',
      metadata: { token },
    }).onConflictDoNothing()
  }

  return { ok: true }
}
