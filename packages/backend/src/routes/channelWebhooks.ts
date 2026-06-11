import { Router } from 'express'
import { metaWhatsappProvider } from '../services/providers/metaWhatsappProvider.js'
import { gupshupWhatsappProvider } from '../services/providers/gupshupProvider.js'
import { twilioWhatsappProvider } from '../services/providers/twilioProvider.js'
import { birdWhatsappProvider } from '../services/providers/birdProvider.js'
import { vonageWhatsappProvider } from '../services/providers/vonageProvider.js'
import {
  findProjectByMetaPhoneNumberId,
  findProjectByGupshupApp,
  findProjectByWhatsappFromNumber,
  findProjectByWabaId,
  persistInboundMessages,
} from '../services/whatsappInboundService.js'
import { handleDeliveryReceipt } from '../services/messageStatusService.js'
import { handleMetaTemplateStatusEvent } from '../services/templateStatusService.js'

const router = Router()

// ============ TWILIO WEBHOOK ============
// Twilio sends form-encoded POST with MessageSid + MessageStatus

router.post('/twilio', async (req, res) => {
  try {
    const body = req.body as Record<string, string>
    const { MessageSid, MessageStatus, From, To } = body

    // Branch 1 — outbound delivery status update (has MessageStatus)
    if (MessageStatus && MessageSid) {
      const statusMap: Record<string, 'delivered' | 'read' | 'failed'> = {
        delivered: 'delivered',
        read: 'read',
        undelivered: 'failed',
        failed: 'failed',
      }
      const mapped = statusMap[MessageStatus]
      if (mapped) {
        // SMS or WhatsApp — Twilio uses same webhook for both. Channel inferred from From prefix.
        const channel = From?.startsWith('whatsapp:') ? 'whatsapp' : 'sms'
        await handleDeliveryReceipt(MessageSid, mapped, channel, 'twilio')
      }
    }

    // Branch 2 — inbound WhatsApp message (no MessageStatus, From has whatsapp: prefix)
    if (!MessageStatus && From?.startsWith('whatsapp:') && twilioWhatsappProvider.parseInbound) {
      const parsed = twilioWhatsappProvider.parseInbound(body)
      if (parsed.length > 0 && To) {
        const projectId = await findProjectByWhatsappFromNumber(To)  // To = our business number
        if (projectId) {
          await persistInboundMessages(projectId, 'twilio', parsed)
        } else {
          console.warn(`[whatsapp/twilio] inbound received but no project matched fromNumber=${To}`)
        }
      }
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
    const payload = req.body as {
      type?: string
      app?: string
      payload?: { id?: string; type?: string; destination?: string }
    }

    // Branch 1 — delivery status updates
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

    // Branch 2 — inbound user messages
    if (payload.type === 'message' && gupshupWhatsappProvider.parseInbound) {
      const parsed = gupshupWhatsappProvider.parseInbound(payload)
      if (parsed.length > 0) {
        const projectId = payload.app ? await findProjectByGupshupApp(payload.app) : null
        if (projectId) {
          await persistInboundMessages(projectId, 'gupshup', parsed)
        } else {
          console.warn(`[whatsapp/gupshup] inbound received but no project matched app=${payload.app}`)
        }
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
    const body = req.body as { id?: string; status?: string; type?: string; message?: { to?: string; channelId?: string } }

    // Branch 1 — delivery receipt
    if (body.id && body.status) {
      const statusMap: Record<string, 'delivered' | 'read' | 'failed'> = {
        delivered: 'delivered',
        read: 'read',
        failed: 'failed',
        expired: 'failed',
      }
      const mapped = statusMap[body.status]
      if (mapped) {
        const channel = body.message?.channelId ? 'whatsapp' : 'sms'
        await handleDeliveryReceipt(body.id, mapped, channel, 'bird')
      }
    }

    // Branch 2 — inbound WhatsApp message (Conversations API: type='message.created')
    if (body.type === 'message.created' && birdWhatsappProvider.parseInbound) {
      const parsed = birdWhatsappProvider.parseInbound(body)
      if (parsed.length > 0 && body.message?.to) {
        const projectId = await findProjectByWhatsappFromNumber(body.message.to)
        if (projectId) await persistInboundMessages(projectId, 'bird', parsed)
        else console.warn(`[whatsapp/bird] inbound received but no project matched fromNumber=${body.message.to}`)
      }
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
    const body = req.body as {
      message_uuid?: string
      status?: string
      channel?: string
      message_type?: string
      from?: string
      to?: string
    }

    // Branch 1 — delivery receipt (has status)
    if (body.message_uuid && body.status) {
      const statusMap: Record<string, 'delivered' | 'read' | 'failed'> = {
        delivered: 'delivered',
        read: 'read',
        rejected: 'failed',
        failed: 'failed',
      }
      const mapped = statusMap[body.status]
      if (mapped) {
        const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'sms'
        await handleDeliveryReceipt(body.message_uuid, mapped, channel, 'vonage')
      }
    }

    // Branch 2 — inbound message (no status, has message_type + from)
    if (!body.status && body.channel === 'whatsapp' && body.message_type && body.from && vonageWhatsappProvider.parseInbound) {
      const parsed = vonageWhatsappProvider.parseInbound(body)
      if (parsed.length > 0 && body.to) {
        const projectId = await findProjectByWhatsappFromNumber(body.to)
        if (projectId) await persistInboundMessages(projectId, 'vonage', parsed)
        else console.warn(`[whatsapp/vonage] inbound received but no project matched fromNumber=${body.to}`)
      }
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('Vonage webhook error:', err)
    res.sendStatus(500)
  }
})

// ============ FCM (PUSH) — CLIENT-REPORTED EVENTS ============
// FCM has no server-side delivery webhook; the mobile SDK pings this endpoint
// when a notification is delivered or tapped, with the FCM messageId we gave it.

router.post('/fcm', async (req, res) => {
  try {
    const { messageId, status } = req.body as { messageId?: string; status?: string }

    const statusMap: Record<string, 'delivered' | 'read' | 'failed'> = {
      delivered: 'delivered',
      tapped: 'read',
      read: 'read',
      failed: 'failed',
    }

    const mapped = statusMap[status ?? '']
    if (mapped && messageId) {
      await handleDeliveryReceipt(messageId, mapped, 'push', 'fcm')
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('FCM webhook error:', err)
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

// POST — delivery receipts AND inbound messages
router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body as {
      entry?: Array<{
        id?: string  // WABA id for template events
        changes?: Array<{
          field?: string  // 'messages' | 'message_template_status_update' | ...
          value?: {
            statuses?: Array<{ id: string; status: string }>
            messages?: unknown[]
            metadata?: { phone_number_id?: string }
            // template_status_update fields
            event?: string
            message_template_id?: string | number
            message_template_name?: string
            message_template_language?: string
            reason?: string
            previous_category?: string
            new_category?: string
          }
        }>
      }>
    }

    // Branch 1 — outbound delivery status updates (existing behavior)
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

    // Branch 1b — template status updates (Phase F1b-5).
    // Meta sends these as `field: 'message_template_status_update'` with the
    // WABA id at entry[].id. We resolve the project from the WABA id and
    // hand off to the template status service which updates the row + alerts
    // on category changes.
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'message_template_status_update') continue
        const wabaId = entry.id
        if (!wabaId) continue
        const projectId = await findProjectByWabaId(wabaId)
        if (!projectId) {
          console.warn(`[whatsapp/meta] template status event for unknown WABA=${wabaId}`)
          continue
        }
        await handleMetaTemplateStatusEvent(projectId, change.value ?? {})
      }
    }

    // Branch 2 — inbound user messages
    const hasInbound = (body.entry ?? []).some(e =>
      (e.changes ?? []).some(c => (c.value?.messages ?? []).length > 0),
    )
    if (hasInbound && metaWhatsappProvider.parseInbound) {
      const parsed = metaWhatsappProvider.parseInbound(body)
      // Resolve project from the metadata.phone_number_id of any change with messages
      let projectId: string | null = null
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if ((change.value?.messages ?? []).length > 0 && change.value?.metadata?.phone_number_id) {
            projectId = await findProjectByMetaPhoneNumberId(change.value.metadata.phone_number_id)
            if (projectId) break
          }
        }
        if (projectId) break
      }
      if (projectId && parsed.length > 0) {
        await persistInboundMessages(projectId, 'meta', parsed)
      } else if (parsed.length > 0) {
        console.warn(`[whatsapp/meta] inbound received but no project matched phone_number_id`)
      }
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
    res.sendStatus(500)
  }
})

// ============ WHATSAPP (PINNACLE) WEBHOOK ============
// Pinnacle is a BSP that relays Meta's Cloud API callbacks, so the payload shape
// is identical to the Meta handler above. Two differences:
//   1. Verification is the `x-storees-secret` header we registered via setwebhook
//      (Pinnacle echoes the headers object back on every callback), not Meta's
//      hub.verify_token handshake.
//   2. Inbound messages are NOT ingested — replies stay on the Pinnacle dashboard
//      (product decision). We handle delivery status + template status only.

router.post('/whatsapp/pinnacle', async (req, res) => {
  try {
    // Verify the relayed shared secret. If PINNACLE_WEBHOOK_SECRET is unset we
    // process anyway (dev), but log it — prod must set the secret.
    const expected = process.env.PINNACLE_WEBHOOK_SECRET
    if (expected) {
      const got = req.get('x-storees-secret')
      if (got !== expected) {
        console.warn('[whatsapp/pinnacle] rejected callback: bad or missing x-storees-secret')
        return res.sendStatus(403)
      }
    } else {
      console.warn('[whatsapp/pinnacle] PINNACLE_WEBHOOK_SECRET unset — processing callback without verification')
    }

    const body = req.body as {
      entry?: Array<{
        id?: string  // WABA id for template events
        changes?: Array<{
          field?: string
          value?: {
            statuses?: Array<{ id: string; status: string }>
            event?: string
            message_template_id?: string | number
            message_template_name?: string
            message_template_language?: string
            reason?: string
            previous_category?: string
            new_category?: string
          }
        }>
      }>
    }

    // Branch 1 — outbound delivery status (the send/delivered/read/failed funnel)
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          // 'sent' is intentionally not mapped — the row is already 'sent' at
          // send time; only delivered/read/failed are real transitions here.
          const statusMap: Record<string, 'delivered' | 'read' | 'failed'> = {
            delivered: 'delivered',
            read: 'read',
            failed: 'failed',
          }
          const mapped = statusMap[status.status]
          if (mapped) {
            await handleDeliveryReceipt(status.id, mapped, 'whatsapp', 'pinnacle')
          }
        }
      }
    }

    // Branch 2 — template status updates (the authoring approval tracker)
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'message_template_status_update') continue
        const wabaId = entry.id
        if (!wabaId) continue
        const projectId = await findProjectByWabaId(wabaId)
        if (!projectId) {
          console.warn(`[whatsapp/pinnacle] template status event for unknown WABA=${wabaId}`)
          continue
        }
        await handleMetaTemplateStatusEvent(projectId, change.value ?? {})
      }
    }

    // Branch 3 — inbound user messages (replies). Pinnacle relays Meta's Cloud
    // API inbound shape, so we reuse the Meta parser + project resolution by
    // phone_number_id. (Opted into beyond the original no-inbox MVP.)
    const inbound = req.body as {
      entry?: Array<{ changes?: Array<{ field?: string; value?: { messages?: unknown[]; metadata?: { phone_number_id?: string } } }> }>
    }
    const hasInbound = (inbound.entry ?? []).some(e =>
      (e.changes ?? []).some(c => (c.value?.messages ?? []).length > 0),
    )
    if (hasInbound && metaWhatsappProvider.parseInbound) {
      const parsed = metaWhatsappProvider.parseInbound(inbound)
      let inboundProjectId: string | null = null
      for (const entry of inbound.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if ((change.value?.messages ?? []).length > 0 && change.value?.metadata?.phone_number_id) {
            inboundProjectId = await findProjectByMetaPhoneNumberId(change.value.metadata.phone_number_id)
            if (inboundProjectId) break
          }
        }
        if (inboundProjectId) break
      }
      if (inboundProjectId && parsed.length > 0) {
        await persistInboundMessages(inboundProjectId, 'pinnacle', parsed)
      } else if (parsed.length > 0) {
        console.warn('[whatsapp/pinnacle] inbound received but no project matched phone_number_id')
      }
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('Pinnacle WhatsApp webhook error:', err)
    res.sendStatus(500)
  }
})

export default router
