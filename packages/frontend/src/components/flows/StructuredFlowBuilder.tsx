'use client'

import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import {
  Zap, Clock, GitBranch, Mail, MessageSquare, Bell, Phone,
  CircleStop, Plus, Trash2, LogOut, X, Save, Loader2, AlertCircle,
  Minus, Maximize2,
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
// Column order matches MoEngage: Actions → Conditions → Controls

type NodeOption = { type: string; label: string; icon: typeof Zap; color: string; bg: string; cat: string }

const ADD_OPTIONS: NodeOption[] = [
  // Actions
  { type: 'send_email',    label: 'Email',              icon: Mail,          color: 'text-green-600',   bg: 'bg-green-50',   cat: 'Actions' },
  { type: 'send_sms',      label: 'SMS',                icon: MessageSquare, color: 'text-teal-600',    bg: 'bg-teal-50',    cat: 'Actions' },
  { type: 'send_push',     label: 'Push Notification',  icon: Bell,          color: 'text-violet-600',  bg: 'bg-violet-50',  cat: 'Actions' },
  { type: 'send_whatsapp', label: 'WhatsApp',           icon: Phone,         color: 'text-emerald-600', bg: 'bg-emerald-50', cat: 'Actions' },
  // Conditions
  { type: 'condition',          label: 'Conditional Split',     icon: GitBranch,     color: 'text-amber-600',  bg: 'bg-amber-50',  cat: 'Conditions' },
  { type: 'condition_email',    label: 'Has opened email',      icon: Mail,          color: 'text-green-600',  bg: 'bg-green-50',  cat: 'Conditions' },
  { type: 'condition_click',    label: 'Has clicked email',     icon: Mail,          color: 'text-green-600',  bg: 'bg-green-50',  cat: 'Conditions' },
  { type: 'condition_sms_read', label: 'Has read SMS',          icon: MessageSquare, color: 'text-teal-600',   bg: 'bg-teal-50',   cat: 'Conditions' },
  { type: 'condition_wa_read',  label: 'Has read WhatsApp',     icon: Phone,         color: 'text-emerald-600',bg: 'bg-emerald-50',cat: 'Conditions' },
  { type: 'condition_push_tap', label: 'Push tapped',           icon: Bell,          color: 'text-violet-600', bg: 'bg-violet-50', cat: 'Conditions' },
  { type: 'condition_attr',     label: 'Check user attribute',  icon: GitBranch,     color: 'text-amber-600',  bg: 'bg-amber-50',  cat: 'Conditions' },
  // Controls
  { type: 'delay',         label: 'Wait for / till',    icon: Clock,         color: 'text-blue-600',    bg: 'bg-blue-50',    cat: 'Controls' },
  { type: 'end',           label: 'Exit',               icon: CircleStop,    color: 'text-red-500',     bg: 'bg-red-50',     cat: 'Controls' },
]

const CATS = ['Actions', 'Conditions', 'Controls'] as const
const CAT_ICON: Record<string, string> = { Actions: 'bg-green-400', Conditions: 'bg-amber-400', Controls: 'bg-violet-400' }

// Pre-fills the condition node's config when a channel-specific preset is picked from the menu
type CondPreset = { check: 'event_occurred' | 'attribute_check'; event?: string }
const CONDITION_PRESETS: Record<string, CondPreset> = {
  condition_email:    { check: 'event_occurred', event: 'email_opened' },
  condition_click:    { check: 'event_occurred', event: 'email_clicked' },
  condition_sms_read: { check: 'event_occurred', event: 'sms_read' },
  condition_wa_read:  { check: 'event_occurred', event: 'whatsapp_read' },
  condition_push_tap: { check: 'event_occurred', event: 'push_read' },
  condition_attr:     { check: 'attribute_check' },
}

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
    const m = new Map<string, NodeOption[]>()
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
          className="absolute z-50 bg-white rounded-xl py-4 px-2"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 680,
            boxShadow: '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          {/* Close — top right */}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 w-6 h-6 rounded-md hover:bg-gray-100 flex items-center justify-center"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>

          {/* 3 columns */}
          <div className="flex">
            {CATS.map(cat => {
              const items = grouped.get(cat) ?? []
              return (
                <div key={cat} className="flex-1 px-4">
                  {/* Category header */}
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className={cn('w-3.5 h-3.5 rounded-sm', CAT_ICON[cat])} />
                    <span className="text-sm font-bold text-gray-900">{cat}</span>
                  </div>
                  {/* Scrollable options */}
                  <div className="max-h-[300px] overflow-y-auto">
                    {items.map(opt => {
                      const Icon = opt.icon
                      return (
                        <button
                          key={opt.type}
                          onClick={() => { onAdd(opt.type); setOpen(false) }}
                          className="w-full flex items-center gap-3 py-3 px-1 text-sm text-gray-700 hover:text-gray-900 transition-colors whitespace-nowrap"
                        >
                          <Icon className={cn('h-5 w-5 flex-shrink-0', opt.color)} />
                          <span>{opt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
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
      data-no-pan
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
          {i > 0 && chain[i - 1].node.type !== 'end' && <AddNodeBtn onAdd={(t) => onAddNode(chain[i - 1].node.id, t)} />}

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

  // Columns size to their own content (asymmetric is fine). Tick positions are measured so the bar always lands on actual column centers.
  const yesRef = useRef<HTMLDivElement>(null)
  const noRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [ticks, setTicks] = useState({ leftPct: 25, rightPct: 25 })
  useLayoutEffect(() => {
    const measure = () => {
      const w = wrapperRef.current
      const y = yesRef.current
      const n = noRef.current
      if (!w || !y || !n) return
      // getBoundingClientRect, not offsetLeft — wrapper isn't a positioned ancestor, so offsetLeft would resolve against the wrong frame
      const wRect = w.getBoundingClientRect()
      const yRect = y.getBoundingClientRect()
      const nRect = n.getBoundingClientRect()
      if (wRect.width === 0) return
      const yesCenterX = yRect.left + yRect.width / 2 - wRect.left
      const noCenterX = nRect.left + nRect.width / 2 - wRect.left
      setTicks({
        leftPct: (yesCenterX / wRect.width) * 100,
        rightPct: ((wRect.width - noCenterX) / wRect.width) * 100,
      })
    }
    measure()
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    if (yesRef.current) ro.observe(yesRef.current)
    if (noRef.current) ro.observe(noRef.current)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [tn])

  return (
    <div className="flex flex-col items-center">
      <Connector h="h-4" />

      <div ref={wrapperRef} className="flex flex-col">
        {/* T-connector — tick percentages computed to land on actual column centers */}
        <div className="relative h-5">
          <div className="absolute top-0 h-px bg-gray-300" style={{ left: `${ticks.leftPct}%`, right: `${ticks.rightPct}%` }} />
          <div className="absolute top-0 w-px h-full bg-green-400" style={{ left: `${ticks.leftPct}%` }} />
          <div className="absolute top-0 w-px h-full bg-red-400" style={{ right: `${ticks.rightPct}%` }} />
        </div>

        {/* Columns size to content; flex (not grid) so neither side balloons to match the other */}
        <div className="flex items-start" style={{ minWidth: 540 }}>
          {/* Yes */}
          <div ref={yesRef} className="flex flex-col items-center px-3" style={{ minWidth: 270 }}>
            <span className="text-[11px] font-bold text-green-600 bg-green-50 border border-green-200 px-2.5 py-px rounded-full">Yes</span>
            <Connector color="bg-green-400" h="h-3" />
            {yes.length > 0 ? (
              <>
                <BranchRenderer chain={yes} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onAddNode={onAddNode} errors={errors} />
                {yes[yes.length - 1].node.type !== 'end' && yes[yes.length - 1].node.type !== 'condition' && <AddNodeBtn onAdd={(t) => onAddNode(yes[yes.length - 1].node.id, t, 'yes')} />}
              </>
            ) : (
              <AddNodeBtn onAdd={(t) => onAddNode(condId, t, 'yes')} />
            )}
          </div>

          {/* No */}
          <div ref={noRef} className="flex flex-col items-center px-3" style={{ minWidth: 270 }}>
            <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-px rounded-full">No</span>
            <Connector color="bg-red-400" h="h-3" />
            {no.length > 0 ? (
              <>
                <BranchRenderer chain={no} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onAddNode={onAddNode} errors={errors} />
                {no[no.length - 1].node.type !== 'end' && no[no.length - 1].node.type !== 'condition' && <AddNodeBtn onAdd={(t) => onAddNode(no[no.length - 1].node.id, t, 'no')} />}
              </>
            ) : (
              <AddNodeBtn onAdd={(t) => onAddNode(condId, t, 'no')} />
            )}
          </div>
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
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  const ZOOM_MIN = 0.4
  const ZOOM_MAX = 1.5
  const ZOOM_STEP = 0.1
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))

  const canvasRef = useRef<HTMLDivElement>(null)

  // Zoom toward a focal point (cursor pos or viewport center) — keeps that point under the cursor/center after the scale change
  const applyZoom = useCallback((nextZoom: number, focalClientX?: number, focalClientY?: number) => {
    const target = clampZoom(nextZoom)
    const oldZoom = zoomRef.current
    if (target === oldZoom) return
    const el = canvasRef.current
    if (!el) { setZoom(target); return }
    const rect = el.getBoundingClientRect()
    const fx = focalClientX != null ? focalClientX - rect.left : el.clientWidth / 2
    const fy = focalClientY != null ? focalClientY - rect.top : el.clientHeight / 2
    const ratio = target / oldZoom
    const newScrollLeft = (el.scrollLeft + fx) * ratio - fx
    const newScrollTop = (el.scrollTop + fy) * ratio - fy
    setZoom(target)
    requestAnimationFrame(() => {
      const node = canvasRef.current
      if (!node) return
      node.scrollLeft = newScrollLeft
      node.scrollTop = newScrollTop
    })
  }, [])

  const zoomIn = () => applyZoom(zoomRef.current + ZOOM_STEP)
  const zoomOut = () => applyZoom(zoomRef.current - ZOOM_STEP)
  const zoomReset = () => applyZoom(1)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
      applyZoom(zoomRef.current + delta, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  // Click-and-drag panning — mousedown on empty canvas starts a pan candidate; 3px threshold preserves "click to deselect"
  const panRef = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('button, a, input, select, textarea, [data-no-pan]')) return
    const el = canvasRef.current
    if (!el) return
    panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false }
  }
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const p = panRef.current
      const el = canvasRef.current
      if (!p || !el) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      if (!p.moved && Math.hypot(dx, dy) < 3) return
      if (!p.moved) {
        p.moved = true
        setIsPanning(true)
      }
      el.scrollLeft = p.sl - dx
      el.scrollTop = p.st - dy
    }
    const onUp = () => {
      panRef.current = null
      setIsPanning(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const errors = validateNodes(nodes)
  const errorCount = Array.from(errors.values()).reduce((sum, a) => sum + a.length, 0)
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const selectedNode = nodes.find(n => n.id === selectedId) ?? null

  const handleAddNode = useCallback((afterId: string, optionType: string, branch?: 'yes' | 'no') => {
    const baseType = optionType.startsWith('condition') ? 'condition' : optionType
    const preset = CONDITION_PRESETS[optionType]
    const newNode: FlowNode = baseType === 'condition'
      ? { id: nextId('condition'), type: 'condition', config: { check: preset?.check ?? 'event_occurred', event: preset?.event, since: 'trip_start', branches: { yes: '', no: '' } } }
      : baseType === 'delay'
        ? { id: nextId('delay'), type: 'delay', config: { value: 30, unit: 'minutes' } }
        : baseType === 'end'
          ? { id: nextId('end'), type: 'end', label: 'End' }
          : { id: nextId('action'), type: 'action', config: { actionType: baseType as 'send_email', templateId: '' } }

    setNodes(prev => {
      if (branch) {
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
      }
      const idx = prev.findIndex(n => n.id === afterId)
      if (idx < 0) return [...prev, newNode]
      const copy = [...prev]
      copy.splice(idx + 1, 0, newNode)
      return copy
    })
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
    <div className="flex h-full bg-gray-50">
      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Scrollable canvas — cocooned in a bordered section */}
        <div className="relative flex-1 m-3 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div
            ref={canvasRef}
            onMouseDown={onCanvasMouseDown}
            className={cn(
              'h-full w-full overflow-auto overscroll-contain select-none',
              isPanning ? 'cursor-grabbing' : 'cursor-grab',
            )}
          >
            <div style={{ zoom }} className="flex flex-col items-center py-10 px-6 min-w-fit min-h-full">
              <BranchRenderer
                chain={tree}
                selectedId={selectedId}
                onSelect={id => setSelectedId(selectedId === id ? null : id)}
                onDelete={handleDelete}
                onAddNode={handleAddNode}
                errors={errors}
              />
              {tree.length > 0 && tree[tree.length - 1].node.type !== 'condition' && tree[tree.length - 1].node.type !== 'end' && (
                <AddNodeBtn onAdd={(t) => handleAddNode(nodes[nodes.length - 1].id, t)} />
              )}
            </div>
          </div>

          {/* Zoom toolbar — floating bottom-right */}
          <div data-no-pan className="absolute bottom-4 right-4 flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-1">
            <button
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom out"
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={zoomReset}
              aria-label="Reset zoom"
              className="px-2 h-7 text-[11px] font-semibold text-gray-700 tabular-nums rounded-md hover:bg-gray-100 transition-colors min-w-[44px]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom in"
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button
              onClick={zoomReset}
              aria-label="Fit to 100%"
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Bottom bar — outside the canvas, pinned to bottom */}
        <div className="flex-shrink-0 mx-3 mb-3">
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-2.5 shadow-sm">
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
