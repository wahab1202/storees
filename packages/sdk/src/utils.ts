/** Generate a UUID v4 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Safe localStorage get */
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Safe localStorage set */
export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // localStorage may be full or blocked
  }
}

/** Safe localStorage remove */
export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** Safe sessionStorage get */
export function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/** Safe sessionStorage set */
export function sessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

/** Safe sessionStorage remove */
export function sessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** First-party cookie get */
export function cookieGet(key: string): string | null {
  try {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'))
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

/**
 * First-party cookie set. Long-lived (browsers cap Max-Age at ~400 days;
 * Safari ITP caps script-set cookies to 7 days, so this is redundancy, not a
 * silver bullet — a server-set first-party cookie is needed for full Safari
 * durability). Host-only + SameSite=Lax; Secure on https.
 */
export function cookieSet(key: string, value: string, days = 400): void {
  try {
    const maxAge = days * 24 * 60 * 60
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${key}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
  } catch {
    // ignore
  }
}

/** Delete a first-party cookie. */
export function cookieRemove(key: string): void {
  try {
    document.cookie = `${key}=; Max-Age=0; Path=/; SameSite=Lax`
  } catch {
    // ignore
  }
}

/* ── IndexedDB: async best-effort backup store (survives some evictions that
   clear localStorage/cookies; itself subject to Safari ITP eviction). ── */

const IDB_NAME = 'storees'
const IDB_STORE = 'kv'

function idbOpen(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function idbGet(key: string): Promise<string | null> {
  const db = await idbOpen()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key)
      req.onsuccess = () => resolve((req.result as string) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function idbSet(key: string, value: string): Promise<void> {
  const db = await idbOpen()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/**
 * Read a durable id from the synchronous stores (localStorage, then cookie),
 * healing whichever one is missing so a value evicted from one store is
 * restored from the other.
 */
export function durableGetSync(key: string): string | null {
  const ls = storageGet(key)
  const ck = cookieGet(key)
  const val = ls ?? ck
  if (val) {
    if (!ls) storageSet(key, val)
    if (!ck) cookieSet(key, val)
  }
  return val
}

/** Write a durable id to every synchronous store. */
export function durableSetSync(key: string, value: string): void {
  storageSet(key, value)
  cookieSet(key, value)
}

/** Remove a durable id from every store (sync stores immediately; IDB async). */
export function durableRemove(key: string): void {
  storageRemove(key)
  cookieRemove(key)
  void idbSet(key, '').catch(() => {})
}

/** Get current ISO timestamp */
export function now(): string {
  return new Date().toISOString()
}

/** Debug logger — only logs when debug mode is enabled */
export function createLogger(debug: boolean) {
  return {
    log: (...args: unknown[]) => {
      if (debug) console.log('[Storees]', ...args)
    },
    warn: (...args: unknown[]) => {
      if (debug) console.warn('[Storees]', ...args)
    },
    error: (...args: unknown[]) => {
      console.error('[Storees]', ...args)
    },
  }
}

export type Logger = ReturnType<typeof createLogger>
