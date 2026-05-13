import { sql } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../db/connection.js'
import { products, collections, productCollections } from '../db/schema.js'

/**
 * Product catalogue service — keeps the products / collections /
 * product_collections tables fresh from the event stream.
 *
 * Two entry points:
 *   - upsertProductsFromLineItems(projectId, lineItems[])
 *       Called by customerAggregateWorker on every order_placed event.
 *       Each line item teaches us about one product (id, title, type,
 *       collection). Upsert into all three catalogue tables atomically.
 *
 *   - bulkUpsertProducts(projectId, products[])
 *       Called by POST /api/v1/import/products for explicit catalogue
 *       sync. Same upsert semantics; just a different entry path.
 *
 * Why ON CONFLICT DO UPDATE not REPLACE: products grow more attributes
 * over time (image, vendor) that may come from one source but not another.
 * Updating only non-empty incoming values preserves data already there.
 *
 * Why collection IDs are MD5-hashed names: gives a deterministic, stable
 * id per (project, name) pair without needing the source system's
 * collection-id. Same name → same row. Different sources collide on
 * intent ("Sneakers" from gwm = "Sneakers" from a CSV import).
 */

// ── Shared types ─────────────────────────────────────────────────────────

export type LineItemForCatalog = {
  product_id?: string | null
  productId?: string | null              // SDK uses camelCase, support both
  product_name?: string | null
  productName?: string | null
  product_type?: string | null
  productType?: string | null
  product_collection?: string | null
  productCollection?: string | null
  // Vertical-specific extension. Banking loan disbursed event might send
  // line_items[0].attributes = { apr: 12.5, tenure: 36 }. EdTech course
  // enrollment: { duration_weeks: 8, instructor: "Priya" }. The catalogue
  // upsert preserves these on the product row so segments can filter by
  // attributes.level = 'beginner' etc.
  attributes?: Record<string, unknown> | null
  price?: number | string | null         // per-unit price for this line item
  currency?: string | null               // ISO 4217
}

export type ProductImport = {
  product_id: string
  title?: string
  product_type?: string
  vendor?: string
  image_url?: string
  status?: 'active' | 'archived' | 'draft'
  collections?: string[]                 // collection names; auto-upserted
  // Vertical-specific metadata (banking APR, edtech instructor, etc.)
  attributes?: Record<string, unknown>
  base_price?: number
  currency?: string                      // ISO 4217
}

// ── Normalisation helpers ────────────────────────────────────────────────

function collectionIdFor(name: string): string {
  // 'coll:' prefix so collections sourced from events don't collide with
  // ids assigned by external systems (e.g. legacy 'gwm-coll:' imports).
  return `coll:${crypto.createHash('md5').update(name.toLowerCase().trim()).digest('hex')}`
}

function trimOrNull(v: string | null | undefined): string | null {
  if (!v) return null
  const t = v.trim()
  return t === '' ? null : t
}

// Coerce a line item to a normalised shape with snake_case keys.
function normaliseLineItem(item: LineItemForCatalog): {
  productId: string
  title: string | null
  productType: string | null
  collection: string | null
  attributes: Record<string, unknown> | null
  basePrice: number | null
  currency: string | null
} | null {
  const productId = trimOrNull(item.product_id ?? item.productId)
  if (!productId) return null
  const priceRaw = item.price
  const priceNum = priceRaw == null ? null
    : typeof priceRaw === 'number' ? priceRaw
    : Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : null
  return {
    productId,
    title: trimOrNull(item.product_name ?? item.productName),
    productType: trimOrNull(item.product_type ?? item.productType),
    collection: trimOrNull(item.product_collection ?? item.productCollection),
    attributes: item.attributes && typeof item.attributes === 'object' ? item.attributes : null,
    basePrice: priceNum,
    currency: trimOrNull(item.currency),
  }
}

// ── Core upsert ──────────────────────────────────────────────────────────

type UpsertResult = {
  productsUpserted: number
  collectionsUpserted: number
  linksUpserted: number
}

/**
 * Upsert a batch of (productId, title, productType, collection) tuples
 * into products + collections + product_collections. Designed to be cheap
 * to call from the event worker on every order — bulk SQL, ON CONFLICT
 * doing the heavy lifting.
 */
type NormalisedCatalogItem = {
  productId: string
  title: string | null
  productType: string | null
  collection: string | null
  attributes: Record<string, unknown> | null
  basePrice: number | null
  currency: string | null
}

