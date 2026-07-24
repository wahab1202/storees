import type { UserIdentity } from './types'
import type { Logger } from './utils'
import {
  generateId,
  storageGet,
  storageSet,
  storageRemove,
  durableGetSync,
  durableSetSync,
  idbGet,
  idbSet,
} from './utils'

const ANON_ID_KEY = 'storees_anon_id'
const DEVICE_ID_KEY = 'storees_device_id'
const USER_ID_KEY = 'storees_user_id'
const USER_ATTRS_KEY = 'storees_user_attrs'

export class IdentityManager {
  private anonymousId: string
  private deviceId: string
  private deviceIdWasNew = false
  private userId: string | undefined
  private attributes: Record<string, unknown> | undefined
  private log: Logger

  constructor(log: Logger) {
    this.log = log

    // Durable device id — the persistent cross-session stitch key. Read from
    // the redundant sync stores (localStorage + first-party cookie, self-
    // healing); IndexedDB is reconciled asynchronously in hydrateDurableId().
    // Unlike anonymousId it is NOT reset on logout — the device is the same
    // device. Migrate a legacy anonymousId into it so existing visitors keep
    // continuity.
    let device = durableGetSync(DEVICE_ID_KEY)
    if (!device) {
      device = storageGet(ANON_ID_KEY) ?? generateId()
      this.deviceIdWasNew = true
    }
    this.deviceId = device
    durableSetSync(DEVICE_ID_KEY, device)

    // Restore or generate anonymous ID (per anonymous session; reset on logout)
    const stored = storageGet(ANON_ID_KEY)
    if (stored) {
      this.anonymousId = stored
    } else {
      this.anonymousId = generateId()
      storageSet(ANON_ID_KEY, this.anonymousId)
    }

    // Restore identified user if exists
    const storedUserId = storageGet(USER_ID_KEY)
    if (storedUserId) {
      this.userId = storedUserId
      const storedAttrs = storageGet(USER_ATTRS_KEY)
      if (storedAttrs) {
        try {
          this.attributes = JSON.parse(storedAttrs)
        } catch {
          // corrupt data, ignore
        }
      }
    }

    this.log.log('Identity initialized', {
      anonymousId: this.anonymousId,
      userId: this.userId,
    })
  }

  /** Identify a user — transitions from anonymous to known */
  identify(
    userId: string,
    attributes?: Record<string, unknown>
  ): { previousAnonymousId: string; isNewIdentification: boolean } {
    const isNew = !this.userId || this.userId !== userId
    const previousAnonymousId = this.anonymousId

    this.userId = userId
    storageSet(USER_ID_KEY, userId)

    if (attributes) {
      this.attributes = { ...this.attributes, ...attributes }
      storageSet(USER_ATTRS_KEY, JSON.stringify(this.attributes))
    }

    this.log.log('User identified', { userId, isNew })
    return { previousAnonymousId, isNewIdentification: isNew }
  }

  /** Set additional user properties without changing identity */
  setAttributes(attributes: Record<string, unknown>): void {
    this.attributes = { ...this.attributes, ...attributes }
    storageSet(USER_ATTRS_KEY, JSON.stringify(this.attributes))
    this.log.log('Attributes updated', attributes)
  }

  /** Get current identity state */
  getIdentity(): UserIdentity {
    return {
      anonymousId: this.anonymousId,
      userId: this.userId,
      attributes: this.attributes,
    }
  }

  /** Get the customer_id to use in events */
  getCustomerId(): string {
    return this.userId || `anon_${this.anonymousId}`
  }

  /**
   * Get the durable device id — stable across sessions, browser restarts, and
   * logouts, stored redundantly across localStorage + first-party cookie +
   * IndexedDB. The persistent stitch key so a returning visitor's prior
   * anonymous history can be back-attributed once they identify.
   */
  getDeviceId(): string {
    return this.deviceId
  }

  /**
   * Reconcile the durable device id against IndexedDB (async). If the sync
   * stores were evicted (Safari ITP, cleared cache) and we generated a fresh
   * id this load, but IndexedDB still holds the original, restore it so
   * continuity survives. Otherwise mirror the current id into IndexedDB as a
   * backup. Fire-and-forget from init.
   */
  async hydrateDurableId(): Promise<void> {
    try {
      const fromIdb = await idbGet(DEVICE_ID_KEY)
      if (this.deviceIdWasNew && fromIdb) {
        this.deviceId = fromIdb
        durableSetSync(DEVICE_ID_KEY, fromIdb)
        this.log.log('Device id restored from IndexedDB', fromIdb)
      } else {
        await idbSet(DEVICE_ID_KEY, this.deviceId)
      }
    } catch {
      // best-effort — durability degrades gracefully to the sync stores
    }
  }

  /** Get customer_email if available */
  getCustomerEmail(): string | undefined {
    return this.attributes?.email as string | undefined
  }

  /** Get customer_phone if available */
  getCustomerPhone(): string | undefined {
    return this.attributes?.phone as string | undefined
  }

  /**
   * Reset identity — used on logout. Clears the user + rotates the anonymous
   * session id (so the next anonymous visitor on a shared device isn't
   * attributed to the previous user), but PRESERVES the durable device id —
   * the device is the same device. Clearing the device id belongs to an
   * explicit "forget me" / consent-withdrawal path, not logout.
   */
  reset(): void {
    storageRemove(USER_ID_KEY)
    storageRemove(USER_ATTRS_KEY)
    storageRemove(ANON_ID_KEY)

    this.userId = undefined
    this.attributes = undefined
    this.anonymousId = generateId()
    storageSet(ANON_ID_KEY, this.anonymousId)

    this.log.log('Identity reset, new anonymousId:', this.anonymousId, 'deviceId preserved:', this.deviceId)
  }
}
