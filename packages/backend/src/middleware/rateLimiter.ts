import { Request, Response, NextFunction } from 'express'
import { redis } from '../services/redis.js'

/**
 * Redis-backed sliding window rate limiter.
 *
 * Uses the API key's rateLimit field (requests per minute).
 * Falls back to a default limit for unauthenticated routes.
 *
 * Algorithm: increment a Redis counter keyed by (apiKeyId, minute).
 * TTL of 120s ensures cleanup. Atomic INCR prevents race conditions.
 */
export function rateLimiter(defaultLimit = 100) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Use API key ID if authenticated, otherwise use IP
      const reqAny = req as unknown as Record<string, unknown>
      const identifier = (reqAny.apiKeyId as string)
        ?? req.ip
        ?? req.socket.remoteAddress
        ?? 'unknown'

      const limit = (reqAny.apiKeyRateLimit as number)
        ?? defaultLimit

      const currentMinute = Math.floor(Date.now() / 60000)
      const key = `ratelimit:${identifier}:${currentMinute}`

      const count = await redis.incr(key)

      // Set TTL on first increment (2 minutes to cover the full window)
      if (count === 1) {
        await redis.expire(key, 120)
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', limit)
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count))
      res.setHeader('X-RateLimit-Reset', (currentMinute + 1) * 60)

      if (count > limit) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: 60 - (Math.floor(Date.now() / 1000) % 60),
        })
      }

      next()
    } catch (err) {
      // If Redis is down, allow the request (fail open)
      console.error('Rate limiter error:', err)
      next()
    }
  }
}
