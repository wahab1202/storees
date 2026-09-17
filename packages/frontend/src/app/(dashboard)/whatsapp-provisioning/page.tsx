'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Loader2, Lock, ExternalLink, Inbox } from 'lucide-react'

type QueueRow = {
  id: string
  projectId: string
  projectName: string
  status: string
  businessName: string | null
  requestedNumber: string | null
  contactEmail: string | null
  assignedTo: string | null
  submittedAt: string
  updatedAt: string
}

const STATUS_TONE: Record<string, string> = {
  submitted: 'bg-amber-500/10 text-amber-600',
  provisioning: 'bg-indigo-500/10 text-indigo-600',
  active: 'bg-green-500/10 text-green-600',
  error: 'bg-red-500/10 text-red-600',
  cancelled: 'bg-surface text-text-muted',
}

/** Jump to a project's WhatsApp settings (sets the active project, then navigates). */
function openProject(projectId: string) {
  try { localStorage.setItem('storees-active-project', projectId) } catch { /* ignore */ }
  window.location.href = '/settings'
}

/**
 * Cross-project WhatsApp provisioning queue for the onboarding team — every
 * brand's request in one list, instead of visiting each project. Platform-admin
 * only (the API gates on STOREES_PLATFORM_ADMINS); a non-admin sees a locked
 * state. Read-only — the register/link actions stay per-project.
 */
export default function WhatsappProvisioningQueuePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-provisioning-queue'],
    queryFn: () => api.get<QueueRow[]>('/api/whatsapp/provisioning-queue'),
    staleTime: 30_000,
    retry: false,
  })

  const rows = data?.success ? (data.data ?? []) : null
  const forbidden = data && !data.success

  return (
    <div>
      <PageHeader title="WhatsApp Provisioning Queue" />

      <div className="max-w-5xl">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : forbidden ? (
          <div className="flex flex-col items-center gap-2 text-center p-12 text-text-muted">
            <Lock className="h-6 w-6" />
            <div className="text-sm font-medium text-text-primary">Platform-admin access required</div>
            <p className="text-xs max-w-sm">This queue spans every brand, so it&apos;s limited to platform admins. Ask an owner to add your email to <code className="text-[10px]">STOREES_PLATFORM_ADMINS</code>.</p>
          </div>
        ) : rows && rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-center p-12 text-text-muted">
            <Inbox className="h-6 w-6" />
            <div className="text-sm">No provisioning requests yet.</div>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-2.5 font-medium">Business</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Number</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Contact</th>
                  <th className="px-4 py-2.5 font-medium">Submitted</th>
                  <th className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface/40">
                    <td className="px-4 py-3 font-medium text-text-primary">{r.businessName || '—'}</td>
                    <td className="px-4 py-3 text-text-secondary">{r.projectName}</td>
                    <td className="px-4 py-3 text-text-secondary tabular-nums">{r.requestedNumber || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium capitalize', STATUS_TONE[r.status] ?? 'bg-surface text-text-muted')}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">{r.contactEmail || '—'}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">{new Date(r.submittedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openProject(r.projectId)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
