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
