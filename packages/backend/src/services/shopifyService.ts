import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { SHOPIFY_API_VERSION, SHOPIFY_WEBHOOK_TOPICS, SHOPIFY_API_DELAY_MS } from '@storees/shared'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { encrypt, decrypt } from './encryption.js'

// Support both old (SHOPIFY_API_KEY) and new (SHOPIFY_CLIENT_ID) env var names
const SHOPIFY_API_KEY = process.env.SHOPIFY_CLIENT_ID ?? process.env.SHOPIFY_API_KEY!
const SHOPIFY_API_SECRET = process.env.SHOPIFY_CLIENT_SECRET ?? process.env.SHOPIFY_API_SECRET!
const APP_URL = process.env.SHOPIFY_APP_URL ?? process.env.APP_URL!
const FRONTEND_URL = process.env.MERCHANT_PANEL_URL ?? process.env.FRONTEND_URL!

const SCOPES = process.env.SHOPIFY_SCOPES ?? [
  'read_products', 'write_products',
  'read_customers', 'write_customers',
  'read_orders', 'write_orders',
  'read_inventory', 'read_locations',
  'read_product_listings', 'read_shipping', 'read_fulfillments',
  'unauthenticated_read_product_listings',
  'unauthenticated_read_customers', 'unauthenticated_write_customers',
  'unauthenticated_read_checkouts', 'unauthenticated_write_checkouts',
  'unauthenticated_read_content', 'unauthenticated_read_product_tags',
].join(',')

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
  const { data } = await fetchShopifyPage<T>(shop, accessToken, path)
  return data
}

/**
 * Fetch a Shopify REST page, returning both the body and the next-page path
 * parsed from the Link header (cursor-based pagination, Shopify API 2019-07+).
 *
 * `pathOrAbsoluteUrl` is either a path like "/products.json?limit=250" or a
 * full URL returned from a previous call's `nextPath`. We strip the host on
 * absolute URLs so caller logic stays simple.
 */
export async function fetchShopifyPage<T>(
  shop: string,
  accessToken: string,
  pathOrAbsoluteUrl: string,
): Promise<{ data: T; nextPath: string | null }> {
  const url = pathOrAbsoluteUrl.startsWith('http')
    ? pathOrAbsoluteUrl
    : `https://${shop}/admin/api/${SHOPIFY_API_VERSION}${pathOrAbsoluteUrl}`

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Shopify API error: ${response.status} ${text}`)
  }

  const data = (await response.json()) as T
  const nextPath = parseNextLink(response.headers.get('link'), shop)
  return { data, nextPath }
}

/**
 * Shopify Link header format (RFC 5988):
 *   <https://shop.myshopify.com/admin/api/2024-01/products.json?limit=250&page_info=...>; rel="next",
 *   <https://shop.myshopify.com/admin/api/2024-01/products.json?limit=250&page_info=...>; rel="previous"
 *
 * Returns the relative path of the rel="next" link (so callers can pass it back
 * to fetchShopifyPage), or null if there is no next page.
 */
function parseNextLink(linkHeader: string | null, shop: string): string | null {
  if (!linkHeader) return null
  const parts = linkHeader.split(',')
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/)
    if (match) {
      const fullUrl = match[1]
      const prefix = `https://${shop}`
      return fullUrl.startsWith(prefix) ? fullUrl.slice(prefix.length) : fullUrl
    }
  }
  return null
}

export async function fetchShopInfo(shop: string, accessToken: string): Promise<{ name: string; email: string; shopOwner: string }> {
  const data = await fetchShopifyApi<{ shop: { name: string; email: string; shop_owner: string } }>(
    shop,
    accessToken,
    '/shop.json',
  )
  return {
    name: data.shop.name,
    email: data.shop.email,
    shopOwner: data.shop.shop_owner,
  }
}

export function getCallbackRedirectUrl(token: string, projectId: string): string {
  return `${FRONTEND_URL}/oauth/shopify/callback?token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(projectId)}`
}

export function getCallbackErrorUrl(error: string): string {
  return `${FRONTEND_URL}/integrations?error=${encodeURIComponent(error)}`
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

// ============ CUSTOM-DISTRIBUTION APP (client_credentials grant) ============
// Live stores can't use OAuth (it only installs on dev / published apps). A
// Dev-Dashboard custom-distribution app exposes a Client ID + secret and mints a
// short-lived (~24h) Admin API token via the client_credentials grant. There is
// no refresh token — re-mint on demand.

/** Mint an Admin API token. Throws on bad creds / app-not-installed (non-200). */
export async function mintShopifyToken(
  shop: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; scope: string; expiresInSec: number }> {
  const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Shopify rejected the credentials (HTTP ${resp.status})${text ? ` — ${text.slice(0, 200)}` : ''}. Check the client id/secret and that the app is installed on this store.`)
  }
  const data = (await resp.json()) as { access_token?: string; scope?: string; expires_in?: number }
  if (!data.access_token) throw new Error('Shopify grant returned no access token')
  return { accessToken: data.access_token, scope: data.scope ?? '', expiresInSec: data.expires_in ?? 86400 }
}

type ShopifyCustomAppCfg = { clientId: string; clientSecret: string; tokenExpiresAt?: string }

/**
 * A valid Admin API token for the project. Custom-app connections (creds in
 * settings.shopifyCustomApp) re-mint via client_credentials when the stored
 * token is missing or within 5 min of expiry, persisting the new token. Legacy
 * OAuth connections (no creds) return the stored static token as-is.
 */
export async function getValidShopifyToken(projectId: string): Promise<{ shop: string; token: string }> {
  const [p] = await db
    .select({ shopifyDomain: projects.shopifyDomain, shopifyAccessToken: projects.shopifyAccessToken, settings: projects.settings })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!p?.shopifyDomain) throw new Error('Project has no Shopify store connected')
  const shop = p.shopifyDomain
  const settings = (p.settings ?? {}) as Record<string, unknown>
  const cfg = (settings.shopifyCustomApp ?? null) as ShopifyCustomAppCfg | null

  // Legacy OAuth path — static token, no creds to re-mint with.
  if (!cfg?.clientId || !cfg?.clientSecret) {
    if (!p.shopifyAccessToken) throw new Error('No Shopify credentials configured for this project')
    return { shop, token: decrypt(p.shopifyAccessToken) }
  }

  const expiresAtMs = cfg.tokenExpiresAt ? new Date(cfg.tokenExpiresAt).getTime() : 0
  if (p.shopifyAccessToken && expiresAtMs > Date.now() + 5 * 60 * 1000) {
    return { shop, token: decrypt(p.shopifyAccessToken) }
  }

  const minted = await mintShopifyToken(shop, cfg.clientId, decrypt(cfg.clientSecret))
  const tokenExpiresAt = new Date(Date.now() + minted.expiresInSec * 1000).toISOString()
  await db.update(projects).set({
    shopifyAccessToken: encrypt(minted.accessToken),
    settings: { ...settings, shopifyCustomApp: { ...cfg, tokenExpiresAt } },
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId))
  return { shop, token: minted.accessToken }
}
