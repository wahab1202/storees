'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useFunnel, useEventNames } from '@/hooks/useAnalytics'
import type { FunnelResult } from '@/hooks/useAnalytics'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  Play,
  Loader2,
  ChevronDown,
  ArrowDown,
  GitBranch,
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

  const funnel = useFunnel()
  const { data: eventNamesData } = useEventNames()
  const eventNames = eventNamesData?.data ?? []

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
      </div>

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
                    <span className="text-sm font-semibold text-heading">{step.count.toLocaleString()}</span>
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
                  <p className="text-xs text-red-500 mt-1 ml-7">
                    -{step.dropoff.toLocaleString()} dropped ({step.dropoffPercentage}% drop-off)
                  </p>
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
    </div>
  )
}
