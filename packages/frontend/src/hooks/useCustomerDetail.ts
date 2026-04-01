'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { Customer, Order, TrackedEvent } from '@storees/shared'

type CustomerDetail = Customer & {
  segments: Array<{ segmentId: string; segmentName: string; joinedAt: string }>
}

export function useCustomerDetail(customerId: string | null) {
  return useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api.get<CustomerDetail>(withProject(`/api/customers/${customerId}`)),
    enabled: !!customerId,
    staleTime: 60_000,
  })
}

export function useCustomerOrders(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-orders', customerId],
    queryFn: () => api.get<Order[]>(withProject(`/api/customers/${customerId}/orders`)),
    enabled: !!customerId,
    staleTime: 120_000,
  })
}

export function useCustomerEvents(customerId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['customer-events', customerId, limit],
    queryFn: () =>
      api.get<TrackedEvent[]>(withProject(`/api/customers/${customerId}/events`, { limit })),
    enabled: !!customerId,
    staleTime: 30_000,
  })
}

type CustomerTrip = {
  id: string
  flowId: string
  flowName: string
  status: string
  currentNodeId: string
  enteredAt: string
  exitedAt: string | null
  context: Record<string, unknown>
}

export function useCustomerTrips(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-trips', customerId],
    queryFn: () =>
      api.get<CustomerTrip[]>(withProject(`/api/customers/${customerId}/trips`)),
    enabled: !!customerId,
    staleTime: 60_000,
  })
}

// Journey timeline types
export type JourneyEntryType =
  | 'event'
  | 'campaign_sent'
  | 'campaign_opened'
  | 'campaign_clicked'
  | 'flow_entered'
  | 'flow_exited'
  | 'segment_joined'
  | 'order'
  | 'message'

export type JourneyEntry = {
  id: string
  type: JourneyEntryType
  timestamp: string
  title: string
  subtitle: string | null
  meta: Record<string, unknown>
}

export type ActivitySummary = {
  engagementScore: number
  totalEvents: number
  totalOrders: number
  totalCampaignsReceived: number
  totalFlowTrips: number
  channelBreakdown: Record<string, number>
  weeklyActivity: Array<{ week: string; count: number }>
  topEvents: Array<{ eventName: string; count: number }>
  firstSeen: string | null
  lastSeen: string | null
  daysSinceLastActive: number | null
}

export function useCustomerJourney(
  customerId: string | null,
  options?: { limit?: number; offset?: number; types?: JourneyEntryType[] },
) {
  const typesParam = options?.types?.join(',')
  return useQuery({
    queryKey: ['customer-journey', customerId, options?.limit, options?.offset, typesParam],
    queryFn: () =>
      api.get<JourneyEntry[]>(
        withProject(`/api/customers/${customerId}/journey`, {
          limit: options?.limit,
          offset: options?.offset,
          ...(typesParam ? { types: typesParam } : {}),
        }),
      ),
    enabled: !!customerId,
    staleTime: 30_000,
  })
}

export function useActivitySummary(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-activity-summary', customerId],
    queryFn: () =>
      api.get<ActivitySummary>(withProject(`/api/customers/${customerId}/activity-summary`)),
    enabled: !!customerId,
    staleTime: 30_000,
  })
}

type CustomerMessage = {
  id: string
  channel: string
  messageType: string
  status: string
  sentAt: string | null
  deliveredAt: string | null
  readAt: string | null
  campaignName: string | null
  flowName: string | null
  blockReason: string | null
}

export function useCustomerMessages(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-messages', customerId],
    queryFn: () =>
      api.get<CustomerMessage[]>(withProject(`/api/customers/${customerId}/messages`)),
    enabled: !!customerId,
    staleTime: 10_000,
  })
}
