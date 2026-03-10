import { Resend } from 'resend'

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

type SendEmailParams = {
  to: string
  subject: string
  html: string
}

/**
 * Send an email via Resend API.
 * Returns the message ID on success.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<string | null> {
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    })

    if (error) {
      console.error('Resend error:', error)
      return null
    }

    console.log(`Email sent to ${to}: ${data?.id}`)
    return data?.id ?? null
  } catch (err) {
    console.error('Email send failed:', err)
    return null
  }
}

/**
 * Replace {{variable}} placeholders in a template string with values from context.
 */
export function interpolateTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = context[key]
    return value !== undefined && value !== null ? String(value) : ''
  })
}
