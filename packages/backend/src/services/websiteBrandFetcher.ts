/**
 * Website brand extractor (Email Engine Step 2 — universal source).
 *
 * Shopify stores get structured brand data from shop.brand; every OTHER vertical
 * (fintech, edtech, SaaS, custom) has a website, so we derive the brand from it:
 *   logo   ← og:image / apple-touch-icon / <link rel="icon"> / favicon.ico
 *   accent ← <meta name="theme-color">
 *   name   ← og:site_name / <title>
 *
 * `extractBrandFromHtml` is pure (no network) so it's fully testable. `fetchWebsiteBrand`
 * wraps it with a guarded fetch: http(s) only, internal/loopback hosts refused
 * (SSRF), a timeout, and a response-size cap.
 */

export type WebsiteBrand = {
  logoUrl: string | null
  accentColor: string | null
  name: string | null
}

const HEX = /^#[0-9a-fA-F]{3,8}$/

function firstMatch(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(html)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

/** Resolve a possibly-relative URL against the page origin; http(s) only. */
function absoluteUrl(href: string | null, baseUrl: string): string | null {
  if (!href) return null
  try {
    const u = new URL(href, baseUrl)
    return /^https?:$/.test(u.protocol) ? u.href : null
  } catch {
    return null
  }
}

export function extractBrandFromHtml(html: string, baseUrl: string): WebsiteBrand {
  // Only scan the <head> — body content has far too many false-positive images.
  const headMatch = /<head[\s\S]*?<\/head>/i.exec(html)
  const head = headMatch ? headMatch[0] : html.slice(0, 50_000)

  const logoHref = firstMatch(head, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i,
  ])
  const logoUrl = absoluteUrl(logoHref, baseUrl) ?? absoluteUrl('/favicon.ico', baseUrl)

  const themeColor = firstMatch(head, [
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
  ])
  const accentColor = themeColor && HEX.test(themeColor) ? themeColor : null

  const name = firstMatch(head, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ])

  return { logoUrl, accentColor, name: name ? decodeEntities(name).trim().slice(0, 120) : null }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'")
}

// ── SSRF guard ──
// Refuse loopback / link-local / private ranges and internal hostnames. This is a
// literal-host check (no DNS resolution); the route is admin-gated and points at
// the tenant's own public site, so this blocks the obvious footguns.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h === '169.254.169.254' || h === 'metadata.google.internal') return true // cloud metadata
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true
  if (/^169\.254\./.test(h) || h === '0.0.0.0' || h === '::1') return true
  return false
}

export async function fetchWebsiteBrand(rawUrl: string): Promise<WebsiteBrand> {
  let url: URL
  try {
    url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
  } catch {
    throw new Error('Invalid website URL')
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Website URL must be http(s)')
  if (isBlockedHost(url.hostname)) throw new Error('That host is not allowed')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const res = await fetch(url.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'StoreesBrandBot/1.0', Accept: 'text/html' },
    })
    if (!res.ok) throw new Error(`Site returned ${res.status}`)
    // Read at most ~512KB of HTML — the <head> is always near the top.
    const reader = res.body?.getReader()
    if (!reader) {
      const text = await res.text()
      return extractBrandFromHtml(text.slice(0, 512 * 1024), res.url || url.href)
    }
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < 512 * 1024) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
      if (/<\/head>/i.test(Buffer.concat(chunks).toString('utf8'))) break // stop once head is in
    }
    await reader.cancel().catch(() => {})
    const html = Buffer.concat(chunks).toString('utf8')
    return extractBrandFromHtml(html, res.url || url.href)
  } finally {
    clearTimeout(timeout)
  }
}
