import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { db } from '../db/connection.js'
import { apiKeys, projects } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { redis } from '../services/redis.js'

const KEY_PREFIX = 'sk_live_'
const SECRET_PREFIX = 'ss_live_'
const CACHE_TTL_SECONDS = 300 // 5 minutes
const CACHE_PREFIX = 'apikey:'

/** Generate a new API key pair. Returns the raw secret (shown once). */
export function generateApiKeyPair(): { keyPublic: string; keySecret: string; keySecretHash: string } {
  const keyPublic = KEY_PREFIX + crypto.randomBytes(24).toString('hex')
  const keySecret = SECRET_PREFIX + crypto.randomBytes(32).toString('hex')
  const keySecretHash = hashSecret(keySecret)
  return { keyPublic, keySecret, keySecretHash }
}

/** Hash a secret using SHA-256 (fast, suitable for API secrets with high entropy). */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

/** Constant-time comparison for secrets. */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

type ApiKeyAuthRequest = Request & {
  projectId?: string
  apiKeyId?: string
  apiKeyPermissions?: string[]
  apiKeyRateLimit?: number
}

type CachedApiKey = {
  id: string
  projectId: string
  permissions: string[]
  rateLimit: number
  ipWhitelist: string[] | null
  expiresAt: string | null
}

/**
 * Invalidate cached API key data. Call when a key is revoked, rotated,
 * or its permissions/rate-limit change.
 */
export async function invalidateApiKeyCache(keyPublic: string): Promise<void> {
  const pattern = `${CACHE_PREFIX}${keyPublic}:*`
  const keys = await redis.keys(pattern).catch(() => [])
  if (keys.length > 0) {
    await redis.del(...keys).catch(() => {})
  }
}

/**
 * Middleware: Authenticate requests via X-API-Key + X-API-Secret headers.
 * Sets req.projectId, req.apiKeyId, req.apiKeyPermissions on success.
 */
export function requireApiKeyAuth(requiredPermission: string = 'write') {
  return async (req: ApiKeyAuthRequest, res: Response, next: NextFunction) => {
    const keyPublic = req.headers['x-api-key'] as string | undefined
    const keySecret = req.headers['x-api-secret'] as string | undefined

    if (!keyPublic || !keySecret) {
      return res.status(401).json({
        success: false,
        error: 'Missing X-API-Key or X-API-Secret headers',
      })
    }

    try {
      // Hash the provided secret once — used for both cache key and verification
      const providedHash = hashSecret(keySecret)

      // Cache key: hash of public key + secret hash (avoids storing raw credentials)
      const cacheKey = `${CACHE_PREFIX}${keyPublic}:${providedHash}`

      // Try Redis cache first
      const cached = await redis.get(cacheKey).catch(() => null)
      if (cached) {
        const keyData = JSON.parse(cached) as CachedApiKey

        // Check expiry (may have expired since caching)
        if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
          await redis.del(cacheKey).catch(() => {})
          return res.status(401).json({ success: false, error: 'API key has expired' })
        }

        // Check IP whitelist
        if (keyData.ipWhitelist && keyData.ipWhitelist.length > 0) {
          const clientIp = req.ip || req.socket.remoteAddress || ''
          if (!keyData.ipWhitelist.includes(clientIp)) {
            return res.status(403).json({
              success: false,
              error: `IP ${clientIp} is not whitelisted for this API key`,
            })
          }
        }

        // Check permissions
        if (keyData.permissions && !keyData.permissions.includes(requiredPermission) && !keyData.permissions.includes('admin')) {
          return res.status(403).json({
            success: false,
            error: `API key lacks '${requiredPermission}' permission`,
          })
        }

        // Set request context from cache
        req.projectId = keyData.projectId
        req.apiKeyId = keyData.id
        req.apiKeyPermissions = keyData.permissions ?? ['write']
        req.apiKeyRateLimit = keyData.rateLimit

        return next()
      }

      // Cache miss — look up in DB
      const [key] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.keyPublic, keyPublic), eq(apiKeys.isActive, true)))
        .limit(1)

      if (!key) {
        return res.status(401).json({ success: false, error: 'Invalid API key' })
      }

      // Check expiry
      if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
        return res.status(401).json({ success: false, error: 'API key has expired' })
      }

      // Verify secret
      if (!secureCompare(providedHash, key.keySecretHash)) {
        return res.status(401).json({ success: false, error: 'Invalid API secret' })
      }

      // Check IP whitelist
      const whitelist = key.ipWhitelist as string[] | null
      if (whitelist && whitelist.length > 0) {
        const clientIp = req.ip || req.socket.remoteAddress || ''
        if (!whitelist.includes(clientIp)) {
          return res.status(403).json({
            success: false,
            error: `IP ${clientIp} is not whitelisted for this API key`,
          })
        }
      }

      // Check permissions
      const perms = key.permissions as string[] | null
      if (perms && !perms.includes(requiredPermission) && !perms.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: `API key lacks '${requiredPermission}' permission`,
        })
      }

      // Cache the validated key data in Redis (5 min TTL)
      const keyData: CachedApiKey = {
        id: key.id,
        projectId: key.projectId,
        permissions: (perms ?? ['write']) as string[],
        rateLimit: key.rateLimit,
        ipWhitelist: whitelist,
        expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
      }
      await redis.set(cacheKey, JSON.stringify(keyData), 'EX', CACHE_TTL_SECONDS).catch(() => {})

      // Set request context
      req.projectId = key.projectId
      req.apiKeyId = key.id
      req.apiKeyPermissions = keyData.permissions
      req.apiKeyRateLimit = key.rateLimit

      // Update last_used_at (fire-and-forget)
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id))
        .catch(() => {}) // non-blocking

      next()
    } catch (err) {
      console.error('API key auth error:', err)
      res.status(500).json({ success: false, error: 'Authentication failed' })
    }
  }
}

