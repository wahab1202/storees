'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  usePredictionGoals,
  useCreatePredictionGoal,
  useUpdatePredictionGoalStatus,
  useDeletePredictionGoal,
  useRetrainPredictionGoal,
  useRetrainAllPredictionGoals,
  useMlServiceHealth,
  useGoalTrainingHistory,
  useGoalModelVersions,
  usePromoteModelVersion,
} from '@/hooks/usePredictions'
import { useEventNames } from '@/hooks/useAnalytics'
import { useProjects } from '@/hooks/useProjects'
import { useProjectContext } from '@/lib/projectContext'
import { getAucQuality, isBehaviorBasedGoal } from '@/lib/predictionQuality'
import type { PredictionGoal } from '@storees/shared'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  Brain,
  Plus,
  Loader2,
  Pause,
  Play,
  Trash2,
  ChevronDown,
  X,
  Target,
  Clock,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Users,
  RefreshCw,
} from 'lucide-react'

// Domain-aware prediction presets
const PREDICTION_PRESETS: Record<string, Array<{ value: string; label: string; event: string; desc: string }>> = {
  ecommerce: [
    { value: 'conversion', label: 'Predict Conversion', event: 'order_completed', desc: 'Which customers are likely to purchase soon' },
    { value: 'dormancy', label: 'Predict Dormancy', event: 'dormancy', desc: 'Which active customers will become inactive' },
    { value: 'cart_abandon', label: 'Predict Cart Abandonment', event: 'cart_abandoned', desc: 'Which customers will add to cart but not buy' },
    { value: 'repeat', label: 'Repeat Purchase', event: 'order_completed', desc: 'Which existing buyers will purchase again' },
  ],
  fintech: [
    { value: 'loan_conv', label: 'Loan Conversion', event: 'loan_disbursed', desc: 'Which leads are likely to get loans disbursed' },
    { value: 'emi_default', label: 'EMI Default Risk', event: 'emi_missed', desc: 'Which borrowers will miss EMI payments' },
    { value: 'app_churn', label: 'App Churn Risk', event: 'churn', desc: 'Which customers will stop using the app' },
    { value: 'cross_sell', label: 'Cross-sell Propensity', event: 'loan_application_started', desc: 'Which customers will apply for new loan products' },
  ],
  saas: [
    { value: 'trial_conv', label: 'Trial to Paid', event: 'subscription_created', desc: 'Which trial users will convert to paid' },
    { value: 'churn', label: 'Churn Risk', event: 'subscription_cancelled', desc: 'Which customers will cancel their subscription' },
    { value: 'dormancy', label: 'Predict Dormancy', event: 'dormancy', desc: 'Which active users will become inactive' },
    { value: 'expansion', label: 'Expansion Revenue', event: 'subscription_upgraded', desc: 'Which customers will upgrade their plan' },
  ],
  edtech: [
    { value: 'enrollment', label: 'Enrollment Propensity', event: 'course_enrolled', desc: 'Which learners are likely to enroll in a course' },
    { value: 'completion_risk', label: 'Completion Risk', event: 'course_dropped', desc: 'Which enrolled learners will drop out' },
    { value: 'next_course', label: 'Next Course', event: 'course_enrolled', desc: 'Which learners will enroll in another course' },
    { value: 'sub_conv', label: 'Subscription Conversion', event: 'subscription_created', desc: 'Which free learners will convert to paid' },
  ],
}

// Fallback for unknown domains
const DEFAULT_PRESETS = PREDICTION_PRESETS.ecommerce

