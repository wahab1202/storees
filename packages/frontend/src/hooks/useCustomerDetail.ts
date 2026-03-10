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
