import type { ChannelProvider } from '../channelProviderRegistry.js'
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
}
