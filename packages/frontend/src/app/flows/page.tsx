'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { useFlows, useCreateFlow, useUpdateFlowStatus, useDeleteFlow, useCloneFlow } from '@/hooks/useFlows'
import { Zap, Pause, FileEdit, Play, Square, ExternalLink, Plus, X, Workflow, Loader2, Trash2, LayoutTemplate, TrendingUp, Users, Copy } from 'lucide-react'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useDashboardStats } from '@/hooks/useDashboard'
import { FlowTemplateGallery } from '@/components/flows/FlowTemplateGallery'

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'bg-emerald-50 text-emerald-700', icon: Zap },
  paused: { label: 'Paused', color: 'bg-amber-50 text-amber-700', icon: Pause },
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600', icon: FileEdit },
} as const

// Domain-specific trigger event lists — these are self-contained, no shared import needed
const DOMAIN_EVENTS: Record<string, { label: string; events: string[]; defaultTrigger: string }> = {
  ecommerce: {
    label: 'Ecommerce',
    defaultTrigger: 'cart_created',
    events: [
      'cart_created', 'cart_updated', 'checkout_started', 'order_placed',
      'order_fulfilled', 'order_cancelled', 'customer_created', 'customer_updated',
      'enters_segment', 'exits_segment',
    ],
  },
  fintech: {
    label: 'Fintech',
    defaultTrigger: 'transaction_completed',
    events: [
      'transaction_completed', 'app_login', 'bill_payment_completed', 'kyc_verified',
      'kyc_expired', 'loan_disbursed', 'emi_paid', 'emi_overdue',
      'sip_started', 'card_activated', 'enters_segment', 'exits_segment',
    ],
  },
  saas: {
    label: 'SaaS',
    defaultTrigger: 'user_signup',
    events: [
      'user_signup', 'feature_used', 'trial_expiring', 'subscription_started',
      'subscription_cancelled', 'user_invited', 'enters_segment', 'exits_segment',
    ],
  },
}

