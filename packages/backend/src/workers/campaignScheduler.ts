/**
 * Campaign Scheduler — polls for scheduled and periodic campaigns.
 *
 * Runs every 60 seconds:
 * 1. Find campaigns with status='scheduled' and scheduledAt <= now → dispatch
 * 2. Find periodic campaigns with status='sent' that are due for next send
 */

import { db } from '../db/connection.js'
import { campaigns } from '../db/schema.js'
import { eq, and, lte, sql } from 'drizzle-orm'
import { dispatchCampaign } from '../services/campaignService.js'

const POLL_INTERVAL_MS = 60_000 // 1 minute

type PeriodicSchedule = {
  frequency: 'daily' | 'weekly' | 'monthly'
  dayOfWeek?: number
  dayOfMonth?: number
  timeOfDay?: string // "HH:mm"
}

function isPeriodicDue(schedule: PeriodicSchedule, lastSentAt: Date): boolean {
  const now = new Date()
  const hoursSinceLast = (now.getTime() - lastSentAt.getTime()) / (1000 * 60 * 60)

  switch (schedule.frequency) {
    case 'daily':
      return hoursSinceLast >= 23 // Allow 1-hour buffer
    case 'weekly': {
      if (hoursSinceLast < 6 * 24) return false // At least 6 days
      const currentDay = now.getUTCDay()
      return schedule.dayOfWeek === undefined || currentDay === schedule.dayOfWeek
    }
    case 'monthly': {
      if (hoursSinceLast < 27 * 24) return false // At least 27 days
      const currentDate = now.getUTCDate()
      return schedule.dayOfMonth === undefined || currentDate === schedule.dayOfMonth
    }
    default:
      return false
  }
}

async function pollScheduledCampaigns(): Promise<void> {
  try {
    // 1. One-time scheduled campaigns that are due
    const dueCampaigns = await db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.status, 'scheduled'),
          lte(campaigns.scheduledAt, new Date()),
        ),
      )

    for (const campaign of dueCampaigns) {
      try {
        console.log(`[scheduler] Dispatching scheduled campaign "${campaign.name}"`)
        await dispatchCampaign(campaign.id)
      } catch (err) {
        console.error(`[scheduler] Failed to dispatch "${campaign.name}":`, err)
        // Mark as draft so it doesn't retry endlessly
        await db.update(campaigns).set({
          status: 'draft',
          updatedAt: new Date(),
        }).where(eq(campaigns.id, campaign.id))
      }
    }

    // 2. Periodic campaigns that are due for re-send
    const periodicCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        periodicSchedule: campaigns.periodicSchedule,
        sentAt: campaigns.sentAt,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.deliveryType, 'periodic'),
          eq(campaigns.status, 'sent'),
          sql`${campaigns.periodicSchedule} IS NOT NULL`,
        ),
      )

    for (const campaign of periodicCampaigns) {
      if (!campaign.sentAt || !campaign.periodicSchedule) continue

      const schedule = campaign.periodicSchedule as PeriodicSchedule
      if (isPeriodicDue(schedule, campaign.sentAt)) {
        try {
          console.log(`[scheduler] Re-dispatching periodic campaign "${campaign.name}"`)
          // Reset campaign for re-send: clear old send records, reset counters
          await db.execute(sql`
            DELETE FROM campaign_sends WHERE campaign_id = ${campaign.id}
          `)
          await db.update(campaigns).set({
            status: 'scheduled',
            sentCount: 0,
            failedCount: 0,
            deliveredCount: 0,
            openedCount: 0,
            clickedCount: 0,
            bouncedCount: 0,
            complainedCount: 0,
            totalRecipients: 0,
            updatedAt: new Date(),
          }).where(eq(campaigns.id, campaign.id))

          await dispatchCampaign(campaign.id)
        } catch (err) {
          console.error(`[scheduler] Failed to re-dispatch periodic "${campaign.name}":`, err)
        }
      }
    }
  } catch (err) {
    console.error('[scheduler] Poll error:', err)
  }
}

export function startCampaignScheduler(): void {
  // Initial poll after 10s (let server start up)
  setTimeout(pollScheduledCampaigns, 10_000)

  // Then poll every minute
  setInterval(pollScheduledCampaigns, POLL_INTERVAL_MS)
  console.log('[scheduler] Campaign scheduler started (polling every 60s)')
}
