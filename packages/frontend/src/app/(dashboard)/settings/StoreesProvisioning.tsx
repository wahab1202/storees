'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, XCircle, Clock, Rocket, ShieldCheck } from 'lucide-react'
import type { WhatsappProvisioningRequest, WhatsappProvisioningStatus } from '@storees/shared'

type Intake = {
  businessName: string
  requestedNumber: string
  category: string
  website: string
  address: string
  about: string
  contactName: string
  contactEmail: string
  logoUrl: string
  notes: string
}

const EMPTY: Intake = {
  businessName: '', requestedNumber: '', category: '', website: '', address: '',
  about: '', contactName: '', contactEmail: '', logoUrl: '', notes: '',
}

const STATUS_META: Record<WhatsappProvisioningStatus, { label: string; tone: string; icon: typeof Clock }> = {
  submitted: { label: 'Submitted — our team will provision your number', tone: 'text-amber-600', icon: Clock },
  provisioning: { label: 'Provisioning in progress', tone: 'text-indigo-600', icon: Loader2 },
  active: { label: 'Live — sending from your Storees-provisioned number', tone: 'text-green-600', icon: CheckCircle2 },
  error: { label: 'Provisioning hit a problem', tone: 'text-red-600', icon: XCircle },
  cancelled: { label: 'Cancelled', tone: 'text-text-muted', icon: XCircle },
}

/**
 * Storees-managed WhatsApp onboarding (ops-assisted). A brand with no provider
 * submits business details + a fresh number; the onboarding team provisions the
 * WABA on Meta and links it here. Mirrors the KwikEngage-style flow.
 */
export function StoreesProvisioning() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-provisioning'],
    queryFn: () => api.get<WhatsappProvisioningRequest | null>(withProject('/api/whatsapp/provisioning')),
    staleTime: 15_000,
  })
  const request = data?.data ?? null

  const [form, setForm] = useState<Intake>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(false)

  // Hydrate the form from the saved request once it loads.
  useEffect(() => {
    if (!request) return
    setForm({
      businessName: request.businessName ?? '', requestedNumber: request.requestedNumber ?? '',
      category: request.category ?? '', website: request.website ?? '', address: request.address ?? '',
      about: request.about ?? '', contactName: request.contactName ?? '', contactEmail: request.contactEmail ?? '',
      logoUrl: request.logoUrl ?? '', notes: request.notes ?? '',
    })
  }, [request])

  const set = (k: keyof Intake) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value })); setSavedAt(false); setError(null)
  }
  const isActive = request?.status === 'active'
  const canSubmit = form.businessName.trim() && form.requestedNumber.trim() && form.contactEmail.trim()

  async function submitIntake() {
    setBusy(true); setError(null)
    try {
      const resp = await api.post<WhatsappProvisioningRequest>(withProject('/api/whatsapp/provisioning'), form)
      if (!resp.success) { setError(resp.error ?? 'Could not save your request'); return }
      setSavedAt(true)
      qc.invalidateQueries({ queryKey: ['whatsapp-provisioning'] })
    } catch { setError('Could not save your request') } finally { setBusy(false) }
  }

  if (isLoading) {
    return <div className="p-4 flex items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }

  const statusMeta = request ? STATUS_META[request.status] : null

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-accent flex items-center justify-center text-white text-[10px] font-bold">St</div>
        <span className="text-sm font-medium text-text-primary">Storees managed WhatsApp</span>
        {statusMeta && (
          <span className={cn('ml-1 inline-flex items-center gap-1 text-[11px] font-medium', statusMeta.tone)}>
            <statusMeta.icon className={cn('h-3.5 w-3.5', request?.status === 'provisioning' && 'animate-spin')} /> {statusMeta.label}
          </span>
        )}
      </div>

      {request?.status === 'error' && request.errorReason && (
        <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg p-2.5">
          <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {request.errorReason}
        </div>
      )}

      {isActive ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Rocket className="h-4 w-4 text-text-muted" />
            Your number <span className="font-medium text-text-primary">{request?.requestedNumber || request?.phoneNumberId}</span> is live.
          </div>
          <p className="text-xs text-text-secondary">Manage your logo, name and details on the <span className="font-medium">WhatsApp Profile</span> panel.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-text-secondary leading-relaxed">
            Don&apos;t have a WhatsApp Business number yet? Give us a phone number that is
            <span className="font-medium"> not already registered on any Meta / WhatsApp Business account</span>,
            plus your business details, and our onboarding team will provision your WABA and connect it.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Business name*" value={form.businessName} onChange={set('businessName')} placeholder="Madurai Ice Creams" />
            <Field label="Phone number*" value={form.requestedNumber} onChange={set('requestedNumber')} placeholder="+91 98xxxxxxxx (fresh number)" />
            <Field label="Business category" value={form.category} onChange={set('category')} placeholder="Food & Beverage" />
            <Field label="Website" value={form.website} onChange={set('website')} placeholder="https://…" />
            <Field label="Contact name" value={form.contactName} onChange={set('contactName')} placeholder="Who we coordinate with" />
            <Field label="Contact email*" value={form.contactEmail} onChange={set('contactEmail')} placeholder="ops@brand.com" />
            <Field label="Logo URL" value={form.logoUrl} onChange={set('logoUrl')} placeholder="Public image URL for the profile photo" />
            <Field label="Address" value={form.address} onChange={set('address')} placeholder="Business address" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">About / notes</label>
            <textarea
              value={form.about} onChange={set('about')} rows={2}
              placeholder="Anything the onboarding team should know"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50"
            />
          </div>

          {error && <div className="flex items-center gap-1.5 text-xs text-red-600"><XCircle className="h-3.5 w-3.5" /> {error}</div>}

          <div className="flex items-center gap-3">
            <button
              onClick={submitIntake} disabled={busy || !canSubmit}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {busy ? 'Saving…' : request ? 'Update request' : 'Submit request'}
            </button>
            {savedAt && <span className="text-xs text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>}
          </div>
        </>
      )}

      {/* Onboarding-team panel — records the created WABA's creds (admin only; the
          API enforces the admin role). */}
      {request && !isActive && <OpsLinkPanel />}
    </div>
  )
}

