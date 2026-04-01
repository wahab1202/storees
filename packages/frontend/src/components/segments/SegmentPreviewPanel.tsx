'use client'

import { useEffect, useRef } from 'react'
import { useSegmentPreview } from '@/hooks/useSegments'
import { Users, Loader2, AlertCircle, Mail, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilterConfig } from '@storees/shared'

type Props = {
  filters: FilterConfig | null
}

export function SegmentPreviewPanel({ filters }: Props) {
  const preview = useSegmentPreview()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce preview requests as filters change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!filters || filters.rules.length === 0) return

    debounceRef.current = setTimeout(() => {
      preview.mutate(filters)
    }, 600)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const data = preview.data?.data
  const hasRules = filters && filters.rules.length > 0

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">Audience Preview</h3>
        </div>
        {preview.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />}
      </div>

      <div className="p-4">
        {!hasRules ? (
          <div className="text-center py-8">
            <Users className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-xs text-text-muted">Add conditions to see matching customers</p>
          </div>
        ) : data?.error ? (
          <div className="text-center py-6">
            <AlertCircle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="text-xs text-text-muted">Could not evaluate filters</p>
          </div>
        ) : data ? (
          <>
            {/* Total count badge */}
            <div className={cn(
              'flex items-center justify-center gap-2 py-2.5 rounded-lg mb-3',
              data.total > 0 ? 'bg-accent/5 border border-accent/20' : 'bg-surface border border-border',
            )}>
              <Users className={cn('h-4 w-4', data.total > 0 ? 'text-accent' : 'text-text-muted')} />
              <span className={cn('text-lg font-bold', data.total > 0 ? 'text-accent' : 'text-text-muted')}>
                {data.total.toLocaleString()}
              </span>
              <span className="text-xs text-text-secondary">
                {data.total === 1 ? 'customer matches' : 'customers match'}
              </span>
            </div>

            {/* Sample customers */}
            {data.sample.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">
                  Sample matches
                </p>
                <div className="space-y-1">
                  {data.sample.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface transition-colors"
                    >
                      {/* Avatar */}
                      <div className="h-7 w-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-accent">
                          {(c.name || c.email || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-text-primary truncate">
                          {c.name || 'Unknown'}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-text-muted">
                          {c.email && (
                            <span className="flex items-center gap-0.5 truncate">
                              <Mail className="h-2.5 w-2.5" />
                              {c.email}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Orders badge */}
                      <div className="flex items-center gap-1 text-[10px] text-text-muted flex-shrink-0">
                        <ShoppingBag className="h-2.5 w-2.5" />
                        {c.totalOrders}
                      </div>
                    </div>
                  ))}
                </div>
                {data.total > 10 && (
                  <p className="text-[10px] text-text-muted text-center mt-2">
                    + {(data.total - 10).toLocaleString()} more
                  </p>
                )}
              </div>
            )}

            {data.total === 0 && (
              <p className="text-xs text-text-muted text-center py-2">
                No customers match these conditions yet
              </p>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <Users className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-xs text-text-muted">Preview will appear here</p>
          </div>
        )}
      </div>
    </div>
  )
}
