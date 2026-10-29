'use client'

import { useEntitlements } from '@/hooks/useEntitlements'
import { Clock, AlertTriangle } from 'lucide-react'

/**
 * Thin banner shown to trial tenants: days left + upgrade CTA, or an "ended"
 * state once expired. Renders nothing for paid/custom plans.
 */
export function TrialBanner() {
  const ent = useEntitlements()
  if (ent.plan !== 'trial') return null

  const ended = ent.status === 'expired' || ent.status === 'suspended'
  const days = ent.trialDaysLeft ?? 0

  if (ended) {
    return (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Your free trial has ended. Upgrade to resume sending and unlock all features.
        </span>
        <a href="mailto:sales@storees.io?subject=Upgrade%20my%20Storees%20plan" className="shrink-0 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">
          Upgrade now
        </a>
      </div>
    )
  }

  const urgent = days <= 3
  return (
    <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${urgent ? 'border-amber-200 bg-amber-50' : 'border-indigo-200 bg-indigo-50'}`}>
      <span className={`flex items-center gap-2 text-sm ${urgent ? 'text-amber-800' : 'text-indigo-800'}`}>
        <Clock className="h-4 w-4 shrink-0" />
        {days > 0
          ? <>You have <strong>{days} {days === 1 ? 'day' : 'days'}</strong> left in your free trial.</>
          : <>Your free trial ends today.</>}
      </span>
      <a href="mailto:sales@storees.io?subject=Upgrade%20my%20Storees%20plan" className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-white ${urgent ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
        Upgrade
      </a>
    </div>
  )
}
