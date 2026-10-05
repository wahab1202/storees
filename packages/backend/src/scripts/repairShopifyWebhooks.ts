/**
 * Repair Shopify webhook subscriptions for connected projects.
 * Run: npm run shopify:repair-webhooks -- [projectId | shop-domain | --all]
 *
 * Why this exists: webhook addresses are baked into Shopify at subscription
 * time. Whenever SHOPIFY_APP_URL changes — a domain migration, a move behind a
 * new host, a dev tunnel that rotated — every existing subscription keeps
 * delivering to the old address, which means the shop's events silently stop
 * arriving. Shopify also removes subscriptions itself after a run of delivery
 * failures. Until now the only way back was a full reconnect, which re-enters
 * credentials and re-runs the whole historical sync.
 *
 * This re-mints the token from the credentials already stored on the project
 * and calls the same registerWebhooks() the connect flow uses, so subscriptions
 * are reconciled against the current address: correct ones kept, stale ones
 * removed, missing ones created. No sync is triggered.
 */

import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db, pool } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { decrypt, encrypt } from '../services/encryption.js'
import { mintShopifyToken, registerWebhooks } from '../services/shopifyService.js'

type CustomApp = { clientId?: string; clientSecret?: string }

const target = process.argv[2]

if (!target) {
  console.error('Usage: npm run shopify:repair-webhooks -- <projectId | shop-domain | --all>')
  process.exit(1)
}

const appUrl = process.env.SHOPIFY_APP_URL ?? process.env.APP_URL
if (!appUrl) {
  console.error('SHOPIFY_APP_URL (or APP_URL) is not set — there is no address to point webhooks at.')
  process.exit(1)
}

const all = await db
  .select({ id: projects.id, name: projects.name, shop: projects.shopifyDomain, settings: projects.settings })
  .from(projects)

const connected = all.filter(p => p.shop)
const chosen =
  target === '--all'
    ? connected
    : connected.filter(p => p.id === target || p.shop === target || p.shop?.startsWith(`${target}.`))

if (chosen.length === 0) {
  console.error(
    target === '--all'
      ? 'No project has a Shopify store connected.'
      : `No Shopify-connected project matches "${target}". Connected: ${connected.map(p => p.shop).join(', ') || '(none)'}`,
  )
  await pool.end()
  process.exit(1)
}

console.log(`Address webhooks will point at: ${appUrl}/api/webhooks/shopify/<projectId>\n`)

let repaired = 0
let skipped = 0

for (const p of chosen) {
  console.log(`── ${p.name} (${p.shop})`)

  const custom = ((p.settings as Record<string, unknown> | null)?.shopifyCustomApp ?? null) as CustomApp | null
  if (!custom?.clientId || !custom?.clientSecret) {
    // OAuth-installed stores hold no client secret here, so there is nothing to
    // re-mint from; the merchant has to reinstall to refresh the token.
    console.log('   skipped — no stored app credentials (connect the store again to repair)\n')
    skipped++
    continue
  }

  try {
    const minted = await mintShopifyToken(p.shop!, custom.clientId, decrypt(custom.clientSecret))
    await db
      .update(projects)
      .set({ shopifyAccessToken: encrypt(minted.accessToken), updatedAt: new Date() })
      .where(eq(projects.id, p.id))

    await registerWebhooks(p.shop!, minted.accessToken, p.id)
    console.log('   done\n')
    repaired++
  } catch (e) {
    console.error(`   failed — ${(e as Error).message}\n`)
    skipped++
  }
}

console.log(`${repaired} store(s) repaired, ${skipped} skipped.`)
await pool.end()
