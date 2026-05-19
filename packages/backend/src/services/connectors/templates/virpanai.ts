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
    // Storees-CDP namespace (NOT Medusa core admin). GWM exposes dealers as
    // a first-class resource here; response is already in canonical shape
    // (see STOREES_DEALERS_EXPORT.md), so the field map is mostly 1:1.
    // Sync of this endpoint is gated server-side on
    // projects.features.agentScopedAccess — only the GWM project qualifies
    // today even if another tenant later picks the VirpanAI template.
    dealers: {
      path: '/admin/storees-cdp/export/dealers',
      method: 'GET',
      responseDataPath: 'dealers',
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
    // GWM's dealer export uses `updated_after` (different param name vs the
    // Medusa admin endpoints which use updated_at[gte]).
    dealers: { param: 'updated_after', format: 'iso8601' },
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

    // Medusa v2 order shape (verified from a real GWM payload):
    //   - customer_id is flat at the root (also nested in customer.id; either works)
    //   - id is the order id
    //   - There is NO flat `total` at the root — totals live inside `summary`
    //     as `current_order_total` (net), `original_order_total` (gross),
    //     `paid_total`, `accounting_total`. Reading from `summary.current_order_total`
    //     gives the right number for active orders AND yields 0 for
    //     canceled/refunded orders — which our zero-total guard then skips,
    //     so cancellations don't inflate revenue.
    //   - line item `unit_price` is a FLAT number in major currency units
    //     (₹), NOT cents. Same for `quantity`. The `raw_*` BigNumber versions
    //     are also present but we ignore them.
    //   - line item also has flat `product_type` and `product_collection`
    //     (typically nullable) — no need to crawl into nested product.
    orders: {
      customer_id: 'customer_id',
      order_id: 'id',
      timestamp: 'created_at',
      total: 'summary.current_order_total',
      currency: 'currency_code',
      line_items: {
        sourcePath: 'items',
        fields: {
          product_id: 'product_id',
          product_name: 'title',
          product_type: 'product_type',
          product_collection: 'product_collection',
          quantity: 'quantity',
          price: 'unit_price',
        },
      },
    },

    // GWM /admin/storees-cdp/export/dealers already emits canonical shape —
    // dealerImport.ts consumes this object directly (see DealerInput type).
    dealers: {
      dealer_id: 'dealer_id',
      name: 'name',
      email: 'email',
      phone: 'phone',
      status: 'status',
      region: 'region',
      state: 'state',
      city: 'city',
      address_1: 'address_1',
      address_2: 'address_2',
      postal_code: 'postal_code',
      country: 'country',
      gst_number: 'gst_number',
      pan_number: 'pan_number',
      assigned_districts: 'assigned_districts',
      created_at: 'created_at',
      updated_at: 'updated_at',
      custom_attributes: 'custom_attributes',
    },
  },
}
