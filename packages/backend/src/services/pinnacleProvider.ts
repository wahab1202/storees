import type { SendCommand } from '@storees/shared'

const PINNACLE_API_URL = process.env.PINNACLE_API_URL ?? ''
const PINNACLE_API_KEY = process.env.PINNACLE_API_KEY ?? ''
const MAX_RETRIES = 3

export const pinnacleProvider = {
  name: 'pinnacle' as const,

  async send(command: SendCommand): Promise<{ messageId: string; status: string; error?: string }> {
    if (!PINNACLE_API_URL) {
      return { messageId: '', status: 'failed', error: 'PINNACLE_API_URL not configured' }
    }

    const payload = {
      userId: command.userId,
      channel: command.channel,
      templateId: command.templateId,
      variables: command.variables,
      messageType: command.messageType,
      scheduledAt: command.scheduledAt?.toISOString(),
    }

    let lastError = ''
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10_000) // 10s timeout

        const response = await fetch(`${PINNACLE_API_URL}/v1/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PINNACLE_API_KEY}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (response.ok) {
          const data = await response.json() as { messageId: string }
          return { messageId: data.messageId, status: 'sent' }
        }

        lastError = `HTTP ${response.status}: ${await response.text()}`

        // Don't retry on 4xx (client errors)
        if (response.status >= 400 && response.status < 500) {
          return { messageId: '', status: 'failed', error: lastError }
        }
      } catch (err) {
        lastError = (err as Error).message
      }

      // Exponential backoff: 1s, 4s, 16s
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, Math.pow(4, attempt - 1) * 1000))
      }
    }

    return { messageId: '', status: 'failed', error: `Max retries exceeded: ${lastError}` }
  },

  async getStatus(providerMessageId: string): Promise<string> {
    if (!PINNACLE_API_URL) return 'unknown'

    try {
      const response = await fetch(`${PINNACLE_API_URL}/v1/status/${providerMessageId}`, {
        headers: { 'Authorization': `Bearer ${PINNACLE_API_KEY}` },
      })

      if (response.ok) {
        const data = await response.json() as { status: string }
        return data.status
      }
    } catch {
      // ignore
    }

    return 'unknown'
  },
}
