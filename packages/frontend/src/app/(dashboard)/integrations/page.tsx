'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Connected Stores has been retired. Store connections (Shopify, VirpanAI, etc.)
// now live per-project in Projects → Data Sources. Redirect any old links there.
export default function IntegrationsRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/projects')
  }, [router])
  return null
}
