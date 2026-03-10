import RedisModule from 'ioredis'

const Redis = RedisModule.default ?? RedisModule

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

// Parse URL into host/port for BullMQ connection config
function parseRedisUrl(url: string) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(parsed.username ? { username: parsed.username } : {}),
  }
}

/** Connection config for BullMQ Queue/Worker constructors */
export const redisConnection = {
  ...parseRedisUrl(REDIS_URL),
  maxRetriesPerRequest: null,
}

/** Standalone Redis client for nonce storage, pub/sub, etc. */
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
})

export const redisSubscriber = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
})
