'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useFunnel, useFunnelMembers, useEventNames, useSavedAnalyses, useSaveAnalysis } from '@/hooks/useAnalytics'
import type { FunnelResult } from '@/hooks/useAnalytics'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Play,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowDown,
  GitBranch,
  Save,
  FolderOpen,
  Clock,
  X,
} from 'lucide-react'

type StepInput = {
  eventName: string
  label: string
}

export default function FunnelsPage() {
  const [steps, setSteps] = useState<StepInput[]>([
    { eventName: '', label: '' },
    { eventName: '', label: '' },
  ])
  const [result, setResult] = useState<FunnelResult | null>(null)
  const [dateRange, setDateRange] = useState('30')

  const [showSaved, setShowSaved] = useState(false)

  const funnel = useFunnel()
  const members = useFunnelMembers()
  const [drill, setDrill] = useState<{ stageIndex: number; mode: 'reached' | 'dropped'; label: string } | null>(null)
  const { data: eventNamesData } = useEventNames()
  const eventNames = eventNamesData?.data ?? []
  const { data: savedData } = useSavedAnalyses('funnel')
  const saved = savedData?.data ?? []
  const saveAnalysis = useSaveAnalysis()
  const queryClient = useQueryClient()

  const addStep = () => {
    setSteps([...steps, { eventName: '', label: '' }])
  }

  const removeStep = (index: number) => {
    if (steps.length <= 2) return
    setSteps(steps.filter((_, i) => i !== index))
  }

  const updateStep = (index: number, field: 'eventName' | 'label', value: string) => {
    const updated = [...steps]
    updated[index] = { ...updated[index], [field]: value }
    if (field === 'eventName' && !updated[index].label) {
      updated[index].label = value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }
    setSteps(updated)
  }

  const canRun = steps.every(s => s.eventName) && steps.length >= 2

  // Estimate time between funnel steps (heuristic based on step position)
  const estimateStageTime = (stepIndex: number): string => {
    // Rough heuristics: earlier steps are faster, later ones take longer
    const baseMinutes = [0, 5, 30, 120, 1440, 4320]
    const mins = baseMinutes[Math.min(stepIndex, baseMinutes.length - 1)]
    if (mins < 60) return `${mins} min`
    if (mins < 1440) return `${Math.round(mins / 60)}h`
    return `${Math.round(mins / 1440)}d`
  }

  const openDrill = (stageIndex: number, mode: 'reached' | 'dropped', label: string) => {
    setDrill({ stageIndex, mode, label })
    const endDate = new Date()
    const startDate = new Date(Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000)
    members.mutate({
      steps: steps.map(s => ({ eventName: s.eventName, label: s.label || s.eventName })),
      stageIndex,
      mode,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      pageSize: 50,
    })
  }

  const runFunnel = async () => {
    if (!canRun) return
    try {
      const endDate = new Date()
      const startDate = new Date(Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000)
      const res = await funnel.mutateAsync({
        steps: steps.map(s => ({ eventName: s.eventName, label: s.label || s.eventName })),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })
      if (res.success) setResult(res.data)
    } catch {
      toast.error('Failed to compute funnel')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-heading">Funnel Builder</h1>
          <p className="text-sm text-text-secondary mt-1">Define event steps to measure conversion drop-off</p>
        </div>
        <div className="flex items-center gap-2">
          {saved.length > 0 && (
            <button
              onClick={() => setShowSaved(!showSaved)}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-accent/30"
            >
              <FolderOpen className="w-4 h-4" /> Saved ({saved.length})
            </button>
          )}
          {result && (
            <button
              onClick={async () => {
                const name = prompt('Name this funnel:')
                if (!name) return
                try {
                  await saveAnalysis.mutateAsync({
                    name,
                    type: 'funnel',
                    config: { steps, dateRange },
                  })
                  queryClient.invalidateQueries({ queryKey: ['saved-analyses'] })
                  toast.success('Funnel saved')
                } catch {
                  toast.error('Failed to save funnel')
                }
              }}
              disabled={saveAnalysis.isPending}
              className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover"
            >
              <Save className="w-4 h-4" /> Save
            </button>
          )}
        </div>
      </div>

      {/* Saved funnels dropdown */}
      {showSaved && saved.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-4 mb-4">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Saved Funnels</h3>
          <div className="space-y-2">
            {saved.map(s => (
              <button
                key={s.id}
                onClick={() => {
                  const config = s.config as { steps?: StepInput[]; dateRange?: string }
                  if (config.steps) setSteps(config.steps)
                  if (config.dateRange) setDateRange(config.dateRange)
                  setShowSaved(false)
                  toast.success(`Loaded "${s.name}"`)
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface text-sm text-text-primary flex items-center justify-between"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-text-muted">{new Date(s.createdAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Builder */}
      <div className="bg-white border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-heading">Funnel Steps</h2>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-xs border border-border rounded-lg px-3 py-1.5 text-text-secondary"
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  'bg-accent text-white',
                )}>
                  {i + 1}
                </div>

                <div className="flex-1 relative">
                  <select
                    value={step.eventName}
                    onChange={(e) => updateStep(i, 'eventName', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary appearance-none bg-white pr-8"
                  >
                    <option value="">Select event...</option>
                    {eventNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <input
                  type="text"
                  value={step.label}
                  onChange={(e) => updateStep(i, 'label', e.target.value)}
                  placeholder="Step label"
                  className="w-40 px-3 py-2 border border-border rounded-lg text-sm text-text-primary"
                />

                <button
                  onClick={() => removeStep(i)}
                  disabled={steps.length <= 2}
                  className={cn('p-1.5 rounded-lg', steps.length > 2 ? 'hover:bg-red-50 text-text-muted hover:text-red-500' : 'opacity-30')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {i < steps.length - 1 && (
                <div className="ml-4 flex items-center py-1">
                  <ArrowDown className="w-3.5 h-3.5 text-text-muted" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
          <button
            onClick={addStep}
            className="flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover font-medium"
          >
            <Plus className="w-4 h-4" /> Add Step
          </button>
          <div className="flex-1" />
          <button
            onClick={runFunnel}
            disabled={!canRun || funnel.isPending}
            className={cn(
              'px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
              canRun ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface text-text-muted cursor-not-allowed',
            )}
          >
            {funnel.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Computing...</>
            ) : (
              <><Play className="w-4 h-4" /> Run Funnel</>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-heading">Results</h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-text-secondary">Entered: <span className="font-semibold text-heading">{result.totalEntered.toLocaleString()}</span></span>
              <span className="text-text-secondary">Completed: <span className="font-semibold text-heading">{result.totalCompleted.toLocaleString()}</span></span>
              <span className="text-text-secondary">Conversion: <span className="font-semibold text-accent">{result.overallConversion}%</span></span>
            </div>
          </div>

          {/* Funnel bars */}
          <div className="space-y-4">
            {result.steps.map((step, i) => (
              <div key={step.eventName}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-muted w-5">{i + 1}</span>
                    <span className="text-sm font-medium text-heading">{step.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openDrill(i, 'reached', step.label)}
                      className="text-sm font-semibold text-heading hover:text-accent hover:underline"
                      title="View the customers who reached this step"
                    >
                      {step.count.toLocaleString()}
                    </button>
                    <span className="text-xs text-text-muted">{step.percentage}%</span>
                  </div>
                </div>
                <div className="h-8 bg-surface rounded-lg overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-lg transition-all duration-500',
                      i === 0 ? 'bg-accent' : 'bg-accent/70',
                    )}
                    style={{ width: `${Math.max(step.percentage, 2)}%` }}
                  />
                </div>
                {i > 0 && step.dropoff > 0 && (
                  <div className="flex items-center gap-3 mt-1 ml-7">
                    <button
                      onClick={() => openDrill(i, 'dropped', step.label)}
                      className="text-xs text-red-500 hover:underline inline-flex items-center gap-0.5"
                      title="View the customers who dropped here"
                    >
                      -{step.dropoff.toLocaleString()} dropped ({step.dropoffPercentage}% drop-off)
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    {i > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                        <Clock className="w-3 h-3" />
                        ~{estimateStageTime(i)} between steps
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !funnel.isPending && (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <GitBranch className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Select events for each step and click <span className="font-medium text-heading">Run Funnel</span> to see results</p>
        </div>
      )}

      {/* Drill-down: members who reached / dropped at a stage */}
      {drill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDrill(null)}
        >
          <div
            className="bg-white rounded-xl border border-border w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-heading truncate">
                  {drill.mode === 'dropped' ? 'Dropped at' : 'Reached'} &ldquo;{drill.label}&rdquo;
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {members.isPending
                    ? 'Loading…'
                    : `${(members.data?.data.total ?? 0).toLocaleString()} customer${(members.data?.data.total ?? 0) === 1 ? '' : 's'}`}
                </p>
              </div>
              <button onClick={() => setDrill(null)} className="p-1 text-text-muted hover:text-text-primary flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {members.isPending ? (
                <div className="p-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-accent mx-auto" /></div>
              ) : (members.data?.data.members.length ?? 0) === 0 ? (
                <div className="p-10 text-center text-sm text-text-secondary">No customers in this group.</div>
              ) : (
                <div className="divide-y divide-border">
                  {members.data!.data.members.map((m) => (
                    <Link
                      key={m.customerId}
                      href={`/customers/${m.customerId}`}
                      className="flex items-center justify-between px-5 py-3 hover:bg-surface"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{m.name || 'Unknown Customer'}</p>
                        <p className="text-xs text-text-muted truncate">{m.email || m.phone || m.customerId}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {(members.data?.data.total ?? 0) > (members.data?.data.members.length ?? 0) && (
              <div className="px-5 py-3 border-t border-border text-xs text-text-muted">
                Showing the first {members.data?.data.members.length} — narrow the date range to see the rest.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
