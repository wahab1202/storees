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
  product_viewed: [
    { name: 'product_id', label: 'Product', type: 'string', picker: 'product', placeholder: 'product id' },
    { name: 'product_collection', label: 'Collection', type: 'string', placeholder: 'collection slug or name' },
    { name: 'product_type', label: 'Product Type', type: 'string' },
  ],
  added_to_cart: [
    { name: 'product_id', label: 'Product', type: 'string', picker: 'product' },
    { name: 'product_collection', label: 'Collection', type: 'string' },
    { name: 'quantity', label: 'Quantity', type: 'number' },
  ],
  collection_viewed: [
    { name: 'collection_id', label: 'Collection', type: 'string', picker: 'collection' },
    { name: 'collection_name', label: 'Collection Name', type: 'string' },
  ],
  enters_segment: [
    { name: 'segment_id', label: 'Segment', type: 'string', picker: 'segment' },
  ],
  exits_segment: [
    { name: 'segment_id', label: 'Segment', type: 'string', picker: 'segment' },
  ],
  order_placed: [
    { name: 'currency', label: 'Currency', type: 'string', placeholder: 'INR / USD' },
    { name: 'total', label: 'Order Total', type: 'number' },
  ],
}

/** Look up properties for an event (returns [] for unknown events). */
export function getEventProperties(event: string | undefined | null): EventPropertyDef[] {
  if (!event) return []
  return EVENT_PROPERTIES[event] ?? []
}
