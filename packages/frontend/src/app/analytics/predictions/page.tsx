'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  usePredictionGoals,
  useCreatePredictionGoal,
  useUpdatePredictionGoalStatus,
  useDeletePredictionGoal,
} from '@/hooks/usePredictions'
import { useEventNames } from '@/hooks/useAnalytics'
import { useProjects } from '@/hooks/useProjects'
import { useProjectContext } from '@/lib/projectContext'
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-heading">Predictions</h1>
          <p className="text-sm text-text-secondary mt-1">AI-powered propensity scoring with model management</p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover"
        >
          <Plus className="w-4 h-4" /> Create Prediction
        </button>
      </div>

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

  const statusStyles: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
    active: { bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle2 },
    paused: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Pause },
    insufficient_data: { bg: 'bg-red-50', text: 'text-red-600', icon: AlertTriangle },
  }

  const style = statusStyles[goal.status] ?? statusStyles.paused
  const StatusIcon = style.icon

  const metric = goal.currentMetric ? Number(goal.currentMetric) : null

  // Determine model type: cycle-based (conversion/repeat) vs behavior-based (dormancy/churn)
  const targetLower = goal.targetEvent.toLowerCase()
  const nameLower = goal.name.toLowerCase()
  const isBehaviorBased = ['dormancy', 'dormant', 'churn', 'cancel', 'default', 'missed', 'expired', 'abandon'].some(
    k => targetLower.includes(k) || nameLower.includes(k)
  )

  // Quality labels differ by model type
  let qualityLabel: string | null = null
  let qualityColor = 'text-text-muted'
  let qualityHint: string | null = null
  let modelTypeLabel: string | null = null

  if (metric !== null) {
    if (isBehaviorBased) {
      // Behavior-based models: engagement quality, behavioral shifts
      qualityLabel = metric >= 0.90 ? 'Strong' : metric >= 0.78 ? 'Good' : 'Needs Data'
      qualityColor = metric >= 0.90 ? 'text-green-600' : metric >= 0.78 ? 'text-blue-600' : 'text-amber-600'
      modelTypeLabel = 'Behavior-Based'
      qualityHint = 'Engagement patterns drive predictions'
    } else {
      // Cycle-based models: recency, purchase cadence
      if (metric >= 0.95) {
        qualityLabel = 'Cycle-Based'
        qualityColor = 'text-violet-600'
        qualityHint = 'Recurring purchase patterns detected'
      } else if (metric >= 0.90) {
        qualityLabel = 'Strong'
        qualityColor = 'text-green-600'
      } else if (metric >= 0.78) {
        qualityLabel = 'Good'
        qualityColor = 'text-blue-600'
      } else {
        qualityLabel = 'Needs Data'
        qualityColor = 'text-amber-600'
      }
      modelTypeLabel = metric >= 0.95 ? 'Cycle-Based' : null
      if (!qualityHint && metric >= 0.90) qualityHint = 'Purchase cadence drives predictions'
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
