'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { FilterConfig } from '@storees/shared'

type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
}

type AiSegmentResponse = {
  filters: FilterConfig
  summary: string
}

export function useAiSegment() {
  return useMutation({
    mutationFn: (data: { input: string; history?: ChatMessage[] }) =>
      api.post<AiSegmentResponse>(withProject('/api/ai/segment'), data),
  })
}

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<{ enabled: boolean }>('/api/ai/status'),
    staleTime: 5 * 60_000,
  })
}
