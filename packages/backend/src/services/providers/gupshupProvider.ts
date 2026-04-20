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

/** Gupshup SMS Provider */
export const gupshupSmsProvider: ChannelProvider = {
  name: 'gupshup',
  async send(command, config) {
    const { userid, password } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const params = new URLSearchParams({
      method: 'sendMessage',
      send_to: to,
      msg: body,
      msg_type: 'TEXT',
      userid,
      password,
      auth_scheme: 'plain',
      format: 'json',
    })

    const resp = await fetch(`https://enterprise.smsgupshup.com/GatewayAPI/rest?${params}`)
    const data = await resp.json() as { response: { id?: string; status?: string } }
    return { messageId: data.response?.id ?? '', status: data.response?.status ?? 'sent' }
  },
}

/** Gupshup WhatsApp Provider */
export const gupshupWhatsappProvider: ChannelProvider = {
  name: 'gupshup',
  async send(command, config) {
    const { apiKey, appName, sourceNumber } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
      method: 'POST',
      headers: { 'apikey': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: sourceNumber,
        destination: to,
        'src.name': appName,
        message: JSON.stringify({ type: 'text', text: body }),
      }),
    })

    const data = await resp.json() as { messageId?: string; status?: string; message?: string }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.message ?? `HTTP ${resp.status}` }
    return { messageId: data.messageId ?? '', status: 'sent' }
  },
}
