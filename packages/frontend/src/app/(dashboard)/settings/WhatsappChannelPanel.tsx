'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { cn } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'
import { MetaConnect } from './MetaConnect'
import { PinnacleConnect } from './PinnacleConnect'
import { StoreesProvisioning } from './StoreesProvisioning'
import { WhatsappProfile } from './WhatsappProfile'
import { WhatsappUsage } from './WhatsappUsage'

type ProviderStatus = { configured: boolean; provider: string | null }
type Profile = { verifiedName: string | null; displayNumber: string | null }

const WA_PROVIDERS = [
  { value: 'storees', label: 'Storees managed', desc: 'No WhatsApp yet? We provision a number for you', initials: 'St', color: 'bg-accent' },
  { value: 'meta', label: 'WhatsApp Cloud API', desc: 'Connect your own Meta WABA', initials: 'WA', color: 'bg-green-500' },
  { value: 'pinnacle', label: 'Pinnacle', desc: 'Bring your own Pinnacle key', initials: 'Pn', color: 'bg-indigo-600' },
]

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * The WhatsApp channel as a proper multi-section surface: a status header, then
 * Connection (provider choice + connect/provision, collapsed once connected),
 * Business Profile (the brand's logo/name/details), and Usage. Replaces the
 * generic "pick a provider + fill a field form" pattern for WhatsApp.
 */
export function WhatsappChannelPanel() {
  const statusQ = useQuery({
    queryKey: ['whatsapp-provider-status'],
    queryFn: () => api.get<ProviderStatus>(withProject('/api/whatsapp/provider-status')),
    staleTime: 30_000,
  })
  const profileQ = useQuery({
    queryKey: ['whatsapp-profile'],
    queryFn: () => api.get<Profile>(withProject('/api/whatsapp/profile')),
    staleTime: 30_000,
    retry: false,
  })

  const status = statusQ.data?.data
  const configured = !!status?.configured
  const provider = status?.provider ?? null
  const profile = profileQ.data?.success ? profileQ.data.data : null

  const [selected, setSelected] = useState('storees')
  const [changing, setChanging] = useState(false)
  // Default the picker to the connected provider once known.
  useEffect(() => { if (provider) setSelected(provider) }, [provider])

  const providerLabel = WA_PROVIDERS.find(p => p.value === provider)?.label ?? provider ?? '—'

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/40 px-4 py-3">
        <span className={cn('w-2.5 h-2.5 rounded-full', configured ? 'bg-green-500' : 'bg-amber-500')} />
        <div>
          <div className="text-sm font-medium text-text-primary">
            {configured ? `Connected · ${providerLabel}` : 'Not connected'}
          </div>
          <div className="text-[11px] text-text-muted">
            {configured
              ? [profile?.displayNumber, profile?.verifiedName].filter(Boolean).join(' · ') || 'Sending enabled'
              : 'Connect a provider, or let Storees provision a number for you.'}
          </div>
        </div>
      </div>

      {/* Connection */}
      <Section title="Connection" subtitle="Choose how WhatsApp messages are sent from your brand.">
        {configured && !changing ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-white px-4 py-3">
            <span className="text-sm text-text-secondary">
              Connected via <span className="font-medium text-text-primary">{providerLabel}</span>
            </span>
            <button onClick={() => setChanging(true)} className="text-xs font-medium text-accent hover:underline">
              Change / reconnect
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {WA_PROVIDERS.map(p => {
                const isSel = selected === p.value
                return (
                  <button
                    key={p.value}
                    onClick={() => setSelected(p.value)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
                      isSel ? 'border-accent bg-accent/5 ring-1 ring-accent/20' : 'border-border hover:border-border-focus hover:bg-white',
                    )}
                  >
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0', p.color)}>
                      {p.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">{p.label}</div>
                      <div className="text-[10px] text-text-muted leading-tight">{p.desc}</div>
                    </div>
                    {isSel && <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 ml-auto" />}
                  </button>
                )
              })}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              {selected === 'meta' && <MetaConnect />}
              {selected === 'pinnacle' && <PinnacleConnect />}
              {selected === 'storees' && <StoreesProvisioning />}
            </div>
            {configured && changing && (
              <button onClick={() => setChanging(false)} className="text-xs text-text-muted hover:text-text-secondary">Cancel</button>
            )}
          </>
        )}
      </Section>

      {/* Business Profile */}
      {configured && provider === 'meta' ? (
        <WhatsappProfile />
      ) : (
        <Section title="Business Profile" subtitle="Your brand's public identity — logo, name, and details customers see on WhatsApp.">
          <div className="rounded-lg border border-dashed border-border bg-surface/30 px-4 py-6 text-center text-sm text-text-muted">
            Connect a Meta number to manage your logo, name, and business details.
          </div>
        </Section>
      )}

      {/* Usage */}
      <WhatsappUsage />
    </div>
  )
}
