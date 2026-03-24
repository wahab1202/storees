'use client'

import { useState, useCallback } from 'react'
import {
  Zap, Clock, GitBranch, Mail, MessageSquare, Bell, Phone,
  CircleStop, Plus, Trash2, ChevronDown, LogOut, X, Save, Loader2,
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

let idCounter = 0
function nextId(type: string) {
  return `${type}_${Date.now()}_${++idCounter}`
}

// ─── Node styling config ────────────────────────────────

const NODE_STYLES: Record<string, { icon: typeof Zap; border: string; bg: string; text: string; label: string }> = {
  trigger: { icon: Zap, border: 'border-purple-300', bg: 'bg-purple-50', text: 'text-purple-700', label: 'Trigger' },
  delay: { icon: Clock, border: 'border-blue-300', bg: 'bg-blue-50', text: 'text-blue-700', label: 'Wait' },
  condition: { icon: GitBranch, border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Condition' },
  send_email: { icon: Mail, border: 'border-green-300', bg: 'bg-green-50', text: 'text-green-700', label: 'Send Email' },
  send_sms: { icon: MessageSquare, border: 'border-teal-300', bg: 'bg-teal-50', text: 'text-teal-700', label: 'Send SMS' },
  send_push: { icon: Bell, border: 'border-violet-300', bg: 'bg-violet-50', text: 'text-violet-700', label: 'Push Notification' },
  send_whatsapp: { icon: Phone, border: 'border-emerald-300', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'WhatsApp' },
  end: { icon: CircleStop, border: 'border-gray-300', bg: 'bg-gray-50', text: 'text-gray-600', label: 'End' },
}

function getNodeStyle(node: FlowNode) {
  if (node.type === 'action') {
    return NODE_STYLES[node.config.actionType] ?? NODE_STYLES.send_email
  }
  return NODE_STYLES[node.type] ?? NODE_STYLES.end
}

function getNodeSubtitle(node: FlowNode): string {
  switch (node.type) {
    case 'trigger':
      return node.config?.event ? formatEvent(node.config.event) : 'Select trigger event'
    case 'delay':
      return `${node.config.value} ${node.config.unit}`
    case 'condition':
      return node.config.check === 'event_occurred'
        ? `Event: ${node.config.event ?? '?'}`
        : `Check: ${node.config.field ?? '?'}`
    case 'action':
      return node.config.templateId ? `Template: ${node.config.templateId.slice(0, 16)}` : 'No template selected'
    case 'end':
      return node.label ?? 'End'
    default:
      return ''
  }
}

function formatEvent(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ─── Add Node Menu ──────────────────────────────────────

const ADD_OPTIONS = [
  { type: 'delay', label: 'Wait / Delay', icon: Clock, color: 'text-blue-600' },
  { type: 'condition', label: 'Condition', icon: GitBranch, color: 'text-amber-600' },
  { type: 'send_email', label: 'Send Email', icon: Mail, color: 'text-green-600' },
  { type: 'send_sms', label: 'Send SMS', icon: MessageSquare, color: 'text-teal-600' },
  { type: 'send_push', label: 'Push Notification', icon: Bell, color: 'text-violet-600' },
  { type: 'send_whatsapp', label: 'WhatsApp', icon: Phone, color: 'text-emerald-600' },
  { type: 'end', label: 'End', icon: CircleStop, color: 'text-gray-600' },
]

function createNode(optionType: string): FlowNode {
  if (optionType === 'delay') {
    return { id: nextId('delay'), type: 'delay', config: { value: 30, unit: 'minutes' } }
  }
  if (optionType === 'condition') {
    return {
      id: nextId('condition'),
      type: 'condition',
      config: { check: 'event_occurred', since: 'trip_start', branches: { yes: '', no: '' } },
    }
  }
  if (optionType === 'end') {
    return { id: nextId('end'), type: 'end', label: 'End' }
  }
  // Action types
  const actionType = optionType as 'send_email' | 'send_sms' | 'send_push' | 'send_whatsapp'
  return { id: nextId('action'), type: 'action', config: { actionType, templateId: '' } }
}

function AddNodeButton({ onAdd }: { onAdd: (node: FlowNode) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex flex-col items-center">
      {/* Connector line */}
      <div className="w-px h-6 bg-border" />
      <button
        onClick={() => setOpen(!open)}
        className="w-7 h-7 rounded-full border-2 border-dashed border-accent/40 flex items-center justify-center hover:border-accent hover:bg-accent/5 transition-colors"
      >
        <Plus className="h-3.5 w-3.5 text-accent" />
      </button>
      <div className="w-px h-6 bg-border" />

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 bg-white border border-border rounded-xl shadow-xl p-2 w-52">
            {ADD_OPTIONS.map(opt => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.type}
                  onClick={() => {
                    onAdd(createNode(opt.type))
                    setOpen(false)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-primary hover:bg-surface transition-colors"
                >
                  <Icon className={cn('h-4 w-4', opt.color)} />
                  {opt.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Node Card ──────────────────────────────────────────

function NodeCard({
  node,
  index,
  isSelected,
  onSelect,
  onDelete,
  canDelete,
  errors,
}: {
  node: FlowNode
  index: number
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  canDelete: boolean
  errors: string[]
}) {
  const style = getNodeStyle(node)
  const Icon = style.icon
  const subtitle = getNodeSubtitle(node)

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative w-80 border-2 rounded-xl px-4 py-3 cursor-pointer transition-all',
        style.border, style.bg,
        isSelected && 'ring-2 ring-accent ring-offset-2',
        errors.length > 0 && 'ring-2 ring-red-400 ring-offset-1',
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className={cn('p-1.5 rounded-lg', style.bg)}>
          <Icon className={cn('h-4 w-4', style.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', style.text)}>{style.label}</p>
          <p className="text-xs text-text-muted truncate">{subtitle}</p>
        </div>
        {canDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded-md hover:bg-white/50 text-text-muted hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {errors.length > 0 && (
        <div className="mt-2 text-xs text-red-600 font-medium">
          {errors.map((err, i) => <p key={i}>{err}</p>)}
        </div>
      )}
    </div>
  )
}

// ─── Right Drawer (Node Config) ─────────────────────────

function NodeConfigDrawer({
  node,
  onUpdate,
  onClose,
  domainType = 'ecommerce',
}: {
  node: FlowNode
  onUpdate: (updated: FlowNode) => void
  onClose: () => void
  domainType: string
}) {
  const domainKey = domainType as keyof typeof EVENTS_BY_DOMAIN
  const eventOptions = EVENTS_BY_DOMAIN[domainKey] ?? EVENTS_BY_DOMAIN.ecommerce

  return (
    <div className="w-80 border-l border-border bg-white overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-heading capitalize">{node.type} Config</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-surface transition-colors">
          <X className="h-4 w-4 text-text-muted" />
        </button>
      </div>
      <div className="p-4 space-y-4">
        {node.type === 'trigger' && (
          <div>
            <Label text="Trigger Event" />
            <select
              value={node.config?.event ?? ''}
              onChange={e => onUpdate({ ...node, config: { event: e.target.value, filters: { logic: 'AND', rules: [] } } } as FlowNode)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">Select event...</option>
              {eventOptions.map((ev: string) => <option key={ev} value={ev}>{formatEvent(ev)}</option>)}
            </select>
          </div>
        )}

        {node.type === 'delay' && (
          <div>
            <Label text="Duration" />
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={node.config.value}
                onChange={e => onUpdate({ ...node, config: { ...node.config, value: parseInt(e.target.value) || 1 } })}
                className="w-20 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <select
                value={node.config.unit}
                onChange={e => onUpdate({ ...node, config: { ...node.config, unit: e.target.value as 'minutes' | 'hours' | 'days' } })}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            <p className="text-xs text-text-muted mt-2">In demo mode, delays use DEMO_DELAY_MINUTES.</p>
          </div>
        )}

        {node.type === 'condition' && (
          <>
            <div>
              <Label text="Check Type" />
              <select
                value={node.config.check}
                onChange={e => onUpdate({ ...node, config: { ...node.config, check: e.target.value as 'event_occurred' | 'attribute_check' } })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="event_occurred">Event Occurred</option>
                <option value="attribute_check">Attribute Check</option>
              </select>
            </div>
            {node.config.check === 'event_occurred' ? (
              <div>
                <Label text="Event Name" />
                <select
                  value={node.config.event ?? ''}
                  onChange={e => onUpdate({ ...node, config: { ...node.config, event: e.target.value } })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="">Select event...</option>
                  {eventOptions.map((ev: string) => <option key={ev} value={ev}>{formatEvent(ev)}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <Label text="Customer Field" />
                <input
                  type="text"
                  value={node.config.field ?? ''}
                  placeholder="e.g. totalOrders"
                  onChange={e => onUpdate({ ...node, config: { ...node.config, field: e.target.value } })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            )}
          </>
        )}

        {node.type === 'action' && (
          <>
            <div>
              <Label text="Channel" />
              <select
                value={node.config.actionType}
                onChange={e => onUpdate({ ...node, config: { ...node.config, actionType: e.target.value as 'send_email' | 'send_sms' | 'send_push' | 'send_whatsapp' } })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="send_email">Email</option>
                <option value="send_sms">SMS</option>
                <option value="send_push">Push Notification</option>
                <option value="send_whatsapp">WhatsApp</option>
              </select>
            </div>
            <div>
              <Label text="Template ID" />
              <input
                type="text"
                value={node.config.templateId}
                placeholder="e.g. abandoned_cart_default"
                onChange={e => onUpdate({ ...node, config: { ...node.config, templateId: e.target.value } })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
          </>
        )}

        {node.type === 'end' && (
          <div>
            <Label text="Label" />
            <input
              type="text"
              value={node.label ?? 'End'}
              onChange={e => onUpdate({ ...node, label: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function Label({ text }: { text: string }) {
  return <span className="text-xs font-medium text-text-secondary block mb-1.5">{text}</span>
}

// ─── Validation ─────────────────────────────────────────

function validateFlow(nodes: FlowNode[]): Map<string, string[]> {
  const errors = new Map<string, string[]>()
  const addError = (id: string, msg: string) => {
    errors.set(id, [...(errors.get(id) ?? []), msg])
  }

  if (nodes.length === 0) return errors

  // First node must be trigger
  if (nodes[0]?.type !== 'trigger') {
    addError(nodes[0].id, 'Flow must start with a trigger')
  }

  for (const node of nodes) {
    if (node.type === 'trigger' && !node.config?.event) {
      addError(node.id, 'Select a trigger event')
    }
    if (node.type === 'action' && !node.config.templateId) {
      addError(node.id, 'Select a template')
    }
    if (node.type === 'condition' && node.config.check === 'event_occurred' && !node.config.event) {
      addError(node.id, 'Select an event to check')
    }
  }

  return errors
}

// ─── Main Component ─────────────────────────────────────

export function StructuredFlowBuilder({ flowNodes, exitConfig: initialExitConfig, onSave, saving, domainType = 'ecommerce' }: Props) {
  const [nodes, setNodes] = useState<FlowNode[]>(flowNodes)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exitEvent, setExitEvent] = useState(initialExitConfig?.event ?? '')

  const errors = validateFlow(nodes)
  const errorCount = Array.from(errors.values()).reduce((sum, arr) => sum + arr.length, 0)

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null

  const handleAddNode = useCallback((afterIndex: number, node: FlowNode) => {
    setNodes(prev => {
      const copy = [...prev]
      copy.splice(afterIndex + 1, 0, node)
      return copy
    })
    setSelectedId(node.id)
  }, [])

  const handleDeleteNode = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id))
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
      {/* Main canvas area */}
      <div className="flex-1 overflow-y-auto bg-surface/50 p-8">
        <div className="flex flex-col items-center">
          {nodes.map((node, i) => (
            <div key={node.id} className="flex flex-col items-center">
              {/* Connector line from previous */}
              {i > 0 && (
                <AddNodeButton onAdd={(n) => handleAddNode(i - 1, n)} />
              )}

              <NodeCard
                node={node}
                index={i}
                isSelected={selectedId === node.id}
                onSelect={() => setSelectedId(selectedId === node.id ? null : node.id)}
                onDelete={() => handleDeleteNode(node.id)}
                canDelete={node.type !== 'trigger'}
                errors={errors.get(node.id) ?? []}
              />
            </div>
          ))}

          {/* Add at end */}
          {nodes.length > 0 && (
            <AddNodeButton onAdd={(n) => handleAddNode(nodes.length - 1, n)} />
          )}
        </div>

        {/* Bottom bar */}
        <div className="sticky bottom-0 left-0 right-0 mt-8 flex items-center justify-between bg-white border border-border rounded-xl px-5 py-3 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <LogOut className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium text-text-secondary">Exit on:</span>
              <select
                value={exitEvent}
                onChange={e => setExitEvent(e.target.value)}
                className="text-xs border border-border rounded-lg px-2.5 py-1.5 text-text-primary"
              >
                <option value="">No exit event</option>
                {(EVENTS_BY_DOMAIN[domainType as keyof typeof EVENTS_BY_DOMAIN] ?? EVENTS_BY_DOMAIN.ecommerce).map((ev: string) => (
                  <option key={ev} value={ev}>{formatEvent(ev)}</option>
                ))}
              </select>
            </div>
            {errorCount > 0 && (
              <span className="text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                {errorCount} error{errorCount !== 1 ? 's' : ''}
              </span>
            )}
            <span className="text-xs text-text-muted">{nodes.length} node{nodes.length !== 1 ? 's' : ''}</span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Flow'}
          </button>
        </div>
      </div>

      {/* Right drawer */}
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
