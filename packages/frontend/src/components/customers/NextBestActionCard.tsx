'use client'

import { useState } from 'react'
import { Sparkles, Send, Gift, TrendingUp, Heart, Pause, Loader2, RefreshCw } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { cn } from '@/lib/utils'

type NextBestAction = {
  action: 'send_offer' | 'win_back' | 'upsell' | 'nurture' | 'do_nothing'
  channel: string
  reason: string
  template_suggestion: string
  confidence: number
}

const ACTION_CONFIG = {
  send_offer: { icon: Gift, label: 'Send Offer', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  win_back: { icon: Heart, label: 'Win Back', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  upsell: { icon: TrendingUp, label: 'Upsell', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  nurture: { icon: Send, label: 'Nurture', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  do_nothing: { icon: Pause, label: 'No Action Needed', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' },
}

export function NextBestActionCard({ customerId }: { customerId: string }) {
  const [result, setResult] = useState<NextBestAction | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      api.post<NextBestAction>(withProject(`/api/ai/next-action/${customerId}`), {}),
    onSuccess: (data) => setResult(data.data),
  })

  if (!result && !mutation.isPending) {
    return (
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-50">
              <Sparkles className="h-4 w-4 text-purple-600" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary">AI Next Best Action</h3>
          </div>
        </div>
        <p className="text-xs text-text-muted mb-3">Get an AI recommendation for the best action to take with this customer.</p>
        <button
          onClick={() => mutation.mutate()}
          className="w-full px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
        >
          Generate Recommendation
        </button>
      </div>
    )
  }

  if (mutation.isPending) {
    return (
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-purple-50">
            <Sparkles className="h-4 w-4 text-purple-600" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">AI Next Best Action</h3>
        </div>
        <div className="flex items-center justify-center py-6 gap-2 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing customer...
        </div>
      </div>
    )
  }

  if (!result) return null

  const config = ACTION_CONFIG[result.action]
  const Icon = config.icon

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-50">
            <Sparkles className="h-4 w-4 text-purple-600" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">AI Next Best Action</h3>
        </div>
        <button
          onClick={() => mutation.mutate()}
          className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
          title="Regenerate"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Action badge */}
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium mb-3', config.bg, config.color)}>
        <Icon className="h-3.5 w-3.5" />
        {config.label}
      </div>

      {/* Reason */}
      <p className="text-sm text-text-primary mb-3">{result.reason}</p>

      {/* Details */}
      <div className="space-y-2 text-xs">
        {result.channel && (
          <div className="flex justify-between">
            <span className="text-text-muted">Channel</span>
            <span className="font-medium text-text-primary capitalize">{result.channel}</span>
          </div>
        )}
        {result.template_suggestion && (
          <div className="flex justify-between">
            <span className="text-text-muted">Template Idea</span>
            <span className="font-medium text-text-primary max-w-[60%] text-right">{result.template_suggestion}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-text-muted">Confidence</span>
          <span className="font-medium text-text-primary">{Math.round(result.confidence * 100)}%</span>
        </div>
      </div>

      {mutation.isError && (
        <p className="text-xs text-red-600 mt-2">Failed to generate recommendation. Try again.</p>
      )}
    </div>
  )
}