function Field(props: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{props.label}</label>
      <input
        value={props.value} onChange={props.onChange} placeholder={props.placeholder}
        className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50"
      />
    </div>
  )
}

/** Ops-only: link the WABA created for this brand by pasting its Cloud API ids. */
function OpsLinkPanel() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function link() {
    setBusy(true); setError(null)
    try {
      const resp = await api.post(withProject('/api/whatsapp/provisioning/link'), {
        phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim(), accessToken: accessToken.trim(),
      })
      if (!resp.success) { setError(resp.error ?? 'Could not link the account'); return }
      setAccessToken('')
      qc.invalidateQueries({ queryKey: ['whatsapp-provisioning'] })
      qc.invalidateQueries({ queryKey: ['whatsapp-provider-status'] })
    } catch { setError('Could not link the account') } finally { setBusy(false) }
  }

  return (
    <details open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-lg border border-border bg-surface/50">
      <summary className="px-3 py-2 text-xs font-medium text-text-secondary cursor-pointer inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" /> Onboarding team — link the provisioned account
      </summary>
      <div className="p-3 pt-1 space-y-3">
        <p className="text-[11px] text-text-muted">After creating the WABA + registering the number on Meta, paste its Cloud API ids to go live.</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Phone number ID" value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} />
          <Field label="WABA ID" value={wabaId} onChange={e => setWabaId(e.target.value)} />
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Access token</label>
            <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
        </div>
        {error && <div className="flex items-center gap-1.5 text-xs text-red-600"><XCircle className="h-3.5 w-3.5" /> {error}</div>}
        <button
          onClick={link} disabled={busy || !phoneNumberId.trim() || !wabaId.trim() || !accessToken.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {busy ? 'Linking…' : 'Link & go live'}
        </button>
      </div>
    </details>
  )
}
