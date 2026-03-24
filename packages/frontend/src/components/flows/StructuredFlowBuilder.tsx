'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Zap, Clock, GitBranch, Mail, MessageSquare, Bell, Phone,
  CircleStop, Plus, Trash2, LogOut, X, Save, Loader2, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EVENTS_BY_DOMAIN } from '@storees/shared'
import type { FlowNode, ExitConfig } from '@storees/shared'

type Props = {
  flowNodes: FlowNode[]
  exitConfig?: ExitConfig | null
  onSave: (nodes: FlowNode[], exitConfig: ExitConfig | null) => void
  saving?: boolean
  domainType?: string
}

// ─── Tree ───────────────────────────────────────────────

type TreeNode = {
  node: FlowNode
  yesBranch?: TreeNode[]
  noBranch?: TreeNode[]
}

function buildTree(nodes: FlowNode[]): TreeNode[] {
  if (nodes.length === 0) return []
  const nodeMap = new Map<string, FlowNode>()
  nodes.forEach(n => nodeMap.set(n.id, n))

  const branchTargets = new Set<string>()
  nodes.forEach(n => {
    if (n.type === 'condition') {
      if (n.config.branches?.yes) branchTargets.add(n.config.branches.yes)
      if (n.config.branches?.no) branchTargets.add(n.config.branches.no)
    }
  })

  function buildChain(startId: string, visited: Set<string>): TreeNode[] {
    const chain: TreeNode[] = []
    let currentId: string | null = startId
    while (currentId && !visited.has(currentId)) {
      const fn = nodeMap.get(currentId)
      if (!fn) break
      visited.add(currentId)
      const tn: TreeNode = { node: fn }
      if (fn.type === 'condition') {
        const yesId = fn.config.branches?.yes
        const noId = fn.config.branches?.no
        if (yesId && nodeMap.has(yesId)) tn.yesBranch = buildChain(yesId, new Set(visited))
        if (noId && nodeMap.has(noId)) tn.noBranch = buildChain(noId, new Set(visited))
        chain.push(tn)
        break
      }
      chain.push(tn)
      const idx = nodes.indexOf(fn)
      const next = idx >= 0 && idx < nodes.length - 1 ? nodes[idx + 1] : null
      currentId = next && !branchTargets.has(next.id) ? next.id : null
    }
    return chain
  }

  return buildChain(nodes[0].id, new Set())
}

// ─── Helpers ────────────────────────────────────────────

let idCounter = 0
function nextId(type: string) { return `${type}_${Date.now()}_${++idCounter}` }

