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

// ─── Tree structure for rendering ───────────────────────

type TreeNode = {
  node: FlowNode
  yesBranch?: TreeNode[]
  noBranch?: TreeNode[]
}

function buildTree(nodes: FlowNode[]): TreeNode[] {
  if (nodes.length === 0) return []

  const nodeMap = new Map<string, FlowNode>()
  nodes.forEach(n => nodeMap.set(n.id, n))

  // Track which nodes are branch targets
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

      const treeNode: TreeNode = { node: fn }

      if (fn.type === 'condition') {
        const yesId = fn.config.branches?.yes
        const noId = fn.config.branches?.no
        if (yesId && nodeMap.has(yesId)) {
          treeNode.yesBranch = buildChain(yesId, new Set(visited))
        }
        if (noId && nodeMap.has(noId)) {
          treeNode.noBranch = buildChain(noId, new Set(visited))
        }
        chain.push(treeNode)
        break
      }

      chain.push(treeNode)

      // Find next linear node
      const idx = nodes.indexOf(fn)
      const nextNode = idx >= 0 && idx < nodes.length - 1 ? nodes[idx + 1] : null
      currentId = nextNode && !branchTargets.has(nextNode.id) ? nextNode.id : null
    }

    return chain
  }

  return buildChain(nodes[0].id, new Set())
}

// ─── ID generator ───────────────────────────────────────

let idCounter = 0
function nextId(type: string) {
  return `${type}_${Date.now()}_${++idCounter}`
}

// ─── Node styling ───────────────────────────────────────

