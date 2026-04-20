import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import QRCode from 'qrcode'

const BCRYPT_ROUNDS = 12
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production'
const JWT_EXPIRY = '24h'
const TEMP_TOKEN_EXPIRY = '5m'
const TOTP_PERIOD = 30
const TOTP_DIGITS = 6
const TOTP_WINDOW = 1 // allow ±1 step (prev + current + next)

export type AdminRole = 'admin' | 'manager' | 'agent'

export type JwtPayload = {
  userId: string
  email: string
  projectId: string | null
  role: AdminRole
  agentId: string | null
  pending2FA?: boolean
}

// ── Password hashing ──

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ── JWT ──

export function generateJwt(payload: Omit<JwtPayload, 'pending2FA'> & { pending2FA?: boolean }): string {
  const expiry = payload.pending2FA ? TEMP_TOKEN_EXPIRY : JWT_EXPIRY
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiry })
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<JwtPayload> & { userId: string; email: string }
    // Defensive defaults for tokens issued before role/agentId were introduced.
    return {
      userId: decoded.userId,
      email: decoded.email,
      projectId: decoded.projectId ?? null,
      role: (decoded.role as AdminRole) ?? 'admin',
      agentId: decoded.agentId ?? null,
      pending2FA: decoded.pending2FA,
    }
  } catch {
    return null
  }
}

/**
 * Build a JWT payload from an admin_users row. Centralizes defaults so every
 * login / token-refresh path carries role + agentId.
 */
export function jwtPayloadFrom(user: {
  id: string
  email: string
  projectId: string | null
  role?: string | null
  agentId?: string | null
}): Omit<JwtPayload, 'pending2FA'> {
  return {
    userId: user.id,
    email: user.email,
    projectId: user.projectId,
    role: (user.role as AdminRole) ?? 'admin',
    agentId: user.agentId ?? null,
  }
}

// ── Password reset tokens ──

export function generatePasswordResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ── TOTP (2FA) — pure crypto implementation ──

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]
    bits += 8
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(encoded: string): Buffer {
  const stripped = encoded.replace(/=+$/, '').toUpperCase()
  let bits = 0
  let value = 0
  const output: number[] = []
  for (let i = 0; i < stripped.length; i++) {
    const idx = BASE32_CHARS.indexOf(stripped[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(output)
}

function generateHOTP(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  let tmp = counter
  for (let i = 7; i >= 0; i--) {
    buf[i] = tmp & 0xff
    tmp = Math.floor(tmp / 256)
  }

  const hmac = crypto.createHmac('sha1', secret).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  return (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0')
}

export function generateTotpSecret(email: string): { secret: string; otpauthUrl: string } {
  const buffer = crypto.randomBytes(20)
  const secret = base32Encode(buffer)
  const otpauthUrl = `otpauth://totp/${encodeURIComponent('Storees')}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent('Storees')}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`
  return { secret, otpauthUrl }
}

export function verifyTotp(secret: string, code: string): boolean {
  const secretBuffer = base32Decode(secret)
  const now = Math.floor(Date.now() / 1000)

  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const counter = Math.floor((now + i * TOTP_PERIOD) / TOTP_PERIOD)
    if (generateHOTP(secretBuffer, counter) === code) {
      return true
    }
  }
  return false
}

export async function generateQrCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl)
}
