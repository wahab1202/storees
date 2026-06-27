'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

type ShopifyStatus = {
  connected: boolean
  shopifyDomain: string | null
}

export function useShopifyStatus() {
  return useQuery({
    queryKey: ['shopify-status'],
    queryFn: () => api.get<ShopifyStatus>(withProject('/api/integrations/shopify/status')),
  })
}

type ShopifySyncStatus = {
  status: 'none' | 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
  jobId?: string
  progress?: Record<string, unknown> | null
  result?: Record<string, unknown> | null
  failedReason?: string | null
  message?: string
}

/**
 * Polls the latest sync job for the active project. Poll only while a job is
 * in flight (waiting/active) so a connected-but-idle store doesn't hammer the API.
 */
export function useShopifySyncStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['shopify-sync-status'],
    queryFn: () => api.get<ShopifySyncStatus>(withProject('/api/integrations/shopify/sync-status')),
    enabled,
    refetchInterval: (query) => {
      const s = query.state.data?.data?.status
      return s === 'waiting' || s === 'active' ? 2000 : false
    },
  })
}

/** Manually queue a re-sync of the active project's Shopify store. */
export function useTriggerShopifySync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(withProject('/api/integrations/shopify/sync'), {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopify-sync-status'] }),
  })
}
