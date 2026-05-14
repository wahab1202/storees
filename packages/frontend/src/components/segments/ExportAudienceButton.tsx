'use client'

import { useRef, useState } from 'react'
import { Download, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { withProject } from '@/lib/project'

// Gap 8: per-segment "Export as audience" dropdown. Calls the
// /api/segments/:id/export-audience endpoint, which returns a CSV of
// hashed PII formatted for the picked ad platform's Custom Audience
// uploader. Marketers upload that CSV manually for now — direct API
// integration is a follow-up.

type Platform = { id: 'meta' | 'google' | 'tiktok' | 'snap' | 'pinterest'; label: string }

const PLATFORMS: Platform[] = [
  { id: 'meta', label: 'Meta Ads' },
  { id: 'google', label: 'Google Ads' },
  { id: 'tiktok', label: 'TikTok Ads' },
  { id: 'snap', label: 'Snap Ads' },
  { id: 'pinterest', label: 'Pinterest Ads' },
]

export function ExportAudienceButton({ segmentId, memberCount }: { segmentId: string; memberCount: number }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  async function handleExport(platform: Platform) {
    setBusy(platform.id)
    setOpen(false)
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}${withProject(`/api/segments/${segmentId}/export-audience`, { platform: platform.id })}`

      // Use fetch (not <a download>) so we can pull auth headers from the
      // session — same JWT path the rest of the admin uses.
      const { getSession } = await import('next-auth/react')
      const session = await getSession()
      const jwt = (session as Record<string, unknown> | null)?.backendJwt as string | undefined

      const res = await fetch(url, {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(error.error ?? `HTTP ${res.status}`)
      }
      const rowCount = parseInt(res.headers.get('X-Audience-Row-Count') ?? '0', 10)
      const blob = await res.blob()
      const filename = (res.headers.get('content-disposition') ?? '').match(/filename="([^"]+)"/)?.[1] ?? 'audience.csv'

      const dlUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(dlUrl)

      toast.success(`Exported ${rowCount.toLocaleString()} hashed identifiers for ${platform.label}`)
    } catch (err) {
      toast.error((err as Error).message ?? 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  if (memberCount === 0) return null

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary font-medium transition-colors disabled:opacity-50"
        title="Export segment as hashed-PII CSV for an ad platform's Custom Audience"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        Export to ads
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 mt-1 z-20 w-56 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-muted bg-surface border-b border-border">
              Export hashed audience
            </div>
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleExport(p)}
                className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface flex items-center justify-between"
              >
                <span>{p.label}</span>
                <Download className="h-3 w-3 text-text-muted" />
              </button>
            ))}
            <div className="px-3 py-2 text-[10px] text-text-muted border-t border-border bg-surface/40">
              Identifiers are SHA-256 hashed before download — upload the CSV to the platform's Custom Audience tool.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
