import { Resend } from 'resend'
import type { SendCommand } from '@storees/shared'

let resend: Resend | null = null

function getResend(): Resend {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — emails will not be sent')
    }
    resend = new Resend(process.env.RESEND_API_KEY ?? '')
  }
  return resend
}

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'Storees <noreply@storees.app>'

export const resendProvider = {
  name: 'resend' as const,

  async send(command: SendCommand): Promise<{ messageId: string; status: string; error?: string }> {
    if (command.channel !== 'email') {
      return { messageId: '', status: 'failed', error: `Resend only supports email, got ${command.channel}` }
    }

    // Look up customer email — for now passed in variables
    const to = command.variables.email ?? command.variables.to
    if (!to) {
      return { messageId: '', status: 'failed', error: 'No email address in variables' }
    }

    const subject = command.variables.subject ?? 'Message from Storees'
    const html = command.variables.html ?? command.variables.body ?? ''

    try {
      const { data, error } = await getResend().emails.send({
        from: FROM_EMAIL,
        to,
        subject,
        html,
      })

      if (error) {
        return { messageId: '', status: 'failed', error: error.message }
      }

      return { messageId: data?.id ?? '', status: 'sent' }
    } catch (err) {
      return { messageId: '', status: 'failed', error: (err as Error).message }
    }
  },
}
