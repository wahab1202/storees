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
  })
}

export function useCustomerOrders(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-orders', customerId],
    queryFn: () => api.get<Order[]>(withProject(`/api/customers/${customerId}/orders`)),
    enabled: !!customerId,
  })
}

export function useCustomerEvents(customerId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['customer-events', customerId, limit],
    queryFn: () =>
      api.get<TrackedEvent[]>(withProject(`/api/customers/${customerId}/events`, { limit })),
    enabled: !!customerId,
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
  })
}
