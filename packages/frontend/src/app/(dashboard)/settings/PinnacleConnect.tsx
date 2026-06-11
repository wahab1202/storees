'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, XCircle, Plug, Phone } from 'lucide-react'

type ProviderStatus = {
  configured: boolean
  provider: string | null
  capabilities: { submitTemplate: boolean; syncTemplates: boolean; getTemplateStatus: boolean }
  missingConfig: string[]
}

type WaNumber = { wabaId: string; waNumber: string; phoneNumberId: string }

type ConnectResult = {
  needsSelection?: boolean
  numbers?: WaNumber[]
  connected?: boolean
  provider?: string
  selectedNumber?: { phoneNumberId: string; waNumber: string; wabaId: string }
  webhookRegistered?: boolean
  templatesImported?: number
}

/**
 * Connector onboarding for Pinnacle WhatsApp (BYO credentials).
 * One secret in → discover numbers → (pick one if several) → connected.
 * Sending, template authoring, and delivery analytics then run through the
 * shared WhatsApp surfaces automatically once the provider is configured.
 */
export function PinnacleConnect() {
  const qc = useQueryClient()
  const status = useQuery({
    queryKey: ['whatsapp-provider-status'],
    queryFn: () => api.get<ProviderStatus>(withProject('/api/whatsapp/provider-status')),
    staleTime: 30_000,
  })

  const [apikey, setApikey] = useState('')
  const [numbers, setNumbers] = useState<WaNumber[] | null>(null)
  const [picked, setPicked] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [editing, setEditing] = useState(false)

  const data = status.data?.data
  const isConnected = data?.provider === 'pinnacle' && data?.configured

  async function connect(phoneNumberId?: string) {
    setBusy(true)
    setError(null)
    try {
      const resp = await api.post<ConnectResult>(withProject('/api/whatsapp/connect-pinnacle'), {
        apikey: apikey.trim(),
        ...(phoneNumberId ? { phoneNumberId } : {}),
      })
      if (!resp.success || !resp.data) {
        setError(resp.error ?? 'Could not connect — check the API key and try again')
        return
      }
      const d = resp.data
      if (d.needsSelection && d.numbers) {
        setNumbers(d.numbers)
        setPicked(d.numbers[0]?.phoneNumberId ?? '')
        return
      }
      // Connected
      setResult(d)
      setNumbers(null)
      setApikey('')
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['whatsapp-provider-status'] })
      qc.invalidateQueries({ queryKey: ['whatsapp-templates'] })
      qc.invalidateQueries({ queryKey: ['channel-config'] })
    } catch {
      setError('Could not connect — check the API key and try again')
    } finally {
      setBusy(false)
    }
  }

  // ── Connected state ──────────────────────────────────────
  if (isConnected && !editing) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">Pn</div>
          <span className="text-sm font-medium text-text-primary">Pinnacle WhatsApp</span>
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
          </span>
        </div>

        {result?.selectedNumber && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Phone className="h-4 w-4 text-text-muted" />
            Sending from <span className="font-medium text-text-primary">{result.selectedNumber.waNumber || result.selectedNumber.phoneNumberId}</span>
          </div>
        )}
        {result && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-text-muted">
            <span>{result.webhookRegistered ? '✓ Webhook registered' : '⚠ Webhook not registered (set PINNACLE_WEBHOOK_SECRET + APP_URL)'}</span>
            <span>{(result.templatesImported ?? 0)} template{result.templatesImported === 1 ? '' : 's'} imported</span>
          </div>
        )}

        <p className="text-xs text-text-secondary">
          Author and sync templates from the <span className="font-medium">WhatsApp Templates</span> page. Inbound replies stay on your Pinnacle dashboard.
        </p>

        <button
          onClick={() => { setEditing(true); setResult(null) }}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-primary hover:bg-surface transition-colors"
        >
          Reconnect / update key
        </button>
      </div>
    )
  }

  // ── Connect / number-pick state ──────────────────────────
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">Pn</div>
        <span className="text-sm font-medium text-text-primary">Pinnacle WhatsApp</span>
      </div>

      <p className="text-xs text-text-secondary leading-relaxed">
        Already have a WhatsApp number live on Pinnacle? Paste your Pinnacle <span className="font-medium">API key</span> and
        we&apos;ll discover your number, register delivery webhooks, and import your existing templates. We never see your password —
        only the API key, stored encrypted.
      </p>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">Pinnacle API Key</label>
        <input
          type="password"
          value={apikey}
          onChange={e => { setApikey(e.target.value); setNumbers(null); setError(null) }}
          placeholder="Paste your apikey (e.g. 68bd0be4-c0fd-11ee-…)"
          className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50"
        />
      </div>

      {/* Number picker — only when the key owns several numbers */}
      {numbers && numbers.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-text-secondary">This key has multiple numbers — choose the sending number:</div>
          <div className="space-y-1.5">
            {numbers.map(n => (
              <label key={n.phoneNumberId} className={cn(
                'flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all',
                picked === n.phoneNumberId ? 'border-accent bg-accent/5 ring-1 ring-accent/20' : 'border-border hover:border-border-focus',
              )}>
                <input type="radio" name="wa-number" checked={picked === n.phoneNumberId} onChange={() => setPicked(n.phoneNumberId)} className="accent-accent" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{n.waNumber || n.phoneNumberId}</div>
                  <div className="text-[10px] text-text-muted truncate">WABA {n.wabaId}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <XCircle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => connect(numbers ? picked : undefined)}
          disabled={busy || !apikey.trim() || (!!numbers && !picked)}
          className="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
          {busy ? 'Connecting…' : numbers ? 'Use this number' : 'Connect'}
        </button>
        {isConnected && editing && (
          <button onClick={() => { setEditing(false); setError(null); setNumbers(null) }} className="text-xs text-text-muted hover:text-text-secondary">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
