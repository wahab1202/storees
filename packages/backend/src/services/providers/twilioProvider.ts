import type { ChannelProvider, InboundMessage } from '../channelProviderRegistry.js'
import type { SendCommand } from '@storees/shared'
import { db } from '../../db/connection.js'
import { customers, emailTemplates } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

async function resolveBody(command: SendCommand): Promise<{ to: string; body: string }> {
  const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
  const template = command.templateId ? (await db.select({ bodyText: emailTemplates.bodyText }).from(emailTemplates).where(eq(emailTemplates.id, command.templateId)).limit(1))[0] : undefined

  let body = template?.bodyText ?? ''
  for (const [key, val] of Object.entries(command.variables)) {
    body = body.replaceAll(`{{${key}}}`, val)
  }

  return { to: customer?.phone ?? '', body }
}

/** Twilio SMS Provider */
export const twilioSmsProvider: ChannelProvider = {
  name: 'twilio',
  async send(command, config) {
    const { accountSid, authToken, fromNumber } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: fromNumber, To: to, Body: body }),
      },
    )

    const data = await resp.json() as { sid?: string; status?: string; message?: string }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.message ?? `HTTP ${resp.status}` }
    return { messageId: data.sid ?? '', status: data.status ?? 'queued' }
  },
}

/** Twilio WhatsApp Provider (same API, whatsapp: prefix) */
export const twilioWhatsappProvider: ChannelProvider = {
  name: 'twilio',
  async send(command, config) {
    const { accountSid, authToken, fromNumber } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: `whatsapp:${fromNumber}`, To: `whatsapp:${to}`, Body: body }),
      },
    )

    const data = await resp.json() as { sid?: string; status?: string; message?: string }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.message ?? `HTTP ${resp.status}` }
    return { messageId: data.sid ?? '', status: data.status ?? 'queued' }
  },

  /**
   * Twilio Content API template send. The template's providerTemplateId stored in our DB
   * must be the Twilio ContentSid. Params map to ContentVariables JSON keyed by '1','2',...
   */
  async sendTemplate(command, config) {
    const { accountSid, authToken, fromNumber } = config
    const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
    const to = customer?.phone
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const contentVariables: Record<string, string> = {}
    command.templateParams.forEach((v, i) => { contentVariables[String(i + 1)] = v })

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: `whatsapp:${fromNumber}`,
          To: `whatsapp:${to}`,
          ContentSid: command.templateName,
          ContentVariables: JSON.stringify(contentVariables),
        }),
      },
    )
    const data = await resp.json() as { sid?: string; status?: string; message?: string }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.message ?? `HTTP ${resp.status}` }
    return { messageId: data.sid ?? '', status: data.status ?? 'queued' }
  },

  /**
   * Twilio inbound webhook is form-encoded. Inbound messages have no MessageStatus field
   * (that field is only on outbound delivery receipts). From/To use 'whatsapp:+E164' format.
   */
  parseInbound(payload) {
    const p = payload as Record<string, string>
    if (p.MessageStatus || !p.MessageSid || !p.From) return []
    const fromPhone = p.From.replace(/^whatsapp:/, '')
    const numMedia = parseInt(p.NumMedia ?? '0', 10) || 0
    return [{
      providerMessageId: p.MessageSid,
      fromPhone,
      content: p.Body || undefined,
      mediaUrl: numMedia > 0 ? p.MediaUrl0 : undefined,
      mediaType: numMedia > 0 && p.MediaContentType0 ? p.MediaContentType0.split('/')[0] : undefined,
      rawPayload: p,
    }]
  },
}
