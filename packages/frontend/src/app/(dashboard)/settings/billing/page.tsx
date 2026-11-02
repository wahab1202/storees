'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { useBillingPlans, useSubscribe } from '@/hooks/useBilling'
import { useEntitlements } from '@/hooks/useEntitlements'
import { Loader2, Check, CreditCard } from 'lucide-react'
import { toast } from 'sonner'

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="py-10 text-text-muted">Loading…</div>}>
      <BillingContent />
    </Suspense>
  )
}

function BillingContent() {
  const params = useSearchParams()
  const ent = useEntitlements()
  const { data, isLoading } = useBillingPlans()
  const subscribe = useSubscribe()
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    const b = params.get('billing')
    if (b === 'success') toast.success('You’re upgraded — thanks!')
    else if (b === 'pending') toast.info('Subscription not active yet. If you approved it, give it a moment and refresh.')
    else if (b === 'error') toast.error('Something went wrong starting billing.')
  }, [params])

  const plans = data?.data ?? []
  const onTrial = ent.plan === 'trial'
  const statusLabel = onTrial
    ? (ent.status === 'trialing' ? `Free trial · ${ent.trialDaysLeft ?? 0} days left` : 'Trial ended')
    : `${ent.plan} · ${ent.status}`

  async function start(plan: string) {
    setPending(plan)
    try { await subscribe.mutateAsync(plan) } // redirects on success
    catch (err) { toast.error((err as Error).message || 'Could not start subscription'); setPending(null) }
  }

  return (
    <div>
      <PageHeader title="Billing" description="Your plan and subscription. Upgrades are billed securely through Shopify." />

      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-4">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><CreditCard className="h-5 w-5" /></span>
        <div>
          <p className="text-xs text-text-muted">Current plan</p>
          <p className="text-sm font-semibold text-text-primary capitalize">{statusLabel}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-text-muted"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading plans…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          {plans.map(p => {
            const current = ent.plan === p.key && ent.status === 'active'
            return (
              <div key={p.key} className="rounded-xl border border-border bg-white p-5 flex flex-col">
                <h3 className="text-base font-bold text-text-primary">{p.name}</h3>
                <p className="mt-1 text-2xl font-extrabold text-text-primary">
                  ${p.price}<span className="text-sm font-medium text-text-muted">/{p.interval === 'ANNUAL' ? 'yr' : 'mo'}</span>
                </p>
                <p className="mt-2 text-sm text-text-muted flex-1">{p.blurb}</p>
                <button
                  onClick={() => start(p.key)}
                  disabled={current || !!pending}
                  className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {current ? <><Check className="h-4 w-4" /> Current plan</>
                    : pending === p.key ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting…</>
                    : `Choose ${p.name.replace('Storees ', '')}`}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-text-muted max-w-2xl">
        You’ll be taken to Shopify to approve the charge; it appears on your Shopify bill. Cancel anytime from your Shopify admin.
      </p>
    </div>
  )
}
