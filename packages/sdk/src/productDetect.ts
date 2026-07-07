/**
 * Detect a Shopify product/collection page and extract structured info, so the
 * SDK can emit `product_viewed` / `collection_viewed` (not just generic
 * page_viewed). These are what the segment engine's has_viewed operator and
 * product-affinity flows match on.
 *
 * Everything is best-effort and defensive: the handle + name (from URL/title)
 * always resolve; id/price/vendor come from Shopify's on-page data when present
 * and are simply omitted otherwise. Never throws.
 */

type ShopifyMeta = {
  product?: {
    id?: number | string
    gid?: string
    vendor?: string
    type?: string
    variants?: Array<{ id?: number | string; price?: number | string; name?: string }>
  }
  page?: { resourceType?: string; resourceId?: number | string }
}

function shopifyMeta(): ShopifyMeta | undefined {
  const w = window as unknown as { ShopifyAnalytics?: { meta?: ShopifyMeta }; meta?: ShopifyMeta }
  return w.ShopifyAnalytics?.meta ?? w.meta
}

/** Read a numeric price (major units) from JSON-LD or og/product meta tags. */
function priceFromDom(): number | undefined {
  try {
    for (const el of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      const parsed = JSON.parse(el.textContent || '{}') as { '@type'?: string; offers?: { price?: string | number } | Array<{ price?: string | number }> }
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      for (const node of nodes) {
        if (node['@type'] === 'Product' && node.offers) {
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers
          const p = Number(offer?.price)
          if (Number.isFinite(p)) return p
        }
      }
    }
  } catch { /* ignore malformed JSON-LD */ }
  const metaPrice = document.querySelector('meta[property="product:price:amount"], meta[property="og:price:amount"]')
  const p = Number(metaPrice?.getAttribute('content'))
  return Number.isFinite(p) ? p : undefined
}

export type DetectedProduct = {
  product_handle: string
  product_id?: string
  product_name: string
  price?: number
  currency?: string
  vendor?: string
  variant_id?: string
  url: string
}

/** If the current page is a product page, return structured info; else null. */
export function detectProduct(): DetectedProduct | null {
  const path = window.location.pathname
  const m = path.match(/\/products\/([^/?#]+)/)
  if (!m) return null

  const handle = decodeURIComponent(m[1])
  const meta = shopifyMeta()
  const prod = meta?.product
  const variantId = new URLSearchParams(window.location.search).get('variant') ?? undefined

  // Price: matching variant from Shopify meta (in cents) → any variant → DOM
  let price: number | undefined
  const variants = prod?.variants ?? []
  const matched = variantId ? variants.find(v => String(v.id) === variantId) : variants[0]
  if (matched?.price != null) {
    const cents = Number(matched.price)
    if (Number.isFinite(cents)) price = cents / 100
  }
  if (price === undefined) price = priceFromDom()

  const currencyMeta = document.querySelector('meta[property="product:price:currency"], meta[property="og:price:currency"]')

  return {
    product_handle: handle,
    product_id: prod?.id != null ? String(prod.id) : undefined,
    product_name: document.title.split(/\s[–|-]\s/)[0]?.trim() || handle,
    price,
    currency: currencyMeta?.getAttribute('content') ?? undefined,
    vendor: prod?.vendor,
    variant_id: variantId,
    url: window.location.href,
  }
}

/** If the current page is a collection page, return the handle; else null. */
export function detectCollection(): { collection_handle: string; url: string } | null {
  const m = window.location.pathname.match(/\/collections\/([^/?#]+)/)
  if (!m) return null
  const handle = decodeURIComponent(m[1])
  if (handle === 'all') return null
  return { collection_handle: handle, url: window.location.href }
}
