import { db } from '../db/connection.js'
import { flows } from '../db/schema.js'
import type { FlowNode } from '@storees/shared'

/**
 * Pre-built flow templates installable via wizard (Phase F2a-5).
 *
 * Each template returns the trigger + nodes JSON for a `flows` row. Created
 * in `draft` status so the merchant can review + activate. The merchant
 * customises the template id (welcome message body, offer code, delay) before
 * activating.
 *
 * Templates are intentionally minimal: 2-3 nodes that demonstrate the
 * mechanic. Merchants extend them after seeing data.
 */

export type FlowTemplateId =
  | 'ctwa_welcome'
  | 'ctwa_browse_abandon_followup'
  | 'widget_optin_welcome'

export type FlowTemplate = {
  id: FlowTemplateId
  name: string
  description: string
  triggerConfig: { event: string; filters: { logic: 'AND' | 'OR'; rules: [] } }
  nodes: FlowNode[]
}

/**
 * "CTWA Welcome" — fires the moment a CTWA-sourced lead's first inbound
 * arrives. Two nodes: trigger + a WhatsApp template send. The send action
 * uses templateId='ctwa_welcome' which the merchant must replace with a
 * real approved template id.
 *
 * Note: the welcome send fires within the 24h Meta customer-service window
 * automatically opened by the user's inbound, so it can use a session
 * (free-form) message technically — but the safer/replicable pattern is to
 * use an approved Utility template anyway. The merchant chooses at template
 * config time.
 */
export const CTWA_WELCOME_TEMPLATE: FlowTemplate = {
  id: 'ctwa_welcome',
  name: 'CTWA Welcome',
  description: 'Fires the moment a customer messages from your Click-to-WhatsApp ad. Sends an approved welcome template with a link to your catalog.',
  triggerConfig: {
    event: 'ctwa_lead_received',
    filters: { logic: 'AND', rules: [] },
  },
  nodes: [
    {
      id: 'trigger',
      type: 'trigger',
      config: {
        event: 'ctwa_lead_received',
        filters: { logic: 'AND', rules: [] },
      },
    },
    {
      id: 'send_welcome',
      type: 'action',
      config: {
        actionType: 'send_whatsapp',
        templateId: 'ctwa_welcome', // merchant replaces with real approved template
      },
    },
    { id: 'end', type: 'end', label: 'Welcome sent' },
  ],
}

/**
 * "CTWA Browse-Abandon Follow-up" — fires from the same ctwa_lead_received,
 * waits 24h, then checks if the customer has placed an order; if not, sends
 * a Marketing template with an offer code. Demonstrates the full
 * lead → conversation → conversion-attempt loop.
 */
export const CTWA_BROWSE_ABANDON_TEMPLATE: FlowTemplate = {
  id: 'ctwa_browse_abandon_followup',
  name: 'CTWA Browse-Abandon Follow-up',
  description: 'Fires 24h after a CTWA lead arrives. Sends an offer if the customer hasn\'t placed an order yet.',
  triggerConfig: {
    event: 'ctwa_lead_received',
    filters: { logic: 'AND', rules: [] },
  },
  nodes: [
    {
      id: 'trigger',
      type: 'trigger',
      config: {
        event: 'ctwa_lead_received',
        filters: { logic: 'AND', rules: [] },
      },
    },
    {
      id: 'wait_24h',
      type: 'delay',
      config: { value: 24, unit: 'hours' },
    },
    {
      id: 'check_purchased',
      type: 'condition',
      config: {
        check: 'event_occurred',
        event: 'order_placed',
        since: 'trip_start',
        branches: { yes: 'end_purchased', no: 'send_offer' },
      },
    },
    {
      id: 'send_offer',
      type: 'action',
      config: {
        actionType: 'send_whatsapp',
        templateId: 'ctwa_browse_abandon_offer', // merchant replaces with real approved Marketing template
      },
    },
    { id: 'end_offer_sent', type: 'end', label: 'Offer sent' },
    { id: 'end_purchased', type: 'end', label: 'Already purchased — exited' },
  ],
}

/**
 * "Widget Opt-in Welcome" — fires when an on-site widget submission lands.
 * Trigger: optin_received event (emitted by POST /v1/optin). Sends an
 * approved welcome template to the new contact. Mirrors the CTWA welcome
 * structure so flows behave consistently regardless of acquisition source.
 */
export const WIDGET_OPTIN_WELCOME_TEMPLATE: FlowTemplate = {
  id: 'widget_optin_welcome',
  name: 'Widget Opt-in Welcome',
  description: 'Fires when a customer submits an on-site opt-in widget. Sends an approved welcome template within seconds.',
  triggerConfig: {
    event: 'optin_received',
    filters: { logic: 'AND', rules: [] },
  },
  nodes: [
    {
      id: 'trigger',
      type: 'trigger',
      config: {
        event: 'optin_received',
        filters: { logic: 'AND', rules: [] },
      },
    },
    {
      id: 'send_welcome',
      type: 'action',
      config: {
        actionType: 'send_whatsapp',
        templateId: 'widget_welcome', // merchant replaces with real approved template
      },
    },
    { id: 'end', type: 'end', label: 'Welcome sent' },
  ],
}

const ALL_TEMPLATES: Record<FlowTemplateId, FlowTemplate> = {
  ctwa_welcome: CTWA_WELCOME_TEMPLATE,
  ctwa_browse_abandon_followup: CTWA_BROWSE_ABANDON_TEMPLATE,
  widget_optin_welcome: WIDGET_OPTIN_WELCOME_TEMPLATE,
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(ALL_TEMPLATES)
}

/**
 * Install a flow template into a project. Inserts a draft flow row and
 * returns the new flow id. Caller (route or wizard) is responsible for
 * directing the admin to the flow editor to fill in the template id.
 */
export async function installFlowTemplate(
  projectId: string,
  templateId: FlowTemplateId,
): Promise<{ flowId: string; name: string }> {
  const tmpl = ALL_TEMPLATES[templateId]
  if (!tmpl) throw new Error(`Unknown flow template: ${templateId}`)

  const [created] = await db.insert(flows).values({
    projectId,
    name: tmpl.name,
    description: tmpl.description,
    triggerConfig: tmpl.triggerConfig,
    nodes: tmpl.nodes,
    status: 'draft',
  }).returning({ id: flows.id, name: flows.name })

  return { flowId: created.id, name: created.name }
}
