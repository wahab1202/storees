'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  type Role,
  type RolePermissions,
} from '@/hooks/useRoles'
import { Loader2, Plus, Shield, Trash2, Pencil, Eye, EyeOff, Download, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Draft = {
  id: string | null
  name: string
  description: string
  viewContactPii: boolean
  exportCustomers: boolean
}

const emptyDraft: Draft = {
  id: null,
  name: '',
  description: '',
  viewContactPii: true,
  exportCustomers: true,
}

export default function RolesSettingsPage() {
  const { data: rolesResp, isLoading } = useRoles()
  const create = useCreateRole()
  const update = useUpdateRole()
  const del = useDeleteRole()

  const roles = rolesResp?.data ?? []
  const [draft, setDraft] = useState<Draft | null>(null)

  const saving = create.isPending || update.isPending

  async function handleSave() {
    if (!draft) return
    if (!draft.name.trim()) return toast.error('Role name is required')
    const permissions: RolePermissions = {
      viewContactPii: draft.viewContactPii,
      exportCustomers: draft.exportCustomers,
      screens: '*',
    }
    try {
      if (draft.id) {
        await update.mutateAsync({ id: draft.id, name: draft.name.trim(), description: draft.description.trim(), permissions })
        toast.success('Role updated')
      } else {
        await create.mutateAsync({ name: draft.name.trim(), description: draft.description.trim(), permissions })
        toast.success('Role created')
      }
      setDraft(null)
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save role')
    }
  }

  async function handleDelete(role: Role) {
    if (!confirm(`Delete the "${role.name}" role? Its ${role.memberCount} member(s) will revert to full access.`)) return
    try {
      await del.mutateAsync(role.id)
      toast.success('Role deleted')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to delete role')
    }
  }

  function startEdit(role: Role) {
    setDraft({
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      viewContactPii: role.permissions.viewContactPii !== false,
      exportCustomers: role.permissions.exportCustomers !== false,
    })
  }

  return (
    <div>
      <PageHeader
        title="Roles"
        description="Custom roles control what each teammate can see and do. Turn off contact visibility to let someone work with customer data without seeing email or phone numbers — enforced across the whole app, including exports."
        actions={
          <button
            onClick={() => setDraft({ ...emptyDraft })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
          >
            <Plus size={14} />
            New role
          </button>
        }
      />

      {draft && (
        <div className="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            {draft.id ? 'Edit role' : 'Create a role'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Name *</span>
              <input
                value={draft.name}
                onChange={e => setDraft(d => d && ({ ...d, name: e.target.value }))}
                placeholder="e.g. Support (no contact details)"
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Description</span>
              <input
                value={draft.description}
                onChange={e => setDraft(d => d && ({ ...d, description: e.target.value }))}
                placeholder="What this role is for"
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Data access</p>
            <PermissionToggle
              label="See contact details"
              hint="Email and phone/WhatsApp numbers. When off, they're masked everywhere (e.g. j•••@•••.com) — including in the API, raw payloads, and exports."
              enabled={draft.viewContactPii}
              onToggle={() => setDraft(d => d && ({ ...d, viewContactPii: !d.viewContactPii }))}
              onIcon={<Eye size={15} />}
              offIcon={<EyeOff size={15} />}
            />
            <PermissionToggle
              label="Export customer data"
              hint="Download customer / consent / audience CSVs. Off blocks all exports for this role."
              enabled={draft.exportCustomers}
              onToggle={() => setDraft(d => d && ({ ...d, exportCustomers: !d.exportCustomers }))}
              onIcon={<Download size={15} />}
              offIcon={<Download size={15} />}
            />
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {draft.id ? 'Save changes' : 'Create role'}
            </button>
            <button
              onClick={() => setDraft(null)}
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
          Loading roles…
        </div>
      ) : roles.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-300 rounded-lg">
          <Shield size={28} className="mx-auto text-slate-400 mb-2" />
          <p className="text-sm text-slate-600">No custom roles yet.</p>
          <p className="text-xs text-slate-500 mt-1">
            Create one to limit what a teammate can see — then assign it on the Team page.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Restrictions</th>
                <th className="px-4 py-2.5">Members</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {roles.map(role => {
                const noPii = role.permissions.viewContactPii === false
                const noExport = role.permissions.exportCustomers === false
                return (
                  <tr key={role.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{role.name}</div>
                      {role.description && <div className="text-xs text-slate-500">{role.description}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {noPii && <Chip className="bg-amber-100 text-amber-700"><EyeOff size={11} /> Contact hidden</Chip>}
                        {noExport && <Chip className="bg-rose-100 text-rose-700"><Download size={11} /> No export</Chip>}
                        {!noPii && !noExport && <span className="text-xs text-slate-400">Full access</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Users size={12} className="text-slate-400" />
                        {role.memberCount}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => startEdit(role)}
                          className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(role)}
                          className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
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
    </div>
  )
}

function PermissionToggle({
  label, hint, enabled, onToggle, onIcon, offIcon,
}: {
  label: string
  hint: string
  enabled: boolean
  onToggle: () => void
  onIcon: React.ReactNode
  offIcon: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 bg-white border border-slate-200 rounded-md">
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5', enabled ? 'text-indigo-600' : 'text-slate-400')}>
          {enabled ? onIcon : offIcon}
        </span>
        <div>
          <div className="text-sm font-medium text-slate-900">{label}</div>
          <div className="text-xs text-slate-500">{hint}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          enabled ? 'bg-indigo-600' : 'bg-slate-300',
        )}
      >
        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', enabled ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
    </div>
  )
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', className)}>
      {children}
    </span>
  )
}
