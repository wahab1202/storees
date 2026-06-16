import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

export type NotificationLog = {
  id: string
  channel: string
  status: string
  messageType: string
  provider: string | null
  failureReason: string | null
  blockReason: string | null
  createdAt: string
  sentAt: string | null
  deliveredAt: string | null
  readAt: string | null
  clickedAt: string | null
  failedAt: string | null
  campaignId: string | null
  flowTripId: string | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  campaignName: string | null
  flowName: string | null
}

export type NotificationLogFilters = {
  page?: number
  pageSize?: number
  channel?: string
  status?: string
  source?: string
  search?: string
  from?: string
  to?: string
}

export function useNotificationLogs(filters: NotificationLogFilters = {}) {
  const { page = 1, pageSize = 25, channel, status, source, search, from, to } = filters
  return useQuery({
    queryKey: ['notification-logs', { page, pageSize, channel, status, source, search, from, to }],
    queryFn: () => api.getPaginated<NotificationLog>(withProject('/api/logs/notifications', {
      page, pageSize, channel, status, source, search, from, to,
    })),
  })
}

export type LogSummary = { total: number; byStatus: Record<string, number> }

export function useNotificationLogSummary(filters: NotificationLogFilters = {}) {
  const { channel, source, search, from, to } = filters
  return useQuery({
    queryKey: ['notification-log-summary', { channel, source, search, from, to }],
    queryFn: () => api.get<LogSummary>(withProject('/api/logs/notifications/summary', {
      channel, source, search, from, to,
    })),
  })
}
