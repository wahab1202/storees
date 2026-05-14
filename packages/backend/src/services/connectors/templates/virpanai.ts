import type { ConnectorTemplate } from '../genericHttpConnector.js'

// VirpanAI (GWM-backed stores). The VirpanAI Admin API exposes customer,
// product, and order endpoints in Storees-canonical shape — flat field
// names matching the bulk-import handoff doc (docs/runbooks/
// GWM_BULK_IMPORT_HANDOFF.md). Totals and prices are already in major
// currency units (₹, not paise), so no divideBy transform needed.
//
// If a future client is on raw Medusa Admin API (nested shape, prices in
// cents), use the Custom template and supply field mappings explicitly.

export const VIRPANAI_TEMPLATE: ConnectorTemplate = {
  id: 'virpanai',
  label: 'VirpanAI',
  description:
    'For VirpanAI-backed stores (GWM and similar). Expects endpoints that return canonical flat-shape customers, products, and orders — see the bulk-import handoff doc for the exact contract.',

  auth: {
    type: 'bearer',
    header: 'Authorization',
    valuePrefix: 'Bearer ',
  },

  endpoints: {
    customers: {
      path: '/admin/customers',
      method: 'GET',
      responseDataPath: 'customers',
      responseCountPath: 'count',
    },
    products: {
      path: '/admin/products',
      method: 'GET',
      responseDataPath: 'products',
      responseCountPath: 'count',
    },
    orders: {
      path: '/admin/orders',
      method: 'GET',
      responseDataPath: 'orders',
      responseCountPath: 'count',
    },
  },

  pagination: {
    type: 'offset',
    limitParam: 'limit',
    offsetParam: 'offset',
    pageSize: 100,
  },

  // VirpanAI/Medusa Admin API doesn't publish a strict rate limit but it
  // appreciates breathing room. 100ms between pages → max 10 requests/sec
  // per entity, well within typical infra tolerances.
  interBatchDelayMs: 100,
  maxFetchRetries: 3,

  fieldMap: {
    // Customer endpoint returns Storees-canonical flat shape:
    //   { customer_id, email, phone, name, region, city, email_subscribed }
    customers: {
      external_id: 'customer_id',
      email: 'email',
      phone: 'phone',
      name: 'name',
      region: 'region',
      city: 'city',
      email_subscribed: 'email_subscribed',
      sms_subscribed: 'sms_subscribed',
      custom_attributes: {
        // Anything else in the payload that's worth keeping for segments
        // can be folded in here later via configOverride per-connector.
      },
    },

    // Product endpoint:
    //   { product_id, title, product_type, vendor, base_price, currency,
    //     image_url, status, collections: [...] }
    products: {
      product_id: 'product_id',
      title: 'title',
      product_type: 'product_type',
      vendor: 'vendor',
      base_price: 'base_price',
      currency: 'currency',
      image_url: 'image_url',
      status: 'status',
      collections: 'collections',
    },

    // Order endpoint:
    //   { customer_id, order_id, timestamp, total, currency,
    //     line_items: [{ product_id, product_name, product_type,
    //                    product_collection, quantity, price }] }
    // Totals are in major currency units (₹). No divideBy.
    orders: {
      customer_id: 'customer_id',
      order_id: 'order_id',
      timestamp: 'timestamp',
      total: 'total',
      currency: 'currency',
      line_items: {
        sourcePath: 'line_items',
        fields: {
          product_id: 'product_id',
          product_name: 'product_name',
          product_type: 'product_type',
          product_collection: 'product_collection',
          quantity: 'quantity',
          price: 'price',
        },
      },
    },
  },
}