async function upsertCatalogBatch(
  projectId: string,
  items: NormalisedCatalogItem[],
): Promise<UpsertResult> {
  if (items.length === 0) return { productsUpserted: 0, collectionsUpserted: 0, linksUpserted: 0 }

  // ── Phase 1: dedupe products by id (latest non-empty values win) ──
  // Same product can appear in multiple line items per batch; collapse
  // before INSERT to avoid "ON CONFLICT cannot affect row a second time".
  const byProductId = new Map<string, Omit<NormalisedCatalogItem, 'collection'>>()
  for (const item of items) {
    const existing = byProductId.get(item.productId)
    // Shallow-merge attributes so multiple line items contributing different
    // keys (e.g. one carries `apr`, another carries `tenure`) accumulate.
    const mergedAttributes = item.attributes
      ? { ...(existing?.attributes ?? {}), ...item.attributes }
      : existing?.attributes ?? null
    byProductId.set(item.productId, {
      productId: item.productId,
      title: item.title ?? existing?.title ?? null,
      productType: item.productType ?? existing?.productType ?? null,
      attributes: mergedAttributes,
      basePrice: item.basePrice ?? existing?.basePrice ?? null,
      currency: item.currency ?? existing?.currency ?? null,
    })
  }

  const productRows = Array.from(byProductId.values()).map(p => ({
    projectId,
    shopifyProductId: p.productId.slice(0, 255),
    title: (p.title ?? 'Untitled').slice(0, 500),
    productType: (p.productType ?? '').slice(0, 255),
    vendor: '',
    imageUrl: null,
    status: 'active' as const,
    attributes: p.attributes ?? {},
    basePrice: p.basePrice != null ? p.basePrice.toString() : null,
    currency: p.currency ? p.currency.slice(0, 3) : null,
  }))

  const upsertedProducts = await db
    .insert(products)
    .values(productRows)
    .onConflictDoUpdate({
      target: [products.projectId, products.shopifyProductId],
      set: {
        // Only overwrite title if incoming is non-default — protects manually-
        // set titles from being clobbered by an event missing product_name.
        title: sql`CASE
          WHEN EXCLUDED.title <> 'Untitled' THEN EXCLUDED.title
          ELSE ${products.title}
        END`,
        productType: sql`CASE
          WHEN EXCLUDED.product_type <> '' THEN EXCLUDED.product_type
          ELSE ${products.productType}
        END`,
        // Attributes: shallow-merge incoming keys on top of existing JSONB so
        // different events contributing different fields accumulate cleanly.
        // A banking loan event might carry { apr } while a later credit-check
        // event carries { credit_score_used } — both stay on the product row.
        attributes: sql`${products.attributes} || EXCLUDED.attributes`,
        basePrice: sql`COALESCE(EXCLUDED.base_price, ${products.basePrice})`,
        currency: sql`COALESCE(EXCLUDED.currency, ${products.currency})`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: products.id, shopifyProductId: products.shopifyProductId })

  // ── Phase 2: collections (one per distinct non-null collection name) ──
  const distinctCollections = Array.from(
    new Set(items.map(i => i.collection).filter((c): c is string => c !== null)),
  )

  let collectionRowsUpserted: Array<{ id: string; shopifyCollectionId: string }> = []
  if (distinctCollections.length > 0) {
    const collectionRows = distinctCollections.map(name => ({
      projectId,
      shopifyCollectionId: collectionIdFor(name),
      title: name.slice(0, 500),
      collectionType: 'custom' as const,
    }))
    collectionRowsUpserted = await db
      .insert(collections)
      .values(collectionRows)
      .onConflictDoUpdate({
        target: [collections.projectId, collections.shopifyCollectionId],
        set: { title: sql`EXCLUDED.title`, updatedAt: new Date() },
      })
      .returning({ id: collections.id, shopifyCollectionId: collections.shopifyCollectionId })
  }

  // ── Phase 3: product_collections junction ──────────────────────────
  // For each (productId, collectionName) pair, resolve the storees ids and
  // upsert the link. Doesn't remove stale links — products accumulate
  // collection memberships over time as the source system reclassifies.
  const productIdByShopify = new Map(upsertedProducts.map(p => [p.shopifyProductId, p.id]))
  const collectionIdByShopify = new Map(collectionRowsUpserted.map(c => [c.shopifyCollectionId, c.id]))

  let linksUpserted = 0
  if (distinctCollections.length > 0) {
    const pairs: Array<{ productId: string; collectionId: string }> = []
    const seen = new Set<string>()
    for (const item of items) {
      if (!item.collection) continue
      const pid = productIdByShopify.get(item.productId.slice(0, 255))
      const cid = collectionIdByShopify.get(collectionIdFor(item.collection))
      if (!pid || !cid) continue
      const key = `${pid}:${cid}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ productId: pid, collectionId: cid })
    }
    if (pairs.length > 0) {
      const result = await db
        .insert(productCollections)
        .values(pairs)
        .onConflictDoNothing()
        .returning({ productId: productCollections.productId })
      linksUpserted = result.length
    }
  }

  return {
    productsUpserted: upsertedProducts.length,
    collectionsUpserted: collectionRowsUpserted.length,
    linksUpserted,
  }
}

// ── Public entry points ──────────────────────────────────────────────────

/**
 * Called by customerAggregateWorker when an `order_placed` event with line
 * items arrives. Best-effort — failures are logged but don't fail the
 * event-processing job (the customer-aggregate update is the contract;
 * catalogue side-effects are bonus).
 */
export async function upsertProductsFromLineItems(
  projectId: string,
  lineItems: unknown[] | undefined,
): Promise<UpsertResult> {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { productsUpserted: 0, collectionsUpserted: 0, linksUpserted: 0 }
  }

  const normalised = lineItems
    .map(item => normaliseLineItem(item as LineItemForCatalog))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (normalised.length === 0) {
    return { productsUpserted: 0, collectionsUpserted: 0, linksUpserted: 0 }
  }

  return upsertCatalogBatch(projectId, normalised)
}

/**
 * Called by POST /api/v1/import/products for explicit catalogue sync.
 * Accepts a richer shape (vendor, image_url, status, collections array)
 * but routes through the same upsert primitive. Vendor + image_url + status
 * are applied per-row directly since the line-item path doesn't carry them.
 */
export async function bulkUpsertProducts(
  projectId: string,
  inputs: ProductImport[],
): Promise<{ imported: number; errors: Array<{ index: number; error: string }> }> {
  const errors: Array<{ index: number; error: string }> = []
  const valid: ProductImport[] = []
  inputs.forEach((p, idx) => {
    const id = trimOrNull(p.product_id)
    if (!id) {
      errors.push({ index: idx, error: 'product_id required' })
      return
    }
    valid.push({ ...p, product_id: id })
  })

  if (valid.length === 0) return { imported: 0, errors }

  // First pass: rich-shape upsert for products themselves (vendor, image,
  // status, attributes, base_price, currency — fields the line-item path
  // doesn't necessarily carry but the bulk import API does).
  const productRows = valid.map(p => ({
    projectId,
    shopifyProductId: p.product_id.slice(0, 255),
    title: ((p.title?.trim() || '') || 'Untitled').slice(0, 500),
    productType: (p.product_type ?? '').slice(0, 255),
    vendor: (p.vendor ?? '').slice(0, 255),
    imageUrl: p.image_url ? p.image_url.slice(0, 2048) : null,
    status: (p.status ?? 'active') as 'active' | 'archived' | 'draft',
    attributes: p.attributes && typeof p.attributes === 'object' ? p.attributes : {},
    basePrice: p.base_price != null && Number.isFinite(p.base_price) ? p.base_price.toString() : null,
    currency: p.currency ? p.currency.slice(0, 3) : null,
  }))

  const upsertedProducts = await db
    .insert(products)
    .values(productRows)
    .onConflictDoUpdate({
      target: [products.projectId, products.shopifyProductId],
      set: {
        title: sql`CASE WHEN EXCLUDED.title <> 'Untitled' THEN EXCLUDED.title ELSE ${products.title} END`,
        productType: sql`CASE WHEN EXCLUDED.product_type <> '' THEN EXCLUDED.product_type ELSE ${products.productType} END`,
        vendor: sql`CASE WHEN EXCLUDED.vendor <> '' THEN EXCLUDED.vendor ELSE ${products.vendor} END`,
        imageUrl: sql`COALESCE(EXCLUDED.image_url, ${products.imageUrl})`,
        status: sql`EXCLUDED.status`,
        attributes: sql`${products.attributes} || EXCLUDED.attributes`,
        basePrice: sql`COALESCE(EXCLUDED.base_price, ${products.basePrice})`,
        currency: sql`COALESCE(EXCLUDED.currency, ${products.currency})`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: products.id, shopifyProductId: products.shopifyProductId })

  // Second pass: collections + junction via the shared upsertCatalogBatch.
  // Build pseudo-line-items so we reuse the dedup + link logic.
  const pseudoLineItems: NormalisedCatalogItem[] = []
  for (const p of valid) {
    const collArr = Array.isArray(p.collections) ? p.collections : []
    if (collArr.length === 0) continue
    for (const collName of collArr) {
      const name = trimOrNull(collName)
      if (!name) continue
      pseudoLineItems.push({
        productId: p.product_id,
        title: trimOrNull(p.title),
        productType: trimOrNull(p.product_type),
        collection: name,
        attributes: null,    // already applied in first pass
        basePrice: null,
        currency: null,
      })
    }
  }
  if (pseudoLineItems.length > 0) {
    await upsertCatalogBatch(projectId, pseudoLineItems)
  }

  return { imported: upsertedProducts.length, errors }
}

// ── Re-export utility for callers that need it (e.g. unit tests) ────────
export { collectionIdFor as _collectionIdFor }
