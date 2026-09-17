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
// The basket itself, not just how big it is. Absent from this registry until now,
// which made it the one thing every real order carries and nothing documented —
// fifteen features are built from it (basket size, quantity, product variety,
// reorder rate, average item price, and the category/brand lookups that join on
// each line's product_id). Each entry is an object:
//   { product_id, product_name, quantity, price }
// `type` is 'string' because this registry describes filterable scalars and has no
// shape for a nested list; the name is what matters — it is what the pipeline reads.
const LINE_ITEMS: EventPropertyDef = { name: 'line_items', label: 'Line Items', type: 'string' }
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
  //: mapped by the ecommerce pack but defined nowhere until now, so a marketer
  //: choosing it in a segment or flow trigger saw "No properties yet".
  product_shared: [
    PRODUCT,
    { name: 'channel', label: 'Channel', type: 'string' },
  ],

  // ─────────── Ecommerce — cart / checkout ───────────
  added_to_cart: [
    PRODUCT,
    { name: 'product_collection', label: 'Collection', type: 'string' },
    { name: 'quantity', label: 'Quantity', type: 'number' },
    { name: 'price', label: 'Price', type: 'number' },
  ],
  //: the counterpart to `added_to_cart`. Named in the past tense to match it and
  //: `added_to_wishlist`; the ecommerce pack carried the imperative `remove_from_cart`,
  //: which is the only name in the codebase written that way.
  removed_from_cart: [
    PRODUCT,
    { name: 'quantity', label: 'Quantity', type: 'number' },
    { name: 'price', label: 'Price', type: 'number' },
  ],
  cart_created: [{ name: 'cart_id', label: 'Cart ID', type: 'string' }, ITEM_COUNT, TOTAL, CURRENCY, LINE_ITEMS],
  cart_updated: [{ name: 'cart_id', label: 'Cart ID', type: 'string' }, ITEM_COUNT, TOTAL, LINE_ITEMS],
  checkout_started: [TOTAL, CURRENCY, ITEM_COUNT],
  coupon_applied: [
    { name: 'code', label: 'Coupon Code', type: 'string' },
    { name: 'type', label: 'Discount Type', type: 'string' },
    { name: 'amount', label: 'Amount', type: 'number' },
  ],

  // ─────────── Ecommerce — orders ───────────
  order_placed: [ORDER_ID, TOTAL, CURRENCY, ITEM_COUNT, LINE_ITEMS, { name: 'payment_method', label: 'Payment Method', type: 'string' }],
  order_fulfilled: [ORDER_ID, TOTAL, CURRENCY],
  order_cancelled: [ORDER_ID, TOTAL, LINE_ITEMS, { name: 'reason', label: 'Reason', type: 'string' }],
  order_refunded: [ORDER_ID, { name: 'amount', label: 'Refund Amount', type: 'number' }, CURRENCY, { name: 'reason', label: 'Reason', type: 'string' }],
  order_returned: [ORDER_ID, { name: 'amount', label: 'Return Value', type: 'number' }, { name: 'reason', label: 'Reason', type: 'string' }],
  payment_failed: [ORDER_ID, { name: 'amount', label: 'Amount', type: 'number' }, CURRENCY, { name: 'reason', label: 'Reason', type: 'string' }],

  // ─────────── Subscriptions (ecommerce + saas) ───────────
  // `subscription_id` identifies the TRANSACTION and was missing from all three. The
  // pipeline discards any purchase without an id, so a SaaS project sending only
  // `plan` and `total` lost every subscription it ever reported — and `plan` cannot
  // stand in, since it names the tier, not the sale: two customers on `pro` are one
  // row after deduplication.
  subscription_started: [{ name: 'subscription_id', label: 'Subscription ID', type: 'string' }, { name: 'plan', label: 'Plan', type: 'string' }, TOTAL, CURRENCY, { name: 'interval', label: 'Billing Interval', type: 'string' }],
  subscription_renewed: [{ name: 'subscription_id', label: 'Subscription ID', type: 'string' }, { name: 'plan', label: 'Plan', type: 'string' }, TOTAL, CURRENCY],
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
  // Pre-application and application-funnel events. Mapped by the NBFC pack — a
  // lender's browse, unfinished-intent and friction signals — but undefined here
  // until now, so an integrator had no spec for them and a marketer could not filter
  // on them.
  //
  // `emi_missed` was left out earlier as a duplicate of `emi_overdue`. It is not one:
  // overdue means the instalment is late and may still arrive, missed means the cycle
  // closed without payment. Lenders distinguish them and EVENT_SPEC already told
  // clients they could send it, so leaving it undefined meant we accepted an event
  // whose properties no marketer could filter on. `emi_overdue` stays the event the
  // default-risk goal targets; this one is recognised alongside it.
  //
  // `app_login` was already defined above with the rest of the banking events; it is
  // now MAPPED by the NBFC pack, which it was not. It is the plainest engagement
  // signal a lender has and the one the dormancy goal reads best — a borrower on
  // auto-debit transacts rarely but opens the app, so without it "went quiet" is
  // measured on far less evidence.
  loan_page_viewed: [{ name: 'product_type', label: 'Product Type', type: 'string' }, { name: 'amount', label: 'Amount Viewed', type: 'number' }],
  pre_approved_viewed: [{ name: 'amount', label: 'Pre-approved Amount', type: 'number' }, { name: 'product_type', label: 'Product Type', type: 'string' }],
  emi_calculator_used: [{ name: 'amount', label: 'Amount', type: 'number' }, { name: 'tenure_months', label: 'Tenure (months)', type: 'number' }, { name: 'product_type', label: 'Product Type', type: 'string' }],
  loan_application_started: [{ name: 'application_id', label: 'Application ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'tenure_months', label: 'Tenure (months)', type: 'number' }, { name: 'product_type', label: 'Product Type', type: 'string' }],
  documents_uploaded: [{ name: 'application_id', label: 'Application ID', type: 'string' }, { name: 'document_type', label: 'Document Type', type: 'string' }],
  top_up_inquiry: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }],
  loan_pre_closed: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Settlement Amount', type: 'number' }, { name: 'reason', label: 'Reason', type: 'string' }],
  loan_applied: [{ name: 'application_id', label: 'Application ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'tenure_months', label: 'Tenure (months)', type: 'number' }, { name: 'product_type', label: 'Product Type', type: 'string' }],
  loan_approved: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'tenure_months', label: 'Tenure (months)', type: 'number' }],
  loan_rejected: [{ name: 'application_id', label: 'Application ID', type: 'string' }, { name: 'reason', label: 'Reason', type: 'string' }],
  // `tenure_months` is what the onboarding guide's fintech sample already tells a
  // lender to send here, and it is the denominator for how far through a loan a
  // borrower is. It was defined on loan_applied and loan_approved but not on the
  // disbursement itself.
  loan_disbursed: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, CURRENCY, { name: 'tenure_months', label: 'Tenure (months)', type: 'number' }],
  loan_closed: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'reason', label: 'Reason', type: 'string' }],
  emi_paid: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, CURRENCY],
  emi_overdue: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'days_overdue', label: 'Days Overdue', type: 'number' }],
  emi_missed: [{ name: 'loan_id', label: 'Loan ID', type: 'string' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'due_date', label: 'Due Date', type: 'string' }],
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
  //: mapped by the SaaS pack and defined nowhere, so eight of its ten events showed
  //: "No properties yet" in the segment and flow builders. `trial_expiring` above is
  //: the WARNING ahead of the date; `trial_expired` is the fact, and the pack's
  //: Trial Expiration Risk goal is built on it — they are different moments and both
  //: are kept.
  pricing_page_viewed: [{ name: 'plan', label: 'Plan Viewed', type: 'string' }],
  plan_compared: [{ name: 'plans', label: 'Plans Compared', type: 'string' }],
  trial_started: [{ name: 'plan', label: 'Plan', type: 'string' }, { name: 'days_remaining', label: 'Trial Length (days)', type: 'number' }],
  trial_expired: [{ name: 'plan', label: 'Plan', type: 'string' }],
  subscription_upgraded: [{ name: 'subscription_id', label: 'Subscription ID', type: 'string' }, { name: 'plan', label: 'New Plan', type: 'string' }, { name: 'previous_plan', label: 'Previous Plan', type: 'string' }, TOTAL, CURRENCY],
  api_key_created: [{ name: 'key_name', label: 'Key Name', type: 'string' }, { name: 'scope', label: 'Scope', type: 'string' }],

  // ─────────── EdTech ───────────
  //
  // None of these existed until now, so every event a course platform sends showed
  // "No properties yet" in the segment and flow builders — the whole vertical had a
  // dictionary of zero. `certificate_issued` is the name in EDTECH_EVENTS; the pack
  // had drifted to `certificate_earned`, which appeared nowhere else.
  //
  // `enrollment_refunded` is new and is the vertical's real cancellation. The pack
  // used `course_dropped` for that, which is a different thing: dropping a course is
  // the learner giving up, not the money coming back. Treating it as a cancellation
  // asks the cleaner to reverse revenue that was never returned, and it collides with
  // the Completion Risk goal, which is built on exactly that event.
  course_viewed: [{ name: 'course_id', label: 'Course ID', type: 'string' }, { name: 'category', label: 'Category', type: 'string' }, { name: 'price', label: 'Price', type: 'number' }],
  course_preview_watched: [{ name: 'course_id', label: 'Course ID', type: 'string' }, { name: 'duration_s', label: 'Seconds Watched', type: 'number' }],
  course_added_to_list: [{ name: 'course_id', label: 'Course ID', type: 'string' }],
  course_enrolled: [{ name: 'enrollment_id', label: 'Enrollment ID', type: 'string' }, { name: 'course_id', label: 'Course ID', type: 'string' }, { name: 'price', label: 'Price', type: 'number' }, CURRENCY],
  enrollment_refunded: [{ name: 'enrollment_id', label: 'Enrollment ID', type: 'string' }, { name: 'price', label: 'Amount Refunded', type: 'number' }, { name: 'reason', label: 'Reason', type: 'string' }],
  lesson_started: [{ name: 'course_id', label: 'Course ID', type: 'string' }, { name: 'lesson_id', label: 'Lesson ID', type: 'string' }],
  lesson_completed: [{ name: 'course_id', label: 'Course ID', type: 'string' }, { name: 'lesson_id', label: 'Lesson ID', type: 'string' }],
  quiz_attempted: [{ name: 'course_id', label: 'Course ID', type: 'string' }, { name: 'score', label: 'Score', type: 'number' }],
  course_completed: [{ name: 'course_id', label: 'Course ID', type: 'string' }],
  certificate_issued: [{ name: 'course_id', label: 'Course ID', type: 'string' }, { name: 'certificate_id', label: 'Certificate ID', type: 'string' }],
  course_dropped: [{ name: 'course_id', label: 'Course ID', type: 'string' }, { name: 'reason', label: 'Reason', type: 'string' }],

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
