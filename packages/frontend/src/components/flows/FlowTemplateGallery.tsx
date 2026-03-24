'use client'

import { useState } from 'react'
import {
  ShoppingCart, UserPlus, Clock, Mail, Bell, Repeat,
  CreditCard, Shield, Briefcase, X, Zap, Workflow,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FlowNode } from '@storees/shared'

type FlowTemplate = {
  id: string
  name: string
  description: string
  icon: typeof ShoppingCart
  color: string
  domain: string[]
  nodes: FlowNode[]
  triggerEvent: string
  exitEvent?: string
}

const TEMPLATES: FlowTemplate[] = [
  {
    id: 'abandoned_cart',
    name: 'Abandoned Cart Recovery',
    description: 'Send a reminder email when a customer creates a cart but doesn\'t complete checkout',
    icon: ShoppingCart,
    color: 'text-orange-600 bg-orange-50',
    domain: ['ecommerce'],
    triggerEvent: 'cart_created',
    exitEvent: 'order_placed',
    nodes: [
      { id: 'trigger_1', type: 'trigger', config: { event: 'cart_created', filters: { logic: 'AND', rules: [] } } },
      { id: 'delay_1', type: 'delay', config: { value: 1, unit: 'hours' } },
      { id: 'cond_1', type: 'condition', config: { check: 'event_occurred', event: 'order_placed', since: 'trip_start', branches: { yes: 'end_1', no: 'action_1' } } },
      { id: 'action_1', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'delay_2', type: 'delay', config: { value: 24, unit: 'hours' } },
      { id: 'action_2', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'end_1', type: 'end', label: 'End' },
    ],
  },
  {
    id: 'welcome_series',
    name: 'Welcome Series',
    description: 'Onboard new customers with a multi-touch email sequence over their first week',
    icon: UserPlus,
    color: 'text-blue-600 bg-blue-50',
    domain: ['ecommerce', 'saas', 'fintech'],
    triggerEvent: 'customer_created',
    nodes: [
      { id: 'trigger_1', type: 'trigger', config: { event: 'customer_created', filters: { logic: 'AND', rules: [] } } },
      { id: 'action_1', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'delay_1', type: 'delay', config: { value: 2, unit: 'days' } },
      { id: 'action_2', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'delay_2', type: 'delay', config: { value: 3, unit: 'days' } },
      { id: 'action_3', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'end_1', type: 'end', label: 'End' },
    ],
  },
  {
    id: 'post_purchase',
    name: 'Post-Purchase Follow-up',
    description: 'Thank customers after purchase and ask for a review after delivery',
    icon: Repeat,
    color: 'text-green-600 bg-green-50',
    domain: ['ecommerce'],
    triggerEvent: 'order_placed',
    nodes: [
      { id: 'trigger_1', type: 'trigger', config: { event: 'order_placed', filters: { logic: 'AND', rules: [] } } },
      { id: 'action_1', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'delay_1', type: 'delay', config: { value: 5, unit: 'days' } },
      { id: 'cond_1', type: 'condition', config: { check: 'event_occurred', event: 'order_fulfilled', since: 'trip_start', branches: { yes: 'action_2', no: 'end_1' } } },
      { id: 'action_2', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'end_1', type: 'end', label: 'End' },
    ],
  },
  {
    id: 'winback',
    name: 'Win-Back Campaign',
    description: 'Re-engage dormant customers who haven\'t interacted in 30 days',
    icon: Clock,
    color: 'text-purple-600 bg-purple-50',
    domain: ['ecommerce', 'saas', 'fintech'],
    triggerEvent: 'enters_segment',
    nodes: [
      { id: 'trigger_1', type: 'trigger', config: { event: 'enters_segment', filters: { logic: 'AND', rules: [] } } },
      { id: 'action_1', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'delay_1', type: 'delay', config: { value: 3, unit: 'days' } },
      { id: 'cond_1', type: 'condition', config: { check: 'event_occurred', event: 'order_placed', since: 'trip_start', branches: { yes: 'end_1', no: 'action_2' } } },
      { id: 'action_2', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'end_1', type: 'end', label: 'End' },
    ],
  },
  {
    id: 'kyc_reminder',
    name: 'KYC Completion Reminder',
    description: 'Nudge customers to complete their KYC verification with escalating urgency',
    icon: Shield,
    color: 'text-red-600 bg-red-50',
    domain: ['fintech'],
    triggerEvent: 'customer_created',
    exitEvent: 'kyc_verified',
    nodes: [
      { id: 'trigger_1', type: 'trigger', config: { event: 'customer_created', filters: { logic: 'AND', rules: [] } } },
      { id: 'delay_1', type: 'delay', config: { value: 1, unit: 'days' } },
      { id: 'cond_1', type: 'condition', config: { check: 'event_occurred', event: 'kyc_verified', since: 'trip_start', branches: { yes: 'end_1', no: 'action_1' } } },
      { id: 'action_1', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'delay_2', type: 'delay', config: { value: 3, unit: 'days' } },
      { id: 'action_2', type: 'action', config: { actionType: 'send_sms', templateId: '' } },
      { id: 'end_1', type: 'end', label: 'End' },
    ],
  },
  {
    id: 'trial_conversion',
    name: 'Trial-to-Paid Conversion',
    description: 'Guide trial users toward upgrading before their trial expires',
    icon: Briefcase,
    color: 'text-indigo-600 bg-indigo-50',
    domain: ['saas'],
    triggerEvent: 'user_signup',
    exitEvent: 'subscription_started',
    nodes: [
      { id: 'trigger_1', type: 'trigger', config: { event: 'user_signup', filters: { logic: 'AND', rules: [] } } },
      { id: 'delay_1', type: 'delay', config: { value: 3, unit: 'days' } },
      { id: 'action_1', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'delay_2', type: 'delay', config: { value: 4, unit: 'days' } },
      { id: 'action_2', type: 'action', config: { actionType: 'send_email', templateId: '' } },
      { id: 'delay_3', type: 'delay', config: { value: 3, unit: 'days' } },
      { id: 'action_3', type: 'action', config: { actionType: 'send_push', templateId: '' } },
      { id: 'end_1', type: 'end', label: 'End' },
    ],
  },
  {
    id: 'transaction_alert',
    name: 'Transaction Alert',
    description: 'Send instant notifications when a transaction is completed',
    icon: CreditCard,
    color: 'text-teal-600 bg-teal-50',
    domain: ['fintech'],
    triggerEvent: 'transaction_completed',
    nodes: [
      { id: 'trigger_1', type: 'trigger', config: { event: 'transaction_completed', filters: { logic: 'AND', rules: [] } } },
      { id: 'action_1', type: 'action', config: { actionType: 'send_push', templateId: '' } },
      { id: 'end_1', type: 'end', label: 'End' },
    ],
  },
]

