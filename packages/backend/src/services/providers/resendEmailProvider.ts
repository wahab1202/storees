import { Resend } from 'resend'
import type { EmailProvider } from '../emailProviderRegistry.js'

const clients = new Map<string, Resend>()

function getClient(apiKey: string): Resend {
  const key = apiKey || ''
  let client = clients.get(key)
  if (!client) {
    if (!apiKey) {
      console.warn('RESEND_API_KEY not set — emails will not be sent')
    }
    client = new Resend(apiKey)
    clients.set(key, client)
  }
  return client
}

export const resendEmailProvider: EmailProvider = {
  name: 'resend',
  async send(command, config) {
    const { data, error } = await getClient(config.apiKey ?? '').emails.send({
      from: command.from || config.fromEmail || 'Storees <noreply@storees.app>',
      to: command.to,
      subject: command.subject,
      html: command.html,
      ...(command.replyTo ? { replyTo: command.replyTo } : {}),
      ...(command.cc && command.cc.length > 0 ? { cc: command.cc } : {}),
      ...(command.bcc && command.bcc.length > 0 ? { bcc: command.bcc } : {}),
      ...(command.attachments && command.attachments.length > 0 ? { attachments: command.attachments } : {}),
    })

    if (error) {
      console.error('Resend error:', error)
      return null
    }

    return data?.id ? { messageId: data.id, provider: 'resend' } : null
  },
}
