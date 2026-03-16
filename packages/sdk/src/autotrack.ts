import type { StoreesSdkConfig } from './types'
import type { Logger } from './utils'
import { generateId, sessionGet, sessionSet } from './utils'
import type { EventBuilder } from './events'
import type { EventQueue } from './queue'
import type { ConsentManager } from './consent'

const SESSION_ID_KEY = 'storees_session_id'
const SESSION_START_KEY = 'storees_session_start'
const SESSION_PAGES_KEY = 'storees_session_pages'
const UTM_KEY = 'storees_utm'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

type UTMParams = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

export class AutoTracker {
  private eventBuilder: EventBuilder
  private queue: EventQueue
  private consent: ConsentManager
  private log: Logger
  private config: NonNullable<StoreesSdkConfig['autoTrack']>
  private sessionId: string
  private utmParams: UTMParams = {}
  private scrollThresholds = new Set<number>()
  private cleanupFns: Array<() => void> = []

  constructor(
    autoTrackConfig: NonNullable<StoreesSdkConfig['autoTrack']>,
    eventBuilder: EventBuilder | undefined,
    queue: EventQueue,
    consent: ConsentManager,
    log: Logger
  ) {
    this.config = autoTrackConfig
    this.eventBuilder = eventBuilder as EventBuilder
    this.queue = queue
    this.consent = consent
    this.log = log

    // Initialize session
    this.sessionId = this.initSession()

    // Capture UTM params
    if (this.config.utm !== false) {
      this.captureUTM()
    }

    // Auto-tracking is started in setEventBuilder() to avoid using
    // an uninitialized eventBuilder (circular dependency with core.ts)
    if (eventBuilder) {
      this.startAutoTracking()
    }
  }

  /** Set the EventBuilder after construction (breaks circular init dependency) */
  setEventBuilder(builder: EventBuilder): void {
    this.eventBuilder = builder
    this.startAutoTracking()
  }

  private startAutoTracking(): void {
    if (this.config.pageViews !== false) this.trackPageViews()
    if (this.config.sessions !== false) this.trackSessions()
    if (this.config.clicks) this.trackClicks()
    if (this.config.scroll) this.trackScroll()
  }

  /** Get current session ID */
  getSessionId(): string {
    return this.sessionId
  }

  /** Get captured UTM params to attach to events */
  getUTMParams(): UTMParams {
    return { ...this.utmParams }
  }

  // ─── Session Management ─────────────────────────────────────

  private initSession(): string {
    const existingId = sessionGet(SESSION_ID_KEY)
    const lastActivity = sessionGet(SESSION_START_KEY)

    if (existingId && lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10)
      if (elapsed < SESSION_TIMEOUT_MS) {
        // Resume existing session
        sessionSet(SESSION_START_KEY, String(Date.now()))
        return existingId
      }
    }

