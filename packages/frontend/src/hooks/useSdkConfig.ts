'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

type SdkConfig = {
  apiKey: string | null
  apiUrl: string
  domainType: string
  sdkConnected: boolean
}

export function useSdkConfig() {
  return useQuery({
    queryKey: ['sdk-config'],
    queryFn: () => api.get<SdkConfig>(withProject('/api/api-keys/sdk-config')),
  })
}
