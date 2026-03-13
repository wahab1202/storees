export type StoreesSdkConfig = {
  apiKey: string
  apiUrl: string
  autoTrack?: {
    pageViews?: boolean
    sessions?: boolean
    clicks?: boolean
    scroll?: boolean
    utm?: boolean
  }
  consent?: {
    required?: boolean
    defaultCategories?: ConsentCategory[]
  }
  batchSize?: number
  flushInterval?: number
  debug?: boolean
}

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'personalization'

export type UserIdentity = {
  anonymousId: string
  userId?: string
  attributes?: Record<string, unknown>
}

export type DeviceContext = {
  os: string
  browser: string
  browser_version: string
  screen_width: number
  screen_height: number
  device_type: 'desktop' | 'mobile' | 'tablet'
  language: string
  timezone: string
}

export type SdkEvent = {
  event_name: string
  customer_id?: string
  customer_email?: string
  customer_phone?: string
  timestamp: string
  idempotency_key: string
  session_id?: string
  source?: string
  platform?: string
  properties: Record<string, unknown>
}

export type BatchResponse = {
  success: boolean
  data?: {
    total: number
    succeeded: number
    failed: number
    results: Array<{ index: number; id?: string; error?: string }>
  }
  error?: string
}

export type FlushResult = {
  success: boolean
  sent: number
  failed: number
}