/**
 * Middleware: Authenticate requests via public key only (no secret required).
 * Designed for client-side SDKs where the secret cannot be embedded.
 *
 * Accepts public key from (checked in order):
 *   1. X-API-Key header
 *   2. Authorization: Bearer <key> header
 *   3. ?api_key=<key> query param (for sendBeacon)
 *
 * Only allows 'write' permission — read/admin operations still require full auth.
 */
export function requirePublicKeyAuth() {
  return async (req: ApiKeyAuthRequest, res: Response, next: NextFunction) => {
    // Extract public key from multiple sources
    let keyPublic: string | undefined =
      (req.headers['x-api-key'] as string | undefined)

    if (!keyPublic) {
      const authHeader = req.headers['authorization'] as string | undefined
      if (authHeader?.startsWith('Bearer ')) {
        keyPublic = authHeader.slice(7)
      }
    }

    if (!keyPublic) {
      keyPublic = req.query.api_key as string | undefined
    }

    if (!keyPublic) {
      return res.status(401).json({
        success: false,
        error: 'Missing API key. Provide via X-API-Key header, Authorization: Bearer, or ?api_key= query param.',
      })
    }

    try {
      // Cache key: public-key-only mode uses a different cache namespace
      const cacheKey = `${CACHE_PREFIX}${keyPublic}:public`

      // Try Redis cache first
      const cached = await redis.get(cacheKey).catch(() => null)
      if (cached) {
        const keyData = JSON.parse(cached) as CachedApiKey

        if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
          await redis.del(cacheKey).catch(() => {})
          return res.status(401).json({ success: false, error: 'API key has expired' })
        }

        if (!keyData.permissions.includes('write') && !keyData.permissions.includes('admin')) {
          return res.status(403).json({ success: false, error: 'API key lacks write permission' })
        }

        req.projectId = keyData.projectId
        req.apiKeyId = keyData.id
        req.apiKeyPermissions = keyData.permissions
        req.apiKeyRateLimit = keyData.rateLimit

        return next()
      }

      // Cache miss — look up in DB
      const [key] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.keyPublic, keyPublic), eq(apiKeys.isActive, true)))
        .limit(1)

      if (!key) {
        return res.status(401).json({ success: false, error: 'Invalid API key' })
      }

      if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
        return res.status(401).json({ success: false, error: 'API key has expired' })
      }

      const perms = key.permissions as string[] | null
      if (perms && !perms.includes('write') && !perms.includes('admin')) {
        return res.status(403).json({ success: false, error: 'API key lacks write permission' })
      }

      // Cache for next time
      const keyData: CachedApiKey = {
        id: key.id,
        projectId: key.projectId,
        permissions: (perms ?? ['write']) as string[],
        rateLimit: key.rateLimit,
        ipWhitelist: key.ipWhitelist as string[] | null,
        expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
      }
      await redis.set(cacheKey, JSON.stringify(keyData), 'EX', CACHE_TTL_SECONDS).catch(() => {})

      req.projectId = key.projectId
      req.apiKeyId = key.id
      req.apiKeyPermissions = keyData.permissions
      req.apiKeyRateLimit = key.rateLimit

      // Update last_used_at (fire-and-forget)
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id))
        .catch(() => {})

      next()
    } catch (err) {
      console.error('Public key auth error:', err)
      res.status(500).json({ success: false, error: 'Authentication failed' })
    }
  }
}
