/**
 * Email-safe product block renderer (Email Engine — Step 1).
 *
 * Turns a LIST of products into table-based HTML that survives Gmail / Outlook /
 * Apple Mail: inline styles only, `<table role="presentation">` layout, no flexbox.
 * Two renderers:
 *   - renderCartLineItems() → the actual items a shopper left (image, name, qty, price)
 *   - renderProductGrid()   → a 2-up recommendation grid (image, title, price, CTA)
 *
 * These are injected into a template as a single token ({{cart_items}} /
 * {{recommended_products}}) by the senders. interpolateTemplate does NOT escape,
 * so every text/URL value is escaped HERE before it reaches the body.
 *
 * Grid cells carry class="mob-stack"; inside our seed templates (emailBase ships
 * that media query) they stack to one column on mobile, and degrade to 2-up
 * elsewhere. Empty input → empty string, so the token collapses cleanly.
 */

export type RenderableProduct = {
  title: string
  price?: string | number | null
  imageUrl?: string | null
  url?: string | null
}

export type RenderableLineItem = {
  name: string
  quantity?: number | null
  price?: string | number | null
  imageUrl?: string | null
  variant?: string | null
}

// ── escaping + formatting ──

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Encode a URL for an href/src attribute; drop anything that isn't http(s). */
function safeUrl(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) return null
  return s.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E')
}

/**
 * Format a price. Single currency (₹, en-IN) for Phase A — this is the one place
 * multi-currency support will plug in. Accepts number or decimal string; returns
 * '' for null/unparseable so the price line is simply omitted.
 */
function formatMoney(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return ''
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** A neutral placeholder tile when a product has no image, so the layout never breaks. */
function imageCell(imageUrl: string | null, alt: string, size: number): string {
  const safe = safeUrl(imageUrl)
  if (safe) {
    return `<img src="${safe}" alt="${escapeHtml(alt)}" width="${size}" style="width:${size}px;max-width:${size}px;border-radius:10px;display:block;object-fit:cover;" />`
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:10px;background:#eef0f4;"></div>`
}

// ── cart line items (what the shopper left behind) ──

export type RenderOpts = { accent?: string }
const DEFAULT_ACCENT = '#111827'

/** Only allow a hex colour as accent — keep untrusted brand data out of inline styles. */
function safeColor(value: string | undefined): string {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : DEFAULT_ACCENT
}

export function renderCartLineItems(items: RenderableLineItem[], opts?: RenderOpts): string {
  if (!Array.isArray(items) || items.length === 0) return ''
  const accent = safeColor(opts?.accent)
  const rows = items.map(item => {
    const price = formatMoney(item.price)
    const meta = [item.variant ? escapeHtml(item.variant) : '', item.quantity ? `Qty ${Number(item.quantity)}` : '']
      .filter(Boolean).join(' · ')
    return `
      <tr>
        <td width="68" style="padding:10px 12px 10px 0;vertical-align:top;">${imageCell(item.imageUrl ?? null, item.name, 60)}</td>
        <td style="padding:10px 0;vertical-align:top;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#111827;line-height:1.3;">${escapeHtml(item.name)}</p>
          ${meta ? `<p style="margin:3px 0 0;font-size:12px;color:#9ca3af;">${meta}</p>` : ''}
        </td>
        ${price ? `<td style="padding:10px 0;text-align:right;vertical-align:top;white-space:nowrap;"><span style="font-size:14px;font-weight:700;color:${accent};">${price}</span></td>` : '<td></td>'}
      </tr>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`
}

// ── recommendation grid (2-up cards) ──

function productCard(p: RenderableProduct, accent: string): string {
  const price = formatMoney(p.price)
  const href = safeUrl(p.url)
  const inner = `
    ${imageCell(p.imageUrl ?? null, p.title, 220)}
    <p style="margin:10px 0 2px;font-size:13px;font-weight:600;color:#111827;line-height:1.35;">${escapeHtml(p.title)}</p>
    ${price ? `<p style="margin:0;font-size:13px;font-weight:600;color:${accent};">${price}</p>` : ''}`
  return href
    ? `<a href="${href}" style="text-decoration:none;color:inherit;display:block;">${inner}</a>`
    : inner
}

export function renderProductGrid(products: RenderableProduct[], opts?: RenderOpts): string {
  const list = (products ?? []).filter(p => p && p.title)
  if (list.length === 0) return ''
  const accent = safeColor(opts?.accent)

  // Pair into rows of two cells; each cell is a mob-stack card.
  const cells = list.map(p => `
    <td class="mob-stack" width="50%" valign="top" style="width:50%;padding:8px;vertical-align:top;">${productCard(p, accent)}</td>`)
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += 2) {
    const pair = cells.slice(i, i + 2)
    if (pair.length === 1) pair.push('<td class="mob-stack" width="50%" style="width:50%;padding:8px;"></td>')
    rows.push(`<tr>${pair.join('')}</tr>`)
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.join('')}</table>`
}

// ── normalizers (raw event line_items → RenderableLineItem) ──

/**
 * Coerce a raw line_items array (canonical `LineItem` OR Shopify-style payload)
 * into the renderer's shape. Reads canonical keys first, then Shopify fallbacks —
 * same rule as the rest of the pipeline (see feedback_canonical_field_reads).
 */
export function normalizeLineItems(raw: unknown): RenderableLineItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((li) => {
    const o = (li ?? {}) as Record<string, unknown>
    const name = o.productName ?? o.product_name ?? o.title ?? o.name
    const imageUrl = o.imageUrl ?? o.image_url ?? o.image ?? o.imageSrc
    const variant = o.variant ?? o.variant_title ?? o.variantTitle ?? null
    const quantity = o.quantity ?? o.qty
    const price = o.price ?? o.unitPrice ?? o.unit_price
    return {
      name: name != null ? String(name) : 'Item',
      quantity: quantity != null ? Number(quantity) : null,
      price: (price as string | number | null | undefined) ?? null,
      imageUrl: imageUrl != null ? String(imageUrl) : null,
      variant: variant != null ? String(variant) : null,
    }
  }).filter(i => i.name)
}
