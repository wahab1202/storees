import { eq } from 'drizzle-orm'
import type { BrandKit } from '@storees/shared'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { decrypt } from './encryption.js'
import { fetchShopBrand } from './shopifyService.js'
import { fetchWebsiteBrand } from './websiteBrandFetcher.js'

/**
 * Brand kit service (Email Engine Step 2).
 *
 * Pulls the store's visual identity from the connected Shopify store and
 * persists it on projects.brand_kit, so every email styles itself to the brand
 * (logo, accent colour) with no manual setup. Read-side applies neutral defaults
 * when a field is missing (see templateContext brand_* tokens), so a store with
 * no brand set still sends a clean email.
 */

/** Neutral fallbacks used wherever a brand field is absent. */
export const DEFAULT_BRAND = {
  primaryColor: '#1f2937',
  accentColor: '#4f46e5',
  fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
} as const

/** Read the stored brand kit for a project (null when never synced). */
export async function getBrandKit(projectId: string): Promise<BrandKit | null> {
  const [row] = await db
    .select({ brandKit: projects.brandKit })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  return (row?.brandKit as BrandKit | null) ?? null
}

/**
 * Fetch brand assets from Shopify and persist them. Pass `shop`/`accessToken`
 * when already in hand (OAuth connect); otherwise they're loaded + decrypted from
 * the project. A non-Shopify or unconnected project is a no-op (returns current).
 * Never throws for a missing brand — fetchShopBrand returns nulls and we persist
 * what we got, stamped with source + syncedAt.
 */
export async function syncBrandKit(
  projectId: string,
  opts?: { shop?: string; accessToken?: string },
): Promise<BrandKit | null> {
  let shop = opts?.shop
  let accessToken = opts?.accessToken

  if (!shop || !accessToken) {
    const [row] = await db
      .select({ domain: projects.shopifyDomain, token: projects.shopifyAccessToken })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!row?.domain || !row.token) return getBrandKit(projectId) // not connected → leave as-is
    shop = row.domain
    try {
      accessToken = decrypt(row.token)
    } catch {
      return getBrandKit(projectId) // can't decrypt (e.g. no ENCRYPTION_KEY) → leave as-is
    }
  }

  const brand = await fetchShopBrand(shop, accessToken)
  return persistMerged(projectId, brand, 'shopify')
}

/**
 * Universal brand source for non-Shopify verticals (fintech, edtech, SaaS,
 * custom) — and a manual "scan my site" for anyone. Derives logo + accent + name
 * from the given website. Throws on a bad/blocked URL so the caller can surface it.
 */
export async function syncBrandFromUrl(projectId: string, url: string): Promise<BrandKit> {
  const brand = await fetchWebsiteBrand(url)
  return persistMerged(projectId, { logoUrl: brand.logoUrl, accentColor: brand.accentColor }, 'website')
}

/**
 * Merge freshly-fetched values over the existing kit and persist. Only non-null
 * incoming values overwrite — so re-syncing never wipes a field (or a manual
 * override) with a provider that happened to return nothing this time.
 */
async function persistMerged(
  projectId: string,
  incoming: Partial<Pick<BrandKit, 'logoUrl' | 'primaryColor' | 'accentColor' | 'slogan'>>,
  source: NonNullable<BrandKit['source']>,
): Promise<BrandKit> {
  const existing = await getBrandKit(projectId)
  const kit: BrandKit = {
    logoUrl: incoming.logoUrl ?? existing?.logoUrl ?? null,
    primaryColor: incoming.primaryColor ?? existing?.primaryColor ?? null,
    accentColor: incoming.accentColor ?? existing?.accentColor ?? null,
    slogan: incoming.slogan ?? existing?.slogan ?? null,
    fontFamily: existing?.fontFamily ?? null,
    source,
    syncedAt: new Date().toISOString(),
  }
  await db.update(projects).set({ brandKit: kit, updatedAt: new Date() }).where(eq(projects.id, projectId))
  return kit
}

/** Apply a manual edit from the settings UI, merged over the current kit. */
export async function updateBrandKit(projectId: string, patch: Partial<BrandKit>): Promise<BrandKit> {
  const existing = (await getBrandKit(projectId)) ?? {}
  const kit: BrandKit = {
    ...existing,
    ...patch,
    source: 'manual',
    syncedAt: new Date().toISOString(),
  }
  await db.update(projects).set({ brandKit: kit, updatedAt: new Date() }).where(eq(projects.id, projectId))
  return kit
}
