'use client'

import type { ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, ShieldAlert } from 'lucide-react'

/**
 * Returns null when the current user is a super admin (render the page), or a
 * fallback element (loading / 403) otherwise. Call at the TOP of a thin wrapper
 * component and early-return its result, then render the real page as a child —
 * so the page's own hooks only mount for authorized users. Nav already hides
 * these surfaces; this stops a direct URL from showing a form that would 403.
 */
export function useSuperAdminGuard(): ReactNode | null {
  const { data: session, status } = useSession()
  if (status === 'loading') {
    return <div className="flex items-center gap-2 text-sm text-text-muted p-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }
  if (session?.user?.isSuperAdmin === true) return null
  return (
    <div className="max-w-md mx-auto text-center p-12">
      <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-3" />
      <h1 className="text-lg font-semibold text-text-primary">Super admins only</h1>
      <p className="text-sm text-text-secondary mt-1">This area is restricted to platform administrators.</p>
    </div>
  )
}