const NODE_META: Record<string, {
  icon: typeof Zap
  iconColor: string
  iconBg: string
  ringColor: string
  label: string
}> = {
  trigger:       { icon: Zap,            iconColor: 'text-purple-600',  iconBg: 'bg-purple-100',  ringColor: 'ring-purple-200',  label: 'Trigger' },
  delay:         { icon: Clock,          iconColor: 'text-blue-600',    iconBg: 'bg-blue-100',    ringColor: 'ring-blue-200',    label: 'Wait / Delay' },
  condition:     { icon: GitBranch,      iconColor: 'text-amber-600',   iconBg: 'bg-amber-100',   ringColor: 'ring-amber-200',   label: 'Condition' },
  send_email:    { icon: Mail,           iconColor: 'text-green-600',   iconBg: 'bg-green-100',   ringColor: 'ring-green-200',   label: 'Email' },
  send_sms:      { icon: MessageSquare,  iconColor: 'text-teal-600',    iconBg: 'bg-teal-100',    ringColor: 'ring-teal-200',    label: 'SMS' },
  send_push:     { icon: Bell,           iconColor: 'text-violet-600',  iconBg: 'bg-violet-100',  ringColor: 'ring-violet-200',  label: 'Push Notification' },
  send_whatsapp: { icon: Phone,          iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100', ringColor: 'ring-emerald-200', label: 'WhatsApp' },
  end:           { icon: CircleStop,     iconColor: 'text-gray-500',    iconBg: 'bg-gray-100',    ringColor: 'ring-gray-200',    label: 'End' },
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

function fmtEvent(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ─── Add Node Popup ─────────────────────────────────────

const ADD_OPTIONS = [
  { type: 'delay',         label: 'Wait / Delay',       icon: Clock,          color: 'text-blue-500',    category: 'Controls' },
  { type: 'end',           label: 'Exit',               icon: CircleStop,     color: 'text-red-400',     category: 'Controls' },
  { type: 'condition',     label: 'Conditional Split',   icon: GitBranch,      color: 'text-amber-500',   category: 'Conditions' },
  { type: 'send_email',    label: 'Email',              icon: Mail,           color: 'text-green-500',   category: 'Actions' },
  { type: 'send_sms',      label: 'SMS',                icon: MessageSquare,  color: 'text-teal-500',    category: 'Actions' },
  { type: 'send_push',     label: 'Push Notification',  icon: Bell,           color: 'text-violet-500',  category: 'Actions' },
  { type: 'send_whatsapp', label: 'WhatsApp',           icon: Phone,          color: 'text-emerald-500', category: 'Actions' },
]

const CATEGORY_ORDER = ['Controls', 'Conditions', 'Actions'] as const
const CATEGORY_DOT: Record<string, string> = {
  Controls: 'bg-violet-400',
  Conditions: 'bg-amber-400',
  Actions: 'bg-green-400',
}

function AddNodePopup({
  onAdd,
  className,
}: {
  onAdd: (optionType: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof ADD_OPTIONS>()
    ADD_OPTIONS.forEach(opt => {
      const list = map.get(opt.category) ?? []
      list.push(opt)
      map.set(opt.category, list)
    })
    return map
  }, [])

  return (
    <div className={cn('relative flex flex-col items-center', className)}>
      {/* Connector line above button */}
      <div className="w-px h-6 bg-gray-300" />

      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center transition-all z-10',
          'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:shadow-lg hover:scale-110',
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
      </button>

      {/* Connector line below button */}
      <div className="w-px h-6 bg-gray-300" />

      {open && (
        <div
          ref={popupRef}
          className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 w-[460px]"
          style={{ filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.12))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Add Node</span>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>

          {/* 3 columns */}
          <div className="grid grid-cols-3 gap-5">
            {CATEGORY_ORDER.map(category => {
              const items = grouped.get(category) ?? []
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn('w-2 h-2 rounded-full', CATEGORY_DOT[category])} />
                    <span className="text-xs font-bold text-gray-800">{category}</span>
                  </div>
                  <div className="space-y-1">
                    {items.map(opt => {
                      const Icon = opt.icon
                      return (
                        <button
                          key={opt.type}
                          onClick={() => { onAdd(opt.type); setOpen(false) }}
                          className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Icon className={cn('h-5 w-5 flex-shrink-0', opt.color)} />
                          <span className="font-medium">{opt.label}</span>
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
  node: FlowNode
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  canDelete: boolean
  errors: string[]
}) {
  const meta = getMeta(node)
  const Icon = meta.icon
  const subtitle = getSubtitle(node)
  const hasError = errors.length > 0

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative w-[280px] bg-white border rounded-2xl px-5 py-4 cursor-pointer transition-all',
        'shadow-sm hover:shadow-md',
        hasError
          ? 'border-red-300 ring-2 ring-red-100'
          : isSelected
            ? 'border-indigo-400 ring-2 ring-indigo-100'
            : 'border-gray-200 hover:border-gray-300',
      )}
    >
      {/* Error badge */}
      {hasError && (
        <div className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm">
          <AlertCircle className="h-3.5 w-3.5" />
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', meta.iconBg)}>
          <Icon className={cn('h-[18px] w-[18px]', meta.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', meta.iconColor)}>{meta.label}</p>
          <p className="text-xs text-gray-400 truncate mt-0.5">{subtitle}</p>
        </div>
        {canDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Branch Renderer (recursive) ────────────────────────

function BranchRenderer({
  chain, selectedId, onSelect, onDelete, onAddNode, errors,
}: {
  chain: TreeNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onAddNode: (afterId: string, optionType: string, branch?: 'yes' | 'no') => void
  errors: Map<string, string[]>
}) {
  return (
    <div className="flex flex-col items-center">
      {chain.map((tn, i) => (
        <div key={tn.node.id} className="flex flex-col items-center">
          {/* Connector + add button between nodes */}
          {i > 0 && (
            <AddNodePopup onAdd={(type) => onAddNode(chain[i - 1].node.id, type)} />
          )}

          {/* Node card */}
          <NodeCard
            node={tn.node}
            isSelected={selectedId === tn.node.id}
            onSelect={() => onSelect(tn.node.id)}
            onDelete={() => onDelete(tn.node.id)}
            canDelete={tn.node.type !== 'trigger'}
            errors={errors.get(tn.node.id) ?? []}
          />

          {/* Condition → Branch split */}
          {tn.node.type === 'condition' && (
            <ConditionBranches
              conditionNode={tn}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onAddNode={onAddNode}
              errors={errors}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function ConditionBranches({
  conditionNode, selectedId, onSelect, onDelete, onAddNode, errors,
}: {
  conditionNode: TreeNode
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onAddNode: (afterId: string, optionType: string, branch?: 'yes' | 'no') => void
  errors: Map<string, string[]>
}) {
  const condId = conditionNode.node.id
  const yesBranch = conditionNode.yesBranch ?? []
  const noBranch = conditionNode.noBranch ?? []

  return (
    <div className="flex flex-col items-center">
      {/* Vertical line down from condition */}
      <div className="w-px h-5 bg-gray-300" />

      {/* T-connector: horizontal bar spanning both branches */}
      <div className="relative flex" style={{ width: '580px' }}>
        {/* Horizontal line */}
        <div className="absolute top-0 left-[calc(50%-145px)] right-[calc(50%-145px)] h-px bg-gray-300" />

        {/* Left (Yes) vertical tick */}
        <div className="absolute left-[calc(50%-145px)] top-0 w-px h-4 bg-green-400" />
        {/* Right (No) vertical tick */}
        <div className="absolute right-[calc(50%-145px)] top-0 w-px h-4 bg-red-400" />

        {/* Branches side by side */}
        <div className="flex w-full pt-4">
          {/* Yes Branch */}
          <div className="flex-1 flex flex-col items-center">
            <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200 px-3 py-0.5 rounded-full mb-1">
              Yes
            </span>
            <div className="w-px h-3 bg-green-400" />

            {yesBranch.length > 0 ? (
              <>
                <BranchRenderer
                  chain={yesBranch}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onAddNode={onAddNode}
                  errors={errors}
                />
                <AddNodePopup
                  onAdd={(type) => {
                    const lastNode = yesBranch[yesBranch.length - 1]
                    onAddNode(lastNode.node.id, type, 'yes')
                  }}
                />
              </>
            ) : (
              <AddNodePopup onAdd={(type) => onAddNode(condId, type, 'yes')} />
            )}
          </div>

          {/* No Branch */}
          <div className="flex-1 flex flex-col items-center">
            <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-3 py-0.5 rounded-full mb-1">
              No
            </span>
            <div className="w-px h-3 bg-red-400" />

            {noBranch.length > 0 ? (
              <>
                <BranchRenderer
                  chain={noBranch}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onAddNode={onAddNode}
                  errors={errors}
                />
                <AddNodePopup
                  onAdd={(type) => {
                    const lastNode = noBranch[noBranch.length - 1]
                    onAddNode(lastNode.node.id, type, 'no')
                  }}
                />
              </>
            ) : (
              <AddNodePopup onAdd={(type) => onAddNode(condId, type, 'no')} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Right Drawer (Node Config) ─────────────────────────

function NodeConfigDrawer({
  node, onUpdate, onClose, domainType = 'ecommerce',
}: {
  node: FlowNode
  onUpdate: (updated: FlowNode) => void
  onClose: () => void
  domainType: string
}) {
  const domainKey = domainType as keyof typeof EVENTS_BY_DOMAIN
  const eventOptions = EVENTS_BY_DOMAIN[domainKey] ?? EVENTS_BY_DOMAIN.ecommerce

  const meta = getMeta(node)
  const Icon = meta.icon

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', meta.iconBg)}>
          <Icon className={cn('h-4 w-4', meta.iconColor)} />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">{meta.label} Settings</h3>
        <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Config body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {node.type === 'trigger' && (
          <Field label="Trigger Event">
            <select
              value={node.config?.event ?? ''}
              onChange={e => onUpdate({ ...node, config: { event: e.target.value, filters: { logic: 'AND', rules: [] } } } as FlowNode)}
              className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-[10px] bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 focus:bg-white"
            >
              <option value="">Select event...</option>
              {eventOptions.map((ev: string) => <option key={ev} value={ev}>{fmtEvent(ev)}</option>)}
            </select>
          </Field>
        )}

        {node.type === 'delay' && (
          <Field label="Wait Duration">
            <div className="flex gap-2">
              <input
                type="number" min={1}
                value={node.config.value}
                onChange={e => onUpdate({ ...node, config: { ...node.config, value: parseInt(e.target.value) || 1 } })}
                className="w-24 px-3 py-2 text-[13px] border border-gray-200 rounded-[10px] bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 focus:bg-white"
              />
              <select
                value={node.config.unit}
                onChange={e => onUpdate({ ...node, config: { ...node.config, unit: e.target.value as 'minutes' | 'hours' | 'days' } })}
                className="flex-1 px-3 py-2 text-[13px] border border-gray-200 rounded-[10px] bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 focus:bg-white"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">In demo mode, delays use DEMO_DELAY_MINUTES override.</p>
          </Field>
        )}

        {node.type === 'condition' && (
          <>
            <Field label="Check Type">
              <select
                value={node.config.check}
                onChange={e => onUpdate({ ...node, config: { ...node.config, check: e.target.value as 'event_occurred' | 'attribute_check' } })}
                className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-[10px] bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 focus:bg-white"
              >
                <option value="event_occurred">Has Done Event</option>
                <option value="attribute_check">Check User Attribute</option>
              </select>
            </Field>
            {node.config.check === 'event_occurred' ? (
              <Field label="Event">
                <select
                  value={node.config.event ?? ''}
                  onChange={e => onUpdate({ ...node, config: { ...node.config, event: e.target.value } })}
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-[10px] bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 focus:bg-white"
                >
                  <option value="">Select event...</option>
                  {eventOptions.map((ev: string) => <option key={ev} value={ev}>{fmtEvent(ev)}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Customer Field">
                <input
                  type="text"
                  value={node.config.field ?? ''}
                  placeholder="e.g. totalOrders"
                  onChange={e => onUpdate({ ...node, config: { ...node.config, field: e.target.value } })}
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-[10px] bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 focus:bg-white"
                />
              </Field>
            )}
          </>
        )}

        {node.type === 'action' && (
          <>
            <Field label="Channel">
              <select
                value={node.config.actionType}
                onChange={e => onUpdate({ ...node, config: { ...node.config, actionType: e.target.value as 'send_email' | 'send_sms' | 'send_push' | 'send_whatsapp' } })}
                className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-[10px] bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 focus:bg-white"
              >
                <option value="send_email">Email</option>
                <option value="send_sms">SMS</option>
                <option value="send_push">Push Notification</option>
                <option value="send_whatsapp">WhatsApp</option>
              </select>
            </Field>
            <Field label="Template ID">
              <input
                type="text"
                value={node.config.templateId}
                placeholder="e.g. abandoned_cart_default"
                onChange={e => onUpdate({ ...node, config: { ...node.config, templateId: e.target.value } })}
                className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-[10px] bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 focus:bg-white"
              />
            </Field>
          </>
        )}

        {node.type === 'end' && (
          <Field label="Label">
            <input
              type="text"
              value={node.label ?? 'End'}
              onChange={e => onUpdate({ ...node, label: e.target.value })}
              className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-[10px] bg-gray-50 text-gray-800 outline-none transition-all focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 focus:bg-white"
            />
          </Field>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">{label}</label>
      {children}
    </div>
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
    if (n.type === 'condition' && n.config.check === 'event_occurred' && !n.config.event) {
      add(n.id, 'Select an event to check')
    }
  }

  return errs
}

// ─── Main Component ─────────────────────────────────────

export function StructuredFlowBuilder({ flowNodes, exitConfig: initialExitConfig, onSave, saving, domainType = 'ecommerce' }: Props) {
  const [nodes, setNodes] = useState<FlowNode[]>(flowNodes)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exitEvent, setExitEvent] = useState(initialExitConfig?.event ?? '')

  const errors = validateNodes(nodes)
  const errorCount = Array.from(errors.values()).reduce((sum, arr) => sum + arr.length, 0)
  const tree = useMemo(() => buildTree(nodes), [nodes])

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null

  const handleAddNode = useCallback((afterId: string, optionType: string, branch?: 'yes' | 'no') => {
    if (optionType === 'condition') {
      // Condition node — no auto-created End nodes, branches start empty
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
    } else {
      const newNode = optionType === 'delay'
        ? { id: nextId('delay'), type: 'delay' as const, config: { value: 30, unit: 'minutes' as const } }
        : optionType === 'end'
          ? { id: nextId('end'), type: 'end' as const, label: 'End' }
          : {
              id: nextId('action'), type: 'action' as const,
              config: { actionType: optionType as 'send_email', templateId: '' },
            }

      if (branch) {
        // Adding to a condition branch — update branch pointer and insert node
        setNodes(prev => {
          const condIdx = prev.findIndex(n => n.id === afterId && n.type === 'condition')
          if (condIdx >= 0) {
            // afterId is the condition itself, adding first node to branch
            const cond = prev[condIdx]
            if (cond.type !== 'condition') return prev
            const updatedCond: FlowNode = {
              ...cond,
              config: {
                ...cond.config,
                branches: {
                  ...cond.config.branches,
                  [branch]: newNode.id,
                },
              },
            }
            const copy = [...prev]
            copy[condIdx] = updatedCond
            copy.splice(condIdx + 1, 0, newNode)
            return copy
          }

          // afterId is a node inside a branch — insert after it
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
    }
  }, [])

  const handleDeleteNode = useCallback((id: string) => {
    setNodes(prev => {
      // If deleting a node that's a branch target, clear the branch pointer
      const copy = prev.map(n => {
        if (n.type === 'condition') {
          const branches = { ...n.config.branches }
          if (branches.yes === id) branches.yes = ''
          if (branches.no === id) branches.no = ''
          return { ...n, config: { ...n.config, branches } }
        }
        return n
      })
      return copy.filter(n => n.id !== id)
    })
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  const handleUpdateNode = useCallback((updated: FlowNode) => {
    setNodes(prev => prev.map(n => n.id === updated.id ? updated : n))
  }, [])

  const handleSave = () => {
    const exitCfg: ExitConfig | null = exitEvent ? { event: exitEvent, scope: 'any' } : null
    onSave(nodes, exitCfg)
  }

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Canvas */}
      <div className="flex-1 overflow-auto bg-[#f7f8fc]">
        <div className="flex flex-col items-center py-12 px-8 min-w-fit">
          <BranchRenderer
            chain={tree}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
            onDelete={handleDeleteNode}
            onAddNode={handleAddNode}
            errors={errors}
          />

          {/* Trailing add button (if last node isn't a condition) */}
          {tree.length > 0 && tree[tree.length - 1].node.type !== 'condition' && (
            <AddNodePopup onAdd={(type) => handleAddNode(nodes[nodes.length - 1].id, type)} />
          )}
        </div>

        {/* Bottom bar */}
        <div className="sticky bottom-4 mx-8 flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-6 py-3.5 shadow-lg">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <LogOut className="h-4 w-4 text-red-400 rotate-180" />
              <span className="text-xs font-semibold text-gray-500">Exit on:</span>
              <select
                value={exitEvent}
                onChange={e => setExitEvent(e.target.value)}
                className="text-xs font-medium border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-gray-50"
              >
                <option value="">No exit event</option>
                {(EVENTS_BY_DOMAIN[domainType as keyof typeof EVENTS_BY_DOMAIN] ?? EVENTS_BY_DOMAIN.ecommerce).map((ev: string) => (
                  <option key={ev} value={ev}>{fmtEvent(ev)}</option>
                ))}
              </select>
            </div>

            {errorCount > 0 && (
              <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
                Errors ({errorCount})
              </span>
            )}

            <span className="text-xs text-gray-400 font-medium">{nodes.length} node{nodes.length !== 1 ? 's' : ''}</span>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-all',
              'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Flow'}
          </button>
        </div>
      </div>

      {/* Right config drawer */}
      {selectedNode && (
        <NodeConfigDrawer
          node={selectedNode}
          onUpdate={handleUpdateNode}
          onClose={() => setSelectedId(null)}
          domainType={domainType}
        />
      )}

    </div>
  )
}
