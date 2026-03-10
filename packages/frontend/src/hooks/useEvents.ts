'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

type EventItem = {
  id: string
  eventName: string
  customerId: string | null
  customerName: string | null
  customerEmail: string | null
  properties: Record<string, unknown>
  platform: string
  timestamp: string
}

export function useEvents(limit = 100) {
  return useQuery({
    queryKey: ['events', limit],
    queryFn: () => api.get<EventItem[]>(withProject('/api/events', { limit })),
    refetchInterval: 5000, // Poll every 5s for live feel
  })
}
