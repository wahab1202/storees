import type { UserIdentity } from './types'
import type { Logger } from './utils'
import { generateId, storageGet, storageSet, storageRemove } from './utils'

const ANON_ID_KEY = 'storees_anon_id'
const USER_ID_KEY = 'storees_user_id'
const USER_ATTRS_KEY = 'storees_user_attrs'

export class IdentityManager {
  private anonymousId: string
  private userId: string | undefined
  private attributes: Record<string, unknown> | undefined
  private log: Logger

  constructor(log: Logger) {
    this.log = log
    // Restore or generate anonymous ID
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

  /** Get customer_email if available */
  getCustomerEmail(): string | undefined {
    return this.attributes?.email as string | undefined
  }

  /** Get customer_phone if available */
  getCustomerPhone(): string | undefined {
    return this.attributes?.phone as string | undefined
  }

  /** Reset identity — used on logout */
  reset(): void {
    storageRemove(USER_ID_KEY)
    storageRemove(USER_ATTRS_KEY)
    storageRemove(ANON_ID_KEY)

    this.userId = undefined
    this.attributes = undefined
    this.anonymousId = generateId()
    storageSet(ANON_ID_KEY, this.anonymousId)

    this.log.log('Identity reset, new anonymousId:', this.anonymousId)
  }
}