export default function PredictionsPage() {
  const { data, isLoading } = usePredictionGoals()
  const goals = data?.data ?? []
  const [showWizard, setShowWizard] = useState(false)
  const retrainAll = useRetrainAllPredictionGoals()
  const mlHealth = useMlServiceHealth()
  const mlDown = mlHealth.data?.data?.mlServiceUp === false
  // Show the bulk retrain whenever ≥1 goal needs help: either flagged as
  // insufficient_data, OR has no usable AUC (training failed silently in
  // an earlier run, so goal.status stayed 'active' but currentMetric is 0).
  const hasGoalsNeedingRetrain = goals.some(g =>
    g.status === 'insufficient_data' ||
    !g.currentMetric ||
    Number(g.currentMetric) === 0,
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-heading">Predictions</h1>
          <p className="text-sm text-text-secondary mt-1">AI-powered propensity scoring with model management</p>
        </div>
        <div className="flex items-center gap-2">
          {hasGoalsNeedingRetrain && (
            <button
              onClick={() => {
                retrainAll.mutate(undefined, {
                  onSuccess: (res) => {
                    const d = res?.data
                    toast.success(`Retraining queued for ${d?.enqueued ?? 0} of ${d?.total ?? 0} goals`)
                  },
                  onError: () => toast.error('Failed to enqueue retraining'),
                })
              }}
              disabled={retrainAll.isPending}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium text-text-secondary hover:text-accent hover:border-accent disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', retrainAll.isPending && 'animate-spin')} /> Re-train all
            </button>
          )}
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover"
          >
            <Plus className="w-4 h-4" /> Create Prediction
          </button>
        </div>
      </div>

      {/* ML service unavailable — explain why retrains will be no-ops */}
      {mlDown && (
        <div className="flex items-start gap-3 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <div className="text-xs text-red-700">
            <p className="font-medium">ML service is unreachable</p>
            <p className="mt-0.5 text-red-600/90">
              Goals can't be (re)trained until the Python ML service comes back up. Status will stay
              on whatever the last successful training produced.
            </p>
          </div>
        </div>
      )}

      {/* Wizard */}
      {showWizard && <CreateWizard onClose={() => setShowWizard(false)} />}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      )}

      {/* Goals list */}
      {!isLoading && goals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map(goal => (
            <PredictionGoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && goals.length === 0 && !showWizard && (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <Brain className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary mb-3">No prediction goals created yet</p>
          <button
            onClick={() => setShowWizard(true)}
            className="text-sm font-medium text-accent hover:text-accent-hover"
          >
            Create your first prediction
          </button>
        </div>
      )}
    </div>
  )
}

