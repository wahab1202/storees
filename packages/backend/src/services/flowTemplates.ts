import { db } from '../db/connection.js'
import { flows } from '../db/schema.js'
import type {
  FlowNode, TriggerNode, DelayNode, ConditionNode, ActionNode, EndNode,
} from '@storees/shared'

/**
 * Pre-built journey templates installable via wizard, mapped per industry.
 *
 * Each returns the trigger + nodes JSON for a `flows` row, created in `draft`
 * status so the merchant reviews + activates. Templates use REAL event names
 * (see packages/shared constants) so the trigger fires; the send actions carry
 * a placeholder templateId + templateName the merchant swaps for an approved
 * channel template before activating.
 *
 * Templates are intentionally 2-5 nodes — they demonstrate the mechanic and
 * are extended after the merchant sees data.
 */

export type TemplateIndustry = 'ecommerce' | 'nbfc' | 'saas' | 'edtech' | 'general'

export type FlowTemplateId = string

export type FlowTemplate = {
  id: FlowTemplateId
  industry: TemplateIndustry
  name: string
  description: string
  triggerConfig: { event: string; filters: { logic: 'AND' | 'OR'; rules: [] } }
  nodes: FlowNode[]
}

type Channel = ActionNode['config']['actionType']

/* ── Node builders (keep templates concise + valid) ── */
const trig = (event: string): TriggerNode => ({ id: 'trigger', type: 'trigger', config: { event, filters: { logic: 'AND', rules: [] } } })
const wait = (id: string, value: number, unit: DelayNode['config']['unit']): DelayNode => ({ id, type: 'delay', config: { value, unit } })
const didEvent = (id: string, event: string, yes: string, no: string): ConditionNode =>
  ({ id, type: 'condition', config: { check: 'event_occurred', event, since: 'trip_start', branches: { yes, no } } })
const send = (id: string, channel: Channel, templateId: string, templateName: string): ActionNode =>
  ({ id, type: 'action', config: { actionType: channel, templateId, templateName } })
const stop = (id: string, label: string): EndNode => ({ id, type: 'end', label })

function template(t: {
  id: string
  industry: TemplateIndustry
  name: string
  description: string
  event: string
  nodes: FlowNode[]
}): FlowTemplate {
  return {
    id: t.id,
    industry: t.industry,
    name: t.name,
    description: t.description,
    triggerConfig: { event: t.event, filters: { logic: 'AND', rules: [] } },
    nodes: [trig(t.event), ...t.nodes],
  }
}

/* ══════════ GENERAL (acquisition-source, industry-agnostic) ══════════ */

const GENERAL: FlowTemplate[] = [
  template({
    id: 'ctwa_welcome', industry: 'general', name: 'CTWA Welcome', event: 'ctwa_lead_received',
    description: 'Fires the moment a customer messages from your Click-to-WhatsApp ad. Sends an approved welcome template with a link to your catalog.',
    nodes: [send('send_welcome', 'send_whatsapp', 'ctwa_welcome', 'CTWA Welcome'), stop('end', 'Welcome sent')],
  }),
  template({
    id: 'ctwa_browse_abandon_followup', industry: 'general', name: 'CTWA Browse-Abandon Follow-up', event: 'ctwa_lead_received',
    description: 'Fires 24h after a CTWA lead arrives. Sends an offer if the customer has not placed an order yet.',
    nodes: [
      wait('wait_24h', 24, 'hours'),
      didEvent('check_purchased', 'order_placed', 'end_purchased', 'send_offer'),
      send('send_offer', 'send_whatsapp', 'ctwa_browse_abandon_offer', 'CTWA Offer'),
      stop('end_offer_sent', 'Offer sent'), stop('end_purchased', 'Already purchased — exited'),
    ],
  }),
  template({
    id: 'widget_optin_welcome', industry: 'general', name: 'Widget Opt-in Welcome', event: 'optin_received',
    description: 'Fires when a customer submits an on-site opt-in widget. Sends an approved welcome template within seconds.',
    nodes: [send('send_welcome', 'send_whatsapp', 'widget_welcome', 'Widget Welcome'), stop('end', 'Welcome sent')],
  }),
]

