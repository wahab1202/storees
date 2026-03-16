import type { StoreesSdkConfig, ConsentCategory } from './types'
import { createLogger } from './utils'
import { IdentityManager } from './identity'
import { ConsentManager } from './consent'
import { EventBuilder } from './events'
import { Transport } from './transport'
import { EventQueue } from './queue'
import { AutoTracker } from './autotrack'

const DEFAULT_CONFIG: Partial<StoreesSdkConfig> = {
  autoTrack: {
    pageViews: true,
    sessions: true,
    clicks: false,
    scroll: false,
    utm: true,
  },
  consent: {
    required: false,
    defaultCategories: ['necessary', 'analytics'],
  },
  batchSize: 20,
  flushInterval: 30000,
  debug: false,
}

class StoreesSdk {
  private initialized = false
  private identity!: IdentityManager
  private consent!: ConsentManager
  private eventBuilder!: EventBuilder
  private transport!: Transport
  private queue!: EventQueue
  private autoTracker!: AutoTracker
  private config!: StoreesSdkConfig

  // Pre-init command queue (for async snippet)
  private preInitQueue: Array<[string, ...unknown[]]> = []

  /** Initialize the SDK */
  init(config: StoreesSdkConfig): void {
    if (this.initialized) {
      console.warn('[Storees] SDK already initialized')
      return
    }

    if (!config.apiKey) {
      console.error('[Storees] apiKey is required')
      return
    }

    if (!config.apiUrl) {
      console.error('[Storees] apiUrl is required')
      return
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      // Deep merge nested objects so partial overrides don't wipe defaults
      autoTrack: { ...DEFAULT_CONFIG.autoTrack, ...config.autoTrack },
      consent: { ...DEFAULT_CONFIG.consent, ...config.consent },
    } as StoreesSdkConfig
    const log = createLogger(this.config.debug || false)

    // Initialize modules
    this.identity = new IdentityManager(log)

    this.consent = new ConsentManager(
      this.config.consent?.required || false,
      this.config.consent?.defaultCategories || ['necessary', 'analytics'],
      log
    )

    this.transport = new Transport(this.config.apiUrl, this.config.apiKey, log)

    this.queue = new EventQueue(
      this.transport,
      this.consent,
      this.config.batchSize || 20,
      this.config.flushInterval || 30000,
      log
    )

    // AutoTracker needs a sessionId getter — use a late-binding closure
    // so EventBuilder always gets the current session ID (not a stale copy)
    this.autoTracker = new AutoTracker(
      this.config.autoTrack || {},
      undefined as unknown as EventBuilder, // set below after eventBuilder is created
      this.queue,
      this.consent,
      log
    )

    this.eventBuilder = new EventBuilder(
      this.identity,
      () => this.autoTracker.getSessionId(),
      log
    )

    // Wire up the EventBuilder reference that AutoTracker needs
    this.autoTracker.setEventBuilder(this.eventBuilder)

    this.initialized = true
    log.log('SDK initialized', {
      apiUrl: this.config.apiUrl,
      autoTrack: this.config.autoTrack,
    })

    // Process any commands queued before init
    this.drainPreInitQueue()
  }

  /** Identify a user — anonymous → known transition */
  identify(userId: string, attributes?: Record<string, unknown>): void {
    if (!this.ensureInit('identify', userId, attributes)) return

    const { previousAnonymousId, isNewIdentification } =
      this.identity.identify(userId, attributes)

    // Track the identification event
    if (isNewIdentification) {
      const event = this.eventBuilder.buildIdentifyEvent(
        userId,
        previousAnonymousId,
        attributes
      )
      this.queue.push(event)
    }

    // Upsert customer on the backend
    if (attributes) {
      this.transport.sendCustomerUpsert(userId, attributes)
    }
  }

  /** Track a custom event */
  track(eventName: string, properties?: Record<string, unknown>): void {
    if (!this.ensureInit('track', eventName, properties)) return

    const event = this.eventBuilder.build(eventName, {
      ...properties,
      ...this.autoTracker.getUTMParams(),
    })
    this.queue.push(event)
  }

  /** Track a page view */
  page(path?: string, properties?: Record<string, unknown>): void {
    if (!this.ensureInit('page', path, properties)) return

    const event = this.eventBuilder.buildPageView(path, {
      ...properties,
      ...this.autoTracker.getUTMParams(),
    })
    this.queue.push(event)
  }

  /** Set user properties without tracking an event */
  setUserProperties(attributes: Record<string, unknown>): void {
    if (!this.ensureInit('setUserProperties', attributes)) return

    this.identity.setAttributes(attributes)

    // Track property update event
    const event = this.eventBuilder.buildSetPropertiesEvent(attributes)
    this.queue.push(event)

    // Upsert customer if identified
    const identity = this.identity.getIdentity()
    if (identity.userId) {
      this.transport.sendCustomerUpsert(identity.userId, attributes)
    }
  }

  /** Set GDPR consent categories */
  setConsent(categories: ConsentCategory[]): void {
    if (!this.ensureInit('setConsent', categories)) return
    this.consent.setConsent(categories)
  }

  /** Reset identity and session — call on user logout */
  reset(): void {
    if (!this.ensureInit('reset')) return

    this.queue.flush()
    this.identity.reset()
    this.autoTracker.destroy()
  }

  // ─── Internal Helpers ───────────────────────────────────────

  /** Ensure SDK is initialized, or queue the command */
  private ensureInit(method: string, ...args: unknown[]): boolean {
    if (this.initialized) return true

    // Queue for processing after init
    this.preInitQueue.push([method, ...args])
    return false
  }

  /** Process commands that were called before init */
  private drainPreInitQueue(): void {
    for (const [method, ...args] of this.preInitQueue) {
      const fn = (this as unknown as Record<string, (...a: unknown[]) => void>)[method]
      if (typeof fn === 'function') {
        fn.apply(this, args)
      }
    }
    this.preInitQueue = []
  }
}

// ─── Singleton + UMD Export ─────────────────────────────────

const instance = new StoreesSdk()

// Support the async snippet pattern:
// Storees('init', { ... }) before the SDK loads
if (typeof window !== 'undefined') {
  const existingQueue = (window as unknown as Record<string, unknown>).Storees
  if (existingQueue && typeof existingQueue === 'function') {
    // The stub queued calls as: Storees.q = [[method, ...args], ...]
    const stub = existingQueue as unknown as { q?: Array<unknown[]> }
    if (stub.q && Array.isArray(stub.q)) {
      for (const [method, ...args] of stub.q) {
        const fn = (instance as unknown as Record<string, (...a: unknown[]) => void>)[
          method as string
        ]
        if (typeof fn === 'function') {
          fn.apply(instance, args)
        }
      }
    }
  }

  // Attach to window for UMD
  ;(window as unknown as Record<string, unknown>).Storees = instance
}

export default instance
export { StoreesSdk }
export type { StoreesSdkConfig, ConsentCategory } from './types'
