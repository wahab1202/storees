import type { EmailProvider, EmailSendCommand, EmailSendResult } from '../emailProviderRegistry.js'
import { createHash, createHmac } from 'node:crypto'

function authHeader(prefix: string, token: string | undefined): string {
  return `${prefix} ${token ?? ''}`.trim()
}

function stripDisplayName(from: string | null | undefined, fallback: string): string {
  const raw = from || fallback
  const match = raw.match(/<([^>]+)>/)
  return (match?.[1] ?? raw).trim()
}

function splitDisplayName(from: string | null | undefined, fallback: string): { name?: string; email: string } {
  const raw = from || fallback
  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (!match) return { email: raw.trim() }
  const name = match[1]?.trim()
  return { name: name || undefined, email: match[2].trim() }
}

async function readError(resp: Response): Promise<string> {
  return await resp.text().catch(() => `${resp.status} ${resp.statusText}`)
}

function attachmentNames(command: EmailSendCommand): string[] {
  return (command.attachments ?? []).map(a => a.filename)
}

export const sendgridEmailProvider: EmailProvider = {
  name: 'sendgrid',
  async send(command, config) {
    const from = splitDisplayName(command.from, config.fromEmail ?? 'noreply@storees.app')
    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: authHeader('Bearer', config.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: command.to }],
          ...(command.cc?.length ? { cc: command.cc.map(email => ({ email })) } : {}),
          ...(command.bcc?.length ? { bcc: command.bcc.map(email => ({ email })) } : {}),
          subject: command.subject,
        }],
        from,
        ...(command.replyTo ? { reply_to: { email: command.replyTo } } : {}),
        content: [{ type: 'text/html', value: command.html }],
        ...(command.attachments?.length ? {
          attachments: command.attachments.map(a => ({
            content: a.content,
            filename: a.filename,
            type: a.contentType,
            disposition: 'attachment',
          })),
        } : {}),
      }),
    })
    if (!resp.ok) throw new Error(`SendGrid error (${resp.status}): ${await readError(resp)}`)
    return { provider: 'sendgrid', messageId: resp.headers.get('x-message-id') ?? `sendgrid:${Date.now()}` }
  },
}

export const postmarkEmailProvider: EmailProvider = {
  name: 'postmark',
  async send(command, config) {
    const resp = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': config.serverToken ?? config.apiKey ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: command.from || config.fromEmail || 'noreply@storees.app',
        To: command.to,
        Subject: command.subject,
        HtmlBody: command.html,
        ...(command.replyTo ? { ReplyTo: command.replyTo } : {}),
        ...(command.cc?.length ? { Cc: command.cc.join(',') } : {}),
        ...(command.bcc?.length ? { Bcc: command.bcc.join(',') } : {}),
        ...(command.attachments?.length ? {
          Attachments: command.attachments.map(a => ({
            Name: a.filename,
            Content: a.content,
            ContentType: a.contentType,
          })),
        } : {}),
      }),
    })
    if (!resp.ok) throw new Error(`Postmark error (${resp.status}): ${await readError(resp)}`)
    const data = await resp.json() as { MessageID?: string }
    return { provider: 'postmark', messageId: data.MessageID ?? `postmark:${Date.now()}` }
  },
}

