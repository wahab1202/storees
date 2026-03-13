import type { SdkEvent } from './types'
import type { Logger } from './utils'
import { generateId, now } from './utils'
import { getDeviceContext } from './context'
import type { IdentityManager } from './identity'

export const SDK_VERSION = '0.1.0'

export class EventBuilder {
  private identity: IdentityManager
  private log: Logger
  private sessionIdGetter: () => string

  constructor(
    identity: IdentityManager,
    sessionIdGetter: () => string,
    log: Logger
  ) {
    this.identity = identity
    this.sessionIdGetter = sessionIdGetter
    this.log = log
  }

  /** Build an event payload ready for the batch endpoint */
  build(eventName: string, properties: Record<string, unknown> = {}): SdkEvent {
    const context = getDeviceContext()
    const event: SdkEvent = {
      event_name: eventName,
      customer_id: this.identity.getCustomerId(),
      customer_email: this.identity.getCustomerEmail(),
      customer_phone: this.identity.getCustomerPhone(),
      timestamp: now(),
      idempotency_key: `sdk_${generateId()}_${Date.now()}`,
      session_id: this.sessionIdGetter(),
      source: 'sdk',
      platform: 'web',
      properties: {
        ...properties,
        // Device context
        $os: context.os,
        $browser: context.browser,
        $browser_version: context.browser_version,
        $screen_width: context.screen_width,
        $screen_height: context.screen_height,
        $device_type: context.device_type,
        $language: context.language,
        $timezone: context.timezone,
        // SDK metadata
        $sdk_version: SDK_VERSION,
        $source: 'sdk',
        $session_id: this.sessionIdGetter(),
        $page_url: window.location.href,
        $page_path: window.location.pathname,
        $page_title: document.title,
      },
    }

    this.log.log('Event built:', eventName, event.properties)
    return event
  }

  /** Build a page view event */
  buildPageView(
    path?: string,
    properties: Record<string, unknown> = {}
  ): SdkEvent {
    return this.build('page_viewed', {
      ...properties,
      url: window.location.href,
      path: path || window.location.pathname,
      title: properties.title || document.title,
      referrer: document.referrer,
    })
  }

  /** Build an identify event for anonymous → known transition */
  buildIdentifyEvent(
    userId: string,
    previousAnonymousId: string,
    attributes: Record<string, unknown> = {}
  ): SdkEvent {
    return this.build('customer_identified', {
      user_id: userId,
      previous_anonymous_id: `anon_${previousAnonymousId}`,
      ...attributes,
    })
  }

  /** Build a user properties update event */
  buildSetPropertiesEvent(attributes: Record<string, unknown>): SdkEvent {
    return this.build('user_properties_updated', attributes)
  }
}
