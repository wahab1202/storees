import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    console.warn('ENCRYPTION_KEY not set — tokens stored in plain text')
    return Buffer.alloc(0)
  }
  return Buffer.from(key, 'hex')
}

/**
 * Encrypt a string value. Returns base64-encoded string: iv + authTag + ciphertext.
 * If ENCRYPTION_KEY is not set, returns the value as-is (dev mode).
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  if (key.length === 0) return plaintext

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Format: iv(12) + authTag(16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted])
  return `enc:${combined.toString('base64')}`
}

/**
 * Decrypt a value encrypted with encrypt(). Handles both encrypted (enc: prefix)
 * and plain text values (backwards compatible).
 */
export function decrypt(value: string): string {
  // Plain text (not encrypted) — return as-is
  if (!value.startsWith('enc:')) return value

  const key = getKey()
  if (key.length === 0) {
    console.warn('Cannot decrypt — ENCRYPTION_KEY not set')
    return value
  }

  const combined = Buffer.from(value.slice(4), 'base64')

  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(ciphertext) + decipher.final('utf8')
}
