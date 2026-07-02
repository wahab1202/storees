/**
 * Per-event property registry — drives the param-filter UI in the Flow
 * Builder (and anywhere event-property filters appear). Without an entry an
 * event's filter dropdown shows "No properties yet" until a property is observed
 * in real data, so a marketer can't narrow the trigger.
 *
 * Coverage goal: EVERY event in STANDARD_EVENTS / FINTECH_EVENTS / SAAS_EVENTS /
 * SDK_EVENTS (constants.ts) has an entry here. Keys MUST match the event names in
 * constants.ts exactly. Property `name`s must match the keys the connector/SDK
 * writes to events.properties JSON.
 */

export type EventPropertyDef = {
  /** Key on events.properties JSON. Must match what the connector/SDK emits. */
  name: string
  /** Human label shown above the input. */
  label: string
  /** Drives input type and how the saved filter value is coerced. */
  type: 'string' | 'number' | 'boolean'
  /** Render a richer picker instead of a plain input. */
  picker?: 'segment' | 'product' | 'collection'
  placeholder?: string
}

// Reused property fragments.
const CURRENCY: EventPropertyDef = { name: 'currency', label: 'Currency', type: 'string', placeholder: 'INR / USD' }
const ORDER_ID: EventPropertyDef = { name: 'order_id', label: 'Order ID', type: 'string' }
const TOTAL: EventPropertyDef = { name: 'total', label: 'Total', type: 'number' }
const ITEM_COUNT: EventPropertyDef = { name: 'item_count', label: 'Item Count', type: 'number' }
const PRODUCT: EventPropertyDef = { name: 'product_id', label: 'Product', type: 'string', picker: 'product' }
const SEGMENT: EventPropertyDef = { name: 'segment_id', label: 'Segment', type: 'string', picker: 'segment' }

