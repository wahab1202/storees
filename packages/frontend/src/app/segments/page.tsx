'use client'

import { PageHeader } from '@/components/layout/PageHeader'
import { useSegments, useEvaluateSegments } from '@/hooks/useSegments'
import { filterSummary } from '@/components/segments/SegmentFilterBuilder'
import { LifecycleChart } from '@/components/segments/LifecycleChart'
import Link from 'next/link'
import { RefreshCw, Users, ArrowRight, Plus, PieChart, Filter, Pencil } from 'lucide-react'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { FilterConfig } from '@storees/shared'

export default function SegmentsPage() {
  const { data, isLoading, isError } = useSegments()
  const evaluate = useEvaluateSegments()

  return (
    <div>
      <PageHeader
        title="Segments"
        actions={
          <>
            <button
              onClick={() => evaluate.mutate()}
              disabled={evaluate.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border text-text-primary rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', evaluate.isPending && 'animate-spin')} />
              Re-evaluate All
            </button>
            <Link
              href="/segments/create"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Segment
            </Link>
          </>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load segments.</p>
        </div>
      ) : data && data.data.length === 0 ? (
        <div className="text-center py-20 bg-white border border-border rounded-xl">
          <PieChart className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-text-primary mb-1">No segments yet</h3>
          <p className="text-sm text-text-secondary mb-4">
            Create segments to group customers by shared characteristics.
          </p>
          <Link
            href="/segments/create"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Segment
          </Link>
        </div>
      ) : data ? (
        <div className="space-y-6">
        {/* Lifecycle Chart */}
        <LifecycleChart />

        {/* Segment Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.data.map(segment => (
            <div
              key={segment.id}
              className="bg-white border border-border rounded-xl p-5 hover:border-border-focus/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-text-primary">{segment.name}</h3>
                  <p className="text-sm text-text-secondary mt-1">{segment.description}</p>
                </div>
                <span
                  className={cn(
                    'inline-block px-2.5 py-0.5 text-[11px] rounded-full font-semibold uppercase tracking-wide flex-shrink-0 ml-3',
                    segment.type === 'default'
                      ? 'bg-accent/10 text-accent'
                      : 'bg-blue-50 text-blue-600',
                  )}
                >
                  {segment.type}
                </span>
              </div>

              {/* Filter summary */}
              {segment.filters && (
                <div className="flex items-start gap-2 mt-3 px-3 py-2 bg-surface rounded-lg">
                  <Filter className="h-3.5 w-3.5 text-text-muted flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-text-secondary leading-relaxed truncate">
                    {filterSummary(segment.filters as FilterConfig)}
                  </p>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-text-muted" />
                  <span className="text-sm font-semibold text-text-primary tabular-nums">
                    {segment.memberCount.toLocaleString()}
                  </span>
                  <span className="text-sm text-text-muted">members</span>
                  {!segment.isActive && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-red-50 text-red-600">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/segments/${segment.id}/edit`}
                    className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary font-medium transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Link>
                  {segment.memberCount > 0 && (
                    <Link
                      href={`/customers?segmentId=${segment.id}`}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover font-medium transition-colors"
                    >
                      View members
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
      ) : null}
    </div>
  )
}
