'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { Loader2, CheckCircle2, XCircle, Plug, Phone, ShieldCheck } from 'lucide-react'

type ProviderStatus = {
  configured: boolean
  provider: string | null
  capabilities: { submitTemplate: boolean; syncTemplates: boolean; getTemplateStatus: boolean }
  missingConfig: string[]
  webhookRegistered?: boolean
}

type ConnectResult = {
  connected?: boolean
  provider?: string
  number?: {
    phoneNumberId: string
    wabaId: string
    waNumber: string | null
    verifiedName: string | null
    qualityRating: string | null
  }
  webhookRegistered?: boolean
  templatesImported?: number
}

/**
 * Connect a brand's OWN Meta Cloud API WhatsApp account (BYO credentials).
 * Paste the three ids from Meta Business Manager → we validate against the
 * number, subscribe webhooks, and import existing templates. Token stored
 * encrypted, never shown back. Profile (logo/about) + usage are managed on
 * their own panels once connected.
 */
export function MetaConnect() {
  const qc = useQueryClient()
  const status = useQuery({
    queryKey: ['whatsapp-provider-status'],
    queryFn: () => api.get<ProviderStatus>(withProject('/api/whatsapp/provider-status')),
    staleTime: 30_000,
  })

  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [editing, setEditing] = useState(false)

  const data = status.data?.data
  const isConnected = data?.provider === 'meta' && data?.configured
  const canSubmit = phoneNumberId.trim() && wabaId.trim() && accessToken.trim()

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      const resp = await api.post<ConnectResult>(withProject('/api/whatsapp/connect-meta'), {
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim(),
        accessToken: accessToken.trim(),
      })
      if (!resp.success || !resp.data) {
        setError(resp.error ?? 'Could not connect — check the ids and token, then try again')
        return
      }
      setResult(resp.data)
      setAccessToken('')
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['whatsapp-provider-status'] })
      qc.invalidateQueries({ queryKey: ['whatsapp-templates'] })
      qc.invalidateQueries({ queryKey: ['channel-config'] })
    } catch {
      setError('Could not connect — check the ids and token, then try again')
    } finally {
      setBusy(false)
    }
  }

  // ── Connected state ──────────────────────────────────────
  if (isConnected && !editing) {
    const num = result?.number
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-green-500 flex items-center justify-center text-white text-[10px] font-bold">WA</div>
          <span className="text-sm font-medium text-text-primary">WhatsApp Cloud API</span>
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
          </span>
        </div>

        {num && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Phone className="h-4 w-4 text-text-muted" />
              Sending from <span className="font-medium text-text-primary">{num.waNumber || num.phoneNumberId}</span>
            </div>
            {num.verifiedName && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <ShieldCheck className="h-4 w-4 text-text-muted" />
                Verified name <span className="font-medium text-text-primary">{num.verifiedName}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          {(result?.webhookRegistered ?? data?.webhookRegistered) ? (
            <span className="text-text-muted">✓ Delivery tracking active</span>
          ) : (
            <span className="text-amber-600">⚠ Delivery tracking inactive — click “Reconnect” to re-subscribe webhooks.</span>
          )}
          {result && (
            <span className="text-text-muted">{(result.templatesImported ?? 0)} template{result.templatesImported === 1 ? '' : 's'} imported</span>
          )}
        </div>

        <p className="text-xs text-text-secondary">
          Manage your business logo, name, and details on the <span className="font-medium">WhatsApp Profile</span> panel. Author templates on the <span className="font-medium">WhatsApp Templates</span> page.
        </p>

        <button
          onClick={() => { setEditing(true); setResult(null) }}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-primary hover:bg-surface transition-colors"
        >
          Reconnect / update token
        </button>
      </div>
    )
  }

  // ── Connect state ────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-green-500 flex items-center justify-center text-white text-[10px] font-bold">WA</div>
        <span className="text-sm font-medium text-text-primary">WhatsApp Cloud API</span>
      </div>

      <p className="text-xs text-text-secondary leading-relaxed">
        Already have your own WhatsApp Business Account on Meta? Paste the three ids from
        Meta Business Manager (WhatsApp → API Setup). We validate them, subscribe delivery
        webhooks, and import your templates. The token is stored encrypted and never shown back.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Phone number ID</label>
          <input
            value={phoneNumberId}
            onChange={e => { setPhoneNumberId(e.target.value); setError(null) }}
            placeholder="e.g. 109somephonenumberid"
            className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">WhatsApp Business Account (WABA) ID</label>
          <input
            value={wabaId}
            onChange={e => { setWabaId(e.target.value); setError(null) }}
            placeholder="e.g. 102somewabaid"
            className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">System-user access token</label>
          <input
            type="password"
            value={accessToken}
            onChange={e => { setAccessToken(e.target.value); setError(null) }}
            placeholder="Paste a permanent system-user token"
            className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50"
          />
          <p className="mt-1 text-[10px] text-text-muted">Use a permanent System User token (Business Settings → System Users), not a temporary one.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <XCircle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={connect}
          disabled={busy || !canSubmit}
          className="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        {isConnected && editing && (
          <button onClick={() => { setEditing(false); setError(null) }} className="text-xs text-text-muted hover:text-text-secondary">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
