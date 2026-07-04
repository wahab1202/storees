'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

const BASE = '/api/outbound-webhooks'

export type RetryPolicy = { max_attempts: number; schedule_seconds: number[] }

export type WebhookSubscription = {
  id: string
  url: string
  description: string | null
  authMethod: 'hmac' | 'bearer'
  events: string[]
  customHeaders: Record<string, string>
  retryPolicy?: RetryPolicy
  isActive: boolean
  createdAt: string
  lastDeliveryAt?: string | null
  secretPreview?: string
}

export type WebhookDelivery = {
  id: string
  eventId: string
  eventData: Record<string, unknown>
  attempt: number
  attemptedAt: string | null
  statusCode: number | null
  responseBody: string | null
  responseHeaders: Record<string, string> | null
  error: string | null
  nextRetryAt: string | null
  final: boolean
  createdAt: string
}

/** The event catalog. Only the segment events are wired today; the rest are
 *  reserved slots (selectable, will fire once their emit sites are wired). */
export const WEBHOOK_EVENT_CATALOG: { id: string; label: string; live: boolean }[] = [
  { id: 'customer.segment.entered', label: 'Customer entered a segment', live: true },
  { id: 'customer.segment.exited', label: 'Customer exited a segment', live: true },
  { id: 'customer.created', label: 'Customer created', live: false },
  { id: 'customer.updated', label: 'Customer updated', live: false },
]

export function useWebhookSubscriptions() {
  return useQuery({
    queryKey: ['webhook-subs'],
    queryFn: () => api.get<WebhookSubscription[]>(withProject(`${BASE}/subscriptions`)),
  })
}

export function useWebhookDeliveries(subId: string | null) {
  return useQuery({
    queryKey: ['webhook-deliveries', subId],
    queryFn: () => api.get<WebhookDelivery[]>(withProject(`${BASE}/subscriptions/${subId}/deliveries`)),
    enabled: !!subId,
    refetchInterval: 5000,
  })
}

export type CreateWebhookInput = {
  url: string
  description?: string
  authMethod: 'hmac' | 'bearer'
  events: string[]
  signingSecret?: string
  customHeaders?: Record<string, string>
  retryPolicy?: RetryPolicy
}

export function useCreateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateWebhookInput) =>
      api.post<{ id: string; signingSecret: string }>(withProject(`${BASE}/subscriptions`), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-subs'] }),
  })
}

export function useUpdateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      api.patch<{ id: string; signingSecret?: string }>(withProject(`${BASE}/subscriptions/${id}`), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-subs'] }),
  })
}

export function useDeleteWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(withProject(`${BASE}/subscriptions/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-subs'] }),
  })
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: string) => api.post(withProject(`${BASE}/subscriptions/${id}/test`), {}),
  })
}

export function useResendDelivery(subId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deliveryId: string) => api.post(withProject(`${BASE}/deliveries/${deliveryId}/resend`), {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-deliveries', subId] }),
  })
}
