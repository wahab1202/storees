'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCustomers } from '@/hooks/useCustomers'
import { useSegments } from '@/hooks/useSegments'
import { useDashboardStats } from '@/hooks/useDashboard'
import { PageHeader } from '@/components/layout/PageHeader'
import { CustomerTable } from '@/components/customers/CustomerTable'
import { Pagination } from '@/components/customers/Pagination'
import { Search, X, Users, UserCheck, UserPlus, DollarSign } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/Skeleton'
import type { CustomerListParams } from '@storees/shared'

export default function CustomersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CustomersContent />
    </Suspense>
  )
}

function CustomersContent() {
  const searchParams = useSearchParams()
  const initialSegmentId = searchParams.get('segmentId') ?? undefined

  const [params, setParams] = useState<CustomerListParams>({
    page: 1,
    pageSize: 25,
    sortBy: 'lastSeen',
    sortOrder: 'desc',
    segmentId: initialSegmentId,
  })
  const [searchInput, setSearchInput] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { data: segmentsData } = useSegments()
  const { data: statsData } = useDashboardStats()
  const domain = statsData?.data.domainType

  const { data, isLoading, isError } = useCustomers(params)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setParams(p => ({ ...p, page: 1, search: searchInput || undefined }))
  }

  function handleSort(sortBy: CustomerListParams['sortBy']) {
    setParams(p => ({
      ...p,
      page: 1,
      sortBy,
      sortOrder: p.sortBy === sortBy && p.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }

  function handlePageChange(page: number) {
    setParams(p => ({ ...p, page }))
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        actions={
          <span className="text-sm text-text-secondary">
            {data?.pagination.total !== undefined && `${data.pagination.total} total`}
          </span>
        }
      />

      {/* Metric strip */}
      {statsData?.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Customers', value: statsData.data.totalCustomers, icon: Users, color: 'text-blue-600 bg-blue-50' },
            { label: 'Active (7d)', value: statsData.data.activeCustomers, icon: UserCheck, color: 'text-emerald-600 bg-emerald-50', change: statsData.data.activeChange },
            { label: 'New This Week', value: statsData.data.newCustomers, icon: UserPlus, color: 'text-violet-600 bg-violet-50', change: statsData.data.newCustomersChange },
            { label: 'Avg CLV', value: statsData.data.avgClv, icon: DollarSign, color: 'text-amber-600 bg-amber-50', isCurrency: true },
          ].map(metric => {
            const Icon = metric.icon
            return (
              <div key={metric.label} className="bg-white border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-lg ${metric.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{metric.label}</span>
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-xl font-bold text-heading tabular-nums">
                    {metric.isCurrency
                      ? `$${(metric.value / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : metric.value.toLocaleString()}
                  </p>
                  {metric.change !== undefined && metric.change !== 0 && (
                    <span className={`text-xs font-medium mb-0.5 ${metric.change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {metric.change > 0 ? '+' : ''}{metric.change.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Search bar + segment filter */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg bg-surface-elevated
                         focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus
                         placeholder:text-text-muted"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            Search
          </button>
        </form>
        <div className="flex items-center gap-2">
          <select
            value={params.segmentId ?? ''}
            onChange={e => setParams(p => ({ ...p, page: 1, segmentId: e.target.value || undefined }))}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-surface-elevated
                       focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus
                       text-text-primary"
          >
            <option value="">All segments</option>
            {segmentsData?.data.map(seg => (
              <option key={seg.id} value={seg.id}>{seg.name}</option>
            ))}
          </select>
          {params.segmentId && (
            <button
              onClick={() => setParams(p => ({ ...p, page: 1, segmentId: undefined }))}
              className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-text-muted"
              title="Clear segment filter"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load customers. Is the backend running?</p>
        </div>
      ) : data && data.data.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-text-secondary text-sm">
            {params.search ? 'No customers match your search.' : 'No customers yet. Send events via the API to start syncing data.'}
          </p>
        </div>
      ) : data ? (
        <>
          <CustomerTable
            customers={data.data}
            sortBy={params.sortBy}
            sortOrder={params.sortOrder}
            onSort={handleSort}
            expandedId={expandedId}
            onToggleExpand={id => setExpandedId(expandedId === id ? null : id)}
            domain={domain}
          />
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={handlePageChange}
          />
        </>
      ) : null}
    </div>
  )
}
