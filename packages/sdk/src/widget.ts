/**
 * Storees on-site opt-in widgets (Phase F2b).
 *
 * Fetches active widgets for the project from /v1/widgets, attaches the
 * configured triggers (exit-intent, time-on-page, scroll-depth, manual),
 * and renders a modal with the form when a trigger fires. On submit POSTs
 * to /v1/optin which creates the contact, records consent (with the
 * widget's exact text), and emits optin_received for flow triggering.
 *
 * Designed for tiny bundle impact: ~3KB minified. No framework, no JSX, no
 * external dependencies. Inline CSS so the merchant doesn't need to add a
 * stylesheet. Polls fonts and colours from the widget config so the look
 * matches the brand.
 */

import { createLogger } from './utils'

type WidgetConfig = {
  id: string
  name: string
  headline: string
  body: string | null
  buttonLabel: string
  consentText: string
  triggerType: 'exit_intent' | 'time_on_page' | 'scroll_depth' | 'manual'
  triggerConfig: Record<string, unknown>
  targetPages: string[]
  showOnce: boolean
  collectEmail: boolean
  collectName: boolean
  phoneRequired: boolean
  preCheckConsent: boolean
}

const SHOWN_KEY_PREFIX = 'storees_widget_shown_'

export class WidgetManager {
  private apiUrl: string
  private apiKey: string
  private logger: ReturnType<typeof createLogger>
  private widgets: WidgetConfig[] = []
  private mounted = new Set<string>()

  constructor(apiUrl: string, apiKey: string, debug: boolean) {
    this.apiUrl = apiUrl.replace(/\/$/, '')
    this.apiKey = apiKey
    this.logger = createLogger(debug)
  }

  /** Boot: fetch active widgets + arm triggers. Idempotent. */
  async init(): Promise<void> {
    if (typeof window === 'undefined') return
    try {
      const resp = await fetch(`${this.apiUrl}/api/v1/widgets`, {
        headers: { 'X-API-Key': this.apiKey },
      })
      if (!resp.ok) {
        this.logger.warn('[widget] fetch failed:', resp.status)
        return
      }
      const data = (await resp.json()) as { success: boolean; data: WidgetConfig[] }
      this.widgets = data.data ?? []
      this.logger.log(`[widget] loaded ${this.widgets.length} active widgets`)

      for (const w of this.widgets) this.armTrigger(w)
    } catch (err) {
      this.logger.warn('[widget] init failed:', err)
    }
  }

  /** Manually show a widget by name or id (`Storees('widget', 'show', 'welcome')`). */
  show(idOrName: string): void {
    const w = this.widgets.find(x => x.id === idOrName || x.name === idOrName)
    if (!w) {
      this.logger.warn('[widget] show: not found', idOrName)
      return
    }
    if (!this.shouldShow(w)) return
    this.render(w)
  }

  // ── Trigger arming ──────────────────────────────────────────

