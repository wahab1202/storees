'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCustomers } from '@/hooks/useCustomers'
import { useSegments } from '@/hooks/useSegments'
import { PageHeader } from '@/components/layout/PageHeader'
import { CustomerTable } from '@/components/customers/CustomerTable'
import { Pagination } from '@/components/customers/Pagination'
import { Search, X } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/Skeleton'
import type { CustomerListParams } from '@storees/shared'

export default function CustomersPage() {
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
            {params.search ? 'No customers match your search.' : 'No customers yet. Connect a Shopify store to sync data.'}
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
