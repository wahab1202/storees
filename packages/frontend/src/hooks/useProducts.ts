'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { Product, Collection } from '@storees/shared'

export function useProducts(search?: string) {
  return useQuery({
    queryKey: ['products', search],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (search) params.search = search
      return api.get<Product[]>(withProject('/api/products', params))
    },
  })
}

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: () => api.get<Collection[]>(withProject('/api/products/collections')),
  })
}
