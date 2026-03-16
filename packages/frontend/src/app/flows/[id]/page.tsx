'use client'

import { useParams, useRouter } from 'next/navigation'
import { useFlowDetail, useUpdateFlow, useUpdateFlowStatus } from '@/hooks/useFlows'
import { useDashboardStats } from '@/hooks/useDashboard'
import { FlowBuilder } from '@/components/flows/FlowBuilder'
import { Loader2, ArrowLeft, Play, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FlowNode, ExitConfig } from '@storees/shared'

export default function FlowDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { data, isLoading, isError } = useFlowDetail(id)
  const { data: statsData } = useDashboardStats()
  const updateFlow = useUpdateFlow()
  const updateStatus = useUpdateFlowStatus()

  const handleSave = (nodes: FlowNode[], exitConfig: ExitConfig | null) => {
    updateFlow.mutate({ id, nodes, exitConfig })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    )
  }

  if (isError || !data?.data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 text-sm">Failed to load flow.</p>
      </div>
    )
  }

  const flow = data.data
  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    draft: 'bg-gray-100 text-gray-600',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/flows')}
            className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-text-secondary" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-text-primary">{flow.name}</h1>
            <p className="text-sm text-text-secondary">{flow.description}</p>
          </div>
          <span className={cn('px-2.5 py-1 text-xs rounded-full font-medium', statusColors[flow.status])}>
            {flow.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {flow.status === 'draft' && (
            <button
              onClick={() => updateStatus.mutate({ id, status: 'active' })}
              disabled={updateStatus.isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Activate
            </button>
          )}
          {flow.status === 'active' && (
            <button
              onClick={() => updateStatus.mutate({ id, status: 'paused' })}
              disabled={updateStatus.isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          )}
          {flow.status === 'paused' && (
            <button
              onClick={() => updateStatus.mutate({ id, status: 'active' })}
              disabled={updateStatus.isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          )}
        </div>
      </div>

      <FlowBuilder
        flowNodes={flow.nodes as FlowNode[]}
        exitConfig={flow.exitConfig as ExitConfig | null}
        onSave={handleSave}
        saving={updateFlow.isPending}
        domainType={statsData?.data.domainType}
      />
    </div>
  )
}