/* ══════════ ECOMMERCE ══════════ */

const ECOMMERCE: FlowTemplate[] = [
  template({
    id: 'ecom_welcome_series', industry: 'ecommerce', name: 'Welcome Series', event: 'customer_created',
    description: 'Greets a new customer, then follows up 2 days later with your bestsellers.',
    nodes: [
      send('welcome', 'send_email', 'ecom_welcome', 'Welcome Email'),
      wait('wait_2d', 2, 'days'),
      send('bestsellers', 'send_whatsapp', 'ecom_bestsellers', 'Bestsellers Nudge'),
      stop('end', 'Series complete'),
    ],
  }),
  template({
    id: 'ecom_abandoned_cart', industry: 'ecommerce', name: 'Abandoned Cart Recovery', event: 'checkout_started',
    description: 'Recovers a started-but-unfinished checkout: a 1h reminder, then an offer at 24h if still not purchased.',
    nodes: [
      wait('wait_1h', 1, 'hours'),
      didEvent('check_1', 'order_placed', 'end_purchased', 'reminder'),
      send('reminder', 'send_whatsapp', 'ecom_cart_reminder', 'Cart Reminder'),
      wait('wait_23h', 23, 'hours'),
      didEvent('check_2', 'order_placed', 'end_purchased', 'offer'),
      send('offer', 'send_email', 'ecom_cart_offer', 'Cart Offer'),
      stop('end_offer', 'Offer sent'), stop('end_purchased', 'Recovered — exited'),
    ],
  }),
  template({
    id: 'ecom_browse_abandon', industry: 'ecommerce', name: 'Browse Abandonment', event: 'product_viewed',
    description: 'Nudges a shopper who viewed a product but did not buy within 4 hours.',
    nodes: [
      wait('wait_4h', 4, 'hours'),
      didEvent('check', 'order_placed', 'end_purchased', 'nudge'),
      send('nudge', 'send_whatsapp', 'ecom_browse_nudge', 'Still Thinking?'),
      stop('end_nudge', 'Nudge sent'), stop('end_purchased', 'Purchased — exited'),
    ],
  }),
  template({
    id: 'ecom_post_purchase_review', industry: 'ecommerce', name: 'Post-Purchase & Review', event: 'order_fulfilled',
    description: 'Thanks the customer after delivery and asks for a review 3 days later.',
    nodes: [
      send('thanks', 'send_whatsapp', 'ecom_thankyou', 'Thank You'),
      wait('wait_3d', 3, 'days'),
      send('review', 'send_email', 'ecom_review_request', 'Review Request'),
      stop('end', 'Review requested'),
    ],
  }),
  template({
    id: 'ecom_winback', industry: 'ecommerce', name: 'Win-Back (At-Risk)', event: 'enters_segment',
    description: 'Re-engages a customer who has entered your at-risk / lapsed segment with a comeback offer.',
    nodes: [
      send('miss_you', 'send_email', 'ecom_winback', 'We Miss You'),
      wait('wait_5d', 5, 'days'),
      didEvent('check', 'order_placed', 'end_back', 'final_offer'),
      send('final_offer', 'send_whatsapp', 'ecom_winback_offer', 'Comeback Offer'),
      stop('end_offer', 'Offer sent'), stop('end_back', 'Came back — exited'),
    ],
  }),
  template({
    id: 'ecom_cart_created_nudge', industry: 'ecommerce', name: 'Add-to-Cart Nudge', event: 'added_to_cart',
    description: 'Catches a shopper earlier than checkout: if they add to cart but do not start checkout within 2 hours, nudges them.',
    nodes: [
      wait('wait_2h', 2, 'hours'),
      didEvent('check', 'checkout_started', 'end_checkout', 'nudge'),
      send('nudge', 'send_whatsapp', 'ecom_cart_nudge', 'Your Cart Is Waiting'),
      stop('end_nudge', 'Nudge sent'), stop('end_checkout', 'Reached checkout — exited'),
    ],
  }),
  template({
    id: 'ecom_wishlist_reminder', industry: 'ecommerce', name: 'Wishlist Reminder', event: 'added_to_wishlist',
    description: 'Reminds a shopper about a wishlisted item 2 days later if they have not bought it.',
    nodes: [
      wait('wait_2d', 2, 'days'),
      didEvent('check', 'order_placed', 'end_bought', 'remind'),
      send('remind', 'send_email', 'ecom_wishlist', 'Still On Your Wishlist'),
      stop('end_remind', 'Reminder sent'), stop('end_bought', 'Purchased — exited'),
    ],
  }),
  template({
    id: 'ecom_payment_failed_recovery', industry: 'ecommerce', name: 'Payment-Failed Recovery', event: 'payment_failed',
    description: 'On a failed payment, sends a retry link, then a follow-up 6 hours later if the order still has not gone through.',
    nodes: [
      send('retry', 'send_whatsapp', 'ecom_payment_retry', 'Payment Didn\'t Go Through'),
      wait('wait_6h', 6, 'hours'),
      didEvent('check', 'order_placed', 'end_done', 'followup'),
      send('followup', 'send_email', 'ecom_payment_followup', 'Complete Your Order'),
      stop('end_followup', 'Follow-up sent'), stop('end_done', 'Order placed — exited'),
    ],
  }),
  template({
    id: 'ecom_replenishment', industry: 'ecommerce', name: 'Replenishment Reminder', event: 'order_fulfilled',
    description: 'For consumables — reminds the customer to reorder 30 days after delivery.',
    nodes: [
      wait('wait_30d', 30, 'days'),
      send('reorder', 'send_whatsapp', 'ecom_reorder', 'Time to Restock?'),
      stop('end', 'Reorder reminder sent'),
    ],
  }),
  template({
    id: 'ecom_second_order', industry: 'ecommerce', name: 'Second-Order Push', event: 'order_placed',
    description: 'Turns a one-time buyer into a repeat one: 14 days after an order, nudges a second purchase if none has followed.',
    nodes: [
      wait('wait_14d', 14, 'days'),
      didEvent('check', 'order_placed', 'end_repeat', 'nudge'),
      send('nudge', 'send_email', 'ecom_second_order', 'Ready for Your Next Order?'),
      stop('end_nudge', 'Nudge sent'), stop('end_repeat', 'Reordered — exited'),
    ],
  }),
  template({
    id: 'ecom_vip_reward', industry: 'ecommerce', name: 'VIP Reward', event: 'enters_segment',
    description: 'Rewards a customer who enters your VIP / champion segment with early access or an exclusive perk.',
    nodes: [
      send('reward', 'send_email', 'ecom_vip', 'A Little Something for a VIP'),
      stop('end', 'Reward sent'),
    ],
  }),
  template({
    id: 'ecom_review_thankyou', industry: 'ecommerce', name: 'Review Thank-You + Reorder', event: 'review_submitted',
    description: 'Thanks a customer who left a review and gives them a discount toward their next order.',
    nodes: [
      send('thanks', 'send_whatsapp', 'ecom_review_thanks', 'Thanks for the Review'),
      stop('end', 'Thank-you sent'),
    ],
  }),
  template({
    id: 'ecom_subscription_winback', industry: 'ecommerce', name: 'Subscription Win-Back', event: 'subscription_cancelled',
    description: 'When a subscription is cancelled, acknowledges it and offers a reason to resubscribe a week later.',
    nodes: [
      send('ack', 'send_email', 'ecom_sub_cancel', 'Sorry to See You Cancel'),
      wait('wait_7d', 7, 'days'),
      didEvent('check', 'subscription_started', 'end_resub', 'offer'),
      send('offer', 'send_whatsapp', 'ecom_sub_offer', 'Come Back — Here\'s an Offer'),
      stop('end_offer', 'Offer sent'), stop('end_resub', 'Resubscribed — exited'),
    ],
  }),
]