export const mailgunEmailProvider: EmailProvider = {
  name: 'mailgun',
  async send(command, config) {
    if (!config.domain) throw new Error('Mailgun domain is required')
    const form = new FormData()
    form.set('from', command.from || config.fromEmail || `Storees <mailgun@${config.domain}>`)
    form.set('to', command.to)
    form.set('subject', command.subject)
    form.set('html', command.html)
    if (command.replyTo) form.set('h:Reply-To', command.replyTo)
    for (const cc of command.cc ?? []) form.append('cc', cc)
    for (const bcc of command.bcc ?? []) form.append('bcc', bcc)
    // Node FormData cannot attach our base64 payloads as files without decoding;
    // keep the send path available and fail clearly if attachments are used.
    if (command.attachments?.length) {
      throw new Error(`Mailgun attachments are not available in this lightweight adapter: ${attachmentNames(command).join(', ')}`)
    }
    const baseUrl = config.baseUrl || 'https://api.mailgun.net'
    const resp = await fetch(`${baseUrl}/v3/${config.domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: authHeader('Basic', Buffer.from(`api:${config.apiKey ?? ''}`).toString('base64')),
      },
      body: form,
    })
    if (!resp.ok) throw new Error(`Mailgun error (${resp.status}): ${await readError(resp)}`)
    const data = await resp.json() as { id?: string }
    return { provider: 'mailgun', messageId: data.id ?? `mailgun:${Date.now()}` }
  },
}

export const sesEmailProvider: EmailProvider = {
  name: 'ses',
  async send(command, config) {
    if (command.attachments?.length) {
      throw new Error(`Amazon SES lightweight adapter does not support attachments yet: ${attachmentNames(command).join(', ')}`)
    }
    const region = config.region || 'us-east-1'
    const accessKeyId = config.accessKeyId || config.apiKey || ''
    const secretAccessKey = config.secretAccessKey || config.apiSecret || ''
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Amazon SES accessKeyId and secretAccessKey are required')
    }

    const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`
    const host = `email.${region}.amazonaws.com`
    const payload = JSON.stringify({
      FromEmailAddress: command.from || config.fromEmail || 'noreply@storees.app',
      Destination: {
        ToAddresses: [command.to],
        ...(command.cc?.length ? { CcAddresses: command.cc } : {}),
        ...(command.bcc?.length ? { BccAddresses: command.bcc } : {}),
      },
      Content: {
        Simple: {
          Subject: { Data: command.subject, Charset: 'UTF-8' },
          Body: { Html: { Data: command.html, Charset: 'UTF-8' } },
        },
      },
      ...(command.replyTo ? { ReplyToAddresses: [command.replyTo] } : {}),
    })
    const now = new Date()
    const amzDate = toAmzDate(now)
    const dateStamp = amzDate.slice(0, 8)
    const baseHeaders: Record<string, string> = {
      'content-type': 'application/json',
      host,
      'x-amz-date': amzDate,
    }
    if (config.sessionToken) baseHeaders['x-amz-security-token'] = config.sessionToken
    const signedHeaders = Object.keys(baseHeaders).sort().join(';')
    const canonicalHeaders = Object.keys(baseHeaders)
      .sort()
      .map(key => `${key}:${baseHeaders[key].trim()}\n`)
      .join('')
    const credentialScope = `${dateStamp}/${region}/ses/aws4_request`
    const canonicalRequest = [
      'POST',
      '/v2/email/outbound-emails',
      '',
      canonicalHeaders,
      signedHeaders,
      sha256(payload),
    ].join('\n')
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n')
    const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp)
    const regionKey = hmacBuffer(dateKey, region)
    const serviceKey = hmacBuffer(regionKey, 'ses')
    const signingKey = hmacBuffer(serviceKey, 'aws4_request')
    const signature = hmacHex(signingKey, stringToSign)
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...Object.fromEntries(Object.entries(baseHeaders).map(([key, value]) => [headerCase(key), value])),
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body: payload,
    })
    if (!resp.ok) throw new Error(`Amazon SES error (${resp.status}): ${await readError(resp)}`)
    const data = await resp.json() as { MessageId?: string }
    return { provider: 'ses', messageId: data.MessageId ?? `ses:${Date.now()}` }
  },
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmacBuffer(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest()
}

function hmacHex(key: string | Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex')
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function headerCase(key: string): string {
  return key.split('-').map(part => part === 'amz' ? 'AMZ' : part.charAt(0).toUpperCase() + part.slice(1)).join('-').replace('X-AMZ', 'X-Amz')
}
