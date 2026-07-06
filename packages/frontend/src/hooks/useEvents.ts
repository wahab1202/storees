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
  customerExternalId: string | null
  properties: Record<string, unknown>
  platform: string
  source?: string | null
  sessionId?: string | null
  timestamp: string
}

export type SessionSummary = {
  sessionId: string
  eventCount: number
  firstSeen: string
  lastSeen: string
  eventNames: string[]
  seenPhone: string | null
  seenEmail: string | null
  customerId: string | null
  customerLabel: string | null
  linkedAt: string | null
  resolvedAt: string | null
  eventsBackAttributed: number | null
}

export type EventFilters = {
  customer?: string
  eventName?: string
  from?: string
  to?: string
  session?: string
}

export function useEvents(limit = 100, filters: EventFilters = {}) {
  // Drop empty values so they don't hit the query string.
  const params: Record<string, string | number | undefined> = { limit }
  if (filters.customer?.trim()) params.customer = filters.customer.trim()
  if (filters.eventName) params.eventName = filters.eventName
  if (filters.from) params.from = filters.from
  if (filters.to) params.to = filters.to
  if (filters.session?.trim()) params.session = filters.session.trim()

  return useQuery({
    queryKey: ['events', params],
    queryFn: () => api.get<EventItem[]>(withProject('/api/events', params)),
    refetchInterval: 5000, // Poll every 5s for live feel
  })
}

export function useEventSessions() {
  return useQuery({
    queryKey: ['event-sessions'],
    queryFn: () => api.get<SessionSummary[]>(withProject('/api/events/sessions')),
    refetchInterval: 10000,
  })
}

export function useEventNames() {
  return useQuery({
    queryKey: ['event-names'],
    queryFn: () => api.get<string[]>(withProject('/api/events/names')),
  })
}