/* ══════════ NBFC / LENDING (fintech) ══════════ */

const NBFC: FlowTemplate[] = [
  template({
    id: 'nbfc_application_dropoff', industry: 'nbfc', name: 'Application Drop-off', event: 'loan_applied',
    description: 'Fires when a loan application starts; if not disbursed within 24h, nudges the applicant to complete it.',
    nodes: [
      wait('wait_24h', 24, 'hours'),
      didEvent('check', 'loan_disbursed', 'end_done', 'nudge'),
      send('nudge', 'send_whatsapp', 'nbfc_complete_application', 'Complete Application'),
      stop('end_nudge', 'Nudge sent'), stop('end_done', 'Disbursed — exited'),
    ],
  }),
  template({
    id: 'nbfc_kyc_pending', industry: 'nbfc', name: 'KYC Pending Reminder', event: 'loan_approved',
    description: 'After approval, reminds the customer to complete KYC if not verified within 6 hours.',
    nodes: [
      wait('wait_6h', 6, 'hours'),
      didEvent('check', 'kyc_verified', 'end_done', 'remind'),
      send('remind', 'send_whatsapp', 'nbfc_kyc_reminder', 'Complete KYC'),
      stop('end_remind', 'Reminder sent'), stop('end_done', 'KYC done — exited'),
    ],
  }),
  template({
    id: 'nbfc_emi_overdue', industry: 'nbfc', name: 'EMI Overdue Recovery', event: 'emi_overdue',
    description: 'On a missed EMI, sends a reminder, then a firmer follow-up 3 days later if still unpaid.',
    nodes: [
      send('remind', 'send_whatsapp', 'nbfc_emi_reminder', 'EMI Reminder'),
      wait('wait_3d', 3, 'days'),
      didEvent('check', 'emi_paid', 'end_paid', 'followup'),
      send('followup', 'send_sms', 'nbfc_emi_followup', 'EMI Follow-up'),
      stop('end_followup', 'Follow-up sent'), stop('end_paid', 'Paid — exited'),
    ],
  }),
  template({
    id: 'nbfc_disbursal_welcome', industry: 'nbfc', name: 'Disbursal Welcome', event: 'loan_disbursed',
    description: 'Congratulates the customer on disbursal and shares their repayment schedule.',
    nodes: [send('welcome', 'send_whatsapp', 'nbfc_disbursal', 'Disbursal Welcome'), stop('end', 'Welcome sent')],
  }),
  template({
    id: 'nbfc_repeat_loan', industry: 'nbfc', name: 'Repeat Loan Offer', event: 'loan_closed',
    description: 'A week after a loan closes, offers the customer a pre-approved top-up loan.',
    nodes: [
      wait('wait_7d', 7, 'days'),
      send('offer', 'send_whatsapp', 'nbfc_preapproved', 'Pre-Approved Offer'),
      stop('end', 'Offer sent'),
    ],
  }),
]

