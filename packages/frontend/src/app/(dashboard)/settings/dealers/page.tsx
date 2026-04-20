'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAgents, useCreateAgent, useUpdateAgent, type Agent } from '@/hooks/useAgents'
import { Loader2, Plus, Users, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type FormState = {
  name: string
  externalDealerId: string
  email: string
  phone: string
  region: string
  city: string
}

const emptyForm: FormState = {
  name: '',
  externalDealerId: '',
  email: '',
  phone: '',
  region: '',
  city: '',
}

export default function DealersSettingsPage() {
  const { data: resp, isLoading } = useAgents()
  const create = useCreateAgent()
  const update = useUpdateAgent()
  const agents = resp?.data ?? []

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(emptyForm)

  async function handleCreate() {
    if (!form.name.trim()) return toast.error('Name is required')
    try {
      await create.mutateAsync({
        name: form.name.trim(),
        externalDealerId: form.externalDealerId.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        region: form.region.trim() || undefined,
        city: form.city.trim() || undefined,
      })
      toast.success('Dealer added')
      setForm(emptyForm)
      setShowCreate(false)
    } catch (err) {
      toast.error((err as Error).message || 'Failed to add dealer')
    }
  }

  function startEdit(agent: Agent) {
    setEditingId(agent.id)
    setEditForm({
      name: agent.name,
      externalDealerId: agent.externalDealerId ?? '',
      email: agent.email ?? '',
      phone: agent.phone ?? '',
      region: agent.region ?? '',
      city: agent.city ?? '',
    })
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.name.trim()) return toast.error('Name is required')
    try {
      await update.mutateAsync({
        id,
        name: editForm.name.trim(),
        externalDealerId: editForm.externalDealerId.trim() || undefined,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        region: editForm.region.trim() || undefined,
        city: editForm.city.trim() || undefined,
      })
      toast.success('Dealer updated')
      setEditingId(null)
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update dealer')
    }
  }

  async function toggleActive(agent: Agent) {
    try {
      await update.mutateAsync({ id: agent.id, isActive: !agent.isActive })
      toast.success(agent.isActive ? 'Dealer deactivated' : 'Dealer reactivated')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update dealer')
    }
  }

  return (
    <div>
      <PageHeader
        title="Dealers"
        description="Distributors and regional reps who own customer relationships. Used to scope segments and agent logins."
        actions={
          <button
            onClick={() => setShowCreate(v => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
          >
            <Plus size={14} />
            Add dealer
          </button>
        }
      />

      {showCreate && (
        <div className="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">New dealer</h3>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <LabeledInput label="External dealer ID" value={form.externalDealerId} onChange={v => setForm(f => ({ ...f, externalDealerId: v }))} placeholder="ID from ecommerce platform" />
            <LabeledInput label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" />
            <LabeledInput label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
            <LabeledInput label="Region" value={form.region} onChange={v => setForm(f => ({ ...f, region: v }))} />
            <LabeledInput label="City" value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleCreate}
              disabled={create.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
            >
              {create.isPending && <Loader2 size={14} className="animate-spin" />}
              Save dealer
            </button>
            <button
              onClick={() => { setShowCreate(false); setForm(emptyForm) }}
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
          Loading dealers…
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-300 rounded-lg">
          <Users size={28} className="mx-auto text-slate-400 mb-2" />
          <p className="text-sm text-slate-600">No dealers yet. Click "Add dealer" to create one, or import from your ecommerce platform.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Region / City</th>
                <th className="px-4 py-2.5">Contact</th>
                <th className="px-4 py-2.5 text-right">Customers</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {agents.map(agent => (
                editingId === agent.id ? (
                  <tr key={agent.id} className="bg-indigo-50/30">
                    <td className="px-4 py-2"><EditInput value={editForm.name} onChange={v => setEditForm(f => ({ ...f, name: v }))} /></td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <EditInput value={editForm.region} onChange={v => setEditForm(f => ({ ...f, region: v }))} placeholder="Region" />
                        <EditInput value={editForm.city} onChange={v => setEditForm(f => ({ ...f, city: v }))} placeholder="City" />
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <EditInput value={editForm.email} onChange={v => setEditForm(f => ({ ...f, email: v }))} placeholder="Email" />
                        <EditInput value={editForm.phone} onChange={v => setEditForm(f => ({ ...f, phone: v }))} placeholder="Phone" />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{agent.customerCount}</td>
                    <td className="px-4 py-2 text-slate-500">—</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleSaveEdit(agent.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-slate-500 hover:bg-slate-100 rounded"><X size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={agent.id} className={cn(!agent.isActive && 'opacity-50')}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{agent.name}</div>
                      {agent.externalDealerId && <div className="text-xs text-slate-500">#{agent.externalDealerId}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {[agent.city, agent.region].filter(Boolean).join(', ') || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      <div>{agent.email ?? <span className="text-slate-400">—</span>}</div>
                      {agent.phone && <div className="text-xs text-slate-500">{agent.phone}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">{agent.customerCount}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggleActive(agent)} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', agent.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                        {agent.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => startEdit(agent)} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Pencil size={14} /></button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
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

function EditInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
    />
  )
}
