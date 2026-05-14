'use client'

import { useState } from 'react'
import { Plus, Trash2, FlaskConical, CheckCircle2, AlertCircle, PauseCircle, Loader2 } from 'lucide-react'
import {
  useAdConversionDestinations,
  useCreateAdConversion,
  useDeleteAdConversion,
  useTestAdConversion,
  useUpdateAdConversion,
  type AdConversionDestination,
  type AdConversionPlatform,
} from '@/hooks/useAdConversions'

// Gap 9: settings page for ad-platform Conversion API destinations.

const PLATFORMS: Array<{ id: AdConversionPlatform; label: string; status: 'ready' | 'coming_soon'; helper: string }> = [
  { id: 'meta', label: 'Meta Ads (Conversions API)', status: 'ready', helper: 'Pixel ID + system-user access token from Events Manager.' },
  { id: 'google', label: 'Google Ads (Enhanced Conversions)', status: 'coming_soon', helper: 'Coming soon — needs developer token + OAuth refresh flow.' },
  { id: 'tiktok', label: 'TikTok Ads (Events API)', status: 'coming_soon', helper: 'Coming soon — same hashing rules as Meta.' },
  { id: 'snap', label: 'Snap Ads (CAPI)', status: 'coming_soon', helper: 'Coming soon.' },
]

export default function AdConversionsPage() {
  const { data, isLoading } = useAdConversionDestinations()
  const destinations = data?.data ?? []
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-heading">Ad Conversion APIs</h1>
        <p className="text-sm text-text-secondary mt-1">
          Relay revenue events server-side to Meta / Google / TikTok / Snap so ad platforms can optimize bids against actual conversions. Storees automatically fires <code className="font-mono text-xs">order_placed</code>, <code className="font-mono text-xs">subscription_renewed</code>, and other revenue events to every active destination configured here.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{destinations.length} destination{destinations.length === 1 ? '' : 's'} configured</span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add destination
        </button>
      </div>

      {showAdd && <AddForm onDone={() => setShowAdd(false)} />}

      {isLoading ? (
        <div className="text-sm text-text-muted py-6 text-center">Loading destinations…</div>
      ) : destinations.length === 0 && !showAdd ? (
        <div className="border border-dashed border-border rounded-xl p-8 text-center text-sm text-text-muted">
          No conversion API destinations configured. Click <strong>Add destination</strong> to wire your first ad platform.
        </div>
      ) : (
        <div className="space-y-3">
          {destinations.map((d) => <DestinationCard key={d.id} destination={d} />)}
        </div>
      )}
    </div>
  )
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [platform, setPlatform] = useState<AdConversionPlatform>('meta')
  const [name, setName] = useState('')
  const [pixelId, setPixelId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [testEventCode, setTestEventCode] = useState('')

  const createMutation = useCreateAdConversion()
  const selected = PLATFORMS.find((p) => p.id === platform)
  const disabled = selected?.status === 'coming_soon'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !pixelId.trim() || !accessToken.trim() || disabled) return
    await createMutation.mutateAsync({
      platform,
      name: name.trim(),
      pixelId: pixelId.trim(),
      accessToken: accessToken.trim(),
      testEventCode: testEventCode.trim() || null,
    })
    setName(''); setPixelId(''); setAccessToken(''); setTestEventCode('')
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="border border-border rounded-xl p-5 bg-surface/30 space-y-3">
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Platform</label>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as AdConversionPlatform)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id} disabled={p.status === 'coming_soon'}>
              {p.label}{p.status === 'coming_soon' ? ' (coming soon)' : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-muted mt-1">{selected?.helper}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Display name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Meta IN Production"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Pixel ID / Account ID</label>
          <input
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="e.g. 1234567890"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Access token</label>
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="System-user / API access token"
          className="w-full px-3 py-2 text-sm border border-border rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <p className="text-xs text-text-muted mt-1">Encrypted at rest. Never returned to the UI once saved.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Test event code <span className="font-normal text-text-muted">(optional)</span></label>
        <input
          value={testEventCode}
          onChange={(e) => setTestEventCode(e.target.value)}
          placeholder="TEST123"
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <p className="text-xs text-text-muted mt-1">
          When set, events show in the platform's debug view but don't count toward optimization. Leave blank for production traffic.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary">Cancel</button>
        <button
          type="submit"
          disabled={!name.trim() || !pixelId.trim() || !accessToken.trim() || disabled || createMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {createMutation.isPending ? 'Saving…' : 'Save destination'}
        </button>
      </div>
    </form>
  )
}

function DestinationCard({ destination: d }: { destination: AdConversionDestination }) {
  const testMutation = useTestAdConversion()
  const updateMutation = useUpdateAdConversion()
  const deleteMutation = useDeleteAdConversion()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="border border-border rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-heading">{d.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-text-muted font-medium uppercase tracking-wider">
              {d.platform}
            </span>
            <StatusBadge status={d.status} />
            {d.testEventCode && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
                TEST MODE
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-text-muted font-mono">Pixel: {d.pixelId}</div>
          <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
            <span>✓ {d.eventsSent.toLocaleString()} sent</span>
            {d.eventsFailed > 0 && <span className="text-red-700">✗ {d.eventsFailed.toLocaleString()} failed</span>}
            {d.lastSentAt && <span>last: {new Date(d.lastSentAt).toLocaleString()}</span>}
          </div>
          {d.lastError && d.lastErrorAt && (
            <div className="mt-2 rounded-md bg-red-50 border border-red-200 px-2 py-1.5 text-[11px] text-red-800">
              <AlertCircle className="inline h-3 w-3 mr-1" />
              <span className="font-medium">Last error ({new Date(d.lastErrorAt).toLocaleString()}):</span> {d.lastError}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => testMutation.mutate(d.id)}
            disabled={testMutation.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-border rounded-md hover:bg-surface disabled:opacity-50"
            title="Send a synthetic order_placed to verify the destination accepts it"
          >
            {testMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
            Test
          </button>
          <button
            onClick={() => updateMutation.mutate({ id: d.id, status: d.status === 'paused' ? 'active' : 'paused' })}
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-border rounded-md hover:bg-surface disabled:opacity-50"
          >
            {d.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
          {confirmingDelete ? (
            <>
              <button
                onClick={() => deleteMutation.mutate(d.id, { onSettled: () => setConfirmingDelete(false) })}
                disabled={deleteMutation.isPending}
                className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Confirm
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="px-2 py-1 text-xs text-text-muted hover:text-text-primary">Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirmingDelete(true)} className="p-1 text-text-muted hover:text-red-600 rounded-md hover:bg-surface" title="Remove destination">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: AdConversionDestination['status'] }) {
  const config = {
    active: { icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50', label: 'Active' },
    paused: { icon: PauseCircle, color: 'text-text-muted bg-surface', label: 'Paused' },
    error: { icon: AlertCircle, color: 'text-red-700 bg-red-50', label: 'Error' },
  }[status]
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}
