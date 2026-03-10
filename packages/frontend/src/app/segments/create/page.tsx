'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SegmentFilterBuilder } from '@/components/segments/SegmentFilterBuilder'
import { AiChatPanel } from '@/components/segments/AiChatPanel'
import { useCreateSegment } from '@/hooks/useSegments'
import { ArrowLeft, Users, Filter, Loader2 } from 'lucide-react'
import type { FilterConfig } from '@storees/shared'

const EMPTY_FILTERS: FilterConfig = {
  logic: 'AND',
  rules: [{ field: 'total_orders', operator: 'greater_than', value: 0 }],
}

export default function CreateSegmentPage() {
  const router = useRouter()
  const createSegment = useCreateSegment()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [filters, setFilters] = useState<FilterConfig>(EMPTY_FILTERS)

  const handleCreate = () => {
    if (!name.trim()) return
    if (filters.rules.length === 0) return

    createSegment.mutate(
      { name, description, filters },
      {
        onSuccess: () => {
          router.push('/segments')
        },
      },
    )
  }

  const canCreate = name.trim().length > 0 && filters.rules.length > 0

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
            <h1 className="text-2xl font-bold text-heading">Create Segment</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Define conditions to group your customers automatically
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/segments')}
            className="px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || createSegment.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createSegment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {createSegment.isPending ? 'Creating...' : 'Create Segment'}
          </button>
        </div>
      </div>

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
                  placeholder="e.g. High-Value Repeat Buyers"
                  autoFocus
                  className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Description
                  <span className="text-text-muted font-normal ml-1">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe what this segment represents..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted resize-none"
                />
              </div>
            </div>
          </div>

          {/* Conditions Card */}
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
        </div>

        {/* Right: AI Chat Panel */}
        <div className="hidden lg:block">
          <div className="sticky top-6">
            <AiChatPanel onApplyFilters={setFilters} />
          </div>
        </div>
      </div>
    </div>
  )
}
