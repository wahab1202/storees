import type { SdkEvent, BatchResponse } from './types'
import type { Logger } from './utils'

const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000

export class Transport {
  private apiUrl: string
  private apiKey: string
  private log: Logger

  constructor(apiUrl: string, apiKey: string, log: Logger) {
    this.apiUrl = apiUrl.replace(/\/$/, '') // strip trailing slash
    this.apiKey = apiKey
    this.log = log
  }

  /** Send a batch of events via fetch with retry */
  async sendBatch(events: SdkEvent[]): Promise<BatchResponse> {
    const url = `${this.apiUrl}/api/v1/events/batch`
    const body = JSON.stringify({ events })

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          body,
        })

        if (response.ok) {
          const data = (await response.json()) as BatchResponse
          this.log.log(`Batch sent: ${events.length} events`, data)
          return data
        }

        // 4xx errors — don't retry (client error)
        if (response.status >= 400 && response.status < 500) {
          const errorData = await response.json().catch(() => ({}))
          this.log.error(`Batch rejected (${response.status}):`, errorData)
          return {
            success: false,
            error: `HTTP ${response.status}`,
          }
        }

        // 5xx — retry
        this.log.warn(
          `Batch failed (${response.status}), attempt ${attempt + 1}/${MAX_RETRIES + 1}`
        )
      } catch (err) {
        this.log.warn(
          `Network error, attempt ${attempt + 1}/${MAX_RETRIES + 1}:`,
          err
        )
      }

      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt)
        await new Promise((r) => setTimeout(r, delay))
      }
    }

    return { success: false, error: 'Max retries exceeded' }
  }

  /** Send via sendBeacon (for page unload — fire and forget) */
  sendBeacon(events: SdkEvent[]): boolean {
    const url = `${this.apiUrl}/api/v1/events/batch`
    const body = JSON.stringify({ events })

    // sendBeacon doesn't support custom headers, so we append apiKey as query param
    const beaconUrl = `${url}?api_key=${encodeURIComponent(this.apiKey)}`
    const blob = new Blob([body], { type: 'application/json' })

    const sent = navigator.sendBeacon(beaconUrl, blob)
    this.log.log(`Beacon ${sent ? 'sent' : 'failed'}: ${events.length} events`)
    return sent
  }

  /** Send customer upsert (for identify) */
  async sendCustomerUpsert(
    customerId: string,
    attributes: Record<string, unknown>
  ): Promise<void> {
    const url = `${this.apiUrl}/api/v1/customers`
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          customer_id: customerId,
          attributes,
        }),
      })

      if (response.ok) {
        this.log.log('Customer upserted:', customerId)
      } else {
        this.log.warn(`Customer upsert failed (${response.status})`)
      }
    } catch (err) {
      this.log.warn('Customer upsert network error:', err)
    }
  }
}
