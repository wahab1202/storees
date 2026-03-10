'use client'

import { useQuery } from '@tanstack/react-query'
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
