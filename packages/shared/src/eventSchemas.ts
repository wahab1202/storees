/**
 * Per-event property registry — drives the param-filter UI in the Flow
 * Builder. Without this, the panel has no way to know that product_viewed
 * carries a product_id, or that enters_segment carries a segment_id, so
 * the marketer would have to hand-type field paths.
 *
 * Adding an event: append its EventPropertyDef[] here; the panel renders one
 * input per field and the saver builds a FilterConfig with one `is` rule per
 * filled field (see EventParamsEditor + FlowBuilder save mapping).
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

export const EVENT_PROPERTIES: Record<string, EventPropertyDef[]> = {
  // ---- Browse ----
  product_viewed: [
    { name: 'product_id', label: 'Product', type: 'string', picker: 'product', placeholder: 'product id' },
    { name: 'product_collection', label: 'Collection', type: 'string', placeholder: 'collection slug or name' },
    { name: 'product_type', label: 'Product Type', type: 'string' },
    { name: 'vendor', label: 'Vendor / Brand', type: 'string' },
    { name: 'price', label: 'Price', type: 'number' },
  ],
  collection_viewed: [
    { name: 'collection_id', label: 'Collection', type: 'string', picker: 'collection' },
    { name: 'collection_name', label: 'Collection Name', type: 'string' },
  ],
  product_searched: [
    { name: 'query', label: 'Search Query', type: 'string' },
    { name: 'results_count', label: 'Results Count', type: 'number' },
  ],
  added_to_wishlist: [
    { name: 'product_id', label: 'Product', type: 'string', picker: 'product' },
    { name: 'price', label: 'Price', type: 'number' },
  ],
  page_viewed: [
    { name: 'url', label: 'URL', type: 'string' },
    { name: 'page_type', label: 'Page Type', type: 'string' },
    { name: 'referrer', label: 'Referrer', type: 'string' },
  ],
  session_started: [
    { name: 'referrer', label: 'Referrer', type: 'string' },
    { name: 'landing_page', label: 'Landing Page', type: 'string' },
    { name: 'utm_source', label: 'UTM Source', type: 'string' },
    { name: 'utm_campaign', label: 'UTM Campaign', type: 'string' },
  ],
  // ---- Cart / checkout ----
  added_to_cart: [
    { name: 'product_id', label: 'Product', type: 'string', picker: 'product' },
    { name: 'product_collection', label: 'Collection', type: 'string' },
    { name: 'quantity', label: 'Quantity', type: 'number' },
    { name: 'price', label: 'Price', type: 'number' },
  ],
  cart_created: [
    { name: 'cart_id', label: 'Cart ID', type: 'string' },
    { name: 'item_count', label: 'Item Count', type: 'number' },
    { name: 'total', label: 'Cart Value', type: 'number' },
    { name: 'currency', label: 'Currency', type: 'string', placeholder: 'INR / USD' },
  ],
  cart_updated: [
    { name: 'cart_id', label: 'Cart ID', type: 'string' },
    { name: 'item_count', label: 'Item Count', type: 'number' },
    { name: 'total', label: 'Cart Value', type: 'number' },
  ],
  checkout_started: [
    { name: 'total', label: 'Cart Total', type: 'number' },
    { name: 'currency', label: 'Currency', type: 'string', placeholder: 'INR / USD' },
    { name: 'item_count', label: 'Item Count', type: 'number' },
  ],
  discount_applied: [
    { name: 'code', label: 'Discount Code', type: 'string' },
    { name: 'type', label: 'Discount Type', type: 'string' },
    { name: 'amount', label: 'Amount', type: 'number' },
  ],
  checkout_completed: [
    { name: 'order_id', label: 'Order ID', type: 'string' },
    { name: 'total', label: 'Order Total', type: 'number' },
    { name: 'currency', label: 'Currency', type: 'string' },
  ],
  // ---- Orders ----
  order_placed: [
    { name: 'order_id', label: 'Order ID', type: 'string' },
    { name: 'total', label: 'Order Total', type: 'number' },
    { name: 'currency', label: 'Currency', type: 'string', placeholder: 'INR / USD' },
    { name: 'item_count', label: 'Item Count', type: 'number' },
    { name: 'payment_method', label: 'Payment Method', type: 'string' },
  ],
  order_fulfilled: [
    { name: 'order_id', label: 'Order ID', type: 'string' },
    { name: 'total', label: 'Order Total', type: 'number' },
    { name: 'currency', label: 'Currency', type: 'string' },
  ],
  order_cancelled: [
    { name: 'order_id', label: 'Order ID', type: 'string' },
    { name: 'total', label: 'Order Total', type: 'number' },
    { name: 'reason', label: 'Reason', type: 'string' },
  ],
  // ---- Lifecycle / CRM ----
  enters_segment: [
    { name: 'segment_id', label: 'Segment', type: 'string', picker: 'segment' },
  ],
  exits_segment: [
    { name: 'segment_id', label: 'Segment', type: 'string', picker: 'segment' },
  ],
  customer_created: [
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'phone', label: 'Phone', type: 'string' },
  ],
  customer_updated: [
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'phone', label: 'Phone', type: 'string' },
  ],
}

/** Look up properties for an event (returns [] for unknown events). */
export function getEventProperties(event: string | undefined | null): EventPropertyDef[] {
  if (!event) return []
  return EVENT_PROPERTIES[event] ?? []
}
