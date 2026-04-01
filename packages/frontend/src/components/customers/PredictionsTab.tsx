'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useCustomerPredictions } from '@/hooks/usePredictions'
import type { PredictionScore, PredictionFactor, ReorderTimingData } from '@/hooks/usePredictions'
import {
  Brain,
  Loader2,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Clock,
  Shield,
  X,
  Zap,
  AlertTriangle,
} from 'lucide-react'

type GoalType = 'positive' | 'risk' | 'abandonment'

function isReorderTiming(factors: unknown): factors is ReorderTimingData {
  return !!factors && typeof factors === 'object' && !Array.isArray(factors) && 'timing_bucket' in (factors as Record<string, unknown>)
}

function isReorderGoal(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('repeat') || n.includes('reorder')
}

function getGoalType(name: string): GoalType {
  const n = name.toLowerCase()
  if (n.includes('abandon') || n.includes('cart abandon')) return 'abandonment'
  if (n.includes('conversion') || n.includes('purchase') || n.includes('order')
    || n.includes('propensity') || n.includes('repeat')
    || n.includes('loan conversion') || n.includes('cross-sell')
    || n.includes('trial to paid') || n.includes('expansion') || n.includes('upgrade')
    || n.includes('top-up') || n.includes('feature adoption')
    || n.includes('pre-closure')) return 'positive'
  return 'risk'
}

function getScoreCardColors(type: GoalType, bucket: string) {
  const b = bucket.toLowerCase()
  if (type === 'positive') {
    if (b === 'high') return { ring: 'text-green-500', bg: 'bg-green-50', text: 'text-green-700', label: 'Likely' }
    if (b === 'medium') return { ring: 'text-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Possible' }
    return { ring: 'text-gray-400', bg: 'bg-gray-50', text: 'text-gray-600', label: 'Unlikely' }
  }
  if (type === 'abandonment') {
    if (b === 'high') return { ring: 'text-red-500', bg: 'bg-red-50', text: 'text-red-700', label: 'Likely to Abandon' }
    if (b === 'medium') return { ring: 'text-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'May Abandon' }
    return { ring: 'text-green-500', bg: 'bg-green-50', text: 'text-green-700', label: 'Unlikely to Abandon' }
  }
  // risk (churn/dormancy)
  if (b === 'high') return { ring: 'text-red-500', bg: 'bg-red-50', text: 'text-red-700', label: 'High Risk' }
  if (b === 'medium') return { ring: 'text-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Medium Risk' }
  return { ring: 'text-green-500', bg: 'bg-green-50', text: 'text-green-700', label: 'Low Risk' }
}

function getExplainabilityHeaders(goalName: string) {
  const type = getGoalType(goalName)
  const n = goalName.toLowerCase()

  if (type === 'positive') {
    if (n.includes('loan')) return { up: 'Driving loan conversion', down: 'Reducing loan conversion' }
    if (n.includes('trial')) return { up: 'Driving subscription', down: 'Reducing subscription likelihood' }
    if (n.includes('expansion') || n.includes('upgrade')) return { up: 'Driving upgrade', down: 'Reducing upgrade likelihood' }
    if (n.includes('feature')) return { up: 'Driving adoption', down: 'Reducing adoption' }
    return { up: 'Driving conversion', down: 'Reducing conversion' }
  }
  if (type === 'abandonment') return { up: 'Increasing abandon likelihood', down: 'Reducing abandon likelihood' }

  // Risk types
  if (n.includes('emi') || n.includes('default')) return { up: 'Increasing default risk', down: 'Decreasing default risk' }
  if (n.includes('dormancy') || n.includes('dormant')) return { up: 'Increasing dormancy risk', down: 'Decreasing dormancy risk' }
  return { up: 'Increasing risk', down: 'Decreasing risk' }
}

export function PredictionsTab({ customerId }: { customerId: string }) {
  const { data, isLoading } = useCustomerPredictions(customerId)
  const scores = data?.data?.scores ?? []
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    )
  }

  if (scores.length === 0) {
    return (
      <div className="bg-white border border-border rounded-xl p-12 text-center">
        <Brain className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <p className="text-sm text-text-secondary mb-1">No prediction scores available</p>
        <p className="text-xs text-text-muted">
          Create prediction goals in Analytics → Predictions to start scoring customers
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Score Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {scores.map(score => (
          <ScoreCard
            key={score.id}
            score={score}
            isExpanded={expandedId === score.id}
            onToggle={() => setExpandedId(expandedId === score.id ? null : score.id)}
          />
        ))}
      </div>

      {/* Explainability Panel */}
      {expandedId && (
        <ExplainabilityPanel
          score={scores.find(s => s.id === expandedId)!}
          onClose={() => setExpandedId(null)}
        />
      )}
    </div>
  )
}

