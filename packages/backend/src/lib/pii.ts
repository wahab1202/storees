/**
 * Field-level PII masking for customer contact details.
 *
 * SECURITY MODEL: masking is enforced here, server-side, before any response
 * leaves the backend. Hiding fields only in the UI leaks them via devtools, the
 * network tab, and CSV export. Every customer-contact egress point must route
 * its output through these helpers when the viewer lacks `viewContactPii`.
 *
 * Masked fields (locked 2026-10-09): email + phone/WhatsApp. Name and address
 * stay visible. Mask style is PARTIAL — enough to recognise a record, not enough
 * to contact or reconstruct:
 *   email  jane.doe@gmail.com  ->  j•••@•••.com
 *   phone  +917012345678       ->  +•••••••7100   (last 4 kept)
 */

const DOT = '•'

/** Partially mask an email: keep the first local char + the TLD. */
export function maskEmail(email: string | null | undefined): string | null {
  if (email == null) return email ?? null
  const value = String(email).trim()
  if (!value) return value
  const at = value.indexOf('@')
  if (at <= 0) {
    // Not an email shape — mask all but the first char.
    return value[0] + DOT.repeat(3)
  }
  const local = value[0] + DOT.repeat(3)
  const domain = value.slice(at + 1)
  const lastDot = domain.lastIndexOf('.')
  const tld = lastDot >= 0 ? domain.slice(lastDot) : '' // ".com"
  return `${local}@${DOT.repeat(3)}${tld}`
}

/** Partially mask a phone/WhatsApp number: keep a leading "+" and the last 4 digits. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (phone == null) return phone ?? null
  const value = String(phone).trim()
  if (!value) return value
  const digits = value.replace(/\D/g, '')
  const plus = value.startsWith('+') ? '+' : ''
  if (digits.length <= 4) {
    // Too short to keep a tail safely — mask entirely.
    return plus + DOT.repeat(Math.max(digits.length, 3))
  }
  const last4 = digits.slice(-4)
  const hidden = DOT.repeat(Math.max(digits.length - 4, 3))
  return `${plus}${hidden}${last4}`
}

export type ContactCaps = { viewContactPii: boolean }

// JSONB keys (lowercased, non-alphanumerics stripped) that hold contact PII in
// raw event properties / webhook payloads. Kept deliberately narrow so we don't
// mangle unrelated fields.
const EMAIL_KEYS = new Set(['email', 'customeremail', 'contactemail', 'recipientemail', 'useremail', 'billingemail', 'shippingemail'])
const PHONE_KEYS = new Set(['phone', 'customerphone', 'phonenumber', 'waid', 'whatsapp', 'whatsappnumber', 'mobile', 'mobilenumber', 'msisdn', 'billingphone', 'shippingphone', 'contactphone'])

function normKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Redact the `email` / `phone` fields on a single mapped row in place of a copy.
 * No-op when the viewer may see contact PII. Masks whichever of the given keys
 * are present; defaults to the canonical `email`/`phone` column names.
 */
export function redactContactFields<T extends Record<string, unknown>>(
  row: T,
  caps: ContactCaps,
  opts?: { emailKeys?: string[]; phoneKeys?: string[] },
): T {
  if (caps.viewContactPii || row == null) return row
  const emailKeys = opts?.emailKeys ?? ['email', 'customerEmail']
  const phoneKeys = opts?.phoneKeys ?? ['phone', 'customerPhone']
  const out: Record<string, unknown> = { ...row }
  for (const k of emailKeys) {
    if (k in out && out[k] != null) out[k] = maskEmail(out[k] as string)
  }
  for (const k of phoneKeys) {
    if (k in out && out[k] != null) out[k] = maskPhone(out[k] as string)
  }
  return out as T
}

/** Convenience for the common customer row shape ({ email, phone, customerEmail, customerPhone }). */
export function redactCustomerContact<T extends Record<string, unknown>>(row: T, caps: ContactCaps): T {
  return redactContactFields(row, caps, {
    emailKeys: ['email', 'customerEmail'],
    phoneKeys: ['phone', 'customerPhone'],
  })
}

/**
 * Deep-scrub contact PII out of an arbitrary JSONB value (raw event properties,
 * webhook payloads, headers). Column-level masking can't reach these — PII lives
 * at unknown depths under known key names. Returns a masked copy; the input is
 * not mutated. No-op when the viewer may see contact PII.
 */
export function scrubJsonbPii<T>(value: T, caps: ContactCaps): T {
  if (caps.viewContactPii || value == null) return value
  return walk(value) as T
}

function walk(value: unknown): unknown {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(walk)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const nk = normKey(k)
      if (typeof v === 'string' && EMAIL_KEYS.has(nk)) out[k] = maskEmail(v)
      else if (typeof v === 'string' && PHONE_KEYS.has(nk)) out[k] = maskPhone(v)
      else out[k] = walk(v)
    }
    return out
  }
  return value
}
