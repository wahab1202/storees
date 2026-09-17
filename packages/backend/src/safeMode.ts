/**
 * LOCAL_SAFE_MODE — a hard stop on every outbound network call.
 *
 * A local database is not the same as local behaviour. A restored production dump
 * carries working third-party credentials, and some of them arrive UNENCRYPTED in
 * `projects.settings.channels` — the Firebase service-account key and the Pinnacle
 * WhatsApp api key among them. Blanking .env does nothing for those: the code reads
 * them from the database.
 *
 * Worker-level gating is not enough either. Several routes call a provider directly
 * rather than queueing — `POST /whatsapp/templates/:id/test-send` reaches
 * `provider.sendTemplate()` with no worker involved — and one provider falls back to
 * a hardcoded live URL when its env var is unset:
 *
 *     pinnacleWhatsappProvider.ts:35
 *     process.env.PINNACLE_API_URL ?? 'https://partnersv1.pinbot.ai/v3'
 *
 * So instead of guarding nineteen call sites and hoping none was missed, this guards
 * the one thing they all share. Every outbound service in the codebase — Meta,
 * Pinnacle, FCM, Twilio, Vonage, Bird, Gupshup, Shopify, Resend, the LLMs, the
 * generic HTTP connector — goes through global `fetch`.
 *
 * Loopback stays open: our own API, the Python ML service, and anything else on this
 * machine work normally. Only calls that would leave the laptop are refused.
 *
 * This installs ONLY when LOCAL_SAFE_MODE=true, which is set in local .env and never
 * in production. A real deployment loads this module and does nothing.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]'])

/** Hosts on this machine are fine; everything else leaves the building. */
function isLocal(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return LOOPBACK.has(h) || h === '::1' || h.endsWith('.localhost')
}

// Taken from the ambient `fetch` rather than written out: this package's tsconfig
// does not pull in the DOM lib, so `RequestInfo` is not a name here.
type FetchInput = Parameters<typeof globalThis.fetch>[0]
type FetchInit = Parameters<typeof globalThis.fetch>[1]

function targetOf(input: FetchInput): URL | null {
  try {
    if (typeof input === 'string') return new URL(input)
    if (input instanceof URL) return input
    return new URL((input as { url: string }).url)
  } catch {
    return null
  }
}

export function installSafeMode(): void {
  if (process.env.LOCAL_SAFE_MODE !== 'true') return

  const realFetch = globalThis.fetch
  if (typeof realFetch !== 'function') return

  globalThis.fetch = async function safeFetch(
    input: FetchInput,
    init?: FetchInit,
  ): Promise<Response> {
    const url = targetOf(input)

    // An unparseable target is refused rather than allowed. Failing closed is the
    // whole point — a URL we cannot inspect is one we cannot vouch for.
    if (!url) {
      console.error('[SAFE MODE] BLOCKED outbound call — unparseable URL')
      throw new Error('LOCAL_SAFE_MODE: refused an outbound call with an unreadable URL')
    }

    if (!isLocal(url.hostname)) {
      // Loud on purpose. A blocked call is a finding: it names a code path that
      // would have reached a real service, and it should be read, not swallowed.
      console.error(
        `[SAFE MODE] BLOCKED outbound call → ${url.protocol}//${url.host}${url.pathname}`,
      )
      throw new Error(
        `LOCAL_SAFE_MODE: refused to call ${url.host}. ` +
        `Unset LOCAL_SAFE_MODE only if you intend to reach live services.`,
      )
    }

    return realFetch(input, init)
  }

  console.log('[SAFE MODE] outbound network calls are blocked — loopback only.')
}

installSafeMode()
