'use client'

import { useEffect, useRef } from 'react'
import { useStorees } from './hooks'

type RouteTrackerProps = {
  /**
   * Pass the current pathname from your router.
   *
   * Next.js App Router: `usePathname()` from 'next/navigation'
   * React Router: `useLocation().pathname`
   *
   * Example:
   *   import { usePathname } from 'next/navigation'
   *   <StoreeRouteTracker pathname={usePathname()} />
   */
  pathname: string
  /** Extra properties to attach to every page_viewed event */
  properties?: Record<string, unknown>
}

/**
 * Automatic page view tracker for React apps.
 *
 * Tracks a `page_viewed` event whenever the pathname changes.
 * Drop this component once inside your layout — it handles the rest.
 *
 * Usage (Next.js App Router):
 * ```tsx
 * 'use client'
 * import { usePathname } from 'next/navigation'
 * import { StoreeRouteTracker } from '@storees/react'
 *
 * export function Providers({ children }) {
 *   const pathname = usePathname()
 *   return (
 *     <StoreesProvider apiKey="..." apiUrl="...">
 *       <StoreeRouteTracker pathname={pathname} />
 *       {children}
 *     </StoreesProvider>
 *   )
 * }
 * ```
 */
export function StoreeRouteTracker({ pathname, properties }: RouteTrackerProps) {
  const { page, isReady } = useStorees()
  const prevPath = useRef<string | null>(null)
  // Store properties in a ref to avoid re-triggering the effect on object identity changes
  const propsRef = useRef(properties)
  propsRef.current = properties

  useEffect(() => {
    if (!isReady) return

    // Skip the initial render if autoTrack.pageViews is enabled in the SDK
    // (the SDK's AutoTracker already fires the first page view)
    if (prevPath.current === null) {
      prevPath.current = pathname
      return
    }

    // Only track when pathname actually changes
    if (pathname !== prevPath.current) {
      prevPath.current = pathname
      page(pathname, propsRef.current)
    }
  }, [pathname, isReady, page])

  return null
}
