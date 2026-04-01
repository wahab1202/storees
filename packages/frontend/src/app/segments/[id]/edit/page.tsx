'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { SegmentFilterBuilder } from '@/components/segments/SegmentFilterBuilder'
import { SegmentPreviewPanel } from '@/components/segments/SegmentPreviewPanel'
import { AiChatPanel } from '@/components/segments/AiChatPanel'
import { useSegmentDetail, useUpdateSegment, useDeleteSegment } from '@/hooks/useSegments'
import { ArrowLeft, Users, Filter, Loader2, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { FilterConfig } from '@storees/shared'

export default function EditSegmentPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { data, isLoading, isError } = useSegmentDetail(id)
  const updateSegment = useUpdateSegment()
  const deleteSegment = useDeleteSegment()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [filters, setFilters] = useState<FilterConfig | null>(null)
  const [showDelete, setShowDelete] = useState(false)

  // Sync form state when data loads
  useEffect(() => {
    if (data?.data) {
      setName(data.data.name)
      setDescription(data.data.description ?? '')
      setFilters(data.data.filters as FilterConfig)
    }
  }, [data])

  const handleSave = () => {
    if (!name.trim() || !filters) return
    updateSegment.mutate(
      { id, name, description, filters },
      { onSuccess: () => router.push('/segments') },
    )
  }

  const handleDelete = () => {
    deleteSegment.mutate(id, {
      onSuccess: () => router.push('/segments'),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          <div className="space-y-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
          <Skeleton className="h-[500px] w-full hidden lg:block" />
        </div>
      </div>
    )
  }

  if (isError || !data?.data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 text-sm">Segment not found.</p>
      </div>
    )
  }

  const segment = data.data
  const isDefault = segment.type === 'default'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/segments')}
            className="p-2 rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-text-secondary" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-heading">Edit Segment</h1>
              <span
                className={cn(
                  'px-2.5 py-0.5 text-[11px] rounded-full font-semibold uppercase tracking-wide',
                  isDefault ? 'bg-accent/10 text-accent' : 'bg-blue-50 text-blue-600',
                )}
              >
                {segment.type}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-0.5">
              {segment.memberCount.toLocaleString()} members
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isDefault && (
            <button
              onClick={() => setShowDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
          <button
            onClick={() => router.push('/segments')}
            className="px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !filters || updateSegment.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateSegment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {updateSegment.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDelete && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700 flex-1">
            Permanently delete this segment? This cannot be undone.
          </p>
          <button
            onClick={() => setShowDelete(false)}
            className="px-3 py-1.5 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteSegment.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleteSegment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
        </div>
      )}

      {/* Split layout: Builder + AI Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left: Segment Builder */}
        <div className="space-y-6 min-w-0">
          {/* Segment Details Card */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Users className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Segment Details</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={isDefault}
                  className={cn(
                    'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted',
                    isDefault && 'bg-surface cursor-not-allowed',
                  )}
                />
                {isDefault && (
                  <p className="text-xs text-text-muted mt-1">Default segment names cannot be changed.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Description
                  <span className="text-text-muted font-normal ml-1">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted resize-none"
                />
              </div>
            </div>
          </div>

          {/* Conditions Card */}
          {filters && (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-text-muted" />
                  <h2 className="text-sm font-semibold text-text-primary">Conditions</h2>
                </div>
                <p className="text-xs text-text-muted">
                  Customers who match <span className="font-semibold text-text-secondary">{filters.logic === 'AND' ? 'all' : 'any'}</span> of the following
                </p>
              </div>
              <div className="p-5">
                <SegmentFilterBuilder filters={filters} onChange={setFilters} />
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview + AI Chat Panel */}
        <div className="hidden lg:block">
          <div className="sticky top-6 space-y-4">
            <SegmentPreviewPanel filters={filters} />
            <AiChatPanel onApplyFilters={setFilters} />
          </div>
        </div>
      </div>
    </div>
  )
}
