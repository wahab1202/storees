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

  // Segment engine-sourced
  ENTERS_SEGMENT: 'enters_segment',
  EXITS_SEGMENT: 'exits_segment',

  // Phase 2 — require storefront SDK with consent
  // PRODUCT_VIEWED: 'product_viewed',
  // PRODUCT_ADDED_TO_CART: 'product_added_to_cart',
  // REVIEW_SUBMITTED: 'review_submitted',
  // SESSION_START: 'session_start',
  // SESSION_END: 'session_end',
  // PAGE_VIEWED: 'page_viewed',
} as const

export const SEGMENT_TEMPLATES = [
  'champion_customers',
  'loyal_customers',
  'discount_shoppers',
  'window_shoppers',
] as const

// 'researchers' removed from Phase 1 — depends on product_views_count
// which requires storefront SDK (Phase 2)

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
