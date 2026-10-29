import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects, adminUsers, events } from '../db/schema.js'
import { resendProvider } from './resendProvider.js'
import { invalidateEntitlements } from './entitlementService.js'

/**
 * Trial lifecycle (self-serve — Phase 2). Run daily by trialWorker:
 *  - expireTrials(): flip trialing → expired once past trial_ends_at (entitlements
 *    then block sends + premium features automatically).
 *  - sendDueTrialReminders(): email the merchant's admins when 7 / 2 / 0 days remain,
 *    once each (tracked in projects.features.trialRemindersSent).
 */

/** Flip trials whose window has closed. Returns how many expired. */
export async function expireTrials(): Promise<number> {
  const now = new Date()
  const expired = await db.update(projects)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(projects.plan, 'trial'), eq(projects.status, 'trialing'), lt(projects.trialEndsAt, now)))
    .returning({ id: projects.id })

  for (const p of expired) {
    invalidateEntitlements(p.id)
    await db.insert(events).values({
      projectId: p.id,
      eventName: 'trial_expired',
      properties: {},
      platform: 'system',
      source: 'trial-worker',
      timestamp: now,
    }).catch(() => {})
  }
  return expired.length
}

const REMINDER_DAYS = [7, 2, 0]

export function daysLeft(trialEndsAt: Date | string, now = new Date()): number {
  const end = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt)
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000))
}

/** Send any due trial reminder (7/2/0 days left), once each. Returns count sent. */
export async function sendDueTrialReminders(): Promise<number> {
  const now = new Date()
  const trials = await db
    .select({ id: projects.id, name: projects.name, trialEndsAt: projects.trialEndsAt, features: projects.features })
    .from(projects)
    .where(and(eq(projects.plan, 'trial'), eq(projects.status, 'trialing')))

  let sent = 0
  for (const p of trials) {
    if (!p.trialEndsAt) continue
    const left = daysLeft(p.trialEndsAt, now)
    if (!REMINDER_DAYS.includes(left)) continue

    const already = (((p.features as Record<string, unknown> | null)?.trialRemindersSent ?? []) as number[])
    if (already.includes(left)) continue

    const admins = await db
      .select({ email: adminUsers.email })
      .from(adminUsers)
      .where(and(eq(adminUsers.projectId, p.id), eq(adminUsers.role, 'admin')))

    const subject = left === 0 ? 'Your Storees free trial ends today' : `${left} day${left === 1 ? '' : 's'} left in your Storees free trial`
    const html = reminderHtml(p.name, left)
    for (const a of admins) {
      await resendProvider.send({
        userId: '', projectId: p.id, channel: 'email', templateId: 'system_trial_reminder',
        messageType: 'transactional', variables: { email: a.email, subject, html },
      }).catch(err => console.error(`[trial] reminder email failed for ${a.email}:`, (err as Error).message))
    }

    await db.update(projects)
      .set({
        features: sql`jsonb_set(coalesce(${projects.features}, '{}'::jsonb), '{trialRemindersSent}', ${JSON.stringify([...already, left])}::jsonb)`,
        updatedAt: now,
      })
      .where(eq(projects.id, p.id))
    sent++
  }
  return sent
}

function reminderHtml(storeName: string, left: number): string {
  const line = left === 0
    ? 'Your free trial ends today.'
    : `You have <strong>${left} day${left === 1 ? '' : 's'}</strong> left in your free trial.`
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f6ff;padding:24px;">
  <table role="presentation" width="100%"><tr><td align="center">
    <table role="presentation" width="520" style="background:#fff;border-radius:14px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 8px;font-size:20px;color:#1f2937;">${line}</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
          Keep ${storeName ? `<strong>${storeName}</strong>'s ` : 'your '}marketing running — upgrade to continue sending campaigns and unlock the AI chatbot, predictions and more.
        </p>
        <a href="mailto:sales@storees.io?subject=Upgrade%20my%20Storees%20plan" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;font-weight:700;border-radius:10px;text-decoration:none;font-size:14px;">Upgrade now</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`
}
