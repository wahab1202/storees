import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

export type CtwaAdRow = {
  adId: string
  headline: string | null
  body: string | null
  sourceUrl: string | null
  mediaType: string | null
  imageUrl: string | null
  leads: number
  engaged: number      // leads with > 1 inbound (replied beyond hello)
  converted: number    // leads with at least one attributed purchase
  attributedRevenue: number
  firstSeen: string
  lastSeen: string
}

export type CtwaAttributionsResponse = {
  ads: CtwaAdRow[]
  totals: { leads: number; engaged: number; converted: number; attributedRevenue: number }
  range: { from: string; to: string }
}

export function useCtwaAttributions(opts?: { from?: string; to?: string }) {
  const params = new URLSearchParams()
  if (opts?.from) params.set('from', opts.from)
  if (opts?.to) params.set('to', opts.to)
  const qs = params.toString()
  return useQuery({
    queryKey: ['ctwa-attributions', opts?.from, opts?.to],
    queryFn: () => api.get<CtwaAttributionsResponse>(withProject(`/api/whatsapp/ctwa-attributions${qs ? `&${qs}` : ''}`)),
  })
}
