'use client'

import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import {
  Zap, Clock, GitBranch, Mail, MessageSquare, Bell, Phone,
  CircleStop, Plus, Trash2, LogOut, X, Save, Loader2, AlertCircle,
  Minus, Maximize2, Shuffle, CornerDownRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { NumberInput } from '@/components/ui/NumberInput'
import { EVENTS_BY_DOMAIN, getEventProperties } from '@storees/shared'
import type { FlowNode, ExitConfig, FilterConfig, FilterRule, FilterOperator } from '@storees/shared'
import { useVariableSources, useTemplates } from '@/hooks/useTemplates'
import { useWhatsappTemplates } from '@/hooks/useWhatsappTemplates'
import { useProducts, useCollections } from '@/hooks/useProducts'
import { useSegments } from '@/hooks/useSegments'
import { SegmentFilterBuilder } from '@/components/segments/SegmentFilterBuilder'

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
  ab_split:      { icon: Shuffle,        iconColor: 'text-fuchsia-600', iconBg: 'bg-fuchsia-50',  label: 'A/B Split' },
  goto:          { icon: CornerDownRight, iconColor: 'text-indigo-600', iconBg: 'bg-indigo-50',   label: 'Goto' },
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
    case 'trigger': {
      const kind = node.config?.kind ?? 'event'
      if (kind === 'fixed_time') {
        const s = node.config?.fixedTimeSchedule
        return s ? `${s.frequency} at ${s.time}` : 'Fixed time — not configured'
      }
      if (kind === 'flow_exit') {
        return node.config?.sourceFlowId ? `On exit of ${node.config.sourceFlowId.slice(0, 8)}…` : 'Select source flow'
      }
      const label = kind === 'business_event' ? 'Business event' : 'Event'
      if (!node.config?.event) return `Select ${label.toLowerCase()}`
      const ruleCount = (node.config.filters?.rules ?? []).length
      const suffix = ruleCount > 0 ? ` · ${ruleCount} filter${ruleCount > 1 ? 's' : ''}` : ''
      return `${label}: ${fmtEvent(node.config.event)}${suffix}`
    }
    case 'delay': return `${node.config.value} ${node.config.unit}`
    case 'condition':
      if (node.config.check === 'event_occurred') {
        return `Has done: ${node.config.event ? fmtEvent(node.config.event) : '?'}`
      }
      if (node.config.field) {
        const op = node.config.operator ?? 'is'
        const val = node.config.value
        return val !== undefined && val !== ''
          ? `${node.config.field} ${op} ${val}`
          : `Check: ${node.config.field}`
      }
      return 'Pick a field to check'
    case 'action': return node.config.templateId ? `Template: ${node.config.templateId.slice(0, 20)}` : 'No template selected'
    case 'ab_split': {
      const branches = node.config?.branches ?? []
      if (branches.length === 0) return 'No branches configured'
      return branches.map((b) => `${b.label} ${b.weight}%`).join(' · ')
    }
    case 'goto': return node.config?.target ? `→ ${node.config.target}` : 'No target set'
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
  { type: 'condition_email',    label: 'Has read email',        icon: Mail,          color: 'text-green-600',  bg: 'bg-green-50',  cat: 'Conditions' },
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
  // email_read mirrors sms_read / whatsapp_read for cross-channel uniformity.
  // Backend dual-emits email_opened for backward compat with old flow configs.
  condition_email:    { check: 'event_occurred', event: 'email_read' },
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
          <TriggerKindBlock node={node} onUpdate={onUpdate} events={events} />
        )}
        {node.type === 'delay' && (
          <Fld label="Duration">
            <div className="flex gap-2">
              <NumberInput min={1} value={node.config.value} onChange={n => onUpdate({ ...node, config: { ...node.config, value: n ?? 1 } })} className={cn(INPUT, '!w-20')} />
              <select value={node.config.unit} onChange={e => onUpdate({ ...node, config: { ...node.config, unit: e.target.value as 'minutes' | 'hours' | 'days' } })} className={cn(INPUT, 'flex-1')}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </Fld>
        )}
        {node.type === 'condition' && (
          <ConditionBlock node={node} onUpdate={onUpdate} events={events} />
        )}
        {node.type === 'action' && (
          <ActionBlock node={node} onUpdate={onUpdate} />
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

// Gap 11: trigger node now supports 4 kinds. Default kind='event' for
// back-compat with pre-Gap 11 flows.
const TRIGGER_KINDS: Array<{ value: 'event' | 'business_event' | 'fixed_time' | 'flow_exit'; label: string; desc: string }> = [
  { value: 'event',          label: 'User event',     desc: 'Fires when a customer performs an event (cart_created, order_placed, etc.)' },
  { value: 'business_event', label: 'Business event', desc: 'Fires on a backend signal (price_drop, inventory_low, new_product_launch)' },
  { value: 'fixed_time',     label: 'At fixed time',  desc: 'Recurring cron-style entry (daily / weekly / monthly at a specific time)' },
  { value: 'flow_exit',      label: 'On flow exit',   desc: 'Cascades from another flow — runs when that flow completes for a customer' },
]

const BUSINESS_EVENT_PRESETS = [
  'price_drop', 'inventory_low', 'restock', 'new_product_launch', 'margin_threshold_hit',
]

// Curated per-event property hints. Used as a fallback when the project hasn't
// ingested enough events for the variable-sources catalog to surface real
// property keys. Lets a marketer pick "Product Viewed → product_id is X"
// before the first event lands.
const EVENT_PROPERTY_HINTS: Record<string, string[]> = {
  product_viewed:    ['product_id', 'product_name', 'category', 'price', 'brand', 'vendor'],
  add_to_cart:       ['product_id', 'product_name', 'quantity', 'price'],
  cart_created:      ['cart_id', 'item_count', 'cart_value', 'currency'],
  checkout_started:  ['cart_id', 'cart_value', 'currency', 'item_count'],
  order_placed:      ['order_id', 'total', 'currency', 'item_count', 'payment_method'],
  order_fulfilled:   ['order_id', 'total', 'currency'],
  order_cancelled:   ['order_id', 'total', 'currency', 'reason'],
  wishlist_added:    ['product_id', 'product_name', 'price'],
  page_viewed:       ['url', 'page_type', 'referrer'],
  search:            ['query', 'results_count'],
  // BFSI defaults
  loan_application_submitted: ['application_id', 'amount', 'tenure_months', 'product_type'],
  emi_due:                    ['loan_id', 'amount', 'days_overdue'],
  policy_purchased:           ['policy_id', 'premium', 'policy_type'],
  kyc_completed:              ['method', 'status'],
}

// Operators the backend's evaluateEventFilters() honours.
const TRIGGER_FILTER_OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'is',           label: 'is' },
  { value: 'is_not',       label: 'is not' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than',    label: 'less than' },
  { value: 'contains',     label: 'contains' },
  { value: 'is_true',      label: 'is true' },
  { value: 'is_false',     label: 'is false' },
]

function isUnaryOperator(op: FilterOperator | undefined): boolean {
  return op === 'is_true' || op === 'is_false'
}

// Searchable product dropdown — each instance owns its own search query so
// adding multiple product-field rules doesn't collide. Backend caps results
// at 50; with no search, we show the first 50; typing re-queries via ilike
// on title. A current selection that's out of the filtered window stays
// pickable through the "(current)" sentinel option.
function ProductPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useProducts(search)
  const products = data?.data ?? []
  const selectedInList = !!products.find(p => (p.shopifyProductId ?? p.id) === value)
  return (
    <div className="flex-1 space-y-1">
      <input
        type="text"
        value={search}
        placeholder="Search products…"
        onChange={(e) => setSearch(e.target.value)}
        className="w-full text-[11px] h-7 px-1.5 border border-gray-200 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[11px] h-7 px-1.5 border border-gray-200 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
      >
        <option value="">{isLoading ? 'Loading…' : 'Pick a product…'}</option>
        {value && !selectedInList && (
          <option value={value}>{value} (current)</option>
        )}
        {products.map(p => (
          <option key={p.id} value={p.shopifyProductId ?? p.id}>{p.title}</option>
        ))}
      </select>
    </div>
  )
}

function SegmentPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useSegments()
  const segments = data?.data ?? []
  const known = !!segments.find(s => s.id === value)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 min-w-0 text-[11px] h-7 px-1.5 border border-gray-200 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
    >
      <option value="">Pick a segment…</option>
      {value && !known && <option value={value}>{value} (current)</option>}
      {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  )
}

function CollectionPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data, isLoading } = useCollections()
  const collections = data?.data ?? []
  const idOf = (c: { shopifyCollectionId?: string; id: string }) => c.shopifyCollectionId ?? c.id
  const known = !!collections.find(c => idOf(c) === value)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 min-w-0 text-[11px] h-7 px-1.5 border border-gray-200 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
    >
      <option value="">{isLoading ? 'Loading…' : 'Pick a collection…'}</option>
      {value && !known && <option value={value}>{value} (current)</option>}
      {collections.map(c => <option key={c.id} value={idOf(c)}>{c.title}</option>)}
    </select>
  )
}

export function TriggerFiltersBlock({
  event, filters, onChange,
}: {
  event: string
  filters: FilterConfig | undefined
  onChange: (next: FilterConfig | undefined) => void
}) {
  const { data: catalog } = useVariableSources()
  const observedProperties = catalog?.data.events.find(e => e.name === event)?.properties ?? []
  const schemaProperties = getEventProperties(event).map(p => p.name)
  const hintedProperties = EVENT_PROPERTY_HINTS[event] ?? []
  // Merge — observed first (real data), then the declared shared schema (covers
  // events with no observed rows yet, e.g. enters_segment → segment_id), then
  // the local hints. Dedup preserves first-seen order.
  const propertyOptions = Array.from(new Set([...observedProperties, ...schemaProperties, ...hintedProperties]))

  const rules = (filters?.rules ?? []).filter((r): r is FilterRule => !('type' in r))
  const logic = filters?.logic ?? 'AND'

  function patchRules(next: FilterRule[]) {
    if (next.length === 0) {
      onChange(undefined)
    } else {
      onChange({ logic, rules: next })
    }
  }

  function addRule() {
    const defaultField = propertyOptions[0] ?? ''
    patchRules([...rules, { field: defaultField, operator: 'is', value: '' }])
  }

  function updateRule(idx: number, partial: Partial<FilterRule>) {
    const next = rules.map((r, i) => (i === idx ? { ...r, ...partial } : r))
    patchRules(next)
  }

  function removeRule(idx: number) {
    patchRules(rules.filter((_, i) => i !== idx))
  }

  if (!event) return null

  return (
    <div className="space-y-2 pt-2 border-t border-gray-100">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          Event property filters
        </label>
        {rules.length > 1 && (
          <select
            value={logic}
            onChange={(e) => onChange({ logic: e.target.value as 'AND' | 'OR', rules })}
            className="text-[11px] font-medium text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 bg-white"
          >
            <option value="AND">Match all</option>
            <option value="OR">Match any</option>
          </select>
        )}
      </div>

      {rules.length === 0 && (
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Trigger fires on every <code className="bg-gray-100 px-1 rounded text-[10px]">{event}</code>.
          Add a filter to narrow it — e.g. only when <code className="bg-gray-100 px-1 rounded text-[10px]">product_id</code> matches a specific product.
        </p>
      )}

      {rules.map((rule, idx) => {
        // Which rich picker (if any) this field needs — from the declared schema,
        // with a name-based fallback. IDs (segment/product/collection) must be
        // chosen from a list, never hand-typed.
        const fieldDef = getEventProperties(event).find(p => p.name === rule.field)
        const picker = fieldDef?.picker
          ?? (rule.field === 'product_id' || rule.field === 'product_external_id' ? 'product' as const
            : rule.field === 'segment_id' ? 'segment' as const
            : rule.field === 'collection_id' ? 'collection' as const
            : undefined)
        const unary = isUnaryOperator(rule.operator)
        return (
          <div key={idx} className="rounded-md border border-gray-200 bg-gray-50 p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <select
                value={rule.field}
                onChange={(e) => updateRule(idx, { field: e.target.value })}
                className="flex-1 min-w-0 text-[11px] h-7 px-1.5 border border-gray-200 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {propertyOptions.length === 0 && <option value="">No properties yet</option>}
                {propertyOptions.map(prop => (
                  <option key={prop} value={prop}>{prop}</option>
                ))}
                {rule.field && !propertyOptions.includes(rule.field) && (
                  <option value={rule.field}>{rule.field}</option>
                )}
              </select>
              <button
                type="button"
                onClick={() => removeRule(idx)}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                title="Remove condition"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={rule.operator}
                onChange={(e) => updateRule(idx, { operator: e.target.value as FilterOperator })}
                className="text-[11px] h-7 px-1.5 border border-gray-200 rounded bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {TRIGGER_FILTER_OPERATORS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
              {!unary && (
                picker === 'product' ? (
                  <ProductPicker value={String(rule.value ?? '')} onChange={(v) => updateRule(idx, { value: v })} />
                ) : picker === 'segment' ? (
                  <SegmentPicker value={String(rule.value ?? '')} onChange={(v) => updateRule(idx, { value: v })} />
                ) : picker === 'collection' ? (
                  <CollectionPicker value={String(rule.value ?? '')} onChange={(v) => updateRule(idx, { value: v })} />
                ) : (
                  <input
                    type="text"
                    value={String(rule.value ?? '')}
                    onChange={(e) => updateRule(idx, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1 min-w-0 text-[11px] h-7 px-1.5 border border-gray-200 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                )
              )}
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={addRule}
        className="w-full text-[11px] h-7 rounded border border-dashed border-gray-300 text-gray-600 hover:border-purple-300 hover:text-purple-700 hover:bg-purple-50 transition-colors flex items-center justify-center gap-1"
      >
        <Plus className="h-3 w-3" /> Add condition
      </button>
    </div>
  )
}

// Operators usable on customer attribute checks (Condition node, Check
// Attribute). Wider than the trigger filter set because conditions run
// against the customer DB row, not raw event properties.
const ATTRIBUTE_CHECK_OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'is',            label: 'is' },
  { value: 'is_not',        label: 'is not' },
  { value: 'greater_than',  label: 'greater than' },
  { value: 'less_than',     label: 'less than' },
  { value: 'contains',      label: 'contains' },
  { value: 'begins_with',   label: 'begins with' },
  { value: 'ends_with',     label: 'ends with' },
  { value: 'is_true',       label: 'is true' },
  { value: 'is_false',      label: 'is false' },
]

function ConditionBlock({
  node, onUpdate, events,
}: {
  node: FlowNode & { type: 'condition' }
  onUpdate: (n: FlowNode) => void
  events: readonly string[]
}) {
  const { data: catalog } = useVariableSources()
  const customerFields = catalog?.data.customer ?? []
  const customAttrs = catalog?.data.attributes ?? []
  const { data: segmentsData } = useSegments()
  const segments = segmentsData?.data ?? []
  const cfg = node.config

  function patch(next: Partial<typeof cfg>) {
    onUpdate({ ...node, config: { ...cfg, ...next } } as FlowNode)
  }

  const unary = cfg.operator === 'is_true' || cfg.operator === 'is_false'

  return (
    <>
      <Fld label="Check">
        <select
          value={cfg.check}
          onChange={e => patch({
            check: e.target.value as 'event_occurred' | 'attribute_check' | 'attribute_filter' | 'in_segment',
            // Clear cross-mode fields so stale state doesn't leak across kinds
            event: undefined, field: undefined, operator: undefined, value: undefined,
            attributeFilter: undefined, segmentId: undefined,
          })}
          className={INPUT}
        >
          <option value="event_occurred">Has Done Event</option>
          <option value="attribute_filter">Customer Attributes</option>
          <option value="in_segment">In Segment</option>
          <option value="attribute_check">Check Attribute (legacy)</option>
        </select>
      </Fld>

      {cfg.check === 'attribute_filter' ? (
        <Fld label="Customer matches">
          <SegmentFilterBuilder
            filters={cfg.attributeFilter ?? { logic: 'AND', rules: [] }}
            onChange={next => patch({ attributeFilter: next })}
          />
        </Fld>
      ) : cfg.check === 'in_segment' ? (
        <Fld label="Segment">
          <select
            value={cfg.segmentId ?? ''}
            onChange={e => patch({ segmentId: e.target.value })}
            className={INPUT}
          >
            <option value="">Select segment…</option>
            {segments.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Fld>
      ) : cfg.check === 'event_occurred' ? (
        <>
          <Fld label="Event">
            <select
              value={cfg.event ?? ''}
              // Switching events invalidates any property filter the old
              // event had (e.g. product_id rule on a non-product event).
              onChange={e => patch({ event: e.target.value, filters: undefined })}
              className={INPUT}
            >
              <option value="">Select...</option>
              {events.map((ev: string) => <option key={ev} value={ev}>{fmtEvent(ev)}</option>)}
            </select>
          </Fld>
          {/* Same event-property rule editor the Trigger uses. The condition
              evaluator (flowExecutor) applies these against past events of
              the trip's customer, so a condition can ask "has done
              product_viewed where product_id = X". */}
          <TriggerFiltersBlock
            event={cfg.event ?? ''}
            filters={cfg.filters}
            onChange={next => patch({ filters: next })}
          />
          <Fld label="Time window">
            <select
              value={cfg.since ?? 'trip_start'}
              onChange={e => patch({ since: e.target.value as 'trip_start' | 'flow_start' })}
              className={INPUT}
            >
              <option value="trip_start">Since this customer entered the flow</option>
              <option value="flow_start">Ever (entire history)</option>
            </select>
          </Fld>
        </>
      ) : (
        <>
          <Fld label="Field">
            <select
              value={cfg.field ?? ''}
              onChange={e => patch({ field: e.target.value })}
              className={INPUT}
            >
              <option value="">Select field…</option>
              {customerFields.length > 0 && (
                <optgroup label="Customer">
                  {customerFields.map(f => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </optgroup>
              )}
              {customAttrs.length > 0 && (
                <optgroup label="Custom attributes">
                  {customAttrs.map(a => (
                    <option key={a.key} value={`customAttributes.${a.key}`}>{a.key}</option>
                  ))}
                </optgroup>
              )}
              {cfg.field && !customerFields.some(f => f.field === cfg.field) &&
                !customAttrs.some(a => `customAttributes.${a.key}` === cfg.field) && (
                <option value={cfg.field}>{cfg.field}</option>
              )}
            </select>
          </Fld>
          <Fld label="Operator">
            <select
              value={cfg.operator ?? 'is'}
              onChange={e => patch({ operator: e.target.value as FilterOperator })}
              className={INPUT}
            >
              {ATTRIBUTE_CHECK_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Fld>
          {!unary && (
            <Fld label="Value">
              <input
                type="text"
                value={String(cfg.value ?? '')}
                onChange={e => patch({ value: e.target.value })}
                placeholder={cfg.field === 'totalOrders' ? 'e.g. 3' : 'value to compare'}
                className={INPUT}
              />
            </Fld>
          )}
        </>
      )}
    </>
  )
}

const ACTION_CHANNEL_BY_TYPE: Record<string, 'email' | 'sms' | 'push' | 'whatsapp'> = {
  send_email: 'email',
  send_sms: 'sms',
  send_push: 'push',
  send_whatsapp: 'whatsapp',
}

function ActionBlock({
  node, onUpdate,
}: {
  node: FlowNode & { type: 'action' }
  onUpdate: (n: FlowNode) => void
}) {
  const cfg = node.config
  const channel = ACTION_CHANNEL_BY_TYPE[cfg.actionType] ?? 'email'
  const isWhatsapp = channel === 'whatsapp'
  const { data: templatesData, isLoading: generalLoading } = useTemplates()
  const { data: waData, isLoading: waLoading } = useWhatsappTemplates()
  const isLoading = isWhatsapp ? waLoading : generalLoading
  // WhatsApp must use the synced, APPROVED provider templates (the send path
  // resolves templateId against whatsapp_templates WHERE status='APPROVED'); a
  // generic/demo template id falls back to a free-form send → Meta #131047.
  // Other channels keep the generic template source filtered by channel.
  const templates = isWhatsapp
    ? (waData?.data ?? [])
        .filter(t => t.status === 'approved' || t.status === 'APPROVED')
        .map(t => ({ id: t.id, name: `${t.name}${t.language ? ` · ${t.language}` : ''}` }))
    : (templatesData?.data ?? [])
        .filter(t => t.channel === channel)
        .map(t => ({ id: t.id, name: t.name }))

  function patch(next: Partial<typeof cfg>) {
    onUpdate({ ...node, config: { ...cfg, ...next } } as FlowNode)
  }

  return (
    <>
      <Fld label="Channel">
        <select
          value={cfg.actionType}
          onChange={e => patch({
            actionType: e.target.value as 'send_email' | 'send_sms' | 'send_push' | 'send_whatsapp',
            templateId: '', // clear — templates don't cross channels
          })}
          className={INPUT}
        >
          <option value="send_email">Email</option>
          <option value="send_sms">SMS</option>
          <option value="send_push">Push Notification</option>
          <option value="send_whatsapp">WhatsApp</option>
        </select>
      </Fld>
      <Fld label="Template">
        <select
          value={cfg.templateId ?? ''}
          onChange={e => patch({ templateId: e.target.value })}
          className={INPUT}
          disabled={isLoading}
        >
          <option value="">
            {isLoading ? 'Loading…' : templates.length === 0 ? `No ${channel} templates yet` : 'Select template…'}
          </option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {!isLoading && templates.length === 0 && (
          <p className="mt-1 text-[11px] text-amber-700">
            Create a {channel} template under <a href="/templates/create" className="underline font-medium">Templates → New</a>, then come back.
          </p>
        )}
      </Fld>
    </>
  )
}

function TriggerKindBlock({ node, onUpdate, events }: { node: FlowNode & { type: 'trigger' }; onUpdate: (n: FlowNode) => void; events: readonly string[] }) {
  const cfg = node.config ?? { event: '' }
  const kind = (cfg.kind as typeof TRIGGER_KINDS[number]['value'] | undefined) ?? 'event'

  function patch(next: Partial<typeof cfg>) {
    onUpdate({ ...node, config: { ...cfg, ...next } } as FlowNode)
  }

  return (
    <>
      <Fld label="Trigger kind">
        <select
          value={kind}
          onChange={(e) => patch({ kind: e.target.value as typeof TRIGGER_KINDS[number]['value'] })}
          className={INPUT}
        >
          {TRIGGER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-gray-500">
          {TRIGGER_KINDS.find((k) => k.value === kind)?.desc}
        </p>
      </Fld>

      {kind === 'event' && (
        <>
          <Fld label="Event">
            <select
              value={cfg.event ?? ''}
              onChange={(e) => patch({ event: e.target.value, filters: undefined })}
              className={INPUT}
            >
              <option value="">Select event...</option>
              {events.map((ev) => <option key={ev} value={ev}>{fmtEvent(ev)}</option>)}
            </select>
          </Fld>
          <TriggerFiltersBlock
            event={cfg.event ?? ''}
            filters={cfg.filters}
            onChange={(next) => patch({ filters: next })}
          />
        </>
      )}

      {kind === 'business_event' && (
        <>
          <Fld label="Business event">
            <select
              value={cfg.event ?? ''}
              onChange={(e) => patch({ event: e.target.value, filters: undefined })}
              className={INPUT}
            >
              <option value="">Select…</option>
              {BUSINESS_EVENT_PRESETS.map((ev) => <option key={ev} value={ev}>{fmtEvent(ev)}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-gray-500">
              Your backend fires these via POST /v1/events with the event name above. See docs for the standard business-event taxonomy.
            </p>
          </Fld>
          <TriggerFiltersBlock
            event={cfg.event ?? ''}
            filters={cfg.filters}
            onChange={(next) => patch({ filters: next })}
          />
        </>
      )}

      {kind === 'fixed_time' && (
        <FixedTimeFields cfg={cfg} patch={patch} />
      )}

      {kind === 'flow_exit' && (
        <Fld label="Source flow id">
          <input
            type="text"
            value={cfg.sourceFlowId ?? ''}
            onChange={(e) => patch({ sourceFlowId: e.target.value })}
            placeholder="flow uuid that triggers this one on completion"
            className={INPUT}
          />
          <p className="mt-1 text-[11px] text-gray-500">
            When that flow completes for a customer, this flow enrols them. Find the source flow's id in its URL.
          </p>
        </Fld>
      )}
    </>
  )
}

function FixedTimeFields({ cfg, patch }: { cfg: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  const sched = (cfg.fixedTimeSchedule as { frequency?: string; time?: string; dayOfWeek?: number; dayOfMonth?: number } | undefined) ?? { frequency: 'daily', time: '09:00' }
  function patchSched(p: Partial<typeof sched>) {
    patch({ fixedTimeSchedule: { ...sched, ...p } })
  }
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return (
    <>
      <Fld label="Repeat">
        <select
          value={sched.frequency}
          onChange={(e) => patchSched({ frequency: e.target.value as 'daily' | 'weekly' | 'monthly' })}
          className={INPUT}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </Fld>
      <Fld label="Time (UTC)">
        <input
          type="time"
          value={sched.time ?? '09:00'}
          onChange={(e) => patchSched({ time: e.target.value })}
          className={INPUT}
        />
      </Fld>
      {sched.frequency === 'weekly' && (
        <Fld label="Day of week">
          <select
            value={sched.dayOfWeek ?? 1}
            onChange={(e) => patchSched({ dayOfWeek: parseInt(e.target.value) })}
            className={INPUT}
          >
            {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </Fld>
      )}
      {sched.frequency === 'monthly' && (
        <Fld label="Day of month">
          <NumberInput
            min={1}
            max={28}
            value={sched.dayOfMonth}
            onChange={n => patchSched({ dayOfMonth: n ?? 1 })}
            className={INPUT}
          />
          <p className="mt-1 text-[11px] text-gray-500">1–28 (avoids month-end edge cases)</p>
        </Fld>
      )}
      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
        Fixed-time flows enrol every customer matching the audience filter when the schedule fires. Make sure an audience filter is set on this flow.
      </p>
    </>
  )
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
