import crypto from 'crypto'
import type { ChannelProvider } from '../channelProviderRegistry.js'
import type { SendCommand } from '@storees/shared'
import { db } from '../../db/connection.js'
import { customers, emailTemplates } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

// JWT signing for Google service account OAuth2
async function getAccessToken(serviceAccountKey: string): Promise<string> {
  let sa: { client_email: string; private_key: string; token_uri: string }
  try {
    sa = JSON.parse(serviceAccountKey)
  } catch (e) {
    throw new Error(`Failed to parse service account JSON: ${(e as Error).message}`)
  }

  if (!sa.private_key || !sa.client_email) {
    throw new Error('Service account JSON missing private_key or client_email')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(sa.private_key, 'base64url')
  const jwt = `${header}.${payload}.${signature}`

  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token'
  const resp = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Google OAuth2 token request failed (${resp.status}): ${errText}`)
  }

  const data = await resp.json() as { access_token?: string; error?: string }
  if (!data.access_token) {
    throw new Error(`No access_token in Google response: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

// Cache access token (expires in 1 hour, refresh at 50 min)
let tokenCache: { token: string; expiresAt: number } | null = null

/** Firebase Cloud Messaging (FCM) Push Provider */
export const fcmProvider: ChannelProvider = {
  name: 'fcm',
  async send(command, config) {
    const { projectId, serviceAccountKey } = config

    const [customer] = await db.select({ customAttributes: customers.customAttributes }).from(customers).where(eq(customers.id, command.userId)).limit(1)
    const template = command.templateId
      ? (await db.select({ subject: emailTemplates.subject, bodyText: emailTemplates.bodyText }).from(emailTemplates).where(eq(emailTemplates.id, command.templateId)).limit(1))[0]
      : undefined

    // FCM device token stored in customer.customAttributes.fcm_token
    const fcmToken = (customer?.customAttributes as Record<string, unknown>)?.fcm_token as string
    if (!fcmToken) return { messageId: '', status: 'failed', error: 'No FCM token' }

    // Build title and body from template or variables
    let title = template?.subject ?? command.variables.title ?? 'Notification'
    let body = template?.bodyText ?? command.variables.message ?? command.variables.body ?? ''
    for (const [key, val] of Object.entries(command.variables)) {
      title = title.replaceAll(`{{${key}}}`, val)
      body = body.replaceAll(`{{${key}}}`, val)
    }

    // Get access token (cached)
    try {
      if (!tokenCache || tokenCache.expiresAt < Date.now()) {
        const token = await getAccessToken(serviceAccountKey)
        tokenCache = { token, expiresAt: Date.now() + 50 * 60 * 1000 }
      }
    } catch (err) {
      return { messageId: '', status: 'failed', error: `FCM auth failed: ${(err as Error).message}` }
    }

    const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenCache.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          data: Object.fromEntries(Object.entries(command.variables).map(([k, v]) => [k, String(v)])),
        },
      }),
    })

    const data = await resp.json() as { name?: string; error?: { message: string; code?: number; status?: string } }
    if (!resp.ok) {
      const errMsg = data.error?.message ?? `HTTP ${resp.status}`
      console.error(`[FCM] Push send failed for ${command.userId}: ${errMsg}`)
      return { messageId: '', status: 'failed', error: errMsg }
    }
    console.log(`[FCM] Push sent: ${data.name} to customer ${command.userId}`)
    return { messageId: data.name ?? '', status: 'sent' }
  },
}
