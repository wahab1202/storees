'use client'

import { useParams, useRouter } from 'next/navigation'
import { useFlowDetail, useUpdateFlow, useUpdateFlowStatus } from '@/hooks/useFlows'
import { useDashboardStats } from '@/hooks/useDashboard'
import { StructuredFlowBuilder } from '@/components/flows/StructuredFlowBuilder'
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
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
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

  return (
    // Break out of AppShell's max-w and padding — full bleed layout
    <div className="-m-4 sm:-m-6 flex flex-col h-screen lg:h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/flows')}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </button>
          <h1 className="text-base font-bold text-gray-900">{flow.name}</h1>
          <StatusBadge status={flow.status} />
        </div>
        <div className="flex items-center gap-2">
          {flow.status === 'draft' && (
            <StatusButton
              onClick={() => updateStatus.mutate({ id, status: 'active' })}
              loading={updateStatus.isPending}
              icon={Play} label="Activate"
              className="bg-green-600 hover:bg-green-700"
            />
          )}
          {flow.status === 'active' && (
            <StatusButton
              onClick={() => updateStatus.mutate({ id, status: 'paused' })}
              loading={updateStatus.isPending}
              icon={Pause} label="Pause"
              className="bg-yellow-600 hover:bg-yellow-700"
            />
          )}
          {flow.status === 'paused' && (
            <StatusButton
              onClick={() => updateStatus.mutate({ id, status: 'active' })}
              loading={updateStatus.isPending}
              icon={Play} label="Resume"
              className="bg-green-600 hover:bg-green-700"
            />
          )}
        </div>
      </div>

      {/* Flow builder — fills remaining space */}
      <div className="flex-1 min-h-0">
        <StructuredFlowBuilder
          flowNodes={flow.nodes as FlowNode[]}
          exitConfig={flow.exitConfig as ExitConfig | null}
          onSave={handleSave}
          saving={updateFlow.isPending}
          domainType={statsData?.data.domainType}
        />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-50 text-green-700 border-green-200',
    paused: 'bg-amber-50 text-amber-700 border-amber-200',
    draft: 'bg-gray-50 text-gray-600 border-gray-200',
  }
  return (
    <span className={cn('px-2.5 py-0.5 text-xs rounded-full font-semibold border', styles[status] ?? styles.draft)}>
      {status}
    </span>
  )
}

function StatusButton({
  onClick, loading, icon: Icon, label, className,
}: {
  onClick: () => void
  loading: boolean
  icon: typeof Play
  label: string
  className: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all shadow-sm disabled:opacity-50',
        className,
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}