  private armTrigger(w: WidgetConfig): void {
    if (this.mounted.has(w.id)) return
    if (!this.matchesPath(w)) return

    switch (w.triggerType) {
      case 'manual':
        // No auto-arming — show() must be called explicitly
        break

      case 'time_on_page': {
        const seconds = Number((w.triggerConfig as { seconds?: number }).seconds) || 30
        const timer = window.setTimeout(() => {
          if (this.shouldShow(w)) this.render(w)
        }, seconds * 1000)
        this.mounted.add(w.id)
        // Clean up on page unload to avoid duplicate timers in SPA route changes
        window.addEventListener('beforeunload', () => window.clearTimeout(timer), { once: true })
        break
      }

      case 'scroll_depth': {
        const percent = Number((w.triggerConfig as { percent?: number }).percent) || 50
        const onScroll = () => {
          const scrolled = window.scrollY
          const max = document.documentElement.scrollHeight - window.innerHeight
          const pct = max > 0 ? (scrolled / max) * 100 : 0
          if (pct >= percent) {
            window.removeEventListener('scroll', onScroll)
            if (this.shouldShow(w)) this.render(w)
          }
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        this.mounted.add(w.id)
        break
      }

      case 'exit_intent': {
        const onLeave = (e: MouseEvent) => {
          // Mouse leaves through the top of the viewport — desktop only.
          if (e.clientY <= 0) {
            document.removeEventListener('mouseleave', onLeave)
            if (this.shouldShow(w)) this.render(w)
          }
        }
        document.addEventListener('mouseleave', onLeave)
        this.mounted.add(w.id)
        break
      }
    }
  }

  // ── Display gating ──────────────────────────────────────────

  private shouldShow(w: WidgetConfig): boolean {
    if (!w.showOnce) return true
    try {
      return localStorage.getItem(SHOWN_KEY_PREFIX + w.id) !== '1'
    } catch {
      return true
    }
  }

  private markShown(w: WidgetConfig): void {
    try {
      if (w.showOnce) localStorage.setItem(SHOWN_KEY_PREFIX + w.id, '1')
    } catch {
      // localStorage unavailable (incognito quota etc.) — ignore
    }
  }

  private matchesPath(w: WidgetConfig): boolean {
    if (!w.targetPages || w.targetPages.length === 0) return true
    const path = window.location.pathname
    for (const glob of w.targetPages) {
      // Simple glob: '*' matches any sequence. Anchor at start; require path to start with the literal prefix.
      const re = new RegExp('^' + glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
      if (re.test(path)) return true
    }
    return false
  }

  // ── Render + submit ─────────────────────────────────────────

  private render(w: WidgetConfig): void {
    if (document.getElementById(`storees-widget-${w.id}`)) return // already on screen

    const overlay = document.createElement('div')
    overlay.id = `storees-widget-${w.id}`
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'background:rgba(15,23,42,0.6)', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:16px', 'font-family:-apple-system,Segoe UI,Roboto,sans-serif',
    ].join(';')

    const card = document.createElement('div')
    card.style.cssText = [
      'background:#fff', 'border-radius:12px', 'padding:28px',
      'max-width:420px', 'width:100%', 'box-shadow:0 20px 50px rgba(0,0,0,0.25)',
      'box-sizing:border-box',
    ].join(';')

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '×'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.style.cssText = [
      'position:absolute', 'top:12px', 'right:16px',
      'background:transparent', 'border:0', 'font-size:28px',
      'color:#94a3b8', 'cursor:pointer', 'line-height:1', 'padding:4px 8px',
    ].join(';')
    closeBtn.addEventListener('click', () => {
      this.markShown(w)
      overlay.remove()
    })

    const inner = `
      <h2 style="font-size:20px;font-weight:600;margin:0 0 8px;color:#0f172a;">${escapeHtml(w.headline)}</h2>
      ${w.body ? `<p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:#475569;">${escapeHtml(w.body)}</p>` : ''}
      <form data-storees-form style="margin:0;">
        ${w.collectName ? `<label style="display:block;margin-bottom:10px;"><span style="display:block;font-size:13px;color:#475569;margin-bottom:4px;">Name</span><input name="name" type="text" autocomplete="name" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;"></label>` : ''}
        ${w.collectEmail ? `<label style="display:block;margin-bottom:10px;"><span style="display:block;font-size:13px;color:#475569;margin-bottom:4px;">Email</span><input name="email" type="email" autocomplete="email" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;"></label>` : ''}
        <label style="display:block;margin-bottom:10px;">
          <span style="display:block;font-size:13px;color:#475569;margin-bottom:4px;">Phone${w.phoneRequired ? ' *' : ''}</span>
          <input name="phone" type="tel" autocomplete="tel" ${w.phoneRequired ? 'required' : ''} placeholder="+91 9876543210" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;">
        </label>
        <!-- honeypot — bots fill every input. Hidden visually + from screen readers via aria-hidden + tabindex=-1. -->
        <input name="hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;height:0;width:0;opacity:0;">
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#64748b;margin:14px 0 16px;line-height:1.5;">
          <input name="consent" type="checkbox" ${w.preCheckConsent ? 'checked' : ''} style="margin-top:2px;flex-shrink:0;">
          <span>${escapeHtml(w.consentText)}</span>
        </label>
        <button type="submit" style="width:100%;padding:11px;background:#4F46E5;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">${escapeHtml(w.buttonLabel)}</button>
        <div data-storees-status style="margin-top:10px;text-align:center;font-size:13px;min-height:18px;"></div>
      </form>
    `
    card.style.position = 'relative'
    card.innerHTML = inner
    card.appendChild(closeBtn)
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    const form = card.querySelector('[data-storees-form]') as HTMLFormElement
    const statusEl = card.querySelector('[data-storees-status]') as HTMLElement
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(form)
      const consentChecked = (fd.get('consent') as string) === 'on'
      if (!consentChecked) {
        statusEl.style.color = '#dc2626'
        statusEl.textContent = 'Please tick the consent box to continue.'
        return
      }
      const phone = (fd.get('phone') as string)?.trim()
      if (w.phoneRequired && !phone) {
        statusEl.style.color = '#dc2626'
        statusEl.textContent = 'Phone number is required.'
        return
      }

      statusEl.style.color = '#475569'
      statusEl.textContent = 'Submitting…'
      const submitBtn = form.querySelector('button[type=submit]') as HTMLButtonElement
      submitBtn.disabled = true

      try {
        const resp = await fetch(`${this.apiUrl}/api/v1/optin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
          body: JSON.stringify({
            widgetId: w.id,
            phone,
            email: fd.get('email') ?? undefined,
            name: fd.get('name') ?? undefined,
            sourceUrl: window.location.href,
            hp: fd.get('hp') ?? undefined,
          }),
        })
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({})) as { error?: string }
          statusEl.style.color = '#dc2626'
          statusEl.textContent = body.error ?? 'Something went wrong. Please try again.'
          submitBtn.disabled = false
          return
        }
        // Success — show a thank-you, then auto-close after 2.5s
        statusEl.style.color = '#059669'
        statusEl.textContent = 'Thanks! We\'ll be in touch.'
        this.markShown(w)
        setTimeout(() => overlay.remove(), 2500)
      } catch (err) {
        statusEl.style.color = '#dc2626'
        statusEl.textContent = 'Network error. Please check your connection.'
        submitBtn.disabled = false
        this.logger.warn('[widget] submit failed:', err)
      }
    })
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
