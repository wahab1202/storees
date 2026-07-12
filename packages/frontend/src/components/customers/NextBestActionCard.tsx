'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Send, Gift, TrendingUp, Heart, Pause, Loader2, RefreshCw, Megaphone, Workflow, ShoppingCart } from 'lucide-react'
import { PredictionIcon } from '@/components/icons/PredictionIcon'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { cn } from '@/lib/utils'

type NextBestAction = {
  action: 'recover_cart' | 'send_offer' | 'win_back' | 'upsell' | 'nurture' | 'do_nothing'
  channel: string
  reason: string
  template_suggestion: string
  confidence: number
  cart_context?: {
    likely_reason: string
    recovery_propensity: number
    product_details?: string
    recovery_url?: string
  }
}

const ACTION_CONFIG = {
  recover_cart: { icon: ShoppingCart, label: 'Recover Cart', color: 'text-fuchsia-700', bg: 'bg-fuchsia-50 border-fuchsia-200' },
  send_offer: { icon: Gift, label: 'Send Offer', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  win_back: { icon: Heart, label: 'Win Back', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  upsell: { icon: TrendingUp, label: 'Upsell', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  nurture: { icon: Send, label: 'Nurture', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  do_nothing: { icon: Pause, label: 'No Action Needed', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' },
}

const CHANNEL_OPTIONS = ['whatsapp', 'email', 'sms', 'push'] as const
const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS', push: 'Push' }
const normalizeChannel = (c?: string) =>
  (CHANNEL_OPTIONS as readonly string[]).includes((c ?? '').toLowerCase()) ? (c as string).toLowerCase() : 'email'

export function NextBestActionCard({ customerId, customerEmail, customerName }: {
  customerId: string
  customerEmail?: string
  customerName?: string
}) {
  const [result, setResult] = useState<NextBestAction | null>(null)
  const [channelOverride, setChannelOverride] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      api.post<NextBestAction>(withProject(`/api/ai/next-action/${customerId}`), {}),
    onSuccess: (data) => { setResult(data.data); setChannelOverride(null) },
  })

  if (!result && !mutation.isPending) {
    return (
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-50">
              <PredictionIcon className="text-purple-600" size={18} />
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
            <PredictionIcon className="text-purple-600" size={18} />
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

  const ch = channelOverride ?? normalizeChannel(result.channel)
  const nbaName = `${config.label}${customerName ? ` – ${customerName}` : ''}`
  const campaignHref = `/campaigns/create?channel=${ch}&type=one-time&nbaAction=${result.action}`
    + (customerEmail ? `&nbaEmail=${encodeURIComponent(customerEmail)}` : '')
    + `&nbaName=${encodeURIComponent(nbaName)}`
  const flowHref = `/flows?nbaName=${encodeURIComponent(nbaName)}&channel=${ch}`

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-50">
            <PredictionIcon className="text-purple-600" size={18} />
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

      {/* Abandoned-cart friction context */}
      {result.cart_context && (
        <div className="mb-3 rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-fuchsia-800">Abandoned cart · likely reason</span>
            <span className="text-[11px] font-semibold text-fuchsia-800">{result.cart_context.recovery_propensity}/100 recover</span>
          </div>
          {result.cart_context.product_details && (
            <p className="text-[11px] text-text-secondary">{result.cart_context.product_details}</p>
          )}
          <p className="text-[11px] text-text-muted italic">{result.cart_context.likely_reason}</p>
          {result.cart_context.recovery_url && (
            <a href={result.cart_context.recovery_url} target="_blank" rel="noreferrer" className="inline-block text-[11px] font-medium text-fuchsia-700 underline">Their checkout link ↗</a>
          )}
          <p className="text-[10px] text-text-muted">Heuristic reason — a likely signal, not a certainty.</p>
        </div>
      )}

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

      {/* Act on it */}
      {result.action !== 'do_nothing' && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-xs text-text-muted">Channel</span>
            <select
              value={ch}
              onChange={(e) => setChannelOverride(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1 text-text-primary bg-white"
            >
              {CHANNEL_OPTIONS.map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={campaignHref}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
            >
              <Megaphone className="h-3.5 w-3.5" /> Campaign
            </Link>
            <Link
              href={flowHref}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
            >
              <Workflow className="h-3.5 w-3.5" /> Flow
            </Link>
          </div>
          <p className="text-[11px] text-text-muted mt-2 leading-snug">
            <span className="font-medium">Campaign</span> = one-off send to this customer. <span className="font-medium">Flow</span> = reusable automation for anyone matching this.
          </p>
        </div>
      )}

      {mutation.isError && (
        <p className="text-xs text-red-600 mt-2">Failed to generate recommendation. Try again.</p>
      )}
    </div>
  )
}
