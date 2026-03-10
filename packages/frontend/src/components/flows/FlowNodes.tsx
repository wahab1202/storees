'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Zap, Clock, GitBranch, Mail, MessageSquare, Bell, Phone, CircleStop } from 'lucide-react'
import { cn } from '@/lib/utils'

type NodeData = Record<string, unknown>

const nodeBase = 'px-4 py-3 rounded-xl border-2 shadow-sm min-w-[180px] text-sm'

export const TriggerNode = memo(function TriggerNode({ data }: NodeProps) {
  const d = data as NodeData
  return (
    <div className={cn(nodeBase, 'border-purple-400 bg-purple-50')}>
      <div className="flex items-center gap-2 font-semibold text-purple-800">
        <Zap className="h-4 w-4" />
        Trigger
      </div>
      <p className="text-xs text-purple-600 mt-1">
        {(d.event as string) ?? 'Event trigger'}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-3 !h-3" />
    </div>
  )
})

export const DelayNode = memo(function DelayNode({ data }: NodeProps) {
  const d = data as NodeData
  const value = (d.value as number) ?? 0
  const unit = (d.unit as string) ?? 'minutes'
  return (
    <div className={cn(nodeBase, 'border-blue-400 bg-blue-50')}>
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 font-semibold text-blue-800">
        <Clock className="h-4 w-4" />
        Wait
      </div>
      <p className="text-xs text-blue-600 mt-1">
        {value} {unit}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3" />
    </div>
  )
})

export const ConditionNode = memo(function ConditionNode({ data }: NodeProps) {
  const d = data as NodeData
  return (
    <div className={cn(nodeBase, 'border-amber-400 bg-amber-50')}>
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 font-semibold text-amber-800">
        <GitBranch className="h-4 w-4" />
        Condition
      </div>
      <p className="text-xs text-amber-600 mt-1">
        {(d.check as string) === 'event_occurred' ? `Event: ${d.event ?? '?'}` : `Check: ${d.field ?? '?'}`}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '30%' }}
        className="!bg-green-500 !w-3 !h-3"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '70%' }}
        className="!bg-red-500 !w-3 !h-3"
      />
      <div className="flex justify-between text-[10px] mt-2 text-amber-700 font-medium">
        <span>Yes</span>
        <span>No</span>
      </div>
    </div>
  )
})

const actionConfig: Record<string, { label: string; icon: typeof Mail; border: string; bg: string; text: string; handle: string }> = {
  send_email: { label: 'Send Email', icon: Mail, border: 'border-green-400', bg: 'bg-green-50', text: 'text-green-800', handle: '!bg-green-500' },
  send_sms: { label: 'Send SMS', icon: MessageSquare, border: 'border-teal-400', bg: 'bg-teal-50', text: 'text-teal-800', handle: '!bg-teal-500' },
  send_push: { label: 'Push Notification', icon: Bell, border: 'border-violet-400', bg: 'bg-violet-50', text: 'text-violet-800', handle: '!bg-violet-500' },
  send_whatsapp: { label: 'WhatsApp', icon: Phone, border: 'border-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-800', handle: '!bg-emerald-500' },
}

export const ActionNode = memo(function ActionNode({ data }: NodeProps) {
  const d = data as NodeData
  const type = (d.actionType as string) ?? 'send_email'
  const cfg = actionConfig[type] ?? actionConfig.send_email
  const Icon = cfg.icon
  return (
    <div className={cn(nodeBase, cfg.border, cfg.bg)}>
      <Handle type="target" position={Position.Top} className={cn(cfg.handle, '!w-3 !h-3')} />
      <div className={cn('flex items-center gap-2 font-semibold', cfg.text)}>
        <Icon className="h-4 w-4" />
        {cfg.label}
      </div>
      <p className="text-xs opacity-70 mt-1 truncate max-w-[160px]">
        Template: {(d.templateId as string)?.slice(0, 8) || 'none'}
      </p>
      <Handle type="source" position={Position.Bottom} className={cn(cfg.handle, '!w-3 !h-3')} />
    </div>
  )
})

export const EndNode = memo(function EndNode({ data }: NodeProps) {
  const d = data as NodeData
  return (
    <div className={cn(nodeBase, 'border-gray-400 bg-gray-50')}>
      <Handle type="target" position={Position.Top} className="!bg-gray-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 font-semibold text-gray-700">
        <CircleStop className="h-4 w-4" />
        {(d.label as string) ?? 'End'}
      </div>
    </div>
  )
})

export const nodeTypes = {
  trigger: TriggerNode,
  delay: DelayNode,
  condition: ConditionNode,
  action: ActionNode,
  end: EndNode,
}
