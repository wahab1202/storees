'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

/** The order the boxes are read in, mirroring the backend's `MEANINGS`: what the
 *  customer did, then what happened to the order. The three reversals are separate
 *  boxes because the order's STATUS needs to know which kind it was — one shared
 *  "undo" could only ever say the money came back off. */
export const MEANING_ORDER = [
  'purchase', 'product_viewed', 'add_to_cart', 'cart_remove',
  'fulfilment', 'cancellation', 'return', 'refund',
] as const

export type MeaningKey = (typeof MEANING_ORDER)[number]

/** An empty slot per meaning — the shape the page's local state starts from. Derived
 *  from MEANING_ORDER so a new box cannot be added on one side only. */
export const emptyAssignment = (): Record<MeaningKey, string[]> =>
  Object.fromEntries(MEANING_ORDER.map(k => [k, [] as string[]])) as
    Record<MeaningKey, string[]>

export type Meaning = {
  key: MeaningKey
  label: string
  help: string
  required: boolean
  events: string[]
  /** where this value came from — this project, its industry, or nowhere yet */
  source: 'project' | 'industry' | 'none'
}

export type SentEvent = {
  eventName: string
  count: number
  lastSeen: string | null
}

export type EventMapping = {
  meanings: Meaning[]
  signals: string[]
  ignored: string[]
  /** every event this project has actually sent, most frequent first */
  available: SentEvent[]
  /** mapped names with no rows behind them — the failure this screen prevents */
  unmatched: string[]
  configured: boolean
  /** Whether Save will be accepted. One remap per project: the save that gets the
   *  mapping right closes the door, and reopening it takes a command on the server. */
  lock?: {
    locked: boolean
    lockedAt?: string
    lockedBy?: string
    unlockedUntil?: string
    unlockedBy?: string
  }
}

export type EventMappingInput = Record<MeaningKey, string[]> & {
  signals: string[]
  ignore_events: string[]
}

/** Whether a rebuild from a previous save is still draining.
 *
 *  Polled while one is running so the screen can hold Save shut and show progress.
 *  Without it the page looks broken: the order count climbs for minutes with nothing
 *  said, and a second save interleaves two rebuilds. */
export function useReplayStatus(enabled = true) {
  return useQuery({
    queryKey: ['event-mapping-replay'],
    queryFn: () => api.get<{ running: boolean; remaining: number; total: number }>(
      withProject('/api/event-mapping/replay-status')),
    // only while something is in flight; stops polling as soon as it settles
    refetchInterval: (q) => (q.state.data?.data?.running ? 2000 : false),
    enabled,
  })
}

export function useEventMapping() {
  return useQuery({
    queryKey: ['event-mapping'],
    queryFn: () => api.get<EventMapping>(withProject('/api/event-mapping')),
  })
}

export function useSaveEventMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: EventMappingInput) =>
      api.put<{ events: Record<string, unknown>; reprocessing?: number; retired?: number }>(
        withProject('/api/event-mapping'), input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['event-mapping'] })
      // Say when history is being rebuilt. Changing a meaning re-queues the orders
      // already received, and that runs in the background — without a word here, the
      // numbers move minutes after the save with nothing connecting the two.
      qc.invalidateQueries({ queryKey: ['event-mapping-replay'] })
      const n = res?.data?.reprocessing ?? 0
      const retired = res?.data?.retired ?? 0
      // Say what actually happened to the books. A save can now REMOVE orders as well
      // as create them — silently changing a client's order count is not acceptable.
      const parts: string[] = []
      if (retired > 0) parts.push(`retired ${retired.toLocaleString('en-IN')} order(s)`)
      if (n > 0) parts.push(`rebuilding ${n.toLocaleString('en-IN')} event(s)`)
      toast.success(parts.length
        ? `Mapping saved — ${parts.join(', ')}. This can take a few minutes.`
        : 'Mapping saved — the next training run will use it')
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not save the mapping'
      toast.error(message)
    },
  })
}
