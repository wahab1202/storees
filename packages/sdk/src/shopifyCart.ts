import type { Logger } from './utils'

/**
 * Shopify cart bridge — stamps the current SDK session id onto the Shopify
 * cart as the `storees_sid` attribute (POST /cart/update.js).
 *
 * Why this matters: Shopify carries cart attributes into
 * `order.note_attributes` (the backend's order→session stitch reads exactly
 * that key), and hosted-checkout providers like Shopflo forward cart
 * attributes in their webhook payloads the same way. This one attribute is
 * the bridge that lets identity captured at checkout (phone/email typed on a
 * DIFFERENT domain, e.g. checkout.shopflo.co) back-attribute the anonymous
 * browsing session.
 *
 * Behavior:
 * - Idempotent per session id (in-memory + sessionStorage guard, so SPA
 *   navigations don't re-POST).
 * - Session renewals re-stamp automatically (the guard keys on the sid).
 * - Safe on non-Shopify sites: /cart/update.js 404s once, we stop trying for
 *   the rest of the page load. One tiny request, no errors surfaced.
 */
export class ShopifyCartBridge {
  private stampedSid: string | null = null
  private inflight = false
  private unavailable = false // non-Shopify page — stop trying

  constructor(
    private getSessionId: () => string,
    private log: Logger,
  ) {}

  /** Idempotent — call as often as convenient; it no-ops unless the sid changed. */
  async stamp(): Promise<void> {
    if (this.unavailable || this.inflight) return
    const sid = this.getSessionId()
    if (!sid || this.stampedSid === sid) return
    try {
      if (sessionStorage.getItem('storees_sid_stamped') === sid) {
        this.stampedSid = sid
        return
      }
    } catch { /* storage unavailable — rely on the in-memory guard */ }

    this.inflight = true
    try {
      const res = await fetch('/cart/update.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: { storees_sid: sid } }),
      })
      if (res.ok) {
        this.stampedSid = sid
        try { sessionStorage.setItem('storees_sid_stamped', sid) } catch { /* ignore */ }
        this.log.log('[cart] storees_sid stamped onto Shopify cart', sid)
      } else {
        // 404/405 → not a Shopify storefront (or AJAX API disabled)
        this.unavailable = true
        this.log.log('[cart] /cart/update.js unavailable — cart bridge off for this page')
      }
    } catch {
      // network hiccup — leave guards unset so a later trigger retries
    } finally {
      this.inflight = false
    }
  }

  /** Stamp now and keep the cart in sync with session renewals. */
  start(): void {
    void this.stamp()
    // Sessions renew after inactivity; a 30s idempotent re-check keeps the
    // cart attribute current without hooking the session lifecycle.
    setInterval(() => void this.stamp(), 30_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.stamp()
    })
  }
}
