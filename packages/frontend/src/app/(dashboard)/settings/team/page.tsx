'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAgents } from '@/hooks/useAgents'
import {
  useAdminUsers,
  useCreateAdminUser,
  useUpdateAdminUser,
  useDeleteAdminUser,
  type AdminRole,
  type TeamMember,
} from '@/hooks/useAdminUsers'
import { Loader2, Plus, UserPlus, Trash2, Key, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type FormState = {
  email: string
  name: string
  password: string
  role: AdminRole
  agentId: string
}

const emptyForm: FormState = {
  email: '',
  name: '',
  password: '',
  role: 'agent',
  agentId: '',
}

const roleLabel: Record<AdminRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
}

const roleColor: Record<AdminRole, string> = {
  admin: 'bg-indigo-100 text-indigo-700',
  manager: 'bg-amber-100 text-amber-700',
  agent: 'bg-emerald-100 text-emerald-700',
}

export default function TeamSettingsPage() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id

  const { data: usersResp, isLoading } = useAdminUsers()
  const { data: agentsResp } = useAgents()
  const create = useCreateAdminUser()
  const update = useUpdateAdminUser()
  const del = useDeleteAdminUser()

  const users = usersResp?.data ?? []
  const agents = (agentsResp?.data ?? []).filter(a => a.isActive)

  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const needsAgent = form.role === 'agent' || form.role === 'manager'

  async function handleInvite() {
    if (!form.email.trim() || !form.name.trim() || !form.password) {
      return toast.error('Email, name, and password are required')
    }
    if (form.password.length < 8) {
      return toast.error('Password must be at least 8 characters')
    }
    if (needsAgent && !form.agentId) {
      return toast.error('Select a dealer for this agent/manager')
    }
    try {
      await create.mutateAsync({
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password,
        role: form.role,
        agentId: needsAgent ? form.agentId : null,
      })
      toast.success('Team member added')
      setForm(emptyForm)
      setShowInvite(false)
    } catch (err) {
      toast.error((err as Error).message || 'Failed to add team member')
    }
  }

  async function handleRoleChange(user: TeamMember, nextRole: AdminRole) {
    if (user.id === currentUserId) return toast.error("You can't change your own role")
    const payload: Parameters<typeof update.mutateAsync>[0] = { id: user.id, role: nextRole }
    if (nextRole === 'admin') payload.agentId = null
    try {
      await update.mutateAsync(payload)
      toast.success('Role updated')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update role')
    }
  }

  async function handleAgentChange(user: TeamMember, agentId: string) {
    try {
      await update.mutateAsync({ id: user.id, agentId: agentId || null })
      toast.success('Dealer assignment updated')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update')
    }
  }

  async function handleResetPassword(id: string) {
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters')
    try {
      await update.mutateAsync({ id, password: newPassword })
      toast.success('Password reset — share the new password with the user')
      setResetPasswordFor(null)
      setNewPassword('')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to reset password')
    }
  }

  async function handleDelete(user: TeamMember) {
    if (user.id === currentUserId) return toast.error("You can't delete yourself")
    if (!confirm(`Remove ${user.name} from the team? They will lose access immediately.`)) return
    try {
      await del.mutateAsync(user.id)
      toast.success('Team member removed')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to remove team member')
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        description="Invite teammates and control what each of them can see. Admins see everything; managers and agents are scoped to their assigned dealer."
        actions={
          <button
            onClick={() => setShowInvite(v => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
          >
            <UserPlus size={14} />
            Invite member
          </button>
        }
      />

      {showInvite && (
        <div className="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Invite a team member</h3>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <LabeledInput label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" />
            <LabeledInput label="Temporary password *" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} type="text" placeholder="min 8 characters" />
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Role *</span>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as AdminRole, agentId: e.target.value === 'admin' ? '' : f.agentId }))}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="admin">Admin — full access</option>
                <option value="manager">Manager — scoped to dealer + reports</option>
                <option value="agent">Agent — scoped to one dealer</option>
              </select>
            </label>
            {needsAgent && (
              <label className="block col-span-2">
                <span className="block text-xs font-medium text-slate-700 mb-1">Dealer *</span>
                <select
                  value={form.agentId}
                  onChange={e => setForm(f => ({ ...f, agentId: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select dealer…</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.region ? ` — ${a.region}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Share the email and temporary password with the user. They can change it after logging in.
          </p>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleInvite}
              disabled={create.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
            >
              {create.isPending && <Loader2 size={14} className="animate-spin" />}
              Create account
            </button>
            <button
              onClick={() => { setShowInvite(false); setForm(emptyForm) }}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading team…
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-300 rounded-lg">
          <UserPlus size={28} className="mx-auto text-slate-400 mb-2" />
          <p className="text-sm text-slate-600">No team members yet.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Dealer</th>
                <th className="px-4 py-2.5">Security</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map(user => {
                const isSelf = user.id === currentUserId
                const needsAgentRow = user.role === 'agent' || user.role === 'manager'
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {user.name}
                      {isSelf && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{user.email}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={user.role}
                        onChange={e => handleRoleChange(user, e.target.value as AdminRole)}
                        disabled={isSelf}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
                          roleColor[user.role],
                        )}
                      >
                        <option value="admin">{roleLabel.admin}</option>
                        <option value="manager">{roleLabel.manager}</option>
                        <option value="agent">{roleLabel.agent}</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {needsAgentRow ? (
                        <select
                          value={user.agentId ?? ''}
                          onChange={e => handleAgentChange(user, e.target.value)}
                          className="text-xs px-2 py-1 rounded border border-slate-300 bg-white max-w-[180px]"
                        >
                          <option value="">Unassigned</option>
                          {agents.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name}{a.region ? ` — ${a.region}` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {user.totpEnabled && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <ShieldCheck size={12} />
                          2FA
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => { setResetPasswordFor(user.id); setNewPassword('') }}
                          className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                          title="Reset password"
                        >
                          <Key size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          disabled={isSelf}
                          className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title={isSelf ? 'Cannot delete yourself' : 'Remove'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {resetPasswordFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setResetPasswordFor(null)}>
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Reset password</h3>
            <p className="text-xs text-slate-500 mb-3">The user will use this new password to log in.</p>
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResetPasswordFor(null)}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResetPassword(resetPasswordFor)}
                disabled={update.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
              >
                {update.isPending && <Loader2 size={14} className="animate-spin" />}
                Reset password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LabeledInput({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
    </label>
  )
}
