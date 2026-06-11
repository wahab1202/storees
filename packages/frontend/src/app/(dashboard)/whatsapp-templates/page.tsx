'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * WhatsApp templates were consolidated into the Templates section.
 * This route now redirects to /templates?channel=whatsapp.
 */
export default function WhatsappTemplatesRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/templates?channel=whatsapp')
  }, [router])

  return (
    <div className="flex items-center gap-2 p-8 text-sm text-text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Templates…
    </div>
  )
}
