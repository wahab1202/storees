'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { DomainFieldDef } from '@storees/shared'

type DomainSchemaResponse = {
  domainType: string
  categories: string[]
  fields: DomainFieldDef[]
}

export function useDomainSchema() {
  return useQuery({
    queryKey: ['domain-schema'],
    queryFn: () => api.get<DomainSchemaResponse>(withProject('/api/schema/fields')),
    staleTime: 5 * 60 * 1000, // schema doesn't change often
  })
}
