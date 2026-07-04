'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type {
  InboundWebhook,
  InboundWebhookEvent,
  PayloadSchemaField,
  EventDefinition,
} from '@storees/shared'

export type {
  InboundWebhook, InboundWebhookEvent, PayloadSchemaField, EventDefinition,
} from '@storees/shared'

export function useInboundWebhooks() {
  return useQuery({
    queryKey: ['inbound-webhooks'],
    queryFn: () => api.get<InboundWebhook[]>(withProject('/api/inbound-webhooks')),
  })
}

export function useInboundWebhookDetail(id: string) {
  return useQuery({
    queryKey: ['inbound-webhooks', id],
    queryFn: () => api.get<InboundWebhook>(withProject(`/api/inbound-webhooks/${id}`)),
    enabled: !!id,
  })
}

export function useCreateInboundWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string }) =>
      api.post<InboundWebhook>(withProject('/api/inbound-webhooks'), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbound-webhooks'] })
      toast.success('Webhook created')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to create webhook'),
  })
}

export function useUpdateInboundWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; status?: 'active' | 'paused' }) =>
      api.patch<InboundWebhook>(withProject(`/api/inbound-webhooks/${id}`), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbound-webhooks'] }),
    onError: (err) => toast.error(err.message ?? 'Failed to update webhook'),
  })
}

export function useDeleteInboundWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(withProject(`/api/inbound-webhooks/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbound-webhooks'] })
      toast.success('Webhook deleted')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to delete webhook'),
  })
}

export function useInboundWebhookEvents(id: string, page = 1) {
  return useQuery({
    queryKey: ['inbound-webhook-events', id, page],
    queryFn: () => api.getPaginated<InboundWebhookEvent>(
      withProject(`/api/inbound-webhooks/${id}/events`, { page, pageSize: 25 }),
    ),
    enabled: !!id,
    refetchInterval: 5000, // live feel while testing "start sending data"
  })
}

export function useInboundWebhookSchema(id: string) {
  return useQuery({
    queryKey: ['inbound-webhook-schema', id],
    queryFn: () => api.get<PayloadSchemaField[]>(withProject(`/api/inbound-webhooks/${id}/schema`)),
    enabled: !!id,
  })
}

export function useEventDefinitions(webhookId: string) {
  return useQuery({
    queryKey: ['event-definitions', webhookId],
    queryFn: () => api.get<EventDefinition[]>(withProject(`/api/inbound-webhooks/${webhookId}/definitions`)),
    enabled: !!webhookId,
  })
}

export function useCreateEventDefinition(webhookId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<EventDefinition>) =>
      api.post<EventDefinition>(withProject(`/api/inbound-webhooks/${webhookId}/definitions`), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-definitions', webhookId] })
      toast.success('Event definition created')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to create definition'),
  })
}

export function useUpdateEventDefinition(webhookId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<EventDefinition>) =>
      api.patch<EventDefinition>(withProject(`/api/inbound-webhooks/definitions/${id}`), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-definitions', webhookId] })
      toast.success('Definition updated')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to update definition'),
  })
}

export function useDeleteEventDefinition(webhookId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(withProject(`/api/inbound-webhooks/definitions/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-definitions', webhookId] })
      toast.success('Definition deleted')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to delete definition'),
  })
}
