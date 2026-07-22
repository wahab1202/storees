import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'

// Data-source connector hooks. Scoped to an explicit `projectId` argument
// (not the global project context) so we can render connector lists inline
// inside any project's card on the Projects page without forcing the user
// to switch active projects.

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

export function useConnectors(projectId: string) {
  return useQuery({
    queryKey: ['connectors', projectId],
    queryFn: () => api.get<Connector[]>(`/api/data-sources/connectors?projectId=${projectId}`),
    enabled: !!projectId,
  })
}

export function useSyncHistory(connectorId: string | undefined, projectId: string) {
  return useQuery({
    queryKey: ['connector-syncs', projectId, connectorId],
    queryFn: () =>
      api.get<SyncRun[]>(`/api/data-sources/connectors/${connectorId}/syncs?projectId=${projectId}`),
    enabled: !!connectorId && !!projectId,
    refetchInterval: (q) => {
      const data = q.state.data?.data
      const hasActive = Array.isArray(data) && data.some((s) => s.status === 'running' || s.status === 'queued')
      return hasActive ? 3_000 : false
    },
  })
}

export function useSyncLogs(
  syncId: string | undefined,
  projectId: string,
  level?: 'info' | 'warn' | 'error',
) {
  return useQuery({
    queryKey: ['sync-logs', projectId, syncId, level ?? 'all'],
    queryFn: () =>
      api.get<SyncLog[]>(
        `/api/data-sources/syncs/${syncId}/logs?projectId=${projectId}${level ? `&level=${level}` : ''}`,
      ),
    enabled: !!syncId && !!projectId,
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useCreateConnector(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      template: string
      name: string
      baseUrl: string
      authValue: string
      configOverride?: Record<string, unknown>
    }) => api.post<{ id: string }>(`/api/data-sources/connectors?projectId=${projectId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors', projectId] })
      toast.success('Connector created')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to create connector'),
  })
}

export function useUpdateConnector(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: {
      id: string
      name?: string
      baseUrl?: string
      authValue?: string
      configOverride?: Record<string, unknown>
      status?: string
    }) => api.patch(`/api/data-sources/connectors/${id}?projectId=${projectId}`, input),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['connectors', projectId] })
      qc.invalidateQueries({ queryKey: ['connector', projectId, vars.id] })
      toast.success('Connector updated')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to update'),
  })
}

export function useDeleteConnector(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/data-sources/connectors/${id}?projectId=${projectId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors', projectId] })
      toast.success('Connector removed')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to remove'),
  })
}

export function useTestConnector(projectId: string) {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<TestConnectionResult>(`/api/data-sources/connectors/${id}/test?projectId=${projectId}`, {}),
    onSuccess: (res) => {
      if (res.data?.ok) toast.success('Connection test passed')
      else toast.error('Connection test failed — see results below')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Test failed'),
  })
}

export function useTriggerSync(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ connectorId, kind }: { connectorId: string; kind: 'full' | 'incremental' }) =>
      api.post<{ syncId: string; kind: string }>(
        `/api/data-sources/connectors/${connectorId}/sync?projectId=${projectId}`,
        { kind },
      ),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['connector-syncs', projectId, vars.connectorId] })
      toast.success(`${res.data?.kind === 'full' ? 'Full' : 'Incremental'} sync queued`)
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to start sync'),
  })
}

/**
 * Connect (or re-connect) a Shopify store as a data source. Shopify is native —
 * it goes through the Shopify connect endpoint (custom-app credentials), not
 * POST /connectors. On success the unified 'shopify' source row appears in the
 * Data Sources list.
 */
export function useConnectShopify(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { shop: string; client_id: string; client_secret: string }) =>
      api.post(`/api/integrations/shopify/connect?projectId=${projectId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors', projectId] })
      toast.success('Shopify store connected — syncing now')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to connect Shopify'),
  })
}
