import type { SdkEvent } from './types'
import type { Logger } from './utils'
import { storageGet, storageSet, storageRemove } from './utils'
import type { Transport } from './transport'
import type { ConsentManager } from './consent'

const QUEUE_KEY = 'storees_queue'
const MAX_PERSISTED_EVENTS = 1000

export class EventQueue {
  private buffer: SdkEvent[] = []
  private batchSize: number
  private flushInterval: number
  private timer: ReturnType<typeof setInterval> | null = null
  private transport: Transport
  private consent: ConsentManager
  private log: Logger
  private flushing = false

  constructor(
    transport: Transport,
    consent: ConsentManager,
    batchSize: number,
    flushInterval: number,
    log: Logger
  ) {
    this.transport = transport
    this.consent = consent
    this.batchSize = batchSize
    this.flushInterval = flushInterval
    this.log = log

    // Restore any persisted events from previous session
    this.restorePersistedEvents()

    // Start flush timer
    this.startTimer()

    // Flush on page visibility change (hidden) and beforeunload
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushBeacon()
      }
    })

    window.addEventListener('beforeunload', () => {
      this.flushBeacon()
    })

    // Wire up consent: when consent is granted, flush queued events
    this.consent.onGranted(() => {
      this.log.log('Consent granted — flushing queued events')
      this.flush()
    })
  }

  /** Add an event to the queue */
  push(event: SdkEvent): void {
    this.buffer.push(event)
    this.log.log(`Queued event: ${event.event_name} (buffer: ${this.buffer.length})`)

    if (this.buffer.length >= this.batchSize) {
      this.flush()
    }
  }

  /** Flush events via fetch (async, with retry) */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return
    if (!this.consent.canTrack()) {
      this.log.log('Consent not granted — events queued but not sent')
      return
    }

    this.flushing = true
    const batch = this.buffer.splice(0, this.batchSize)

    try {
      const result = await this.transport.sendBatch(batch)
      if (!result.success) {
        // Put failed events back and persist
        this.buffer.unshift(...batch)
        this.persistEvents()
      }
    } catch {
      // Network error — persist for later
      this.buffer.unshift(...batch)
      this.persistEvents()
    } finally {
      this.flushing = false
    }

    // If there are still events, flush again
    if (this.buffer.length >= this.batchSize) {
      this.flush()
    }
  }

  /** Flush via sendBeacon (synchronous, for page unload) */
  private flushBeacon(): void {
    if (this.buffer.length === 0) return
    if (!this.consent.canTrack()) {
      this.persistEvents()
      return
    }

    const batch = this.buffer.splice(0)
    const sent = this.transport.sendBeacon(batch)
    if (!sent) {
      // sendBeacon failed — persist for next page load
      this.buffer.unshift(...batch)
      this.persistEvents()
    }
  }

  /** Persist events to localStorage for offline/crash recovery */
  private persistEvents(): void {
    if (this.buffer.length === 0) return
    const toSave = this.buffer.slice(0, MAX_PERSISTED_EVENTS)
    storageSet(QUEUE_KEY, JSON.stringify(toSave))
    this.log.log(`Persisted ${toSave.length} events to localStorage`)
  }

  /** Restore persisted events on init */
  private restorePersistedEvents(): void {
    const stored = storageGet(QUEUE_KEY)
    if (!stored) return

    try {
      const events = JSON.parse(stored) as SdkEvent[]
      if (Array.isArray(events) && events.length > 0) {
        this.buffer.unshift(...events)
        storageRemove(QUEUE_KEY)
        this.log.log(`Restored ${events.length} persisted events`)
      }
    } catch {
      storageRemove(QUEUE_KEY)
    }
  }

  /** Start the periodic flush timer */
  private startTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.flush()
    }, this.flushInterval)
  }

  /** Stop the flush timer */
  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    // Persist any remaining events
    this.persistEvents()
  }

  /** Get current buffer size (for debugging) */
  get size(): number {
    return this.buffer.length
  }
}