    // New session
    const newId = generateId()
    sessionSet(SESSION_ID_KEY, newId)
    sessionSet(SESSION_START_KEY, String(Date.now()))
    sessionSet(SESSION_PAGES_KEY, '0')
    return newId
  }

  private trackSessions(): void {
    // Track session_started
    const event = this.eventBuilder.build('session_started', {
      referrer: document.referrer,
      landing_page: window.location.href,
      ...this.utmParams,
    })
    this.queue.push(event)

    // Track session_ended on visibility hidden (with timeout check)
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        const startStr = sessionGet(SESSION_START_KEY)
        if (startStr) {
          const duration = Date.now() - parseInt(startStr, 10)
          const pageCount = parseInt(sessionGet(SESSION_PAGES_KEY) || '0', 10)
          const endEvent = this.eventBuilder.build('session_ended', {
            duration_ms: duration,
            page_count: pageCount,
          })
          this.queue.push(endEvent)
        }
      }
    }

    document.addEventListener('visibilitychange', handler)
    this.cleanupFns.push(() =>
      document.removeEventListener('visibilitychange', handler)
    )
  }

  // ─── Page View Tracking ─────────────────────────────────────

  private trackPageViews(): void {
    // Track initial page view
    this.recordPageView()

    // Monkey-patch pushState and replaceState for SPA navigation
    const originalPushState = history.pushState.bind(history)
    const originalReplaceState = history.replaceState.bind(history)

    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      originalPushState(...args)
      this.onNavigation()
    }

    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      originalReplaceState(...args)
      this.onNavigation()
    }

    // Listen for popstate (back/forward)
    const popHandler = () => this.onNavigation()
    window.addEventListener('popstate', popHandler)

    this.cleanupFns.push(() => {
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
      window.removeEventListener('popstate', popHandler)
    })
  }

  private onNavigation(): void {
    // Small delay to let the URL update
    setTimeout(() => this.recordPageView(), 0)
  }

  private recordPageView(): void {
    if (!this.consent.hasCategory('analytics')) return

    const event = this.eventBuilder.buildPageView(undefined, this.utmParams)
    this.queue.push(event)

    // Increment session page count
    const count = parseInt(sessionGet(SESSION_PAGES_KEY) || '0', 10)
    sessionSet(SESSION_PAGES_KEY, String(count + 1))

    // Reset scroll thresholds for new page
    this.scrollThresholds.clear()
  }

  // ─── Click Tracking ─────────────────────────────────────────

  private trackClicks(): void {
    const handler = (e: MouseEvent) => {
      if (!this.consent.hasCategory('analytics')) return

      const target = e.target as HTMLElement
      if (!target) return

      // Walk up to find the nearest clickable element
      const clickable = target.closest('a, button, [role="button"], [data-track]')
      const el = (clickable || target) as HTMLElement

      const props: Record<string, unknown> = {
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || '').slice(0, 100).trim(),
      }

      if (el.id) props.id = el.id
      if (el.className && typeof el.className === 'string') {
        props.class = el.className.slice(0, 200)
      }
      if (el instanceof HTMLAnchorElement && el.href) {
        props.href = el.href
      }

      // Capture data-track-* attributes
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-track-')) {
          const key = attr.name.replace('data-track-', '')
          props[key] = attr.value
        }
      }

      const event = this.eventBuilder.build('element_clicked', props)
      this.queue.push(event)
    }

    document.addEventListener('click', handler, true)
    this.cleanupFns.push(() =>
      document.removeEventListener('click', handler, true)
    )
  }

  // ─── Scroll Depth Tracking ──────────────────────────────────

  private trackScroll(): void {
    const thresholds = [25, 50, 75, 100]
    let ticking = false

    const handler = () => {
      if (ticking) return
      ticking = true

      requestAnimationFrame(() => {
        if (!this.consent.hasCategory('analytics')) {
          ticking = false
          return
        }

        const scrollTop = window.scrollY || document.documentElement.scrollTop
        const docHeight = Math.max(
          document.documentElement.scrollHeight - window.innerHeight,
          1
        )
        const percent = Math.round((scrollTop / docHeight) * 100)

        for (const threshold of thresholds) {
          if (percent >= threshold && !this.scrollThresholds.has(threshold)) {
            this.scrollThresholds.add(threshold)
            const event = this.eventBuilder.build('scroll_depth_reached', {
              threshold,
              page_url: window.location.href,
              page_path: window.location.pathname,
            })
            this.queue.push(event)
          }
        }

        ticking = false
      })
    }

    window.addEventListener('scroll', handler, { passive: true })
    this.cleanupFns.push(() => window.removeEventListener('scroll', handler))
  }

  // ─── UTM Capture ────────────────────────────────────────────

  private captureUTM(): void {
    // Check sessionStorage first (persist across pages in same session)
    const stored = sessionGet(UTM_KEY)
    if (stored) {
      try {
        this.utmParams = JSON.parse(stored)
        return
      } catch {
        // parse error, recapture
      }
    }

    // Parse from URL
    const params = new URLSearchParams(window.location.search)
    const utmKeys = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
    ] as const

    for (const key of utmKeys) {
      const value = params.get(key)
      if (value) {
        this.utmParams[key] = value
      }
    }

    if (Object.keys(this.utmParams).length > 0) {
      sessionSet(UTM_KEY, JSON.stringify(this.utmParams))
      this.log.log('UTM params captured:', this.utmParams)
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────

  destroy(): void {
    for (const fn of this.cleanupFns) {
      fn()
    }
    this.cleanupFns = []
  }
}
