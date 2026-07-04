'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** The public receive URL for an inbound webhook token. */
export function webhookUrl(token: string): string {
  return `${API_BASE}/api/hooks/${token}`
}

export function CopyUrlButton({ token, compact }: { token: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(webhookUrl(token))
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-border bg-white text-xs font-medium text-text-secondary hover:bg-surface transition-colors',
        compact ? 'px-2 py-1' : 'px-3 py-1.5',
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy URL'}
    </button>
  )
}