type Props = {
  domainType: string
  onSelect: (template: { name: string; description: string; triggerEvent: string; nodes: FlowNode[]; exitEvent?: string }) => void
  onClose: () => void
}

export function FlowTemplateGallery({ domainType, onSelect, onClose }: Props) {
  const [filter, setFilter] = useState<string>('all')

  const filtered = TEMPLATES.filter(t =>
    filter === 'all' || t.domain.includes(filter)
  )

  const domainTemplates = TEMPLATES.filter(t => t.domain.includes(domainType))
  const otherTemplates = filtered.filter(t => !t.domain.includes(domainType))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white border border-border rounded-xl w-full max-w-3xl max-h-[80vh] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-accent/10 rounded-lg">
              <Workflow className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-heading">Flow Templates</h2>
              <p className="text-xs text-text-muted">Start with a pre-built automation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface transition-colors">
            <X className="h-4 w-4 text-text-muted" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
          {['all', 'ecommerce', 'fintech', 'saas'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors',
                filter === f ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface',
              )}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {filter === 'all' && domainTemplates.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Recommended for {domainType}
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {domainTemplates.map(t => (
                  <TemplateCard key={t.id} template={t} onSelect={onSelect} recommended />
                ))}
              </div>
              {otherTemplates.length > 0 && (
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Other Templates</h3>
              )}
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            {(filter === 'all' ? otherTemplates : filtered).map(t => (
              <TemplateCard key={t.id} template={t} onSelect={onSelect} />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-text-muted">No templates for this domain yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  onSelect,
  recommended,
}: {
  template: FlowTemplate
  onSelect: Props['onSelect']
  recommended?: boolean
}) {
  const Icon = template.icon
  return (
    <button
      onClick={() => onSelect({
        name: template.name,
        description: template.description,
        triggerEvent: template.triggerEvent,
        nodes: template.nodes,
        exitEvent: template.exitEvent,
      })}
      className={cn(
        'text-left border rounded-xl p-4 hover:border-accent/40 hover:shadow-sm transition-all group',
        recommended ? 'border-accent/20 bg-accent/5' : 'border-border bg-white',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', template.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-heading group-hover:text-accent transition-colors">
            {template.name}
          </p>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{template.description}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-text-muted bg-surface px-2 py-0.5 rounded-full">
              {template.nodes.length} nodes
            </span>
            {template.domain.map(d => (
              <span key={d} className="text-[10px] text-accent/70 bg-accent/10 px-2 py-0.5 rounded-full capitalize">
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  )
}