/* ══════════ SAAS ══════════ */

const SAAS: FlowTemplate[] = [
  template({
    id: 'saas_trial_welcome', industry: 'saas', name: 'Trial Welcome & Activation', event: 'user_signup',
    description: 'Onboards a new sign-up, then nudges activation 1 day later if no feature has been used.',
    nodes: [
      send('welcome', 'send_email', 'saas_welcome', 'Getting Started'),
      wait('wait_1d', 1, 'days'),
      didEvent('check', 'feature_used', 'end_active', 'nudge'),
      send('nudge', 'send_email', 'saas_activation_nudge', 'Activation Nudge'),
      stop('end_nudge', 'Nudge sent'), stop('end_active', 'Activated — exited'),
    ],
  }),
  template({
    id: 'saas_trial_expiring', industry: 'saas', name: 'Trial Expiring → Convert', event: 'trial_expiring',
    description: 'Prompts an upgrade as the trial ends, with a discount offer 2 days later if not yet subscribed.',
    nodes: [
      send('upgrade', 'send_email', 'saas_upgrade', 'Upgrade Now'),
      wait('wait_2d', 2, 'days'),
      didEvent('check', 'subscription_started', 'end_converted', 'discount'),
      send('discount', 'send_email', 'saas_discount', 'Last-Chance Discount'),
      stop('end_discount', 'Discount sent'), stop('end_converted', 'Converted — exited'),
    ],
  }),
  template({
    id: 'saas_onboarding_stall', industry: 'saas', name: 'Onboarding Stall', event: 'user_signup',
    description: 'If a user has not used a core feature 3 days after sign-up, offers help getting started.',
    nodes: [
      wait('wait_3d', 3, 'days'),
      didEvent('check', 'feature_used', 'end_active', 'help'),
      send('help', 'send_email', 'saas_help', 'Need a Hand?'),
      stop('end_help', 'Help sent'), stop('end_active', 'Activated — exited'),
    ],
  }),
  template({
    id: 'saas_churn_winback', industry: 'saas', name: 'Cancellation Win-Back', event: 'subscription_cancelled',
    description: 'Acknowledges a cancellation, then follows up in 14 days with a come-back offer.',
    nodes: [
      send('sorry', 'send_email', 'saas_cancel_ack', 'Sorry to See You Go'),
      wait('wait_14d', 14, 'days'),
      send('comeback', 'send_email', 'saas_comeback', 'Come Back Offer'),
      stop('end', 'Win-back sent'),
    ],
  }),
]