function PredictionGoalCard({ goal }: { goal: PredictionGoal }) {
  const updateStatus = useUpdatePredictionGoalStatus()
  const deleteGoal = useDeletePredictionGoal()
  const retrain = useRetrainPredictionGoal()

  const statusStyles: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
    active: { bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle2 },
    paused: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Pause },
    insufficient_data: { bg: 'bg-red-50', text: 'text-red-600', icon: AlertTriangle },
  }

  const style = statusStyles[goal.status] ?? statusStyles.paused
  const StatusIcon = style.icon

  const metric = goal.currentMetric ? Number(goal.currentMetric) : null

  // Quality bucket — single source of truth in lib/predictionQuality.
  const isBehaviorBased = isBehaviorBasedGoal(goal.targetEvent, goal.name)
  const { label: qualityLabel, colorClass: qualityColor } = getAucQuality(metric, isBehaviorBased)

  // Modelling hint copy (page-specific, doesn't belong in the shared util)
  let qualityHint: string | null = null
  let modelTypeLabel: string | null = null
  if (metric !== null) {
    if (isBehaviorBased) {
      modelTypeLabel = 'Behavior-Based'
      qualityHint = 'Engagement patterns drive predictions'
    } else if (metric >= 0.95) {
      modelTypeLabel = 'Cycle-Based'
      qualityHint = 'Recurring purchase patterns detected'
    } else if (metric >= 0.90) {
      qualityHint = 'Purchase cadence drives predictions'
    }
  }

  return (
    <div className="bg-white border border-border rounded-xl p-5 hover:border-accent/20 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-heading">{goal.name}</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1', style.bg, style.text)}>
            <StatusIcon className="w-3 h-3" />
            {goal.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <BarChart3 className="w-3 h-3" />
          <span>Target: <span className="font-medium text-text-primary">{goal.targetEvent}</span></span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Clock className="w-3 h-3" />
          <span>{goal.observationWindowDays}d observation / {goal.predictionWindowDays}d prediction</span>
        </div>
        {metric !== null && (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs">
              <Brain className="w-3 h-3 text-text-secondary" />
              <span className="text-text-secondary">AUC: <span className="font-semibold text-heading">{metric.toFixed(3)}</span></span>
              <span className={cn('font-medium', qualityColor)}>({qualityLabel})</span>
            </div>
            {modelTypeLabel && (
              <div className="flex items-center gap-1.5 ml-5">
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-[9px] font-semibold',
                  isBehaviorBased ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700',
                )}>
                  {modelTypeLabel}
                </span>
                {qualityHint && (
                  <span className="text-[10px] text-text-muted">{qualityHint}</span>
                )}
              </div>
            )}
          </div>
        )}
        {goal.lastTrainedAt && (
          <div className="text-[10px] text-text-muted">
            Last trained: {new Date(goal.lastTrainedAt).toLocaleDateString()}
          </div>
        )}

        <TrainingTrend goalId={goal.id} />
        <VersionHistory goalId={goal.id} />
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <Link
          href={`/analytics/predictions/${goal.id}`}
          className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 font-medium"
        >
          <Users className="w-3 h-3" /> View Customers
        </Link>
        <div className="flex-1" />
        {goal.status === 'active' && (
          <button
            onClick={() => updateStatus.mutate({ id: goal.id, status: 'paused' })}
            disabled={updateStatus.isPending}
            className="text-xs text-text-secondary hover:text-amber-600 flex items-center gap-1"
          >
            <Pause className="w-3 h-3" /> Pause
          </button>
        )}
        {goal.status === 'paused' && (
          <button
            onClick={() => updateStatus.mutate({ id: goal.id, status: 'active' })}
            disabled={updateStatus.isPending}
            className="text-xs text-text-secondary hover:text-green-600 flex items-center gap-1"
          >
            <Play className="w-3 h-3" /> Activate
          </button>
        )}
        <button
          onClick={() => {
            retrain.mutate(goal.id, {
              onSuccess: () => toast.success('Retraining queued — refresh in a minute'),
              onError: () => toast.error('Failed to queue retraining'),
            })
          }}
          disabled={retrain.isPending}
          className="text-xs text-text-secondary hover:text-accent flex items-center gap-1"
          title="Re-run training against the current data"
        >
          <RefreshCw className={cn('w-3 h-3', retrain.isPending && 'animate-spin')} /> Re-train
        </button>
        {goal.origin !== 'pack' && (
          <button
            onClick={() => {
              if (confirm('Delete this prediction goal?')) {
                deleteGoal.mutate(goal.id)
              }
            }}
            disabled={deleteGoal.isPending}
            className="text-xs text-text-muted hover:text-red-500"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

function CreateWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [predType, setPredType] = useState('')
  const [name, setName] = useState('')
  const [targetEvent, setTargetEvent] = useState('')
  const [observationDays, setObservationDays] = useState('90')
  const [predictionDays, setPredictionDays] = useState('14')
  const [minLabels, setMinLabels] = useState('200')

  const { data: eventNamesData } = useEventNames()
  const eventNames = eventNamesData?.data ?? []
  const createGoal = useCreatePredictionGoal()

  // Get domain-aware presets
  const { projectId } = useProjectContext()
  const { data: projectsData } = useProjects()
  const projects = projectsData?.data ?? []
  const currentProject = projects.find((p: any) => p.id === projectId)
  const domainType = (currentProject?.domainType ?? 'ecommerce').toLowerCase()
  const normalizedDomain = domainType === 'nbfc' || domainType === 'lending' ? 'fintech' : domainType
  const presets = PREDICTION_PRESETS[normalizedDomain] ?? DEFAULT_PRESETS

  const selectType = (type: string) => {
    const t = presets.find(p => p.value === type)
    if (t) {
      setPredType(type)
      setName(t.label)
      setTargetEvent(t.event)
    }
    setStep(1)
  }

  const handleCreate = async () => {
    if (!name || !targetEvent) return
    try {
      await createGoal.mutateAsync({
        name,
        targetEvent,
        observationWindowDays: Number(observationDays),
        predictionWindowDays: Number(predictionDays),
        minPositiveLabels: Number(minLabels),
      })
      toast.success('Prediction goal created')
      onClose()
    } catch {
      toast.error('Failed to create prediction goal')
    }
  }

  return (
    <div className="bg-white border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-heading">Create Prediction Goal</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
          <X className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      {step === 0 && (
        <div>
          <p className="text-sm text-text-secondary mb-4">Choose a prediction type</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {presets.map(t => (
              <button
                key={t.value}
                onClick={() => selectType(t.value)}
                className="text-left border border-border rounded-xl p-4 hover:border-accent/30 hover:shadow-sm transition-all"
              >
                <p className="text-sm font-semibold text-heading">{t.label}</p>
                <p className="text-xs text-text-secondary mt-1">{t.desc}</p>
              </button>
            ))}
            <button
              onClick={() => { setPredType('custom'); setStep(1) }}
              className="text-left border border-dashed border-border rounded-xl p-4 hover:border-accent/30 transition-all"
            >
              <p className="text-sm font-semibold text-heading">Custom Prediction</p>
              <p className="text-xs text-text-secondary mt-1">Define your own target event</p>
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Predict Churn"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Target Event</label>
              <div className="relative">
                <select
                  value={targetEvent}
                  onChange={(e) => setTargetEvent(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm appearance-none bg-white pr-8"
                >
                  <option value="">Select event...</option>
                  {eventNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Observation Window (days)</label>
              <input
                type="number"
                value={observationDays}
                onChange={(e) => setObservationDays(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Prediction Window (days)</label>
              <input
                type="number"
                value={predictionDays}
                onChange={(e) => setPredictionDays(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <button onClick={() => setStep(0)} className="text-sm text-text-secondary hover:text-heading">
              Back
            </button>
            <div className="flex-1" />
            <button
              onClick={handleCreate}
              disabled={!name || !targetEvent || createGoal.isPending}
              className={cn(
                'px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
                name && targetEvent ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface text-text-muted cursor-not-allowed',
              )}
            >
              {createGoal.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Mini-trend: shows the last ~14 successful AUC values as a sparkline + the
// delta vs the prior run. Renders nothing until at least two successful runs
// have been recorded — a single AUC isn't a trend. Also renders a per-segment
// AUC table from the latest run when segment_metrics are available.
function TrainingTrend({ goalId }: { goalId: string }) {
  const [showSegments, setShowSegments] = useState(false)
  const { data } = useGoalTrainingHistory(goalId, 30)
  const runs = data?.data ?? []
  const successes = runs.filter(r => r.status === 'success' && r.auc != null) as Array<typeof runs[number] & { auc: number }>
  const latestSegments = successes[0]?.segmentMetrics ?? null

  if (successes.length < 2 && !latestSegments) return null
  if (successes.length < 2) {
    // Only have segments to show, no trend
    return <SegmentBreakdown segments={latestSegments} show={showSegments} onToggle={() => setShowSegments(!showSegments)} />
  }

  // chronological order for the sparkline
  const series = [...successes].reverse().slice(-14)
  const values = series.map(s => s.auc)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 0.001)

  const W = 80
  const H = 18
  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * W
    const y = H - ((v - min) / span) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const latest = successes[0].auc
  const prior  = successes[1].auc
  const delta  = latest - prior
  const deltaColor =
    delta > 0.005 ? 'text-emerald-600' :
    delta < -0.005 ? 'text-red-600' :
    'text-text-muted'
  const arrow = delta > 0.005 ? '↑' : delta < -0.005 ? '↓' : '→'

  return (
    <>
      <div className="flex items-center gap-2 mt-1.5" title={`Last ${series.length} successful runs`}>
        <svg width={W} height={H} className="text-text-muted">
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <span className={cn('text-[10px] tabular-nums', deltaColor)}>
          {arrow} {(delta >= 0 ? '+' : '')}{(delta * 100).toFixed(2)}pp
        </span>
        <span className="text-[10px] text-text-muted">vs last</span>
      </div>
      <SegmentBreakdown segments={latestSegments} show={showSegments} onToggle={() => setShowSegments(!showSegments)} />
    </>
  )
}

// Version history: expandable list of every successful model trained for
// this goal, latest first. Active version is highlighted; non-active ones
// have a Promote button so you can roll back when a fresh train regressed.
function VersionHistory({ goalId }: { goalId: string }) {
  const [show, setShow] = useState(false)
  const { data } = useGoalModelVersions(goalId)
  const promote = usePromoteModelVersion()
  const versions = data?.data ?? []

  if (versions.length < 2) return null  // Only one version — nothing to roll back to

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="text-[10px] text-text-muted hover:text-accent flex items-center gap-1"
      >
        {show ? '▾' : '▸'} Versions ({versions.length})
      </button>
      {show && (
        <div className="mt-1 border border-border rounded-md p-2 bg-surface space-y-1">
          {versions.map(v => (
            <div key={v.id} className="flex items-center gap-2 text-[11px]">
              <span className={cn('flex-1 truncate', v.isActive && 'font-semibold text-accent')} title={v.modelVersion}>
                {v.isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-1.5" />}
                {v.modelVersion}
              </span>
              <span className="text-text-muted tabular-nums">
                AUC {v.trainAuc != null ? v.trainAuc.toFixed(3) : '—'}
              </span>
              <span className="text-text-muted text-[10px]">{new Date(v.trainedAt).toLocaleDateString()}</span>
              {!v.isActive && (
                <button
                  onClick={() => {
                    if (confirm(`Promote ${v.modelVersion} as the active model?`)) {
                      promote.mutate({ goalId, versionId: v.id }, {
                        onSuccess: () => toast.success('Promoted — new model is live'),
                        onError: (err) => toast.error(`Promote failed: ${(err as Error).message}`),
                      })
                    }
                  }}
                  disabled={promote.isPending}
                  className="text-accent hover:text-accent-hover disabled:opacity-50"
                >
                  Promote
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Per-segment AUC table — expandable. Highlights cohorts where the model
// performs notably worse than overall (delta < -0.05) so you can spot
// "good overall, useless on new customers" patterns at a glance.
function SegmentBreakdown({
  segments,
  show,
  onToggle,
}: {
  segments: { segment_type: string; segment_label: string; n: number; n_positive: number; auc: number; delta_vs_overall: number }[] | null
  show: boolean
  onToggle: () => void
}) {
  if (!segments || segments.length === 0) return null

  // Group by type for readability
  const grouped = segments.reduce<Record<string, typeof segments>>((acc, s) => {
    (acc[s.segment_type] = acc[s.segment_type] ?? []).push(s)
    return acc
  }, {})

  const TYPE_LABEL: Record<string, string> = {
    behaviour: 'Behaviour',
    region: 'Region',
    dealer: 'Dealer',
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="text-[10px] text-text-muted hover:text-accent flex items-center gap-1"
      >
        {show ? '▾' : '▸'} Segments ({segments.length})
      </button>
      {show && (
        <div className="mt-1 border border-border rounded-md p-2 bg-surface space-y-2">
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                {TYPE_LABEL[type] ?? type}
              </p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-text-muted">
                    <th className="text-left font-medium pb-0.5">Segment</th>
                    <th className="text-right font-medium pb-0.5">n</th>
                    <th className="text-right font-medium pb-0.5">AUC</th>
                    <th className="text-right font-medium pb-0.5">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s, i) => {
                    const dColor =
                      s.delta_vs_overall <= -0.05 ? 'text-red-600' :
                      s.delta_vs_overall >= 0.05 ? 'text-emerald-600' :
                      'text-text-muted'
                    return (
                      <tr key={i} className="border-t border-border/60">
                        <td className="py-0.5 text-text-primary truncate max-w-[140px]" title={s.segment_label}>{s.segment_label}</td>
                        <td className="py-0.5 text-right tabular-nums text-text-secondary">{s.n.toLocaleString()}</td>
                        <td className="py-0.5 text-right tabular-nums">{s.auc.toFixed(3)}</td>
                        <td className={cn('py-0.5 text-right tabular-nums', dColor)}>
                          {s.delta_vs_overall >= 0 ? '+' : ''}{(s.delta_vs_overall * 100).toFixed(1)}pp
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
