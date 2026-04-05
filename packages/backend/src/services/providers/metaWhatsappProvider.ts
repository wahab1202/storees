import type { ChannelProvider } from '../channelProviderRegistry.js'
import type { SendCommand } from '@storees/shared'
import { db } from '../../db/connection.js'
import { customers, emailTemplates } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

/** WhatsApp Cloud API (Meta) Provider */
export const metaWhatsappProvider: ChannelProvider = {
  name: 'meta',
  async send(command, config) {
    const { phoneNumberId, accessToken } = config

    const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
    const [template] = await db.select({ bodyText: emailTemplates.bodyText, subject: emailTemplates.subject }).from(emailTemplates).where(eq(emailTemplates.id, command.templateId)).limit(1)

    const to = customer?.phone
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    let body = template?.bodyText ?? ''
    for (const [key, val] of Object.entries(command.variables)) {
      body = body.replaceAll(`{{${key}}}`, val)
    }

    const resp = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    })

    const data = await resp.json() as { messages?: Array<{ id: string }>; error?: { message: string } }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.error?.message ?? `HTTP ${resp.status}` }
    return { messageId: data.messages?.[0]?.id ?? '', status: 'sent' }
  },
}
