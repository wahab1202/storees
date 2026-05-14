import type { ConnectorTemplate } from '../genericHttpConnector.js'

// VirpanAI (GWM and similar Medusa v2-backed stores). The Admin API returns
// records in raw Medusa shape:
//   - customers: `id`, `email`, `phone`, `first_name`, `last_name`, ...
//   - products: `id`, `title`, `variants[*].prices[*].amount` (cents),
//                `collections[*].title`, `thumbnail`, `type.value`, ...
//   - orders: `id`, `customer.id`, `created_at`, `total` (cents),
//              `currency_code`, `items[*]` with nested product
//
// All money values are integer cents — divideBy: 100 to get major-unit
// rupees/dollars. If GWM (or a future client) eventually wraps these
// endpoints to return Storees-canonical flat shape, switch to the Custom
// template and supply the flat mapping there instead.

export const VIRPANAI_TEMPLATE: ConnectorTemplate = {
  id: 'virpanai',
  label: 'VirpanAI',
  description:
    'For VirpanAI / Medusa v2-backed stores (GWM and similar). Hits /admin/customers, /admin/products, /admin/orders on the Admin API and maps raw Medusa shape — nested customer.id, items[] with prices in cents — to Storees canonical fields. Use the Custom template if the source already returns canonical flat shape.',

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
      queryParams: { fields: '+items.*,+items.product.*,+customer.*' },
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

  interBatchDelayMs: 100,
  maxFetchRetries: 3,

  incremental: {
    customers: { param: 'updated_at[gte]', format: 'iso8601' },
    products: { param: 'updated_at[gte]', format: 'iso8601' },
    orders: { param: 'updated_at[gte]', format: 'iso8601' },
  },

  fieldMap: {
    customers: {
      external_id: 'id',
      email: 'email',
      phone: 'phone',
      name: { concat: ['first_name', 'last_name'], separator: ' ' },
      email_subscribed: 'has_account',
      custom_attributes: {
        billing_city: 'billing_address.city',
        billing_region: 'billing_address.province',
        metadata: 'metadata',
      },
    },

    products: {
      product_id: 'id',
      title: 'title',
      product_type: 'type.value',
      vendor: 'collection.title',
      base_price: { from: 'variants[0].prices[0].amount', divideBy: 100 },
      currency: 'variants[0].prices[0].currency_code',
      image_url: 'thumbnail',
      // Medusa product.status is 'draft' | 'proposed' | 'published' | 'rejected'.
      // Storees products column accepts 'active'/'archived'/'draft' — letting
      // 'published' through means the row will fail the constraint check.
      // The aggregator catches that and skips; for now we just pass the raw
      // value and let onboarding edit the connector config to remap if needed.
      status: 'status',
      collections: { fromArray: 'collections', field: 'title' },
    },

    orders: {
      customer_id: 'customer.id',
      order_id: 'id',
      timestamp: 'created_at',
      total: { from: 'total', divideBy: 100 },
      currency: 'currency_code',
      line_items: {
        sourcePath: 'items',
        fields: {
          product_id: 'product_id',
          product_name: 'title',
          product_type: 'product.type.value',
          product_collection: 'product.collection.title',
          quantity: 'quantity',
          price: { from: 'unit_price', divideBy: 100 },
        },
      },
    },
  },
}
