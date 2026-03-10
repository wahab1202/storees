import type { TriggerConfig, ExitConfig, FlowNode } from '@storees/shared'

type FlowTemplate = {
  name: string
  slug: string
  description: string
  triggerConfig: TriggerConfig
  exitConfig: ExitConfig
  nodes: FlowNode[]
  emailTemplateId: string
}

export const FLOW_TEMPLATE_DEFINITIONS: FlowTemplate[] = [
  {
    name: 'Abandoned Cart Recovery',
    slug: 'abandoned_cart',
    description: 'Send recovery email when a customer adds to cart but doesn\'t checkout',
    triggerConfig: {
      event: 'cart_created',
      filters: {
        logic: 'AND',
        rules: [
          { field: 'properties.cart_value', operator: 'greater_than', value: 0 },
        ],
      },
      inactivityTime: { value: 30, unit: 'minutes' },
    },
    exitConfig: {
      event: 'order_placed',
      scope: 'any',
    },
    nodes: [
      { id: 'trigger', type: 'trigger' },
      { id: 'delay_30m', type: 'delay', config: { value: 30, unit: 'minutes' } },
      {
        id: 'check_ordered',
        type: 'condition',
        config: {
          check: 'event_occurred',
          event: 'order_placed',
          since: 'trip_start',
          branches: { yes: 'end_converted', no: 'send_email' },
        },
      },
      {
        id: 'send_email',
        type: 'action',
        config: {
          actionType: 'send_email',
          templateId: 'abandoned_cart_default',
          dynamicData: ['cart_items', 'customer_name', 'checkout_url'],
        },
      },
      { id: 'end_converted', type: 'end', label: 'Converted' },
      { id: 'end_sent', type: 'end', label: 'Email Sent' },
    ],
    emailTemplateId: 'abandoned_cart_default',
  },
]