/* ══════════ EDTECH ══════════ */

const EDTECH: FlowTemplate[] = [
  template({
    id: 'edtech_enrollment_welcome', industry: 'edtech', name: 'Enrollment Welcome', event: 'course_enrolled',
    description: 'Welcomes a new learner and points them to their first lesson.',
    nodes: [send('welcome', 'send_email', 'edtech_welcome', 'Enrollment Welcome'), stop('end', 'Welcome sent')],
  }),
  template({
    id: 'edtech_abandoned_enrollment', industry: 'edtech', name: 'Abandoned Enrollment', event: 'course_viewed',
    description: 'A learner viewed a course but did not enroll within 6 hours — nudges them with a start offer.',
    nodes: [
      wait('wait_6h', 6, 'hours'),
      didEvent('check', 'course_enrolled', 'end_enrolled', 'nudge'),
      send('nudge', 'send_whatsapp', 'edtech_start_offer', 'Start Learning'),
      stop('end_nudge', 'Nudge sent'), stop('end_enrolled', 'Enrolled — exited'),
    ],
  }),
  template({
    id: 'edtech_lesson_nudge', industry: 'edtech', name: 'Lesson Continuation', event: 'lesson_started',
    description: 'If a learner starts a lesson but does not complete it within 2 days, nudges them to continue.',
    nodes: [
      wait('wait_2d', 2, 'days'),
      didEvent('check', 'lesson_completed', 'end_done', 'nudge'),
      send('nudge', 'send_whatsapp', 'edtech_continue', 'Continue Your Lesson'),
      stop('end_nudge', 'Nudge sent'), stop('end_done', 'Completed — exited'),
    ],
  }),
  template({
    id: 'edtech_completion_congrats', industry: 'edtech', name: 'Course Completion', event: 'course_completed',
    description: 'Congratulates the learner on finishing a course and recommends the next one.',
    nodes: [send('congrats', 'send_email', 'edtech_congrats', 'Congratulations!'), stop('end', 'Sent')],
  }),
  template({
    id: 'edtech_reengagement', industry: 'edtech', name: 'Inactive Learner Re-engagement', event: 'enters_segment',
    description: 'Re-engages a learner who has entered your inactive segment with a reason to return.',
    nodes: [send('comeback', 'send_email', 'edtech_reengage', 'Pick Up Where You Left Off'), stop('end', 'Sent')],
  }),
]

const ALL: FlowTemplate[] = [...GENERAL, ...ECOMMERCE, ...NBFC, ...SAAS, ...EDTECH]
const ALL_TEMPLATES: Record<string, FlowTemplate> = Object.fromEntries(ALL.map(t => [t.id, t]))

/** List templates, optionally filtered to one industry (plus the general set). */
export function listFlowTemplates(industry?: TemplateIndustry): FlowTemplate[] {
  if (!industry) return ALL
  return ALL.filter(t => t.industry === industry || t.industry === 'general')
}

/**
 * Install a flow template into a project. Inserts a draft flow row and returns
 * the new flow id. Caller directs the admin to the editor to fill in the real
 * channel template ids.
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
