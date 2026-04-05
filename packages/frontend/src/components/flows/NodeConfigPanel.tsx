'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { EVENTS_BY_DOMAIN } from '@storees/shared'
import type { Node } from '@xyflow/react'

type NodeConfigPanelProps = {
  node: Node | null
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onClose: () => void
  domainType?: string
}

export function NodeConfigPanel({ node, onUpdate, onClose, domainType = 'ecommerce' }: NodeConfigPanelProps) {
  const domainKey = domainType as keyof typeof EVENTS_BY_DOMAIN
  const eventOptions = EVENTS_BY_DOMAIN[domainKey] ?? EVENTS_BY_DOMAIN.ecommerce

  if (!node) return null

  return (
    <div className="w-72 border-l border-border bg-surface overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary capitalize">
          {node.type} Config
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-elevated transition-colors"
        >
          <X className="h-4 w-4 text-text-muted" />
        </button>
      </div>
      <div className="p-4">
        {node.type === 'trigger' && (
          <TriggerForm node={node} onUpdate={onUpdate} eventOptions={eventOptions} />
        )}
        {node.type === 'delay' && (
          <DelayForm node={node} onUpdate={onUpdate} />
        )}
        {node.type === 'condition' && (
          <ConditionForm node={node} onUpdate={onUpdate} eventOptions={eventOptions} />
        )}
        {node.type === 'action' && (
          <ActionForm node={node} onUpdate={onUpdate} />
        )}
        {node.type === 'end' && (
          <EndForm node={node} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  )
}

function TriggerForm({ node, onUpdate, eventOptions }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void; eventOptions: string[] }) {
  const d = node.data as Record<string, unknown>
  const [event, setEvent] = useState((d.event as string) ?? '')

  useEffect(() => {
    setEvent((node.data as Record<string, unknown>).event as string ?? '')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <FieldLabel label="Trigger Event">
        <select
          value={event}
          onChange={e => {
            setEvent(e.target.value)
            onUpdate(node.id, { ...d, event: e.target.value })
          }}
          className="w-full px-3 py-1.5 pr-8 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
        >
          <option value="">Select event...</option>
          {eventOptions.map((ev: string) => (
            <option key={ev} value={ev}>{formatEvent(ev)}</option>
          ))}
        </select>
      </FieldLabel>
    </div>
  )
}

function DelayForm({ node, onUpdate }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void }) {
  const d = node.data as Record<string, unknown>
  const [value, setValue] = useState((d.value as number) ?? 30)
  const [unit, setUnit] = useState((d.unit as string) ?? 'minutes')

  useEffect(() => {
    const nd = node.data as Record<string, unknown>
    setValue((nd.value as number) ?? 30)
    setUnit((nd.unit as string) ?? 'minutes')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <FieldLabel label="Duration">
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            value={value}
            onChange={e => {
              const v = parseInt(e.target.value) || 1
              setValue(v)
              onUpdate(node.id, { ...d, value: v, unit })
            }}
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-border-focus w-20"
          />
          <select
            value={unit}
            onChange={e => {
              setUnit(e.target.value)
              onUpdate(node.id, { ...d, value, unit: e.target.value })
            }}
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-border-focus flex-1"
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      </FieldLabel>
      <p className="text-xs text-text-muted">
        In demo mode, all delays are overridden by DEMO_DELAY_MINUTES.
      </p>
    </div>
  )
}

function ConditionForm({ node, onUpdate, eventOptions }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void; eventOptions: string[] }) {
  const d = node.data as Record<string, unknown>
  const [check, setCheck] = useState((d.check as string) ?? 'event_occurred')
  const [event, setEvent] = useState((d.event as string) ?? '')
  const [field, setField] = useState((d.field as string) ?? '')

  useEffect(() => {
    const nd = node.data as Record<string, unknown>
    setCheck((nd.check as string) ?? 'event_occurred')
    setEvent((nd.event as string) ?? '')
    setField((nd.field as string) ?? '')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <FieldLabel label="Check Type">
        <select
          value={check}
          onChange={e => {
            setCheck(e.target.value)
            onUpdate(node.id, { ...d, check: e.target.value })
          }}
          className="w-full px-3 py-1.5 pr-8 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
        >
          <option value="event_occurred">Event Occurred</option>
          <option value="attribute_check">Attribute Check</option>
        </select>
      </FieldLabel>

      {check === 'event_occurred' ? (
        <FieldLabel label="Event Name">
          <select
            value={event}
            onChange={e => {
              setEvent(e.target.value)
              onUpdate(node.id, { ...d, check, event: e.target.value })
            }}
            className="w-full px-3 py-1.5 pr-8 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
          >
            <option value="">Select event...</option>
            {eventOptions.map((ev: string) => (
              <option key={ev} value={ev}>{formatEvent(ev)}</option>
            ))}
          </select>
        </FieldLabel>
      ) : (
        <FieldLabel label="Customer Field">
          <input
            type="text"
            value={field}
            placeholder="e.g. totalOrders"
            onChange={e => {
              setField(e.target.value)
              onUpdate(node.id, { ...d, check, field: e.target.value })
            }}
            className="w-full px-3 py-1.5 pr-8 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
          />
        </FieldLabel>
      )}

      <p className="text-xs text-text-muted">
        Yes/No branches are connected via edges on the canvas.
      </p>
    </div>
  )
}

function ActionForm({ node, onUpdate }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void }) {
  const d = node.data as Record<string, unknown>
  const [actionType, setActionType] = useState((d.actionType as string) ?? 'send_email')
  const [templateId, setTemplateId] = useState((d.templateId as string) ?? '')

  useEffect(() => {
    const nd = node.data as Record<string, unknown>
    setActionType((nd.actionType as string) ?? 'send_email')
    setTemplateId((nd.templateId as string) ?? '')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <FieldLabel label="Channel">
        <select
          value={actionType}
          onChange={e => {
            setActionType(e.target.value)
            onUpdate(node.id, { ...d, actionType: e.target.value })
          }}
          className="w-full px-3 py-1.5 pr-8 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
        >
          <option value="send_email">Email</option>
          <option value="send_sms">SMS</option>
          <option value="send_push">Push Notification</option>
          <option value="send_whatsapp">WhatsApp</option>
        </select>
      </FieldLabel>
      <FieldLabel label="Template ID">
        <input
          type="text"
          value={templateId}
          placeholder="e.g. abandoned_cart_default"
          onChange={e => {
            setTemplateId(e.target.value)
            onUpdate(node.id, { ...d, actionType, templateId: e.target.value })
          }}
          className="w-full px-3 py-1.5 pr-8 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
        />
      </FieldLabel>
    </div>
  )
}

function EndForm({ node, onUpdate }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void }) {
  const d = node.data as Record<string, unknown>
  const [label, setLabel] = useState((d.label as string) ?? 'End')

  useEffect(() => {
    setLabel(((node.data as Record<string, unknown>).label as string) ?? 'End')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <FieldLabel label="Label">
        <input
          type="text"
          value={label}
          onChange={e => {
            setLabel(e.target.value)
            onUpdate(node.id, { ...d, label: e.target.value })
          }}
          className="w-full px-3 py-1.5 pr-8 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
        />
      </FieldLabel>
    </div>
  )
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-text-secondary block mb-1">{label}</span>
      {children}
    </label>
  )
}

function formatEvent(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
