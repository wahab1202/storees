'use client'

import { useContext, useCallback, useSyncExternalStore } from 'react'
import { StoreesContext, subscribeEventLog, getEventLogSnapshot } from './provider'
import type { StoreesContextValue, EventLogEntry } from './provider'

/**
 * Access the full Storees SDK interface.
 *
 * Returns: { track, identify, page, setUserProperties, reset, isReady }
 *
 * Must be used inside <StoreesProvider>.
 */
export function useStorees(): StoreesContextValue {
  const ctx = useContext(StoreesContext)
  if (!ctx) {
    throw new Error('useStorees() must be used within a <StoreesProvider>')
  }
  return ctx
}

/**
 * Convenience hook — returns a stable `track` function.
 *
 * Usage:
 *   const track = useTrack()
 *   track('button_clicked', { label: 'signup' })
 */
export function useTrack() {
  const { track } = useStorees()
  return track
}

/**
 * Convenience hook — returns a stable `identify` function.
 *
 * Usage:
 *   const identify = useIdentify()
 *   identify('user_123', { email: 'jane@example.com', plan: 'pro' })
 */
export function useIdentify() {
  const { identify } = useStorees()
  return identify
}

/**
 * Convenience hook — returns a stable `page` function.
 *
 * Usage:
 *   const page = usePage()
 *   page('/dashboard', { section: 'overview' })
 */
export function usePage() {
  const { page } = useStorees()
  return page
}

/**
 * Subscribe to the SDK's event log — useful for building
 * a dev tools panel or StoreesBanner component.
 *
 * Returns the current log entries (most recent first).
 * Re-renders when new events are tracked.
 */
export function useEventLog(): EventLogEntry[] {
  return useSyncExternalStore(subscribeEventLog, getEventLogSnapshot, getServerSnapshot)
}

// SSR returns empty array
function getServerSnapshot(): EventLogEntry[] {
  return []
}
