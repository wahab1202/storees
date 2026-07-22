import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants.js'

export function clampPageSize(pageSize: number | undefined): number {
  const size = pageSize ?? DEFAULT_PAGE_SIZE
  return Math.min(Math.max(1, size), MAX_PAGE_SIZE)
}

export function calcTotalPages(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize)
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Read a nested value by dot-path, with numeric segments indexing arrays —
 * e.g. `line_items.0.image` → obj.line_items[0].image. A path without dots
 * is a plain key read. Returns undefined anywhere the path breaks.
 */
export function readPath(obj: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!obj) return undefined
  if (!path.includes('.')) return obj[path]
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined
    if (Array.isArray(acc)) {
      const idx = Number(key)
      return Number.isInteger(idx) ? acc[idx] : undefined
    }
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

/**
 * Normalize an unknown value into a trimmed, non-empty string array.
 * Non-array input yields an empty array.
 */
export function normalizeEmailList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(v => String(v).trim()).filter(Boolean)
}
