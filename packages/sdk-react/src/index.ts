// Provider
export { StoreesProvider, StoreesContext } from './provider'
export type { StoreesProviderProps, StoreesContextValue, EventLogEntry } from './provider'

// Hooks
export { useStorees, useTrack, useIdentify, usePage, useEventLog } from './hooks'

// Route tracking
export { StoreeRouteTracker } from './route-tracker'

// Re-export SDK types that consumers commonly need
export type { StoreesSdkConfig, ConsentCategory } from '@storees/sdk'
