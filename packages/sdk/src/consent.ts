import type { ConsentCategory } from './types'
import type { Logger } from './utils'
import { storageGet, storageSet } from './utils'

const CONSENT_KEY = 'storees_consent'

export class ConsentManager {
  private required: boolean
  private categories: Set<ConsentCategory>
  private hasConsented: boolean
  private log: Logger
  private onConsentGranted?: () => void

  constructor(
    required: boolean,
    defaultCategories: ConsentCategory[],
    log: Logger
  ) {
    this.required = required
    this.log = log

    // Restore previous consent
    const stored = storageGet(CONSENT_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ConsentCategory[]
        this.categories = new Set(parsed)
        this.hasConsented = true
      } catch {
        this.categories = new Set(defaultCategories)
        this.hasConsented = !required
      }
    } else {
      this.categories = new Set(defaultCategories)
      this.hasConsented = !required
    }

    this.log.log('Consent initialized', {
      required,
      hasConsented: this.hasConsented,
      categories: [...this.categories],
    })
  }

  /** Set a callback for when consent is first granted */
  onGranted(callback: () => void): void {
    this.onConsentGranted = callback
  }

  /** Update consent categories */
  setConsent(categories: ConsentCategory[]): void {
    this.categories = new Set(categories)
    // 'necessary' is always included
    this.categories.add('necessary')
    this.hasConsented = true

    storageSet(CONSENT_KEY, JSON.stringify([...this.categories]))
    this.log.log('Consent updated', [...this.categories])

    // Trigger flush of queued events
    if (this.onConsentGranted) {
      this.onConsentGranted()
    }
  }

  /** Check if tracking is currently allowed */
  canTrack(): boolean {
    if (!this.required) return true
    return this.hasConsented
  }

  /** Check if a specific category is consented */
  hasCategory(category: ConsentCategory): boolean {
    if (category === 'necessary') return true
    if (!this.required) return true
    return this.categories.has(category)
  }

  /** Get current consent state */
  getCategories(): ConsentCategory[] {
    return [...this.categories]
  }
}
