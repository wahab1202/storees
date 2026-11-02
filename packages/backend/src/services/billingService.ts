import { eq } from 'drizzle-orm'
import { SHOPIFY_API_VERSION } from '@storees/shared'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { decrypt } from './encryption.js'
import { invalidateEntitlements } from './entitlementService.js'

/**
 * Shopify Billing (self-serve trial → paid — Phase 3).
 *
 * Uses the Admin GraphQL `appSubscriptionCreate` mutation to start a recurring app
 * charge; the merchant approves on Shopify's confirmation page, Shopify redirects
 * back to our callback, and we verify the active subscription and flip the project
 * to a paid plan (entitlements then unlock automatically). `app_subscriptions/update`
 * keeps status in sync afterwards.
 *
 * Test mode (SHOPIFY_BILLING_TEST, default true) issues non-charging test
 * subscriptions so this works on dev/unlisted apps before App Store approval.
 */

const APP_URL = process.env.SHOPIFY_APP_URL ?? process.env.APP_URL ?? ''
const FRONTEND_URL = process.env.MERCHANT_PANEL_URL ?? process.env.FRONTEND_URL ?? ''
const BILLING_TEST = process.env.SHOPIFY_BILLING_TEST !== 'false'
const BILLING_CURRENCY = process.env.SHOPIFY_BILLING_CURRENCY ?? 'USD'

export type BillingPlan = {
  key: string          // our plan key (maps to entitlements)
  name: string         // shown to the merchant + used as the Shopify subscription name
  price: number        // per 30 days, in BILLING_CURRENCY
  interval: 'EVERY_30_DAYS' | 'ANNUAL'
  blurb: string
}

// Tune prices/features with product. These map to entitlement plans (starter/pro → full today).
export const BILLING_PLANS: BillingPlan[] = [
  { key: 'starter', name: 'Storees Starter', price: Number(process.env.PRICE_STARTER ?? 29), interval: 'EVERY_30_DAYS', blurb: 'Core WhatsApp + email marketing, automations and inbox.' },
  { key: 'pro', name: 'Storees Pro', price: Number(process.env.PRICE_PRO ?? 79), interval: 'EVERY_30_DAYS', blurb: 'Everything in Starter plus the AI chatbot, predictions and higher limits.' },
]

export function getBillingPlan(key: string): BillingPlan | undefined {
  return BILLING_PLANS.find(p => p.key === key)
}

async function shopifyGraphQL<T>(shop: string, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const resp = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await resp.json() as { data?: T; errors?: unknown }
  if (!resp.ok || json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors ?? resp.status)}`)
  }
  return json.data as T
}

async function loadShop(projectId: string): Promise<{ shop: string; token: string } | null> {
  const [row] = await db.select({ domain: projects.shopifyDomain, token: projects.shopifyAccessToken })
    .from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!row?.domain || !row.token) return null
  try { return { shop: row.domain, token: decrypt(row.token) } } catch { return null }
}

const CREATE_MUTATION = `
mutation Create($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean, $trialDays: Int) {
  appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test, trialDays: $trialDays) {
    appSubscription { id }
    confirmationUrl
    userErrors { field message }
  }
}`

/**
 * Start a subscription. Returns the Shopify confirmation URL to redirect the
 * merchant to. Shopify then redirects back to our callback on approval.
 */
export async function createSubscription(projectId: string, planKey: string): Promise<{ confirmationUrl: string }> {
  const plan = getBillingPlan(planKey)
  if (!plan) throw new Error('Unknown plan')
  const creds = await loadShop(projectId)
  if (!creds) throw new Error('Store not connected')

  const returnUrl = `${APP_URL}/api/billing/callback?projectId=${encodeURIComponent(projectId)}&plan=${encodeURIComponent(planKey)}`
  const data = await shopifyGraphQL<{ appSubscriptionCreate: { confirmationUrl: string | null; userErrors: Array<{ message: string }> } }>(
    creds.shop, creds.token, CREATE_MUTATION,
    {
      name: plan.name,
      returnUrl,
      test: BILLING_TEST,
      lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: plan.price, currencyCode: BILLING_CURRENCY }, interval: plan.interval } } }],
    },
  )
  const result = data.appSubscriptionCreate
  if (result.userErrors?.length) throw new Error(result.userErrors.map(e => e.message).join('; '))
  if (!result.confirmationUrl) throw new Error('Shopify did not return a confirmation URL')
  return { confirmationUrl: result.confirmationUrl }
}

const ACTIVE_QUERY = `
query { currentAppInstallation { activeSubscriptions { id name status } } }`

type ActiveSub = { id: string; name: string; status: string }

/** Query the shop's active subscriptions and map the name back to a plan key. */
async function fetchActiveSubscription(shop: string, token: string): Promise<ActiveSub | null> {
  const data = await shopifyGraphQL<{ currentAppInstallation: { activeSubscriptions: ActiveSub[] } }>(shop, token, ACTIVE_QUERY, {})
  const subs = data.currentAppInstallation?.activeSubscriptions ?? []
  return subs.find(s => s.status === 'ACTIVE') ?? subs[0] ?? null
}

function planKeyFromName(name: string): string {
  const match = BILLING_PLANS.find(p => p.name === name)
  return match?.key ?? 'pro'
}

/**
 * Callback after the merchant approves: verify a real active subscription exists
 * for the shop, then flip the project to that paid plan + active. Idempotent.
 */
export async function activateFromShopify(projectId: string): Promise<{ activated: boolean; plan?: string }> {
  const creds = await loadShop(projectId)
  if (!creds) return { activated: false }
  const sub = await fetchActiveSubscription(creds.shop, creds.token)
  if (!sub || sub.status !== 'ACTIVE') return { activated: false }

  const planKey = planKeyFromName(sub.name)
  await db.update(projects)
    .set({ plan: planKey, status: 'active', updatedAt: new Date() })
    .where(eq(projects.id, projectId))
  invalidateEntitlements(projectId)
  return { activated: true, plan: planKey }
}

/**
 * app_subscriptions/update webhook — keep status in sync (cancel/freeze/expire).
 * Payload carries app_subscription { name, status }. Resolves project by shop.
 */
export async function handleSubscriptionUpdate(projectId: string, payload: unknown): Promise<void> {
  const sub = (payload as { app_subscription?: { name?: string; status?: string } })?.app_subscription
  if (!sub?.status) return
  const status = sub.status.toUpperCase()
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (status === 'ACTIVE') {
    updates.plan = sub.name ? planKeyFromName(sub.name) : 'pro'
    updates.status = 'active'
  } else if (['CANCELLED', 'EXPIRED', 'FROZEN', 'DECLINED'].includes(status)) {
    // Lost the paid subscription — drop to expired so entitlements block sends.
    updates.plan = 'trial'
    updates.status = 'expired'
  } else {
    return
  }
  await db.update(projects).set(updates).where(eq(projects.id, projectId))
  invalidateEntitlements(projectId)
}
