import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { toast } from 'sonner'

// Data-source connector hooks. Used by the project page's "Data Sources" tab.
// Connectors are commissioned once by the onboarding team and run on a manual
// "Sync Now" button afterwards.

export type ConnectorTemplate = {
  id: string
  label: string
  description: string
}

export type Connector = {
  id: string
  template: string
  name: string
  baseUrl: string
  status: 'active' | 'paused' | 'error'
  lastSyncedAt: Record<string, string | undefined>
  createdAt: string
  updatedAt: string
}

export type SyncStats = {
  customers?: { fetched: number; imported: number; failed: number }
  products?: { fetched: number; imported: number; failed: number }
  orders?: { fetched: number; imported: number; failed: number }
}

export type SyncRun = {
  id: string
  connectorId: string
  kind: 'full' | 'incremental'
  status: 'queued' | 'running' | 'success' | 'partial' | 'failed' | 'cancelled'
  startedAt: string | null
  finishedAt: string | null
  stats: SyncStats
  errorSummary: string | null
  createdAt: string
}

export type SyncLog = {
  id: string
  syncId: string
  level: 'info' | 'warn' | 'error'
  entityType: string | null
  entityId: string | null
  message: string
  payload: unknown | null
  createdAt: string
}

export type TestConnectionResult = {
  ok: boolean
  results: Record<'customers' | 'products' | 'orders', { ok: boolean; sample?: unknown; mapped?: unknown; error?: string }>
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useConnectorTemplates() {
  return useQuery({
    queryKey: ['connector-templates'],
    queryFn: () => api.get<ConnectorTemplate[]>('/api/data-sources/templates'),
    staleTime: 5 * 60_000,
  })
}

export function useConnectors() {
  return useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.get<Connector[]>(withProject('/api/data-sources/connectors')),
  })
}

export function useConnector(id: string | undefined) {
  return useQuery({
    queryKey: ['connector', id],
    queryFn: () => api.get<Connector>(withProject(`/api/data-sources/connectors/${id}`)),
    enabled: !!id,
  })
}

export function useSyncHistory(connectorId: string | undefined) {
  return useQuery({
    queryKey: ['connector-syncs', connectorId],
    queryFn: () => api.get<SyncRun[]>(withProject(`/api/data-sources/connectors/${connectorId}/syncs`)),
    enabled: !!connectorId,
    refetchInterval: (q) => {
      // Poll while any sync is running so the UI updates without manual refresh
      const data = q.state.data?.data
      const hasActive = Array.isArray(data) && data.some((s) => s.status === 'running' || s.status === 'queued')
      return hasActive ? 3_000 : false
    },
  })
}

export function useSyncLogs(syncId: string | undefined, level?: 'info' | 'warn' | 'error') {
  return useQuery({
    queryKey: ['sync-logs', syncId, level ?? 'all'],
    queryFn: () => api.get<SyncLog[]>(withProject(`/api/data-sources/syncs/${syncId}/logs${level ? `?level=${level}` : ''}`)),
    enabled: !!syncId,
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useCreateConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      template: string
      name: string
      baseUrl: string
      authValue: string
      configOverride?: Record<string, unknown>
    }) => api.post<{ id: string }>(withProject('/api/data-sources/connectors'), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      toast.success('Connector created')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to create connector'),
  })
}

export function useUpdateConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: {
      id: string
      name?: string
      baseUrl?: string
      authValue?: string
      configOverride?: Record<string, unknown>
      status?: string
    }) => api.patch(withProject(`/api/data-sources/connectors/${id}`), input),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      qc.invalidateQueries({ queryKey: ['connector', vars.id] })
      toast.success('Connector updated')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to update'),
  })
}

export function useDeleteConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(withProject(`/api/data-sources/connectors/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      toast.success('Connector removed')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to remove'),
  })
}

export function useTestConnector() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<TestConnectionResult>(withProject(`/api/data-sources/connectors/${id}/test`), {}),
    onSuccess: (res) => {
      if (res.data?.ok) toast.success('Connection test passed')
      else toast.error('Connection test failed — see results below')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Test failed'),
  })
}

export function useTriggerSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ connectorId, kind }: { connectorId: string; kind: 'full' | 'incremental' }) =>
      api.post<{ syncId: string; kind: string }>(
        withProject(`/api/data-sources/connectors/${connectorId}/sync`),
        { kind },
      ),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['connector-syncs', vars.connectorId] })
      toast.success(`${res.data?.kind === 'full' ? 'Full' : 'Incremental'} sync queued`)
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to start sync'),
  })
}
