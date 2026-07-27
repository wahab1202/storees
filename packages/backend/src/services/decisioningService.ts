import { and, eq, or, inArray, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { products, productRecommendations } from '../db/schema.js'

/**
 * Decisioning service (Step 1) — the shared "what should this customer get/see"
 * brain. One resolver, consumed by flows (dynamic message content) and, later,
 * onsite storefront personalization + the /personalize relay. Nothing here is
 * brand-specific: rules + live analytics resolve per project at call time.
 */

export type RecommendedProduct = {
  productId: string       // external id (products.shopify_product_id)
  title: string
  imageUrl: string | null
  price: string | null
}

const MATCH_PRIORITY: Record<string, number> = { product: 0, product_type: 1, collection: 2 }

/**
 * Resolve the recommended product(s) for a source product, using the merchant's
 * pairing config (exact product rule wins over product_type rule), enriched with
 * catalog display fields. Empty when no rule matches (a later step can add an
 * affinity/top-seller fallback).
 */
export async function recommendForProduct(
  projectId: string,
  sourceProductId: string,
  limit = 1,
): Promise<RecommendedProduct[]> {
  const [src] = await db.select({ productType: products.productType })
    .from(products)
    .where(and(eq(products.projectId, projectId), eq(products.shopifyProductId, sourceProductId)))
    .limit(1)

  const conds = [and(eq(productRecommendations.matchType, 'product'), eq(productRecommendations.matchValue, sourceProductId))]
  if (src?.productType) {
    conds.push(and(eq(productRecommendations.matchType, 'product_type'), eq(productRecommendations.matchValue, src.productType)))
  }

  const rules = await db.select({
    matchType: productRecommendations.matchType,
    recommendProductId: productRecommendations.recommendProductId,
    rank: productRecommendations.rank,
  }).from(productRecommendations)
    .where(and(eq(productRecommendations.projectId, projectId), or(...conds)))

  // Priority: exact product rule beats product_type; then by rank. Dedup,
  // never recommend the source product back.
  const ordered = rules
    .filter(r => r.recommendProductId !== sourceProductId)
    .sort((a, b) => (MATCH_PRIORITY[a.matchType] - MATCH_PRIORITY[b.matchType]) || (a.rank - b.rank))
  const ids: string[] = []
  for (const r of ordered) {
    if (!ids.includes(r.recommendProductId)) ids.push(r.recommendProductId)
    if (ids.length >= limit) break
  }
  if (ids.length === 0) return []

  const rows = await db.select({
    productId: products.shopifyProductId,
    title: products.title,
    imageUrl: products.imageUrl,
    price: products.basePrice,
  }).from(products)
    .where(and(eq(products.projectId, projectId), inArray(products.shopifyProductId, ids)))

  // Preserve the priority order of `ids`.
  const byId = new Map(rows.map(r => [r.productId, r]))
  return ids.map(id => byId.get(id)).filter(Boolean) as RecommendedProduct[]
}

export type SocialProof = { viewers: number; buyers: number }

/**
 * Live social proof for a product — distinct viewers (last `days`) and distinct
 * buyers (last `days*3`, since purchase windows are longer). Powers dynamic
 * "500+ picked this" copy from real data instead of a hardcoded string.
 */
export async function socialProof(projectId: string, productId: string, days = 30): Promise<SocialProof> {
  const v = await db.execute(sql`
    SELECT COUNT(DISTINCT customer_id) AS n FROM events
    WHERE project_id = ${projectId} AND event_name = 'product_viewed'
      AND properties->>'product_id' = ${productId}
      AND timestamp > NOW() - make_interval(days => ${days})
  `)
  const b = await db.execute(sql`
    SELECT COUNT(DISTINCT o.customer_id) AS n
    FROM orders o, jsonb_array_elements(o.line_items) li
    WHERE o.project_id = ${projectId}
      AND COALESCE(li->>'product_id', li->>'productId') = ${productId}
      AND o.created_at > NOW() - make_interval(days => ${days * 3})
  `)
  return {
    viewers: Number((v.rows[0] as { n?: string })?.n ?? 0),
    buyers: Number((b.rows[0] as { n?: string })?.n ?? 0),
  }
}

/**
 * Build the decisioning template variables for a product in flow/message
 * context — the dynamic content that makes one flow serve every product:
 *   {{recommended_product}} / _image / _price / _id, {{social_proof_viewers}} /
 *   {{social_proof_buyers}}.
 * Returns only the keys it can resolve (missing rules → no recommended_* keys,
 * so the template falls back to its default).
 */
export async function buildDecisionVars(projectId: string, productId: string): Promise<Record<string, string>> {
  const [recs, proof] = await Promise.all([
    recommendForProduct(projectId, productId, 1),
    socialProof(projectId, productId),
  ])
  const vars: Record<string, string> = {
    social_proof_viewers: String(proof.viewers),
    social_proof_buyers: String(proof.buyers),
  }
  const rec = recs[0]
  if (rec) {
    vars.recommended_product = rec.title
    vars.recommended_product_id = rec.productId
    if (rec.imageUrl) vars.recommended_product_image = rec.imageUrl
    if (rec.price) vars.recommended_product_price = rec.price
  }
  return vars
}
