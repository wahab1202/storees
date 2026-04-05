import { Router } from 'express'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { messages, events } from '../db/schema.js'
import crypto from 'crypto'

const router = Router()

// In-memory URL mapping (could use Redis for persistence)
const urlMap = new Map<string, { originalUrl: string; messageId: string; projectId: string; customerId: string }>()

/**
 * Generate a tracked short URL for SMS messages.
 * Call this before sending SMS to replace URLs in the body.
 */
export function createTrackedUrl(
  originalUrl: string,
  messageId: string,
  projectId: string,
  customerId: string,
  baseUrl: string,
): string {
  const trackId = crypto.randomBytes(6).toString('hex')
  urlMap.set(trackId, { originalUrl, messageId, projectId, customerId })
  return `${baseUrl}/api/t/${trackId}`
}

/**
 * Replace URLs in SMS body with tracked short URLs.
 */
export function trackUrlsInBody(
  body: string,
  messageId: string,
  projectId: string,
  customerId: string,
  baseUrl: string,
): string {
  return body.replace(
    /https?:\/\/[^\s]+/g,
    (url) => createTrackedUrl(url, messageId, projectId, customerId, baseUrl),
  )
}

/**
 * GET /api/t/:trackId — redirect to original URL + log click event
 */
router.get('/:trackId', async (req, res) => {
  const trackId = req.params.trackId as string
  const entry = urlMap.get(trackId)

  if (!entry) {
    return res.status(404).send('Link expired or not found')
  }

  // Log click event
  try {
    // Update message clicked_at
    await db.execute(sql`
      UPDATE messages SET clicked_at = NOW(), status = 'clicked'
      WHERE id = ${entry.messageId} AND clicked_at IS NULL
    `)

    // Create tracking event
    await db.insert(events).values({
      projectId: entry.projectId,
      customerId: entry.customerId,
      eventName: 'sms_clicked',
      properties: { message_id: entry.messageId, url: entry.originalUrl },
      platform: 'sms',
      source: 'url_tracker',
      idempotencyKey: `sms_click_${trackId}`,
      timestamp: new Date(),
    }).onConflictDoNothing()
  } catch (err) {
    console.error('URL tracker error:', err)
  }

  // Redirect to original URL
  res.redirect(302, entry.originalUrl)
})

export default router
