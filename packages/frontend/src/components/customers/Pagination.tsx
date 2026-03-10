'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null

  const pages = getPageNumbers(page, totalPages)

  return (
    <div className="flex items-center justify-center gap-1 mt-4 py-3">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={cn(
          'p-2 rounded-lg transition-colors',
          page <= 1 ? 'text-text-muted cursor-not-allowed' : 'text-text-secondary hover:bg-surface hover:text-text-primary',
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-text-muted text-sm">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p as number)}
            className={cn(
              'min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors',
              p === page
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-surface hover:text-text-primary',
            )}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(
          'p-2 rounded-lg transition-colors',
          page >= totalPages ? 'text-text-muted cursor-not-allowed' : 'text-text-secondary hover:bg-surface hover:text-text-primary',
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Generates page numbers with ellipsis for large ranges */
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '...')[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')

  pages.push(total)
  return pages
}
