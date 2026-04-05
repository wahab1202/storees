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

/** Bird (MessageBird) SMS Provider */
export const birdSmsProvider: ChannelProvider = {
  name: 'bird',
  async send(command, config) {
    const { accessKey, originator } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://rest.messagebird.com/messages', {
      method: 'POST',
      headers: {
        'Authorization': `AccessKey ${accessKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipients: [to], originator, body }),
    })

    const data = await resp.json() as { id?: string; status?: string; errors?: Array<{ description: string }> }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.errors?.[0]?.description ?? `HTTP ${resp.status}` }
    return { messageId: data.id ?? '', status: 'sent' }
  },
}

/** Bird (MessageBird) WhatsApp Provider via Conversations API */
export const birdWhatsappProvider: ChannelProvider = {
  name: 'bird',
  async send(command, config) {
    const { accessKey, channelId } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://conversations.messagebird.com/v1/conversations/start', {
      method: 'POST',
      headers: {
        'Authorization': `AccessKey ${accessKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        channelId,
        type: 'text',
        content: { text: body },
      }),
    })

    const data = await resp.json() as { id?: string; status?: string; errors?: Array<{ description: string }> }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.errors?.[0]?.description ?? `HTTP ${resp.status}` }
    return { messageId: data.id ?? '', status: 'sent' }
  },
}
