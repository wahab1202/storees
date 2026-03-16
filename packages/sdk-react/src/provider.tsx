'use client'

import {
  createContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { StoreesSdkConfig } from '@storees/sdk'
import storees from '@storees/sdk'

// ─── Event Log (for dev tools / StoreesBanner) ─────────────────

type EventLogEntry = {
  id: string
  timestamp: Date
  type: 'track' | 'identify' | 'page' | 'set_properties'
  name: string
  data?: Record<string, unknown>
  status: 'sent' | 'queued'
}

const MAX_LOG_ENTRIES = 100
let eventLog: EventLogEntry[] = []
let eventLogListeners = new Set<() => void>()
let eventCounter = 0

function pushLogEntry(entry: Omit<EventLogEntry, 'id' | 'timestamp' | 'status'>) {
  eventCounter++
  eventLog = [
    {
      ...entry,
      id: `${eventCounter}`,
      timestamp: new Date(),
      status: 'sent' as const,
    },
    ...eventLog,
  ].slice(0, MAX_LOG_ENTRIES)
  eventLogListeners.forEach(l => l())
}

function subscribeEventLog(listener: () => void) {
  eventLogListeners.add(listener)
  return () => { eventLogListeners.delete(listener) }
}

function getEventLogSnapshot() {
  return eventLog
}

// ─── Context ────────────────────────────────────────────────────

type StoreesContextValue = {
  /** Track a custom event */
  track: (eventName: string, properties?: Record<string, unknown>) => void
  /** Identify a user with attributes */
  identify: (userId: string, attributes?: Record<string, unknown>) => void
  /** Track a page view */
  page: (path?: string, properties?: Record<string, unknown>) => void
  /** Set user properties without tracking an event */
  setUserProperties: (attributes: Record<string, unknown>) => void
  /** Reset identity — call on logout */
  reset: () => void
  /** Whether the SDK has been initialized */
  isReady: boolean
}

export const StoreesContext = createContext<StoreesContextValue | null>(null)

// ─── Provider ───────────────────────────────────────────────────

type StoreesProviderProps = {
  /** Your Storees public API key */
  apiKey: string
  /** Storees API URL (e.g. https://your-storees.com or http://localhost:3003) */
  apiUrl: string
  /** SDK configuration overrides */
  config?: Partial<Omit<StoreesSdkConfig, 'apiKey' | 'apiUrl'>>
  children: ReactNode
}

export function StoreesProvider({ apiKey, apiUrl, config, children }: StoreesProviderProps) {
  const [isReady, setIsReady] = useState(false)
  const initialized = useRef(false)

  // Initialize SDK once on mount
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    storees.init({
      apiKey,
      apiUrl,
      ...config,
    })
    setIsReady(true)
  }, [apiKey, apiUrl, config])

  // Wrapped methods that also push to the event log
  const track = useCallback((eventName: string, properties?: Record<string, unknown>) => {
    storees.track(eventName, properties)
    pushLogEntry({ type: 'track', name: eventName, data: properties })
  }, [])

  const identify = useCallback((userId: string, attributes?: Record<string, unknown>) => {
    storees.identify(userId, attributes)
    pushLogEntry({ type: 'identify', name: userId, data: attributes })
  }, [])

  const page = useCallback((path?: string, properties?: Record<string, unknown>) => {
    storees.page(path, properties)
    pushLogEntry({ type: 'page', name: path ?? window.location.pathname, data: properties })
  }, [])

  const setUserProperties = useCallback((attributes: Record<string, unknown>) => {
    storees.setUserProperties(attributes)
    pushLogEntry({ type: 'set_properties', name: 'setUserProperties', data: attributes })
  }, [])

  const reset = useCallback(() => {
    storees.reset()
  }, [])

  return (
    <StoreesContext.Provider value={{ track, identify, page, setUserProperties, reset, isReady }}>
      {children}
    </StoreesContext.Provider>
  )
}

// ─── Exports for hooks ──────────────────────────────────────────

export { subscribeEventLog, getEventLogSnapshot }
export type { EventLogEntry, StoreesContextValue, StoreesProviderProps }
