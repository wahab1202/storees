export const STANDARD_EVENTS = {
  // Shopify webhook-sourced
  CART_CREATED: 'cart_created',
  CART_UPDATED: 'cart_updated',
  CHECKOUT_STARTED: 'checkout_started',
  ORDER_PLACED: 'order_placed',
  ORDER_FULFILLED: 'order_fulfilled',
  ORDER_CANCELLED: 'order_cancelled',
  CUSTOMER_CREATED: 'customer_created',
  CUSTOMER_UPDATED: 'customer_updated',

  // Storefront / SDK-sourced product events
  PRODUCT_VIEWED: 'product_viewed',
  ADDED_TO_CART: 'added_to_cart',
  ADDED_TO_WISHLIST: 'added_to_wishlist',
  COLLECTION_VIEWED: 'collection_viewed',

  // Segment engine-sourced
  ENTERS_SEGMENT: 'enters_segment',
  EXITS_SEGMENT: 'exits_segment',
} as const

export const FINTECH_EVENTS = {
  TRANSACTION_COMPLETED: 'transaction_completed',
  APP_LOGIN: 'app_login',
  BILL_PAYMENT_COMPLETED: 'bill_payment_completed',
  KYC_VERIFIED: 'kyc_verified',
  KYC_EXPIRED: 'kyc_expired',
  LOAN_DISBURSED: 'loan_disbursed',
  EMI_PAID: 'emi_paid',
  EMI_OVERDUE: 'emi_overdue',
  SIP_STARTED: 'sip_started',
  SIP_EXECUTED: 'sip_executed',
  CARD_ACTIVATED: 'card_activated',
  ENTERS_SEGMENT: 'enters_segment',
  EXITS_SEGMENT: 'exits_segment',
} as const

export const SAAS_EVENTS = {
  FEATURE_USED: 'feature_used',
  TRIAL_EXPIRING: 'trial_expiring',
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  USER_SIGNUP: 'user_signup',
  USER_INVITED: 'user_invited',
  ENTERS_SEGMENT: 'enters_segment',
  EXITS_SEGMENT: 'exits_segment',
} as const

export const SEGMENT_TEMPLATES = [
  'champion_customers',
  'loyal_customers',
  'discount_shoppers',
  'window_shoppers',
] as const

// 'researchers' removed from Phase 1 — depends on product_views_count
// which requires storefront SDK (Phase 2)

export const SDK_EVENTS = {
  PAGE_VIEWED: 'page_viewed',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',
  ELEMENT_CLICKED: 'element_clicked',
  SCROLL_DEPTH_REACHED: 'scroll_depth_reached',
  CUSTOMER_IDENTIFIED: 'customer_identified',
  USER_PROPERTIES_UPDATED: 'user_properties_updated',
} as const

/** All recognized events grouped by domain — used for validation and metrics routing */
export const EVENTS_BY_DOMAIN = {
  ecommerce: Object.values(STANDARD_EVENTS),
  fintech: Object.values(FINTECH_EVENTS),
  saas: Object.values(SAAS_EVENTS),
  sdk: Object.values(SDK_EVENTS),
} as const

export const SHOPIFY_API_VERSION = '2024-01' as const

export const SHOPIFY_API_DELAY_MS = 500 as const

export const SHOPIFY_WEBHOOK_TOPICS = [
  'customers/create',
  'customers/update',
  'orders/create',
  'orders/fulfilled',
  'orders/cancelled',
  'checkouts/create',
  'carts/create',
] as const

export const FLOW_NODE_TYPES = [
  'trigger',
  'delay',
  'condition',
  'action',
  'end',
] as const

export const FLOW_STATUSES = ['draft', 'active', 'paused'] as const

export const ORDER_STATUSES = ['pending', 'fulfilled', 'cancelled', 'refunded'] as const

export const TRIP_STATUSES = ['active', 'waiting', 'completed', 'exited'] as const

export const DEFAULT_PAGE_SIZE = 25 as const

export const MAX_PAGE_SIZE = 100 as const
