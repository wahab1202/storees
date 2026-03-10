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
