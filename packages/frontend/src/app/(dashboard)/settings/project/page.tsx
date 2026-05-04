'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useProjects,
  useUpdateProjectFeatures,
  useEmailDomain,
  useRegisterEmailDomain,
  useFrequencyCaps,
  useUpdateFrequencyCaps,
  type EmailDnsRecord,
  type FrequencyCaps,
} from '@/hooks/useProjects'
import { getProjectId } from '@/lib/project'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, AlertCircle, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export default function ProjectSettingsPage() {
  const { data: projectsResp, isLoading } = useProjects()
  const projects = projectsResp?.data ?? []

  let activeId: string | null = null
  try {
    activeId = getProjectId()
  } catch {
    // no active project
  }

  const project = projects.find(p => p.id === activeId) ?? null
  const updateFeatures = useUpdateProjectFeatures(activeId ?? '')

  const [agentScoped, setAgentScoped] = useState(false)
  useEffect(() => {
    setAgentScoped(!!project?.features?.agentScopedAccess)
  }, [project?.id, project?.features?.agentScopedAccess])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading project settings…
      </div>
    )
  }

  if (!project) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No active project selected.
      </div>
    )
  }

  const handleToggleAgentScoped = (next: boolean) => {
    setAgentScoped(next)
    updateFeatures.mutate(
      { agentScopedAccess: next },
      {
        onSuccess: () => {
          toast.success(next ? 'Dealer-scoped access enabled' : 'Dealer-scoped access disabled')
        },
        onError: (err: Error) => {
          setAgentScoped(!next) // revert
          toast.error(err.message || 'Failed to update setting')
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Settings"
        description={`Per-project configuration for ${project.name}`}
      />

      <section className="rounded-lg border border-slate-200 bg-white">
        <header className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">B2B / Dealer access</h2>
          <p className="mt-1 text-sm text-slate-500">
            Required for distributors with multi-region/dealer hierarchies (e.g. GowelMart).
          </p>
        </header>

        <div className="px-6 py-5 flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-900">Enable dealer-scoped access</div>
            <p className="mt-1 text-sm text-slate-500">
              When enabled: agent/manager logins see only their assigned dealer&apos;s customers, the
              segment builder gains <strong>Dealer / Region / City</strong> filters, and the Dealers
              and Team settings tabs become available.
            </p>
          </div>

          <Toggle
            checked={agentScoped}
            onChange={handleToggleAgentScoped}
            disabled={updateFeatures.isPending}
          />
        </div>
      </section>

      <EmailDomainSection projectId={project.id} projectName={project.name} />

      <FrequencyCapsSection projectId={project.id} />
    </div>
  )
}

function FrequencyCapsSection({ projectId }: { projectId: string }) {
  const { data: capsResp, isLoading } = useFrequencyCaps(projectId)
  const update = useUpdateFrequencyCaps(projectId)

  const channels: Array<{ key: keyof FrequencyCaps; label: string; help: string }> = [
    { key: 'whatsapp_marketing', label: 'WhatsApp marketing',  help: 'Meta recommends ≤2 per week to keep WABA quality HIGH.' },
    { key: 'sms_marketing',      label: 'SMS marketing',       help: 'TRAI guidance: don’t exceed 5 per week or carriers throttle.' },
    { key: 'email_marketing',    label: 'Email marketing',     help: 'Per-day cap; bounce/complaint rates rise sharply above 1/day.' },
    { key: 'push_marketing',     label: 'Push marketing',      help: 'Per-day cap; iOS notifications get hidden after a few in-day.' },
  ]

  const [form, setForm] = useState<FrequencyCaps>({})
  useEffect(() => {
    if (capsResp?.data?.frequencyCaps) setForm(capsResp.data.frequencyCaps)
  }, [capsResp?.data?.frequencyCaps])

  const handleSave = () => {
    update.mutate(form, {
      onSuccess: () => toast.success('Frequency caps updated'),
      onError: (err: Error) => toast.error(err.message || 'Failed to update'),
    })
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-900">Frequency caps</h2>
        <p className="mt-1 text-sm text-slate-500">
          Maximum marketing messages per channel per customer in a rolling window. Transactional sends
          (order receipts, OTPs) bypass these caps. Set <code className="text-xs bg-slate-100 px-1 rounded">max = 0</code> to disable a channel’s cap.
        </p>
      </header>

      <div className="px-6 py-5 space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {channels.map(({ key, label, help }) => {
              const cap = form[key] ?? { perDays: 7, max: 1 }
              return (
                <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">{label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{help}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600">Max</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={cap.max}
                      onChange={e => setForm(f => ({ ...f, [key]: { ...cap, max: Number(e.target.value) } }))}
                      className="w-16 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    />
                    <span className="text-slate-600">per</span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={cap.perDays}
                      onChange={e => setForm(f => ({ ...f, [key]: { ...cap, perDays: Number(e.target.value) } }))}
                      className="w-16 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    />
                    <span className="text-slate-600">{cap.perDays === 1 ? 'day' : 'days'}</span>
                  </div>
                </div>
              )
            })}

            <div className="pt-2">
              <button
                onClick={handleSave}
                disabled={update.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60"
              >
                {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save caps
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function EmailDomainSection({ projectId, projectName }: { projectId: string; projectName: string }) {
  const qc = useQueryClient()
  const { data: domainResp, isLoading } = useEmailDomain(projectId)
  const registerDomain = useRegisterEmailDomain(projectId)
  const status = domainResp?.data ?? null

  const [domain, setDomain] = useState('')
  const [fromName, setFromName] = useState(projectName)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (status?.fromName) setFromName(status.fromName)
  }, [status?.fromName])

  const handleRegister = () => {
    if (!domain.trim()) {
      toast.error('Enter a domain')
      return
    }
    if (!fromName.trim()) {
      toast.error('Enter a from-name')
      return
    }
    registerDomain.mutate(
      { domain: domain.trim().toLowerCase(), fromName: fromName.trim() },
      {
        onSuccess: () => toast.success('Domain registered. Add the DNS records below to verify.'),
        onError: (err: Error) => toast.error(err.message || 'Failed to register domain'),
      },
    )
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      // Force a re-fetch from Resend
      await api.get(`/api/onboarding/projects/${projectId}/email-domain`)
      await qc.invalidateQueries({ queryKey: ['email-domain', projectId] })
      toast.success('Status refreshed')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-900">Email sending domain</h2>
        <p className="mt-1 text-sm text-slate-500">
          Send marketing email from your own domain. DKIM/SPF reputation accumulates against your
          brand, not the shared Storees pool — required before high-volume campaigns.
        </p>
      </header>

      <div className="px-6 py-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading domain status…
          </div>
        ) : !status?.registered ? (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex gap-3 items-start">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <strong>No sending domain registered.</strong> Campaigns from this project will use
                the shared Storees pool, which is rate-capped to protect platform reputation. Register
                your own domain to send at full volume.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="block font-medium text-slate-700 mb-1">Domain (subdomain recommended)</span>
                <input
                  type="text"
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="mail.yourbrand.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                />
              </label>
              <label className="block text-sm">
                <span className="block font-medium text-slate-700 mb-1">From name (display name)</span>
                <input
                  type="text"
                  value={fromName}
                  onChange={e => setFromName(e.target.value)}
                  placeholder="Your Brand"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                />
              </label>
            </div>

            <button
              onClick={handleRegister}
              disabled={registerDomain.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {registerDomain.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Register with Resend
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-900">{status.domain}</div>
                <div className="text-sm text-slate-500">
                  Sending as <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{status.fromName} &lt;{status.fromAddress}&gt;</code>
                </div>
              </div>
              <StatusBadge verified={status.verified} status={status.status} />
            </div>

            {!status.verified && (
              <>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  Add the DNS records below to your domain&apos;s DNS provider (Cloudflare, Route53,
                  Google Domains, etc.). Verification typically takes 5-30 minutes after the records
                  propagate.
                </div>

                <DnsRecordTable records={status.records} />

                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                  Check verification status
                </button>
              </>
            )}

            {status.verified && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-900">
                  <strong>Domain verified.</strong> Future campaigns will send from{' '}
                  <code>{status.fromAddress}</code> with full DKIM/SPF authentication.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function StatusBadge({ verified, status }: { verified: boolean; status: string }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Verified
      </span>
    )
  }
  if (status === 'failed' || status === 'temporary_failure') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <AlertCircle className="h-3.5 w-3.5" /> Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <Loader2 className="h-3.5 w-3.5" /> Pending
    </span>
  )
}

function DnsRecordTable({ records }: { records: EmailDnsRecord[] }) {
  if (records.length === 0) return null

  const copy = (val: string) => {
    navigator.clipboard.writeText(val)
    toast.success('Copied')
  }

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Name / Host</th>
            <th className="px-3 py-2 text-left font-medium">Value</th>
            <th className="px-3 py-2 text-left font-medium w-12"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.type}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-700 break-all">{r.name}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-700 break-all">{r.value}</td>
              <td className="px-3 py-2">
                <button
                  onClick={() => copy(r.value)}
                  title="Copy value"
                  className="text-slate-400 hover:text-slate-700"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
        checked ? 'bg-indigo-600' : 'bg-slate-300',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
