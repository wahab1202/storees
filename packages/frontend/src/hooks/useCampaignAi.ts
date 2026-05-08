'use client'

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { CampaignChannel } from '@storees/shared'

export type CampaignVariation = {
  subject: string
  body: string
  tone: string
}

export function useCampaignVariations() {
  return useMutation({
    mutationFn: (data: {
      channel: CampaignChannel
      subject?: string
      body?: string
      goal?: string
      count?: number
    }) => api.post<{ variations: CampaignVariation[]; provider: string; model: string }>(
      withProject('/api/ai/campaign-variations'),
      data,
    ),
    onError: (err) => toast.error(err.message ?? 'Failed to generate variations'),
  })
}