export const EVENT_PROPERTIES: Record<string, EventPropertyDef[]> = {
  // ─────────── Ecommerce — browse (SDK/pixel) ───────────
  product_viewed: [
    { ...PRODUCT, placeholder: 'product id' },
    { name: 'product_collection', label: 'Collection', type: 'string', placeholder: 'collection slug or name' },
    { name: 'product_type', label: 'Product Type', type: 'string' },
    { name: 'vendor', label: 'Vendor / Brand', type: 'string' },
    { name: 'price', label: 'Price', type: 'number' },
  ],
  collection_viewed: [
    { name: 'collection_id', label: 'Collection', type: 'string', picker: 'collection' },
    { name: 'collection_name', label: 'Collection Name', type: 'string' },
  ],
  search_performed: [
    { name: 'query', label: 'Search Query', type: 'string' },
    { name: 'results_count', label: 'Results Count', type: 'number' },
  ],
  added_to_wishlist: [PRODUCT, { name: 'price', label: 'Price', type: 'number' }],
  review_submitted: [
    PRODUCT,
    { name: 'rating', label: 'Rating', type: 'number' },
    { name: 'comment', label: 'Comment', type: 'string' },
  ],

  // ─────────── Ecommerce — cart / checkout ───────────
  added_to_cart: [
    PRODUCT,
    { name: 'product_collection', label: 'Collection', type: 'string' },
    { name: 'quantity', label: 'Quantity', type: 'number' },
    { name: 'price', label: 'Price', type: 'number' },
  ],
  cart_created: [{ name: 'cart_id', label: 'Cart ID', type: 'string' }, ITEM_COUNT, TOTAL, CURRENCY],
  cart_updated: [{ name: 'cart_id', label: 'Cart ID', type: 'string' }, ITEM_COUNT, TOTAL],
  checkout_started: [TOTAL, CURRENCY, ITEM_COUNT],
  coupon_applied: [
    { name: 'code', label: 'Coupon Code', type: 'string' },
    { name: 'type', label: 'Discount Type', type: 'string' },
    { name: 'amount', label: 'Amount', type: 'number' },
  ],

  // ─────────── Ecommerce — orders ───────────
  order_placed: [ORDER_ID, TOTAL, CURRENCY, ITEM_COUNT, { name: 'payment_method', label: 'Payment Method', type: 'string' }],
  order_fulfilled: [ORDER_ID, TOTAL, CURRENCY],
  order_cancelled: [ORDER_ID, TOTAL, { name: 'reason', label: 'Reason', type: 'string' }],
  order_refunded: [ORDER_ID, { name: 'amount', label: 'Refund Amount', type: 'number' }, CURRENCY, { name: 'reason', label: 'Reason', type: 'string' }],
  order_returned: [ORDER_ID, { name: 'amount', label: 'Return Value', type: 'number' }, { name: 'reason', label: 'Reason', type: 'string' }],
  payment_failed: [ORDER_ID, { name: 'amount', label: 'Amount', type: 'number' }, CURRENCY, { name: 'reason', label: 'Reason', type: 'string' }],

  // ─────────── Subscriptions (ecommerce + saas) ───────────
  subscription_started: [{ name: 'plan', label: 'Plan', type: 'string' }, TOTAL, CURRENCY, { name: 'interval', label: 'Billing Interval', type: 'string' }],
  subscription_renewed: [{ name: 'plan', label: 'Plan', type: 'string' }, TOTAL, CURRENCY],
  subscription_cancelled: [{ name: 'plan', label: 'Plan', type: 'string' }, { name: 'reason', label: 'Reason', type: 'string' }],

  // ─────────── Lifecycle / CRM ───────────
  enters_segment: [SEGMENT],
  exits_segment: [SEGMENT],
  customer_created: [{ name: 'email', label: 'Email', type: 'string' }, { name: 'phone', label: 'Phone', type: 'string' }],
  customer_updated: [{ name: 'email', label: 'Email', type: 'string' }, { name: 'phone', label: 'Phone', type: 'string' }],

  // ─────────── WhatsApp / CTWA / opt-in ───────────
  whatsapp_inbound: [{ name: 'message', label: 'Message', type: 'string' }, { name: 'phone', label: 'Phone', type: 'string' }],
  ctwa_lead_received: [{ name: 'ad_id', label: 'Ad ID', type: 'string' }, { name: 'campaign_id', label: 'Campaign ID', type: 'string' }, { name: 'phone', label: 'Phone', type: 'string' }],
  optin_received: [{ name: 'channel', label: 'Channel', type: 'string' }, { name: 'source', label: 'Source', type: 'string' }, { name: 'widget_id', label: 'Widget ID', type: 'string' }],

  // ─────────── SDK / on-site ───────────
  page_viewed: [{ name: 'url', label: 'URL', type: 'string' }, { name: 'page_type', label: 'Page Type', type: 'string' }, { name: 'referrer', label: 'Referrer', type: 'string' }],
  session_started: [{ name: 'referrer', label: 'Referrer', type: 'string' }, { name: 'landing_page', label: 'Landing Page', type: 'string' }, { name: 'utm_source', label: 'UTM Source', type: 'string' }, { name: 'utm_campaign', label: 'UTM Campaign', type: 'string' }],
  session_ended: [{ name: 'duration_ms', label: 'Duration (ms)', type: 'number' }, { name: 'page_count', label: 'Pages Viewed', type: 'number' }],
  element_clicked: [{ name: 'text', label: 'Text', type: 'string' }, { name: 'tag', label: 'Tag', type: 'string' }, { name: 'href', label: 'Link URL', type: 'string' }, { name: 'id', label: 'Element ID', type: 'string' }],
  scroll_depth_reached: [{ name: 'threshold', label: 'Depth %', type: 'number' }, { name: 'page_url', label: 'Page URL', type: 'string' }],
  customer_identified: [{ name: 'user_id', label: 'User ID', type: 'string' }, { name: 'email', label: 'Email', type: 'string' }, { name: 'previous_anonymous_id', label: 'Previous Anonymous ID', type: 'string' }],
  user_properties_updated: [{ name: 'email', label: 'Email', type: 'string' }, { name: 'phone', label: 'Phone', type: 'string' }, { name: 'name', label: 'Name', type: 'string' }],

  // ─────────── Fintech ───────────
  transaction_completed: [{ name: 'amount', label: 'Amount', type: 'number' }, CURRENCY, { name: 'txn_type', label: 'Transaction Type', type: 'string' }, { name: 'status', label: 'Status', type: 'string' }],
  app_login: [{ name: 'method', label: 'Method', type: 'string' }, { name: 'device', label: 'Device', type: 'string' }],
  bill_payment_completed: [{ name: 'amount', label: 'Amount', type: 'number' }, { name: 'biller', label: 'Biller', type: 'string' }, CURRENCY],
  kyc_verified: [{ name: 'method', label: 'Method', type: 'string' }, { name: 'status', label: 'Status', type: 'string' }],
  kyc_expired: [{ name: 'method', label: 'Method', type: 'string' }],
  loan_applied: [{ name: 'application_id', label: 'Application ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'tenure_months', label: 'Tenure (months)', type: 'number' }, { name: 'product_type', label: 'Product Type', type: 'string' }],
  loan_approved: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'tenure_months', label: 'Tenure (months)', type: 'number' }],
  loan_rejected: [{ name: 'application_id', label: 'Application ID', type: 'string' }, { name: 'reason', label: 'Reason', type: 'string' }],
  loan_disbursed: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, CURRENCY],
  loan_closed: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'reason', label: 'Reason', type: 'string' }],
  emi_paid: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, CURRENCY],
  emi_overdue: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'days_overdue', label: 'Days Overdue', type: 'number' }],
  policy_quoted: [{ name: 'quote_id', label: 'Quote ID', type: 'string' }, { name: 'premium', label: 'Premium', type: 'number' }, { name: 'policy_type', label: 'Policy Type', type: 'string' }],
  policy_bound: [{ name: 'policy_id', label: 'Policy ID', type: 'string' }, { name: 'premium', label: 'Premium', type: 'number' }, { name: 'policy_type', label: 'Policy Type', type: 'string' }],
  premium_paid: [{ name: 'policy_id', label: 'Policy ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, CURRENCY],
  claim_filed: [{ name: 'claim_id', label: 'Claim ID', type: 'string' }, { name: 'policy_id', label: 'Policy ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }],
  claim_settled: [{ name: 'claim_id', label: 'Claim ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, CURRENCY],
  sip_started: [{ name: 'sip_id', label: 'SIP ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'frequency', label: 'Frequency', type: 'string' }],
  sip_executed: [{ name: 'sip_id', label: 'SIP ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }],
  card_activated: [{ name: 'card_id', label: 'Card ID', type: 'string' }, { name: 'card_type', label: 'Card Type', type: 'string' }],

  // ─────────── SaaS ───────────
  feature_used: [{ name: 'feature', label: 'Feature', type: 'string' }, { name: 'plan', label: 'Plan', type: 'string' }],
  trial_expiring: [{ name: 'days_remaining', label: 'Days Remaining', type: 'number' }, { name: 'plan', label: 'Plan', type: 'string' }],
  user_signup: [{ name: 'source', label: 'Source', type: 'string' }, { name: 'plan', label: 'Plan', type: 'string' }],
  user_invited: [{ name: 'inviter_id', label: 'Inviter ID', type: 'string' }, { name: 'role', label: 'Role', type: 'string' }],

  // ─────────── Pixel aliases (emitted by the Customer Events pixel, distinct
  // from the STANDARD_EVENTS names above — kept so they resolve too) ───────────
  discount_applied: [{ name: 'code', label: 'Code', type: 'string' }, { name: 'type', label: 'Type', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }],
  product_searched: [{ name: 'query', label: 'Search Query', type: 'string' }],
  checkout_completed: [ORDER_ID, TOTAL, CURRENCY],
  checkout_payment_info: [TOTAL, CURRENCY],
}

/** Look up properties for an event (returns [] for unknown events). */
export function getEventProperties(event: string | undefined | null): EventPropertyDef[] {
  if (!event) return []
  return EVENT_PROPERTIES[event] ?? []
}
