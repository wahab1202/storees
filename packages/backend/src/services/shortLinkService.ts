import crypto from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { trackedLinks, messages, events } from '../db/schema.js'

/**
 * Durable short-link / click-tracking service (replaces the old in-memory map).
 *
 * Phase 1 uses a single platform base domain (SHORTLINK_BASE_URL, e.g.
 * https://go.storees.io); the per-project custom-domain layer (Phase 2) will
 * resolve the host → project and swap the base. The slug space is global-unique
 * so the redirect resolves without needing the host today.
 */

const BASE_URL = (process.env.SHORTLINK_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:3001').replace(/\/$/, '')

export type TrackedLinkInput = {
  originalUrl: string
  projectId: string
  channel?: string | null
  messageId?: string | null
  campaignId?: string | null
  customerId?: string | null
}

/** Mint a tracked short link. Returns the slug and the full public short URL. */
export async function createTrackedLink(input: TrackedLinkInput): Promise<{ slug: string; url: string }> {
  // 9 url-safe chars (~53 bits) — collision-safe for the demo; the UNIQUE
  // constraint is the backstop if two ever clash.
  const slug = crypto.randomBytes(7).toString('base64url').slice(0, 9)
  await db.insert(trackedLinks).values({
    projectId: input.projectId,
    slug,
    originalUrl: input.originalUrl,
    channel: input.channel ?? null,
    messageId: input.messageId ?? null,
    campaignId: input.campaignId ?? null,
    customerId: input.customerId ?? null,
  })
  return { slug, url: `${BASE_URL}/c/${slug}` }
}

/**
 * Resolve a slug to its destination and record the click: bump link counters,
 * flip the message to 'clicked', emit a `${channel}_clicked` event, and mirror
 * the click onto the campaign recipient. Returns the original URL, or null if
 * the slug is unknown (caller 404s).
 */
export async function resolveAndLogClick(slug: string): Promise<string | null> {
  const [link] = await db.select().from(trackedLinks).where(eq(trackedLinks.slug, slug)).limit(1)
  if (!link) return null

  await db.update(trackedLinks).set({
    clickCount: sql`${trackedLinks.clickCount} + 1`,
    lastClickedAt: new Date(),
    firstClickedAt: sql`COALESCE(${trackedLinks.firstClickedAt}, NOW())`,
  }).where(eq(trackedLinks.id, link.id))

  if (link.messageId) {
    await db.execute(sql`
      UPDATE messages SET clicked_at = NOW(), status = 'clicked'
      WHERE id = ${link.messageId} AND clicked_at IS NULL
    `)
  }

  if (link.customerId) {
    const channel = link.channel ?? 'link'
    // Idempotent per slug: the first tap is the attributable click; repeat taps
    // still bump click_count above but don't double-count the campaign metric.
    await db.insert(events).values({
      projectId: link.projectId,
      customerId: link.customerId,
      eventName: `${channel}_clicked`,
      properties: { message_id: link.messageId, campaign_id: link.campaignId, url: link.originalUrl, slug },
      platform: channel,
      source: 'short_link',
      idempotencyKey: `${channel}_click_${slug}`,
      timestamp: new Date(),
    }).onConflictDoNothing()

    if (link.campaignId) {
      const { mirrorCampaignReceipt } = await import('./messageStatusService.js')
      await mirrorCampaignReceipt(link.campaignId, link.customerId, 'clicked')
    }
  }

  return link.originalUrl
}
