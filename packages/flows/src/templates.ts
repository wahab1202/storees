import type { TriggerConfig, ExitConfig, FlowNode, DomainType } from '@storees/shared'

type FlowTemplate = {
  name: string
  slug: string
  description: string
  domainTypes: DomainType[] // which domains this template applies to
  triggerConfig: TriggerConfig
  exitConfig?: ExitConfig
  nodes: FlowNode[]
  emailTemplateId: string
}

export const FLOW_TEMPLATE_DEFINITIONS: FlowTemplate[] = [
  // ============ ECOMMERCE ============
  {
    name: 'Abandoned Cart Recovery',
    slug: 'abandoned_cart',
    description: 'Send recovery email when a customer adds to cart but doesn\'t checkout',
    domainTypes: ['ecommerce'],
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

  // ============ FINTECH ============
  {
    name: 'EMI Overdue Reminder',
    slug: 'emi_overdue_reminder',
    description: 'Nudge customers when their EMI payment is overdue',
    domainTypes: ['fintech'],
    triggerConfig: {
      event: 'emi_overdue',
    },
    exitConfig: {
      event: 'emi_paid',
      scope: 'any',
    },
    nodes: [
      { id: 'trigger', type: 'trigger' },
      { id: 'delay_1h', type: 'delay', config: { value: 1, unit: 'hours' } },
      {
        id: 'check_paid',
        type: 'condition',
        config: {
          check: 'event_occurred',
          event: 'emi_paid',
          since: 'trip_start',
          branches: { yes: 'end_paid', no: 'send_reminder' },
        },
      },
      {
        id: 'send_reminder',
        type: 'action',
        config: {
          actionType: 'send_email',
          templateId: 'emi_overdue_reminder',
          dynamicData: ['customer_name', 'loan_id', 'emi_number', 'amount', 'days_overdue'],
        },
      },
      { id: 'delay_24h', type: 'delay', config: { value: 24, unit: 'hours' } },
      {
        id: 'check_paid_2',
        type: 'condition',
        config: {
          check: 'event_occurred',
          event: 'emi_paid',
          since: 'trip_start',
          branches: { yes: 'end_paid', no: 'send_sms' },
        },
      },
      {
        id: 'send_sms',
        type: 'action',
        config: {
          actionType: 'send_sms',
          templateId: 'emi_overdue_sms',
          dynamicData: ['customer_name', 'amount'],
        },
      },
      { id: 'end_paid', type: 'end', label: 'EMI Paid' },
      { id: 'end_reminded', type: 'end', label: 'Reminders Sent' },
    ],
    emailTemplateId: 'emi_overdue_reminder',
  },
  {
    name: 'KYC Re-Verification',
    slug: 'kyc_reverification',
    description: 'Prompt customers to re-verify KYC when it expires',
    domainTypes: ['fintech'],
    triggerConfig: {
      event: 'kyc_expired',
    },
    exitConfig: {
      event: 'kyc_verified',
      scope: 'any',
    },
    nodes: [
      { id: 'trigger', type: 'trigger' },
      { id: 'delay_2h', type: 'delay', config: { value: 2, unit: 'hours' } },
      {
        id: 'check_reverified',
        type: 'condition',
        config: {
          check: 'event_occurred',
          event: 'kyc_verified',
          since: 'trip_start',
          branches: { yes: 'end_verified', no: 'send_email' },
        },
      },
      {
        id: 'send_email',
        type: 'action',
        config: {
          actionType: 'send_email',
          templateId: 'kyc_reverification',
          dynamicData: ['customer_name', 'kyc_expiry_date'],
        },
      },
      { id: 'delay_3d', type: 'delay', config: { value: 3, unit: 'days' } },
      {
        id: 'check_reverified_2',
        type: 'condition',
        config: {
          check: 'event_occurred',
          event: 'kyc_verified',
          since: 'trip_start',
          branches: { yes: 'end_verified', no: 'send_push' },
        },
      },
      {
        id: 'send_push',
        type: 'action',
        config: {
          actionType: 'send_push',
          templateId: 'kyc_reverification_push',
          dynamicData: ['customer_name'],
        },
      },
      { id: 'end_verified', type: 'end', label: 'KYC Re-Verified' },
      { id: 'end_reminded', type: 'end', label: 'Reminders Sent' },
    ],
    emailTemplateId: 'kyc_reverification',
  },
  {
    name: 'Dormant Account Reactivation',
    slug: 'dormant_reactivation',
    description: 'Re-engage customers who haven\'t transacted in 60+ days',
    domainTypes: ['fintech'],
    triggerConfig: {
      event: 'transaction_completed',
      audienceFilter: {
        logic: 'AND',
        rules: [
          { field: 'days_since_last_txn', operator: 'greater_than', value: 60 },
        ],
      },
    },
    // No exitConfig — the condition node at 'check_active' handles re-engagement.
    // (Cannot use transaction_completed as exit event because it is also the trigger —
    // the flow would immediately self-cancel on the same event that started it.)
    nodes: [
      { id: 'trigger', type: 'trigger' },
      { id: 'send_email', type: 'action', config: {
        actionType: 'send_email',
        templateId: 'dormant_reactivation',
        dynamicData: ['customer_name', 'days_inactive', 'last_transaction_date'],
      }},
      { id: 'delay_5d', type: 'delay', config: { value: 5, unit: 'days' } },
      {
        id: 'check_active',
        type: 'condition',
        config: {
          check: 'event_occurred',
          event: 'transaction_completed',
          since: 'trip_start',
          branches: { yes: 'end_reactivated', no: 'send_push' },
        },
      },
      {
        id: 'send_push',
        type: 'action',
        config: {
          actionType: 'send_push',
          templateId: 'dormant_reactivation_push',
          dynamicData: ['customer_name'],
        },
      },
      { id: 'end_reactivated', type: 'end', label: 'Reactivated' },
      { id: 'end_reminded', type: 'end', label: 'Reminders Sent' },
    ],
    emailTemplateId: 'dormant_reactivation',
  },

  // ============ SaaS ============
  {
    name: 'Trial Expiry Nudge',
    slug: 'trial_expiry',
    description: 'Nudge trial users to convert before their trial expires',
    domainTypes: ['saas'],
    triggerConfig: {
      event: 'trial_expiring',
    },
    exitConfig: {
      event: 'subscription_started',
      scope: 'any',
    },
    nodes: [
      { id: 'trigger', type: 'trigger' },
      { id: 'send_email', type: 'action', config: {
        actionType: 'send_email',
        templateId: 'trial_expiry',
        dynamicData: ['customer_name', 'days_remaining', 'plan_name'],
      }},
      { id: 'delay_2d', type: 'delay', config: { value: 2, unit: 'days' } },
      {
        id: 'check_converted',
        type: 'condition',
        config: {
          check: 'event_occurred',
          event: 'subscription_started',
          since: 'trip_start',
          branches: { yes: 'end_converted', no: 'send_final' },
        },
      },
      {
        id: 'send_final',
        type: 'action',
        config: {
          actionType: 'send_email',
          templateId: 'trial_final_reminder',
          dynamicData: ['customer_name'],
        },
      },
      { id: 'end_converted', type: 'end', label: 'Converted' },
      { id: 'end_expired', type: 'end', label: 'Trial Expired' },
    ],
    emailTemplateId: 'trial_expiry',
  },
]