function formatEventLabel(evt: string): string {
  return evt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function FlowsPage() {
  const router = useRouter()
  const { data, isLoading, isError } = useFlows()
  const { data: statsData } = useDashboardStats()
  const updateStatus = useUpdateFlowStatus()
  const createFlow = useCreateFlow()
  const deleteFlow = useDeleteFlow()
  const cloneFlow = useCloneFlow()

  const domain = statsData?.data.domainType ?? 'ecommerce'
  const domainConfig = DOMAIN_EVENTS[domain] ?? DOMAIN_EVENTS.ecommerce

  const [showCreate, setShowCreate] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTrigger, setNewTrigger] = useState(domainConfig.defaultTrigger)

  const handleCreate = () => {
    if (!newName.trim()) return
    createFlow.mutate(
      { name: newName, description: newDescription, triggerEvent: newTrigger },
      {
        onSuccess: (result) => {
          setShowCreate(false)
          setNewName('')
          setNewDescription('')
          setNewTrigger(domainConfig.defaultTrigger)
          if (result.data?.id) {
            router.push(`/flows/${result.data.id}`)
          }
        },
      },
    )
  }

  const closeModal = () => {
    setShowCreate(false)
    setNewName('')
    setNewDescription('')
    setNewTrigger(domainConfig.defaultTrigger)
  }

  return (
    <div>
      <PageHeader
        title="Flows"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border text-text-secondary rounded-lg hover:bg-surface transition-colors"
            >
              <LayoutTemplate className="h-4 w-4" />
              Templates
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Flow
            </button>
          </div>
        }
      />

      {/* Template Gallery */}
      {showTemplates && (
        <FlowTemplateGallery
          domainType={domain}
          onClose={() => setShowTemplates(false)}
          onSelect={(template) => {
            setShowTemplates(false)
            createFlow.mutate(
              { name: template.name, description: template.description, triggerEvent: template.triggerEvent },
              {
                onSuccess: (result) => {
                  if (result.data?.id) {
                    router.push(`/flows/${result.data.id}`)
                  }
                },
              },
            )
          }}
        />
      )}

      {/* Create Flow Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={closeModal}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white border border-border rounded-xl w-full max-w-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-accent/10 rounded-lg">
                  <Workflow className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-heading">Create Flow</h2>
                  <p className="text-xs text-text-muted">Set up a new automation workflow</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-surface transition-colors"
              >
                <X className="h-4 w-4 text-text-muted" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Flow Name</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Welcome Series, Post-Purchase Follow-up"
                  autoFocus
                  className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Description
                  <span className="text-text-muted font-normal ml-1">(optional)</span>
                </label>
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="What does this flow do?"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Trigger Event</label>
                <p className="text-xs text-text-muted mb-2">
                  This flow starts when this event occurs for a customer
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                  {domainConfig.events.map((evt: string) => (
                    <button
                      key={evt}
                      onClick={() => setNewTrigger(evt)}
                      className={cn(
                        'px-3 py-2 text-sm text-left rounded-lg border transition-colors',
                        newTrigger === evt
                          ? 'border-accent bg-accent/5 text-accent font-medium'
                          : 'border-border text-text-secondary hover:border-text-muted hover:bg-surface',
                      )}
                    >
                      {formatEventLabel(evt)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface/50 rounded-b-xl">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createFlow.isPending}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createFlow.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {createFlow.isPending ? 'Creating...' : 'Create & Open Builder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load flows.</p>
        </div>
      ) : data && data.data.length === 0 ? (
        <div className="text-center py-20 bg-white border border-border rounded-xl">
          <Workflow className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-text-primary mb-1">No flows yet</h3>
          <p className="text-sm text-text-secondary mb-4">
            Create your first automation flow to engage customers automatically.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Flow
          </button>
        </div>
      ) : data ? (
        <div className="space-y-3">
          {data.data.map(flow => {
            const status = STATUS_CONFIG[flow.status] ?? STATUS_CONFIG.draft
            const StatusIcon = status.icon

            return (
              <div
                key={flow.id}
                className="bg-white border border-border rounded-xl p-5 hover:border-border-focus/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/flows/${flow.id}`} className="group inline-flex items-center gap-1.5">
                      <h3 className="font-semibold text-text-primary group-hover:text-accent transition-colors">{flow.name}</h3>
                      <ExternalLink className="h-3.5 w-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                    <p className="text-sm text-text-secondary mt-1">{flow.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {flow.status === 'draft' && (
                      <button
                        onClick={() => updateStatus.mutate({ id: flow.id, status: 'active' })}
                        disabled={updateStatus.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        <Play className="h-3 w-3" />
                        Activate
                      </button>
                    )}
                    {flow.status === 'active' && (
                      <button
                        onClick={() => updateStatus.mutate({ id: flow.id, status: 'paused' })}
                        disabled={updateStatus.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                      >
                        <Pause className="h-3 w-3" />
                        Pause
                      </button>
                    )}
                    {flow.status === 'paused' && (
                      <>
                        <button
                          onClick={() => updateStatus.mutate({ id: flow.id, status: 'active' })}
                          disabled={updateStatus.isPending}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" />
                          Resume
                        </button>
                        <button
                          onClick={() => updateStatus.mutate({ id: flow.id, status: 'draft' })}
                          disabled={updateStatus.isPending}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border text-text-secondary rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
                        >
                          <Square className="h-3 w-3" />
                          Draft
                        </button>
                      </>
                    )}
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full font-medium',
                        status.color,
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                    <button
                      onClick={() => cloneFlow.mutate(flow.id, {
                        onSuccess: (result) => {
                          if (result.data?.id) router.push(`/flows/${result.data.id}`)
                        },
                      })}
                      disabled={cloneFlow.isPending}
                      className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                      title="Clone flow"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {flow.status !== 'active' && (
                      <button
                        onClick={() => setDeleteConfirm(deleteConfirm === flow.id ? null : flow.id)}
                        className="p-1.5 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete flow"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Delete confirmation */}
                {deleteConfirm === flow.id && (
                  <div className="flex items-center gap-3 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 flex-1">Delete this flow and all its trip data?</p>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-3 py-1.5 text-xs font-medium text-text-secondary border border-border rounded-lg hover:bg-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        deleteFlow.mutate(flow.id, { onSuccess: () => setDeleteConfirm(null) })
                      }}
                      disabled={deleteFlow.isPending}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {deleteFlow.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Delete
                    </button>
                  </div>
                )}

                {/* Trip counts + performance */}
                <div className="mt-4 pt-3 border-t border-border">
                  <FlowCardStats flow={flow} />
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function FlowCardStats({ flow }: { flow: import('@/hooks/useFlows').FlowWithCounts }) {
  const tc = flow.tripCounts ?? { active: 0, waiting: 0, completed: 0, exited: 0, total: 0 }
  const triggerEvent = (flow.triggerConfig && typeof flow.triggerConfig === 'object' && 'event' in (flow.triggerConfig as Record<string, unknown>))
    ? String((flow.triggerConfig as Record<string, unknown>).event)
    : null

  return (
    <>
      {/* Badges row */}
      <div className="flex items-center flex-wrap gap-2 mb-3">
        {triggerEvent && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-surface text-text-secondary rounded-md border border-border">
            <Zap className="h-3 w-3 text-accent" />
            {formatEventLabel(triggerEvent)}
          </span>
        )}
        {tc.total > 0 && (
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md',
            (tc.completed / tc.total) * 100 >= 50 ? 'bg-green-50 text-green-700'
              : (tc.completed / tc.total) * 100 >= 20 ? 'bg-amber-50 text-amber-700'
              : 'bg-red-50 text-red-600',
          )}>
            <TrendingUp className="h-3 w-3" />
            {((tc.completed / tc.total) * 100).toFixed(0)}% completion
          </span>
        )}
        {tc.active + tc.waiting > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-600 rounded-md">
            <Users className="h-3 w-3" />
            {tc.active + tc.waiting} in progress
          </span>
        )}
      </div>

      {/* Distribution bar */}
      {tc.total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden mb-3">
          {tc.active > 0 && <div className="bg-emerald-500" style={{ width: `${(tc.active / tc.total) * 100}%` }} />}
          {tc.waiting > 0 && <div className="bg-amber-400" style={{ width: `${(tc.waiting / tc.total) * 100}%` }} />}
          {tc.completed > 0 && <div className="bg-blue-500" style={{ width: `${(tc.completed / tc.total) * 100}%` }} />}
          {tc.exited > 0 && <div className="bg-gray-300" style={{ width: `${(tc.exited / tc.total) * 100}%` }} />}
        </div>
      )}

      {/* Stat row */}
      <div className="flex gap-6 text-sm">
        <Stat label="Active" value={tc.active} dotColor="bg-emerald-500" />
        <Stat label="Waiting" value={tc.waiting} dotColor="bg-amber-400" />
        <Stat label="Completed" value={tc.completed} dotColor="bg-blue-500" />
        <Stat label="Exited" value={tc.exited} dotColor="bg-gray-300" />
        <Stat label="Total" value={tc.total} highlight />
      </div>
    </>
  )
}

function Stat({ label, value, highlight, dotColor }: { label: string; value: number; highlight?: boolean; dotColor?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {dotColor && <span className={cn('w-2 h-2 rounded-full flex-shrink-0', dotColor)} />}
      <div>
        <span className="text-text-muted text-xs">{label}</span>
        <p className={cn('font-semibold tabular-nums', highlight ? 'text-accent' : 'text-text-primary')}>
          {value}
        </p>
      </div>
    </div>
  )
}
