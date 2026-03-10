'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { Customer, CustomerListParams, PaginatedResponse } from '@storees/shared'

type CustomerWithSegments = Customer & {
  segments: Array<{ id: string; name: string }>
}

export function useCustomers(params: CustomerListParams = {}) {
  const { page = 1, pageSize = 25, search, sortBy, sortOrder, segmentId } = params

  return useQuery({
    queryKey: ['customers', { page, pageSize, search, sortBy, sortOrder, segmentId }],
    queryFn: () =>
      api.getPaginated<CustomerWithSegments>(
        withProject('/api/customers', {
          page,
          pageSize,
          search,
          sortBy,
          sortOrder,
          segmentId,
        }),
      ),
  })
}
