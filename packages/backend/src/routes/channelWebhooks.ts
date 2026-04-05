import { Router } from 'express'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { messages, events } from '../db/schema.js'

const router = Router()

// Helper: update message status + create tracking event
async function handleDeliveryReceipt(
  providerMessageId: string,
  status: 'delivered' | 'read' | 'clicked' | 'failed',
  channel: string,
  providerName: string,
) {
  const fieldMap: Record<string, string> = {
    delivered: 'delivered_at',
    read: 'read_at',
    clicked: 'clicked_at',
    failed: 'failed_at',
  }
  const statusMap: Record<string, string> = {
    delivered: 'delivered',
    read: 'read',
    clicked: 'clicked',
    failed: 'failed',
  }

  const tsField = fieldMap[status]
  if (!tsField) return

  // Find the message
  const [msg] = await db
    .select({ id: messages.id, projectId: messages.projectId, customerId: messages.customerId })
    .from(messages)
    .where(eq(messages.providerMessageId, providerMessageId))
    .limit(1)

  if (!msg) return

  // Update message timestamp (idempotent)
  await db.execute(sql`
    UPDATE messages
    SET ${sql.raw(tsField)} = NOW(),
        status = ${statusMap[status]}
    WHERE id = ${msg.id} AND ${sql.raw(tsField)} IS NULL
  `)

  // Create tracking event
  const eventName = `${channel}_${status}`
  if (msg.customerId) {
    await db.insert(events).values({
      projectId: msg.projectId,
      customerId: msg.customerId,
      eventName,
      properties: { message_id: msg.id, channel, provider: providerName },
      platform: channel,
      source: `${providerName}_webhook`,
      idempotencyKey: `${eventName}_${providerMessageId}`,
      timestamp: new Date(),
    }).onConflictDoNothing()
  }
}

// ============ TWILIO WEBHOOK ============
// Twilio sends form-encoded POST with MessageSid + MessageStatus

router.post('/twilio', async (req, res) => {
  try {
    const { MessageSid, MessageStatus } = req.body as { MessageSid: string; MessageStatus: string }

    const statusMap: Record<string, 'delivered' | 'read' | 'failed'> = {
      delivered: 'delivered',
      read: 'read',
      undelivered: 'failed',
      failed: 'failed',
    }

    const mapped = statusMap[MessageStatus]
    if (mapped && MessageSid) {
      await handleDeliveryReceipt(MessageSid, mapped, 'sms', 'twilio')
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('Twilio webhook error:', err)
    res.sendStatus(500)
  }
})

// ============ GUPSHUP WEBHOOK ============

router.post('/gupshup', async (req, res) => {
  try {
    const payload = req.body as { type?: string; payload?: { id?: string; type?: string; destination?: string } }

    if (payload.type === 'message-event' && payload.payload?.id) {
      const typeMap: Record<string, 'delivered' | 'read' | 'failed'> = {
        delivered: 'delivered',
        read: 'read',
        failed: 'failed',
      }
      const mapped = typeMap[payload.payload.type ?? '']
      if (mapped) {
        await handleDeliveryReceipt(payload.payload.id, mapped, 'whatsapp', 'gupshup')
      }
    }

    res.json({ status: 'ok' })
  } catch (err) {
    console.error('Gupshup webhook error:', err)
    res.sendStatus(500)
  }
})

// ============ BIRD (MESSAGEBIRD) WEBHOOK ============

router.post('/bird', async (req, res) => {
  try {
    const { id, status } = req.body as { id?: string; status?: string }

    const statusMap: Record<string, 'delivered' | 'read' | 'failed'> = {
      delivered: 'delivered',
      read: 'read',
      failed: 'failed',
      expired: 'failed',
    }

    const mapped = statusMap[status ?? '']
    if (mapped && id) {
      await handleDeliveryReceipt(id, mapped, 'sms', 'bird')
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('Bird webhook error:', err)
    res.sendStatus(500)
  }
})

// ============ VONAGE WEBHOOK ============

router.post('/vonage', async (req, res) => {
  try {
    const { message_uuid, status } = req.body as { message_uuid?: string; status?: string }

    const statusMap: Record<string, 'delivered' | 'read' | 'failed'> = {
      delivered: 'delivered',
      read: 'read',
      rejected: 'failed',
      failed: 'failed',
    }

    const mapped = statusMap[status ?? '']
    if (mapped && message_uuid) {
      await handleDeliveryReceipt(message_uuid, mapped, 'sms', 'vonage')
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('Vonage webhook error:', err)
    res.sendStatus(500)
  }
})

// ============ WHATSAPP (META) WEBHOOK ============

// GET — webhook verification (Meta requires this)
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    res.status(200).send(challenge)
  } else {
    res.sendStatus(403)
  }
})

// POST — delivery receipts
router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{ id: string; status: string }>
          }
        }>
      }>
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          const statusMap: Record<string, 'delivered' | 'read' | 'failed'> = {
            delivered: 'delivered',
            read: 'read',
            failed: 'failed',
          }
          const mapped = statusMap[status.status]
          if (mapped) {
            await handleDeliveryReceipt(status.id, mapped, 'whatsapp', 'meta')
          }
        }
      }
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
    res.sendStatus(500)
  }
})

export default router
