'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, UserPlus, X, ShieldAlert, Check } from 'lucide-react'
import { useClients, useCreateClient, useLinkClientProject, useUnlinkClientProject } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleDateString(undefined, { dateStyle: 'medium' }) } catch { return s }
}

export default function ClientsPage() {
  const { data: session, status } = useSession()
  const isSuperAdmin = session?.user?.isSuperAdmin === true

  if (status === 'loading') {
    return <div className="flex items-center gap-2 text-sm text-text-muted p-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }
  if (!isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto text-center p-12">
        <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-text-primary">Super admins only</h1>
        <p className="text-sm text-text-secondary mt-1">Client management is restricted to platform administrators.</p>
      </div>
    )
  }
  return <ClientsAdmin />
}

function ClientsAdmin() {
  const { data: clientsRes, isLoading } = useClients()
  const { data: projectsRes } = useProjects()
  const create = useCreateClient()
  const unlink = useUnlinkClientProject()
  const link = useLinkClientProject()

  const clients = clientsRes?.success ? clientsRes.data : []
  const projects = projectsRes?.data ?? []
  const projectName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projects) m.set(p.id, p.name)
    return (id: string) => m.get(id) ?? id.slice(0, 8)
  }, [projects])

  const [form, setForm] = useState({ email: '', name: '', password: '', projectId: '' })
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setCreated(null)
    const resp = await create.mutateAsync(form).catch((err) => ({ success: false, error: (err as Error).message }))
    if (resp && (resp as { success?: boolean }).success) {
      setCreated(form.email)
      setForm({ email: '', name: '', password: '', projectId: '' })
    } else {
      setError((resp as { error?: string })?.error ?? 'Could not create client')
    }
  }

  const inputCls = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Clients</h1>
        <p className="text-sm text-text-secondary mt-1">Create client logins and link each one to a project. Clients see only the project(s) you grant them.</p>
      </div>

      {/* Create client */}
      <form onSubmit={onCreate} className="bg-white border border-border rounded-xl p-5 space-y-4">
        <div className="text-sm font-semibold text-text-primary flex items-center gap-2"><UserPlus className="h-4 w-4 text-accent" /> New client</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Marketing" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Email</label>
            <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="team@acme.com" autoComplete="off" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Initial password</label>
            <input className={inputCls} type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Project</label>
            <select className={inputCls} value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
              <option value="">Select a project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="text-xs text-red-600 inline-flex items-center gap-1"><X className="h-3.5 w-3.5" /> {error}</div>}
        {created && <div className="text-xs text-green-600 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Created {created}. Share the initial password securely — they can change it after signing in.</div>}
        <div>
          <button
            type="submit"
            disabled={create.isPending || !form.email || !form.name || form.password.length < 8 || !form.projectId}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Create client
          </button>
        </div>
      </form>

      {/* Clients list */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border text-sm font-semibold text-text-primary">
          {clients.length} client{clients.length === 1 ? '' : 's'}
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : clients.length === 0 ? (
          <div className="text-sm text-text-muted p-6 text-center">No clients yet. Create one above.</div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map(c => (
              <div key={c.id} className="px-5 py-3 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary truncate">{c.name}</div>
                  <div className="text-xs text-text-muted truncate">{c.email} · joined {fmtDate(c.createdAt)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 justify-end max-w-[55%]">
                  {c.projectIds.length === 0 && <span className="text-[11px] text-text-muted">No projects</span>}
                  {c.projectIds.map(pid => (
                    <span key={pid} className="inline-flex items-center gap-1 text-[11px] font-medium bg-accent/10 text-accent px-2 py-0.5 rounded">
                      {projectName(pid)}
                      <button
                        title="Revoke access"
                        onClick={() => unlink.mutate({ userId: c.id, projectId: pid })}
                        className="text-accent/70 hover:text-red-600"
                      ><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <select
                    className="h-7 text-[11px] border border-border rounded-md bg-white text-text-secondary px-1.5"
                    value=""
                    onChange={e => { if (e.target.value) link.mutate({ userId: c.id, projectId: e.target.value }) }}
                  >
                    <option value="">+ link…</option>
                    {projects.filter(p => !c.projectIds.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
