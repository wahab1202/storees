import crypto from 'node:crypto'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { unsubscribeTokens, consents, emailSuppressions } from '../db/schema.js'

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
 * Apply an unsubscribe action: flip consents to opted_out AND add the email
 * to the suppression list (defense in depth — the suppression check is the
 * dispatcher's last-line safeguard).
 */
export async function applyUnsubscribe(
  token: string,
  customerEmail: string | null,
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

  // Upsert opted_out consent for this channel + purpose
  await db.execute(sql`
    INSERT INTO consents (project_id, customer_id, channel, purpose, status, source, revoked_at, consented_at)
    VALUES (${row.projectId}, ${row.customerId}, ${row.channel}, 'promotional', 'opted_out', 'one_click_unsub', ${now}, ${now})
    ON CONFLICT DO NOTHING
  `)
  // Also flip an existing opted_in row if present
  await db
    .update(consents)
    .set({ status: 'opted_out', revokedAt: now })
    .where(and(
      eq(consents.projectId, row.projectId),
      eq(consents.customerId, row.customerId),
      eq(consents.channel, row.channel),
      eq(consents.purpose, 'promotional'),
    ))

  // Belt-and-braces: also drop the email into the suppression list. The
  // suppression check is the dispatcher's last-line safeguard, independent
  // of consents (so a future schema change to consents can't accidentally
  // re-include this address).
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