function fmtEvent(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const NODE_META: Record<string, { icon: typeof Zap; iconColor: string; iconBg: string; label: string }> = {
  trigger:       { icon: Zap,            iconColor: 'text-purple-600',  iconBg: 'bg-purple-50',   label: 'Trigger' },
  delay:         { icon: Clock,          iconColor: 'text-blue-600',    iconBg: 'bg-blue-50',     label: 'Wait / Delay' },
  condition:     { icon: GitBranch,      iconColor: 'text-amber-600',   iconBg: 'bg-amber-50',    label: 'Condition' },
  send_email:    { icon: Mail,           iconColor: 'text-green-600',   iconBg: 'bg-green-50',    label: 'Email' },
  send_sms:      { icon: MessageSquare,  iconColor: 'text-teal-600',    iconBg: 'bg-teal-50',     label: 'SMS' },
  send_push:     { icon: Bell,           iconColor: 'text-violet-600',  iconBg: 'bg-violet-50',   label: 'Push Notification' },
  send_whatsapp: { icon: Phone,          iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50',  label: 'WhatsApp' },
  end:           { icon: CircleStop,     iconColor: 'text-gray-500',    iconBg: 'bg-gray-50',     label: 'End' },
}

function getMeta(node: FlowNode) {
  if (node.type === 'action') return NODE_META[node.config.actionType] ?? NODE_META.send_email
  return NODE_META[node.type] ?? NODE_META.end
}

function getSubtitle(node: FlowNode): string {
  switch (node.type) {
    case 'trigger': return node.config?.event ? fmtEvent(node.config.event) : 'Select trigger event'
    case 'delay': return `${node.config.value} ${node.config.unit}`
    case 'condition':
      return node.config.check === 'event_occurred'
        ? `Has done: ${node.config.event ? fmtEvent(node.config.event) : '?'}`
        : `Check: ${node.config.field ?? '?'}`
    case 'action': return node.config.templateId ? `Template: ${node.config.templateId.slice(0, 20)}` : 'No template selected'
    case 'end': return node.label ?? 'End'
    default: return ''
  }
}

// ─── Connector Line ─────────────────────────────────────

function Connector({ color = 'bg-gray-300', h = 'h-5' }: { color?: string; h?: string }) {
  return <div className={cn('w-px', h, color)} />
}

// ─── Add Node Popup ─────────────────────────────────────

const ADD_OPTIONS = [
  { type: 'delay',         label: 'Wait / Delay',      icon: Clock,         color: 'text-blue-500',    cat: 'Controls' },
  { type: 'end',           label: 'Exit',              icon: CircleStop,    color: 'text-red-400',     cat: 'Controls' },
  { type: 'condition',     label: 'Conditional Split',  icon: GitBranch,     color: 'text-amber-500',   cat: 'Conditions' },
  { type: 'send_email',    label: 'Email',             icon: Mail,          color: 'text-green-500',   cat: 'Actions' },
  { type: 'send_sms',      label: 'SMS',               icon: MessageSquare, color: 'text-teal-500',    cat: 'Actions' },
  { type: 'send_push',     label: 'Push Notification', icon: Bell,          color: 'text-violet-500',  cat: 'Actions' },
  { type: 'send_whatsapp', label: 'WhatsApp',          icon: Phone,         color: 'text-emerald-500', cat: 'Actions' },
]

const CATS = ['Controls', 'Conditions', 'Actions'] as const
const CAT_DOT: Record<string, string> = { Controls: 'bg-violet-400', Conditions: 'bg-amber-400', Actions: 'bg-green-400' }

function AddNodeBtn({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const grouped = useMemo(() => {
    const m = new Map<string, typeof ADD_OPTIONS>()
    ADD_OPTIONS.forEach(o => m.set(o.cat, [...(m.get(o.cat) ?? []), o]))
    return m
  }, [])

  return (
    <div ref={ref} className="relative flex flex-col items-center">
      <Connector />
      <button
        onClick={() => setOpen(!open)}
        className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md hover:bg-indigo-700 hover:scale-110 transition-all z-10"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
      <Connector />

      {open && (
        <div
          className="absolute z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-4"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 420,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Add Node</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-gray-100">
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {CATS.map(cat => (
              <div key={cat}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={cn('w-1.5 h-1.5 rounded-full', CAT_DOT[cat])} />
                  <span className="text-[11px] font-bold text-gray-700">{cat}</span>
                </div>
                {(grouped.get(cat) ?? []).map(opt => {
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.type}
                      onClick={() => { onAdd(opt.type); setOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Icon className={cn('h-4 w-4 flex-shrink-0', opt.color)} />
                      <span className="font-medium">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Node Card ──────────────────────────────────────────

function NodeCard({
  node, isSelected, onSelect, onDelete, canDelete, errors,
}: {
  node: FlowNode; isSelected: boolean; onSelect: () => void; onDelete: () => void; canDelete: boolean; errors: string[]
}) {
  const meta = getMeta(node)
  const Icon = meta.icon
  const hasError = errors.length > 0

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative bg-white border rounded-xl px-4 py-3 cursor-pointer transition-all',
        'w-[260px] shadow-sm hover:shadow-md',
        hasError ? 'border-red-300 ring-2 ring-red-100'
          : isSelected ? 'border-indigo-400 ring-2 ring-indigo-100'
          : 'border-gray-200 hover:border-gray-300',
      )}
    >
      {hasError && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center">
          <AlertCircle className="h-3 w-3" />
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', meta.iconBg)}>
          <Icon className={cn('h-4 w-4', meta.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', meta.iconColor)}>{meta.label}</p>
          <p className="text-[11px] text-gray-400 truncate">{getSubtitle(node)}</p>
        </div>
        {canDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Branch Renderer ────────────────────────────────────

type BranchProps = {
  chain: TreeNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onAddNode: (afterId: string, type: string, branch?: 'yes' | 'no') => void
  errors: Map<string, string[]>
}

function BranchRenderer({ chain, selectedId, onSelect, onDelete, onAddNode, errors }: BranchProps) {
  return (
    <div className="flex flex-col items-center">
      {chain.map((tn, i) => (
        <div key={tn.node.id} className="flex flex-col items-center">
          {i > 0 && <AddNodeBtn onAdd={(t) => onAddNode(chain[i - 1].node.id, t)} />}

          <NodeCard
            node={tn.node}
            isSelected={selectedId === tn.node.id}
            onSelect={() => onSelect(tn.node.id)}
            onDelete={() => onDelete(tn.node.id)}
            canDelete={tn.node.type !== 'trigger'}
            errors={errors.get(tn.node.id) ?? []}
          />

          {tn.node.type === 'condition' && (
            <ConditionSplit tn={tn} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onAddNode={onAddNode} errors={errors} />
          )}
        </div>
      ))}
    </div>
  )
}

function ConditionSplit({ tn, selectedId, onSelect, onDelete, onAddNode, errors }: { tn: TreeNode } & Omit<BranchProps, 'chain'>) {
  const condId = tn.node.id
  const yes = tn.yesBranch ?? []
  const no = tn.noBranch ?? []

  return (
    <div className="flex flex-col items-center">
      <Connector h="h-4" />

      {/* T-connector */}
      <div className="relative" style={{ width: 540, height: 20 }}>
        {/* Horizontal bar */}
        <div className="absolute top-0 left-[135px] right-[135px] h-px bg-gray-300" />
        {/* Left (Yes) vertical tick — green */}
        <div className="absolute top-0 left-[135px] w-px h-full bg-green-400" />
        {/* Right (No) vertical tick — red */}
        <div className="absolute top-0 right-[135px] w-px h-full bg-red-400" />
      </div>

      {/* Two columns */}
      <div className="flex" style={{ width: 540 }}>
        {/* Yes */}
        <div className="flex-1 flex flex-col items-center">
          <span className="text-[11px] font-bold text-green-600 bg-green-50 border border-green-200 px-2.5 py-px rounded-full">Yes</span>
          <Connector color="bg-green-400" h="h-3" />
          {yes.length > 0 ? (
            <>
              <BranchRenderer chain={yes} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onAddNode={onAddNode} errors={errors} />
              <AddNodeBtn onAdd={(t) => onAddNode(yes[yes.length - 1].node.id, t, 'yes')} />
            </>
          ) : (
            <AddNodeBtn onAdd={(t) => onAddNode(condId, t, 'yes')} />
          )}
        </div>

        {/* No */}
        <div className="flex-1 flex flex-col items-center">
          <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-px rounded-full">No</span>
          <Connector color="bg-red-400" h="h-3" />
          {no.length > 0 ? (
            <>
              <BranchRenderer chain={no} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onAddNode={onAddNode} errors={errors} />
              <AddNodeBtn onAdd={(t) => onAddNode(no[no.length - 1].node.id, t, 'no')} />
            </>
          ) : (
            <AddNodeBtn onAdd={(t) => onAddNode(condId, t, 'no')} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Config Drawer ──────────────────────────────────────

const INPUT = 'w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white'

function ConfigDrawer({
  node, onUpdate, onClose, domainType = 'ecommerce',
}: {
  node: FlowNode; onUpdate: (n: FlowNode) => void; onClose: () => void; domainType: string
}) {
  const events = EVENTS_BY_DOMAIN[domainType as keyof typeof EVENTS_BY_DOMAIN] ?? EVENTS_BY_DOMAIN.ecommerce
  const meta = getMeta(node)
  const Icon = meta.icon

  return (
    <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', meta.iconBg)}>
          <Icon className={cn('h-3.5 w-3.5', meta.iconColor)} />
        </div>
        <span className="text-[13px] font-semibold text-gray-900 flex-1">{meta.label}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="h-3.5 w-3.5 text-gray-400" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {node.type === 'trigger' && (
          <Fld label="Event">
            <select value={node.config?.event ?? ''} onChange={e => onUpdate({ ...node, config: { event: e.target.value, filters: { logic: 'AND', rules: [] } } } as FlowNode)} className={INPUT}>
              <option value="">Select event...</option>
              {events.map((ev: string) => <option key={ev} value={ev}>{fmtEvent(ev)}</option>)}
            </select>
          </Fld>
        )}
        {node.type === 'delay' && (
          <Fld label="Duration">
            <div className="flex gap-2">
              <input type="number" min={1} value={node.config.value} onChange={e => onUpdate({ ...node, config: { ...node.config, value: parseInt(e.target.value) || 1 } })} className={cn(INPUT, '!w-20')} />
              <select value={node.config.unit} onChange={e => onUpdate({ ...node, config: { ...node.config, unit: e.target.value as 'minutes' | 'hours' | 'days' } })} className={cn(INPUT, 'flex-1')}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </Fld>
        )}
        {node.type === 'condition' && (
          <>
            <Fld label="Check">
              <select value={node.config.check} onChange={e => onUpdate({ ...node, config: { ...node.config, check: e.target.value as 'event_occurred' | 'attribute_check' } })} className={INPUT}>
                <option value="event_occurred">Has Done Event</option>
                <option value="attribute_check">Check Attribute</option>
              </select>
            </Fld>
            {node.config.check === 'event_occurred' ? (
              <Fld label="Event">
                <select value={node.config.event ?? ''} onChange={e => onUpdate({ ...node, config: { ...node.config, event: e.target.value } })} className={INPUT}>
                  <option value="">Select...</option>
                  {events.map((ev: string) => <option key={ev} value={ev}>{fmtEvent(ev)}</option>)}
                </select>
              </Fld>
            ) : (
              <Fld label="Field">
                <input type="text" value={node.config.field ?? ''} placeholder="e.g. totalOrders" onChange={e => onUpdate({ ...node, config: { ...node.config, field: e.target.value } })} className={INPUT} />
              </Fld>
            )}
          </>
        )}
        {node.type === 'action' && (
          <>
            <Fld label="Channel">
              <select value={node.config.actionType} onChange={e => onUpdate({ ...node, config: { ...node.config, actionType: e.target.value as 'send_email' | 'send_sms' | 'send_push' | 'send_whatsapp' } })} className={INPUT}>
                <option value="send_email">Email</option>
                <option value="send_sms">SMS</option>
                <option value="send_push">Push Notification</option>
                <option value="send_whatsapp">WhatsApp</option>
              </select>
            </Fld>
            <Fld label="Template">
              <input type="text" value={node.config.templateId} placeholder="template_id" onChange={e => onUpdate({ ...node, config: { ...node.config, templateId: e.target.value } })} className={INPUT} />
            </Fld>
          </>
        )}
        {node.type === 'end' && (
          <Fld label="Label">
            <input type="text" value={node.label ?? 'End'} onChange={e => onUpdate({ ...node, label: e.target.value })} className={INPUT} />
          </Fld>
        )}
      </div>
    </div>
  )
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>{children}</div>
}

// ─── Validation ─────────────────────────────────────────

function validateNodes(nodes: FlowNode[]): Map<string, string[]> {
  const errs = new Map<string, string[]>()
  const add = (id: string, msg: string) => errs.set(id, [...(errs.get(id) ?? []), msg])
  if (nodes.length === 0) return errs
  if (nodes[0]?.type !== 'trigger') add(nodes[0].id, 'Flow must start with a trigger')
  for (const n of nodes) {
    if (n.type === 'trigger' && !n.config?.event) add(n.id, 'Select a trigger event')
    if (n.type === 'action' && !n.config.templateId) add(n.id, 'Select a template')
    if (n.type === 'condition' && n.config.check === 'event_occurred' && !n.config.event) add(n.id, 'Select an event to check')
  }
  return errs
}

// ─── Main ───────────────────────────────────────────────

export function StructuredFlowBuilder({ flowNodes, exitConfig: initialExitConfig, onSave, saving, domainType = 'ecommerce' }: Props) {
  const [nodes, setNodes] = useState<FlowNode[]>(flowNodes)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exitEvent, setExitEvent] = useState(initialExitConfig?.event ?? '')

  const errors = validateNodes(nodes)
  const errorCount = Array.from(errors.values()).reduce((sum, a) => sum + a.length, 0)
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const selectedNode = nodes.find(n => n.id === selectedId) ?? null

  const handleAddNode = useCallback((afterId: string, optionType: string, branch?: 'yes' | 'no') => {
    if (optionType === 'condition') {
      const condNode: FlowNode = {
        id: nextId('condition'), type: 'condition',
        config: { check: 'event_occurred', since: 'trip_start', branches: { yes: '', no: '' } },
      }
      setNodes(prev => {
        const idx = prev.findIndex(n => n.id === afterId)
        if (idx < 0) return [...prev, condNode]
        const copy = [...prev]
        copy.splice(idx + 1, 0, condNode)
        return copy
      })
      setSelectedId(condNode.id)
      return
    }

    const newNode: FlowNode = optionType === 'delay'
      ? { id: nextId('delay'), type: 'delay', config: { value: 30, unit: 'minutes' } }
      : optionType === 'end'
        ? { id: nextId('end'), type: 'end', label: 'End' }
        : { id: nextId('action'), type: 'action', config: { actionType: optionType as 'send_email', templateId: '' } }

    if (branch) {
      setNodes(prev => {
        const condIdx = prev.findIndex(n => n.id === afterId && n.type === 'condition')
        if (condIdx >= 0) {
          const cond = prev[condIdx]
          if (cond.type !== 'condition') return prev
          const updated: FlowNode = {
            ...cond,
            config: { ...cond.config, branches: { ...cond.config.branches, [branch]: newNode.id } },
          }
          const copy = [...prev]
          copy[condIdx] = updated
          copy.splice(condIdx + 1, 0, newNode)
          return copy
        }
        const idx = prev.findIndex(n => n.id === afterId)
        if (idx < 0) return [...prev, newNode]
        const copy = [...prev]
        copy.splice(idx + 1, 0, newNode)
        return copy
      })
    } else {
      setNodes(prev => {
        const idx = prev.findIndex(n => n.id === afterId)
        if (idx < 0) return [...prev, newNode]
        const copy = [...prev]
        copy.splice(idx + 1, 0, newNode)
        return copy
      })
    }
    setSelectedId(newNode.id)
  }, [])

  const handleDelete = useCallback((id: string) => {
    setNodes(prev => {
      const copy = prev.map(n => {
        if (n.type === 'condition') {
          const b = { ...n.config.branches }
          if (b.yes === id) b.yes = ''
          if (b.no === id) b.no = ''
          return { ...n, config: { ...n.config, branches: b } }
        }
        return n
      })
      return copy.filter(n => n.id !== id)
    })
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  const handleUpdate = useCallback((u: FlowNode) => {
    setNodes(prev => prev.map(n => n.id === u.id ? u : n))
  }, [])

  const handleSave = () => {
    onSave(nodes, exitEvent ? { event: exitEvent, scope: 'any' } : null)
  }

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div className="flex-1 relative overflow-auto bg-[#f8f9fc]">
        <div className="flex flex-col items-center py-10 px-6 min-w-fit min-h-full">
          <BranchRenderer
            chain={tree}
            selectedId={selectedId}
            onSelect={id => setSelectedId(selectedId === id ? null : id)}
            onDelete={handleDelete}
            onAddNode={handleAddNode}
            errors={errors}
          />
          {tree.length > 0 && tree[tree.length - 1].node.type !== 'condition' && (
            <AddNodeBtn onAdd={(t) => handleAddNode(nodes[nodes.length - 1].id, t)} />
          )}
        </div>

        {/* Bottom bar — pinned */}
        <div className="sticky bottom-0 left-0 right-0 p-3">
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-2.5 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <LogOut className="h-3.5 w-3.5 text-gray-400 rotate-180" />
                <span className="text-[11px] font-semibold text-gray-500">Exit on:</span>
                <select
                  value={exitEvent}
                  onChange={e => setExitEvent(e.target.value)}
                  className="text-[11px] font-medium border border-gray-200 rounded-md px-2 py-1 text-gray-700 bg-gray-50"
                >
                  <option value="">No exit event</option>
                  {(EVENTS_BY_DOMAIN[domainType as keyof typeof EVENTS_BY_DOMAIN] ?? EVENTS_BY_DOMAIN.ecommerce).map((ev: string) => (
                    <option key={ev} value={ev}>{fmtEvent(ev)}</option>
                  ))}
                </select>
              </div>
              {errorCount > 0 && (
                <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">
                  Errors ({errorCount})
                </span>
              )}
              <span className="text-[11px] text-gray-400">{nodes.length} nodes</span>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Saving...' : 'Save Flow'}
            </button>
          </div>
        </div>
      </div>

      {/* Config drawer */}
      {selectedNode && (
        <ConfigDrawer node={selectedNode} onUpdate={handleUpdate} onClose={() => setSelectedId(null)} domainType={domainType} />
      )}
    </div>
  )
}