function ScoreCard({
  score,
  isExpanded,
  onToggle,
}: {
  score: PredictionScore
  isExpanded: boolean
  onToggle: () => void
}) {
  const numScore = Number(score.score)
  const numConfidence = Number(score.confidence)

  const goalType = getGoalType(score.goalName)
  const colors = getScoreCardColors(goalType, score.bucket)
  const circumference = 2 * Math.PI * 36
  const dashOffset = circumference - (numScore / 100) * circumference

  return (
    <button
      onClick={onToggle}
      className={cn(
        'bg-white border rounded-xl p-5 text-left transition-all',
        isExpanded ? 'border-accent shadow-sm' : 'border-border hover:border-accent/20',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-heading truncate">{score.goalName}</h3>
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1', colors.bg, colors.text)}>
            {colors.label}
          </span>
        </div>

        {/* Circular score ring */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="4" className="text-gray-100" />
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className={colors.ring}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-heading">{Math.round(numScore)}</span>
          </div>
        </div>
      </div>

      {/* Reorder timing badges */}
      {isReorderGoal(score.goalName) && isReorderTiming(score.factors) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {score.factors.days_overdue > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">
              <AlertTriangle className="w-3 h-3" />
              Overdue by {Math.round(score.factors.days_overdue)}d
            </span>
          ) : score.factors.timing_bucket ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
              <Clock className="w-3 h-3" />
              Expected in {score.factors.timing_bucket}
            </span>
          ) : null}
          {score.factors.avg_cycle_days > 0 && (
            <span className="text-[10px] text-text-muted">
              Avg cycle: {Math.round(score.factors.avg_cycle_days)}d
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {(numConfidence * 100).toFixed(0)}% confidence
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo(score.computedAt)}
          </span>
        </div>
        <ChevronRight className={cn('w-4 h-4 text-text-muted transition-transform', isExpanded && 'rotate-90')} />
      </div>
    </button>
  )
}

function ExplainabilityPanel({ score, onClose }: { score: PredictionScore; onClose: () => void }) {
  const timing = isReorderTiming(score.factors) ? score.factors : null
  const factors = (!timing && Array.isArray(score.factors)) ? score.factors as PredictionFactor[] : []

  const positive = factors.filter(f => f.direction === 'positive').sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  const negative = factors.filter(f => f.direction === 'negative').sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))

  const maxImpact = Math.max(...factors.map(f => Math.abs(f.impact)), 1)
  const headers = getExplainabilityHeaders(score.goalName)
  const hasContent = timing || factors.length > 0

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-heading">{timing ? 'Reorder Intelligence' : 'Why this score?'}</h3>
          <span className="text-xs text-text-muted">— {score.goalName}</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
          <X className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      <div className="p-5">
        {/* Reorder timing panel */}
        {timing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TimingStat
                label="Avg Cycle"
                value={`${Math.round(timing.avg_cycle_days)}d`}
                icon={<Clock className="w-4 h-4 text-blue-500" />}
              />
              <TimingStat
                label="Expected In"
                value={timing.days_overdue > 0 ? 'Overdue' : timing.timing_bucket ?? 'N/A'}
                icon={timing.days_overdue > 0
                  ? <AlertTriangle className="w-4 h-4 text-red-500" />
                  : <TrendingUp className="w-4 h-4 text-green-500" />}
                highlight={timing.days_overdue > 0 ? 'red' : undefined}
              />
              <TimingStat
                label="Days Overdue"
                value={timing.days_overdue > 0 ? `${Math.round(timing.days_overdue)}d` : '—'}
                icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
                highlight={timing.days_overdue > 0 ? 'red' : undefined}
              />
              <TimingStat
                label="Regularity"
                value={`${Math.round(timing.regularity * 100)}%`}
                icon={<Shield className="w-4 h-4 text-violet-500" />}
              />
            </div>

            {!timing.is_repeat_buyer && (
              <p className="text-xs text-text-muted bg-gray-50 rounded-lg px-3 py-2">
                This customer has only one purchase — timing predictions require repeat order history.
              </p>
            )}
          </div>
        )}

        {/* SHAP factors panel */}
        {!timing && factors.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-secondary">No explainability factors available yet</p>
            <p className="text-xs text-text-muted mt-1">Factors will appear after the model is trained</p>
          </div>
        ) : !timing && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-red-500" />
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  {headers.up}
                </h4>
              </div>
              <div className="space-y-2">
                {positive.slice(0, 5).map((f, i) => (
                  <FactorBar key={i} factor={f} maxImpact={maxImpact} color="red" />
                ))}
                {positive.length === 0 && (
                  <p className="text-xs text-text-muted py-2">No positive contributors</p>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-green-600" />
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  {headers.down}
                </h4>
              </div>
              <div className="space-y-2">
                {negative.slice(0, 5).map((f, i) => (
                  <FactorBar key={i} factor={f} maxImpact={maxImpact} color="green" />
                ))}
                {negative.length === 0 && (
                  <p className="text-xs text-text-muted py-2">No negative contributors</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Suggested Actions */}
        {hasContent && (
          <div className="mt-6 pt-4 border-t border-border">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Suggested Actions
            </h4>
            <div className="flex flex-wrap gap-2">
              {getSuggestedActions(score).map((action, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent/5 border border-accent/15 rounded-lg text-xs font-medium text-accent"
                >
                  <Zap className="w-3 h-3" />
                  {action}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TimingStat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: string
  icon: React.ReactNode
  highlight?: 'red'
}) {
  return (
    <div className={cn(
      'rounded-lg p-3 border',
      highlight === 'red' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100',
    )}>
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[10px] text-text-muted uppercase tracking-wide">{label}</span></div>
      <p className={cn('text-sm font-bold', highlight === 'red' ? 'text-red-700' : 'text-heading')}>{value}</p>
    </div>
  )
}

function FactorBar({ factor, maxImpact, color }: { factor: PredictionFactor; maxImpact: number; color: 'red' | 'green' }) {
  const widthPercent = Math.max((Math.abs(factor.impact) / maxImpact) * 100, 8)

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-primary font-medium truncate flex-1">{factor.label}</span>
        <span className={cn(
          'text-[10px] font-semibold ml-2',
          color === 'red' ? 'text-red-600' : 'text-green-600',
        )}>
          {color === 'red' ? '+' : '-'}{Math.abs(factor.impact).toFixed(2)}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            color === 'red' ? 'bg-red-400' : 'bg-green-400',
          )}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <p className="text-[10px] text-text-muted mt-0.5">
        Value: {typeof factor.value === 'number' ? factor.value.toFixed(1) : factor.value}
      </p>
    </div>
  )
}

function getSuggestedActions(score: PredictionScore): string[] {
  const goalName = score.goalName.toLowerCase()
  const bucket = score.bucket

  if (bucket === 'Low') return ['Monitor activity']

  // Ecommerce: churn, dormancy
  if (goalName.includes('churn') || goalName.includes('dormancy') || goalName.includes('dormant')) {
    return bucket === 'High'
      ? ['Send win-back email', 'Offer discount', 'Move to high-touch segment']
      : ['Schedule check-in', 'Add to re-engagement flow']
  }

  // Ecommerce: repeat/reorder with timing data
  if (isReorderGoal(goalName) && isReorderTiming(score.factors)) {
    const timing = score.factors
    if (timing.days_overdue > 0) {
      return ['Send reorder reminder', 'Offer reorder discount', 'WhatsApp nudge']
    }
    if (timing.timing_bucket === '0-3d') {
      return ['Send reorder reminder', 'Show reorder suggestions']
    }
    return bucket === 'High'
      ? ['Schedule reorder reminder', 'Add to reorder flow']
      : ['Monitor reorder timing']
  }

  // Ecommerce: conversion, purchase, repeat (no timing data)
  if (goalName.includes('conversion') || goalName.includes('purchase') || goalName.includes('repeat') || goalName.includes('propensity to')) {
    return bucket === 'High'
      ? ['Send product recommendation', 'Offer free shipping', 'Priority support']
      : ['Add to nurture flow', 'Show social proof']
  }

  // Ecommerce: cart abandonment
  if (goalName.includes('abandon') || goalName.includes('cart')) {
    return bucket === 'High'
      ? ['Send cart recovery email', 'Offer limited-time discount', 'Show urgency messaging']
      : ['Add to browse abandonment flow', 'Send product reminder']
  }

  // Fintech: EMI default
  if (goalName.includes('emi') || goalName.includes('default')) {
    return bucket === 'High'
      ? ['Send payment reminder', 'Offer EMI restructuring', 'Assign to collections']
      : ['Send gentle reminder', 'Offer auto-debit setup']
  }

  // Fintech: loan conversion
  if (goalName.includes('loan conversion') || goalName.includes('loan conv')) {
    return bucket === 'High'
      ? ['Send pre-approved offer', 'Assign relationship manager', 'Fast-track application']
      : ['Send educational content', 'Share EMI calculator']
  }

  // Fintech: cross-sell, top-up
  if (goalName.includes('cross-sell') || goalName.includes('top-up')) {
    return bucket === 'High'
      ? ['Send personalized product offer', 'Show pre-approved amounts']
      : ['Add to awareness campaign']
  }

  // SaaS: trial conversion
  if (goalName.includes('trial')) {
    return bucket === 'High'
      ? ['Send onboarding tips', 'Offer trial extension', 'Schedule demo call']
      : ['Send feature highlights', 'Show success stories']
  }

  // SaaS: expansion, upgrade
  if (goalName.includes('expansion') || goalName.includes('upgrade')) {
    return bucket === 'High'
      ? ['Show upgrade benefits', 'Offer annual discount', 'Assign CSM']
      : ['Send usage report', 'Highlight premium features']
  }

  // SaaS: feature adoption
  if (goalName.includes('feature')) {
    return bucket === 'High'
      ? ['Send feature tutorial', 'In-app onboarding prompt']
      : ['Add to feature discovery flow']
  }

  return bucket === 'High'
    ? ['Take immediate action', 'Add to priority segment']
    : ['Continue monitoring']
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
