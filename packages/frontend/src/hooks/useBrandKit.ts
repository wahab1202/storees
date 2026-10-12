'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { BrandKit } from '@storees/shared'

export type BrandKitResponse = {
  kit: BrandKit | null
  effective: {
    logoUrl: string | null
    primaryColor: string
    accentColor: string
    slogan: string | null
  }
}

export function useBrandKit() {
  return useQuery({
    queryKey: ['brand-kit'],
    queryFn: () => api.get<BrandKitResponse>(withProject('/api/brand-kit')),
  })
}

/** Detect brand assets: pass a website URL to scan it, or omit to pull from Shopify. */
export function useSyncBrandKit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input?: { url?: string }) =>
      api.post<BrandKit>(withProject('/api/brand-kit/sync'), input ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand-kit'] }),
  })
}

export function useUpdateBrandKit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<BrandKit>) =>
      api.patch<BrandKit>(withProject('/api/brand-kit'), patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand-kit'] }),
  })
}
