'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { SubscriptionCategory, CampaignChannel } from '@storees/shared'

export function useSubscriptionCategories() {
  return useQuery({
    queryKey: ['subscription-categories'],
    queryFn: () => api.get<SubscriptionCategory[]>(withProject('/api/subscription-categories')),
  })
}

export function useCreateSubscriptionCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description?: string | null; channel?: CampaignChannel | 'whatsapp' | null }) =>
      api.post<SubscriptionCategory>(withProject('/api/subscription-categories'), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription-categories'] }),
  })
}
