'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { SubscriptionCategory } from '@storees/shared'

export function useSubscriptionCategories() {
  return useQuery({
    queryKey: ['subscription-categories'],
    queryFn: () => api.get<SubscriptionCategory[]>(withProject('/api/subscription-categories')),
  })
}
