import type { ChannelProvider } from '../channelProviderRegistry.js'
import type { SendCommand } from '@storees/shared'
import { db } from '../../db/connection.js'
import { customers, emailTemplates } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

async function resolveBody(command: SendCommand): Promise<{ to: string; body: string }> {
  const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
  const [template] = await db.select({ bodyText: emailTemplates.bodyText }).from(emailTemplates).where(eq(emailTemplates.id, command.templateId)).limit(1)

  let body = template?.bodyText ?? ''
  for (const [key, val] of Object.entries(command.variables)) {
    body = body.replaceAll(`{{${key}}}`, val)
  }
  return { to: customer?.phone ?? '', body }
}

/** Vonage (Nexmo) SMS Provider — Legacy SMS API */
export const vonageSmsProvider: ChannelProvider = {
  name: 'vonage',
  async send(command, config) {
    const { apiKey, apiSecret, from } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, from: from ?? 'Storees', to, text: body }),
    })

    const data = await resp.json() as { messages: Array<{ 'message-id'?: string; status?: string; 'error-text'?: string }> }
    const msg = data.messages?.[0]
    if (msg?.status !== '0') return { messageId: '', status: 'failed', error: msg?.['error-text'] ?? 'Send failed' }
    return { messageId: msg['message-id'] ?? '', status: 'sent' }
  },
}

/** Vonage WhatsApp Provider — Messages API v1 */
export const vonageWhatsappProvider: ChannelProvider = {
  name: 'vonage',
  async send(command, config) {
    const { apiKey, apiSecret, from } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://api.nexmo.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message_type: 'text', channel: 'whatsapp', from, to, text: body }),
    })

    const data = await resp.json() as { message_uuid?: string; error?: { title?: string } }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.error?.title ?? `HTTP ${resp.status}` }
    return { messageId: data.message_uuid ?? '', status: 'sent' }
  },
}
