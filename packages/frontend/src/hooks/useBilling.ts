'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

export type BillingPlan = {
  key: string
  name: string
  price: number
  interval: 'EVERY_30_DAYS' | 'ANNUAL'
  blurb: string
}

export function useBillingPlans() {
  return useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api.get<BillingPlan[]>(withProject('/api/billing/plans')),
  })
}

/** Start a subscription → redirect the merchant to Shopify's confirmation page. */
export function useSubscribe() {
  return useMutation({
    mutationFn: (plan: string) =>
      api.post<{ confirmationUrl: string }>(withProject('/api/billing/subscribe'), { plan }),
    onSuccess: (res) => {
      const url = res.data?.confirmationUrl
      if (url) window.location.href = url
    },
  })
}
