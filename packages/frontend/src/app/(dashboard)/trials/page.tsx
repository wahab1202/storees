'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSuperAdminGuard } from '@/components/auth/RequireSuperAdmin'
import { useAdminCustomers, useAdminCustomerDetail, useUpdateCustomerPlan, type AdminCustomer } from '@/hooks/useAdminCustomers'
import { Loader2, Search, Clock, CheckCircle2, ArrowUpCircle, Ban, Store, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Tab = { key: string; label: string; status?: string; endingSoon?: boolean }
const TABS: Tab[] = [
  { key: 'all', label: 'All' },
  { key: 'trialing', label: 'Trialing', status: 'trialing' },
  { key: 'ending', label: 'Ending soon', endingSoon: true },
  { key: 'expired', label: 'Expired', status: 'expired' },
  { key: 'active', label: 'Active', status: 'active' },
]

const STATUS_STYLE: Record<string, string> = {
  trialing: 'bg-indigo-100 text-indigo-700',
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-rose-100 text-rose-700',
  suspended: 'bg-slate-200 text-slate-600',
  cancelled: 'bg-slate-200 text-slate-600',
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const d = Date.now() - new Date(iso).getTime()
  const h = Math.floor(d / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function TrialsPage() {
  const guard = useSuperAdminGuard()
  const [tabKey, setTabKey] = useState('all')
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const tab = TABS.find(t => t.key === tabKey)!
  const { data, isLoading } = useAdminCustomers({ status: tab.status, endingSoon: tab.endingSoon, search: search.trim() || undefined })
  const update = useUpdateCustomerPlan()
  if (guard) return guard

  const rows = data?.data ?? []
  const totalTrials = rows.filter(r => r.plan === 'trial' && r.status === 'trialing').length

  async function act(c: AdminCustomer, body: { plan?: string; status?: string; extendDays?: number }, msg: string) {
    try { await update.mutateAsync({ projectId: c.id, ...body }); toast.success(msg) }
    catch (err) { toast.error((err as Error).message || 'Failed') }
  }

  return (
    <div>
      <PageHeader
        title="Trials & Customers"
        description="Every signup, their store, plan, trial status and usage. Extend, upgrade or suspend from here."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTabKey(t.key)}
              className={cn('px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                tabKey === t.key ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface')}>
              {t.label}{t.key === 'all' && totalTrials ? ` · ${totalTrials} trialing` : ''}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search store / domain…"
            className="w-64 h-9 pl-9 pr-3 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-text-muted"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-lg">
          <Store className="h-7 w-7 mx-auto text-text-muted mb-2" />
          <p className="text-sm text-text-secondary">No customers here yet.</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-surface text-left text-xs font-semibold text-text-muted uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5">Store</th>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Trial</th>
                <th className="px-4 py-2.5 text-right">Contacts</th>
                <th className="px-4 py-2.5 text-right">Sent</th>
                <th className="px-4 py-2.5">Last active</th>
                <th className="px-4 py-2.5 w-px" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(c => (
                <tr key={c.id} className="hover:bg-surface/50">
                  <td className="px-4 py-2.5">
                    <button onClick={() => setDetailId(c.id)} className="text-left hover:underline">
                      <div className="font-medium text-text-primary">{c.name || c.shopifyDomain || '—'}</div>
                      <div className="text-xs text-text-muted">{c.ownerEmail || c.shopifyDomain || ''}</div>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 capitalize text-text-secondary">{c.plan}</td>
                  <td className="px-4 py-2.5"><span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', STATUS_STYLE[c.status] ?? 'bg-slate-100 text-slate-600')}>{c.status}</span></td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {c.plan === 'trial' && c.trialDaysLeft != null
                      ? <span className={cn(c.trialDaysLeft <= 3 && c.status === 'trialing' ? 'text-amber-600 font-medium' : '')}>{c.status === 'trialing' ? `${c.trialDaysLeft}d left` : 'ended'}</span>
                      : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{c.contacts.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{c.messagesSent.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-text-muted text-xs">{timeAgo(c.lastActiveAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      {c.plan === 'trial' && (
                        <button onClick={() => act(c, { extendDays: 14 }, 'Trial extended 14 days')} disabled={update.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-border rounded-md text-text-secondary hover:bg-surface" title="Extend trial 14 days">
                          <Clock className="h-3.5 w-3.5" /> +14d
                        </button>
                      )}
                      {c.plan !== 'custom' && (
                        <button onClick={() => act(c, { plan: 'custom', status: 'active' }, 'Upgraded to full access')} disabled={update.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-border rounded-md text-accent hover:bg-accent/5" title="Upgrade to full access">
                          <ArrowUpCircle className="h-3.5 w-3.5" /> Upgrade
                        </button>
                      )}
                      {c.status !== 'suspended' ? (
                        <button onClick={() => act(c, { status: 'suspended' }, 'Account suspended')} disabled={update.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-border rounded-md text-text-muted hover:text-rose-600 hover:bg-rose-50" title="Suspend">
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => act(c, { status: 'active' }, 'Account reactivated')} disabled={update.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-border rounded-md text-emerald-600 hover:bg-emerald-50" title="Reactivate">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailId && <CustomerDrawer projectId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

function CustomerDrawer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data, isLoading } = useAdminCustomerDetail(projectId)
  const d = data?.data
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text-primary truncate">{d?.name || d?.shopifyDomain || 'Customer'}</h2>
            <p className="text-xs text-text-muted truncate">{d?.shopifyDomain} · {d?.signupSource}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:bg-surface rounded"><X className="h-4 w-4" /></button>
        </div>

        {isLoading || !d ? (
          <div className="flex items-center justify-center py-16 text-text-muted"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
        ) : (
          <div className="space-y-5 text-sm">
            <section className="grid grid-cols-2 gap-3">
              <Stat label="Plan" value={d.plan} />
              <Stat label="Status" value={d.status} />
              <Stat label="Trial left" value={d.plan === 'trial' && d.trialDaysLeft != null ? (d.status === 'trialing' ? `${d.trialDaysLeft}d` : 'ended') : '—'} />
              <Stat label="Signed up" value={new Date(d.createdAt).toLocaleDateString()} />
              <Stat label="Contacts" value={d.usage.contacts.toLocaleString()} />
              <Stat label="Owner" value={d.admins[0]?.email ?? '—'} />
            </section>

            <section>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Sent by channel</p>
              {Object.keys(d.usage.sentByChannel).length === 0 ? (
                <p className="text-xs text-text-muted">No sends yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(d.usage.sentByChannel).map(([ch, n]) => (
                    <span key={ch} className="text-xs px-2 py-1 rounded-md bg-surface text-text-secondary capitalize">{ch}: <strong>{n}</strong></span>
                  ))}
                </div>
              )}
            </section>

            <section>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Entitlements</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {Object.entries(d.entitlements.features).map(([f, on]) => (
                  <span key={f} className={`text-[11px] px-2 py-0.5 rounded-full ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{f.replace(/_/g, ' ')}</span>
                ))}
              </div>
              <div className="text-xs text-text-muted">
                Limits: {Object.entries(d.entitlements.limits).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v < 0 ? '∞' : v}`).join(' · ')}
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Recent activity</p>
              {d.timeline.length === 0 ? (
                <p className="text-xs text-text-muted">No events yet.</p>
              ) : (
                <ul className="space-y-1">
                  {d.timeline.slice(0, 12).map((e, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary">{e.eventName.replace(/_/g, ' ')}</span>
                      <span className="text-text-muted">{new Date(e.at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className="text-sm font-medium text-text-primary capitalize truncate">{value}</p>
    </div>
  )
}
