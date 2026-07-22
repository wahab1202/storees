import { lookup } from 'node:dns/promises'
import net from 'node:net'

/**
 * SSRF defence for outbound requests to tenant-controlled URLs (data connectors,
 * webhook subscriptions). Rejects non-http(s) schemes and any host that resolves
 * to a loopback, private, link-local or cloud-metadata address.
 *
 * Note: this validates at call time; it does not fully close the DNS-rebinding
 * (TOCTOU) window between resolution and fetch. It blocks the common case where a
 * tenant points a URL directly at an internal address or an internal hostname.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL scheme: ${parsed.protocol}`)
  }

  const host = parsed.hostname
  const addresses = net.isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((a) => a.address)

  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new Error(`Blocked host: ${host} resolves to a non-public address (${address})`)
    }
  }
}

function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0 || a === 127) return true                 // "this" network / loopback
    if (a === 10) return true                              // private
    if (a === 172 && b >= 16 && b <= 31) return true       // private
    if (a === 192 && b === 168) return true                // private
    if (a === 169 && b === 254) return true                // link-local + cloud metadata (169.254.169.254)
    if (a === 100 && b >= 64 && b <= 127) return true       // carrier-grade NAT
    if (a >= 224) return true                              // multicast / reserved
    return false
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    if (lower === '::' || lower === '::1') return true      // unspecified / loopback
    if (lower.startsWith('fe80')) return true               // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique-local
    if (lower.startsWith('::ffff:')) return isBlockedAddress(lower.slice('::ffff:'.length)) // IPv4-mapped
    return false
  }

  return true // unrecognised format — fail closed
}
