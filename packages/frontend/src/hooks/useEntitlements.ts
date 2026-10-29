'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

export type Entitlements = {
  plan: string
  status: string
  trialEndsAt: string | null
  trialDaysLeft: number | null
  features: Record<string, boolean>
  limits: Record<string, number>
}

const FULL: Entitlements = {
  plan: 'custom', status: 'active', trialEndsAt: null, trialDaysLeft: null,
  features: { ai_chatbot: true, ai_email_designer: true, predictions: true, ad_audience_export: true },
  limits: {},
}

/**
 * The operational project's plan entitlements. Used to lock premium features and
 * show trial/upgrade banners. Backend enforces regardless — this is cosmetic.
 * Defaults to full access while loading so nothing flashes locked.
 */
export function useEntitlements(): Entitlements {
  const { data } = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.get<Entitlements>(withProject('/api/entitlements')),
    staleTime: 60_000,
  })
  return data?.data ?? FULL
}

/** Convenience: is a named feature available on the current plan? */
export function useFeature(key: string): boolean {
  return useEntitlements().features[key] !== false
}
