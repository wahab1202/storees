import crypto from 'node:crypto'
import { SHOPIFY_API_VERSION, SHOPIFY_WEBHOOK_TOPICS, SHOPIFY_API_DELAY_MS } from '@storees/shared'

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!
const APP_URL = process.env.APP_URL!
const FRONTEND_URL = process.env.FRONTEND_URL!

const SCOPES = 'read_customers,read_orders,read_products,read_checkouts,read_draft_orders'

export function getInstallUrl(shop: string, state: string): string {
  const redirectUri = `${APP_URL}/api/integrations/shopify/callback`
  return (
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`
  )
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<string> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed: ${response.status} ${text}`)
  }

  const data = await response.json() as { access_token: string }
  return data.access_token
}

export function verifyHmac(rawBody: Buffer, hmacHeader: string, secret: string): boolean {
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader))
  } catch {
    return false
  }
}

export function verifyOAuthHmac(query: Record<string, string>): boolean {
  const { hmac, ...params } = query
  if (!hmac) return false

  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')
  const computed = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(sorted).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac))
  } catch {
    return false
  }
}

export async function registerWebhooks(shop: string, accessToken: string, projectId: string): Promise<void> {
  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    const response = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address: `${APP_URL}/api/webhooks/shopify/${projectId}`,
            format: 'json',
          },
        }),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      console.error(`Failed to register webhook ${topic}:`, text)
    } else {
      console.log(`Registered webhook: ${topic}`)
    }

    // Rate limit: 500ms between calls (2/sec for Basic plan)
    await delay(SHOPIFY_API_DELAY_MS)
  }
}

export async function fetchShopifyApi<T>(
  shop: string,
  accessToken: string,
  path: string,
): Promise<T> {
  const response = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}${path}`,
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Shopify API error: ${response.status} ${text}`)
  }

  return response.json() as T
}

export function getCallbackRedirectUrl(connected: boolean): string {
  return `${FRONTEND_URL}/integrations?connected=${connected}`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}
