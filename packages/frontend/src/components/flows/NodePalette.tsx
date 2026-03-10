'use client'

import { Clock, GitBranch, Mail, MessageSquare, Bell, Phone, CircleStop, LogOut } from 'lucide-react'
import type { DragEvent } from 'react'

type PaletteItem = {
  type: string
  subtype?: string
  label: string
  icon: typeof Mail
  color: string
}

const paletteItems: PaletteItem[] = [
  { type: 'delay', label: 'Wait / Delay', icon: Clock, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { type: 'condition', label: 'Condition', icon: GitBranch, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { type: 'action', subtype: 'send_email', label: 'Send Email', icon: Mail, color: 'text-green-600 bg-green-50 border-green-200' },
  { type: 'action', subtype: 'send_sms', label: 'Send SMS', icon: MessageSquare, color: 'text-teal-600 bg-teal-50 border-teal-200' },
  { type: 'action', subtype: 'send_push', label: 'Push Notification', icon: Bell, color: 'text-violet-600 bg-violet-50 border-violet-200' },
  { type: 'action', subtype: 'send_whatsapp', label: 'WhatsApp', icon: Phone, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { type: 'end', label: 'End', icon: CircleStop, color: 'text-gray-600 bg-gray-50 border-gray-200' },
]

type NodePaletteProps = {
  exitEvent?: string
  onExitEventChange?: (event: string) => void
}

const EVENT_OPTIONS = [
  'cart_created', 'checkout_started', 'order_placed', 'order_fulfilled',
  'order_cancelled', 'customer_updated', 'enters_segment', 'exits_segment',
]

export function NodePalette({ exitEvent, onExitEventChange }: NodePaletteProps) {
  const onDragStart = (e: DragEvent, item: PaletteItem) => {
    const payload = item.subtype ? `${item.type}:${item.subtype}` : item.type
    e.dataTransfer.setData('application/reactflow', payload)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-52 border-r border-border bg-surface p-4 space-y-4 overflow-y-auto">
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Drag to add
        </h3>
        <div className="space-y-2">
          {paletteItems.map(item => {
            const Icon = item.icon
            return (
              <div
                key={item.subtype ?? item.type}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-grab active:cursor-grabbing text-sm font-medium transition-shadow hover:shadow-md ${item.color}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </div>
            )
          })}
        </div>
      </div>

      {/* Exit condition config */}
      {onExitEventChange && (
        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <LogOut className="h-3.5 w-3.5 text-red-500" />
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Exit Condition
            </h3>
          </div>
          <p className="text-[11px] text-text-muted mb-2">
            Customers exit the flow when this event occurs.
          </p>
          <select
            value={exitEvent ?? ''}
            onChange={e => onExitEventChange(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-surface-elevated
                       focus:outline-none focus:ring-2 focus:ring-border-focus text-text-primary"
          >
            <option value="">No exit event</option>
            {EVENT_OPTIONS.map(ev => (
              <option key={ev} value={ev}>
                {ev.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
