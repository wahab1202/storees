import type { ConnectorTemplate } from '../genericHttpConnector.js'

// VirpanAI (GWM and similar Medusa v2-backed stores). Pulls from the dedicated
// /storees-cdp/export/* endpoints, which emit Storees-CANONICAL FLAT shape
// (NOT raw Medusa — that was the old /admin/* path):
//   - customers: `customer_id`, `email`, `phone`, `name`, `region`, `city`,
//                `created_at`, top-level `fcm_token` + `push_subscribed`,
//                `custom_attributes.dealer_id`
//   - products:  `product_id`, `title`, `base_price`, `currency`, `image_url`,
//                `status` (already 'active'/...), `collections` (string[])
//   - orders:    `customer_id`, `order_id`, `timestamp`, `total`, `currency`,
//                `canceled_at`, `line_items[*]` (flat product_name/price/qty)
//
// Money is ALREADY in major currency units (₹) — no divideBy. There is no
// fulfillment_status; importOrderBatch treats a null canceled_at as revenue.

export const VIRPANAI_TEMPLATE: ConnectorTemplate = {
  id: 'virpanai',
  label: 'VirpanAI',
  description:
    'For VirpanAI / Medusa v2-backed stores (GWM and similar). Pulls /storees-cdp/export/{customers,products,orders,dealers}, which return Storees-canonical flat shape (flat ids, major-unit money, top-level fcm_token/push_subscribed). Maps near-identity. Use the Custom template for a differently-shaped source.',

  auth: {
    type: 'bearer',
    header: 'Authorization',
    valuePrefix: 'Bearer ',
  },

  // All four now live under the dedicated /storees-cdp/export/* namespace
  // (bypasses Medusa's admin permission chain — see STOREES_CDP_AUTH_UPDATE.md).
  // Auth is a static Bearer pull_token set per-connector-row, NOT in code.
  // Every export endpoint returns the same envelope: { <resource>: [...], count,
  // limit, offset, next_offset, has_more }. The orders endpoint FILTERS rows
  // server-side (drops guest / zero-total), so a page can return far fewer rows
  // than `limit` while more pages remain — we MUST page off `has_more` +
  // `next_offset`, never `records.length === pageSize` (which quits after the
  // thin first page → the "only 77 orders synced" bug). See STOREES_CDP_PULL_API §6/§7.
  endpoints: {
    customers: {
      path: '/storees-cdp/export/customers',
      method: 'GET',
      responseDataPath: 'customers',
      responseCountPath: 'count',
      responseHasMorePath: 'has_more',
      responseNextOffsetPath: 'next_offset',
    },
    products: {
      path: '/storees-cdp/export/products',
      method: 'GET',
      responseDataPath: 'products',
      responseCountPath: 'count',
      responseHasMorePath: 'has_more',
      responseNextOffsetPath: 'next_offset',
    },
    orders: {
      path: '/storees-cdp/export/orders',
      method: 'GET',
      responseDataPath: 'orders',
      responseCountPath: 'count',
      responseHasMorePath: 'has_more',
      responseNextOffsetPath: 'next_offset',
    },
    dealers: {
      path: '/storees-cdp/export/dealers',
      method: 'GET',
      responseDataPath: 'dealers',
      responseCountPath: 'count',
      responseHasMorePath: 'has_more',
      responseNextOffsetPath: 'next_offset',
    },
  },

  pagination: {
    type: 'offset',
    limitParam: 'limit',
    offsetParam: 'offset',
    pageSize: 500, // doc-recommended connector page size (max 1000)
  },

  interBatchDelayMs: 100,
  maxFetchRetries: 3,

  // The /storees-cdp/export/* endpoints all use `updated_after` (the CDP-export
  // convention) — unlike the old Medusa admin routes that used updated_at[gte].
  incremental: {
    customers: { param: 'updated_after', format: 'iso8601' },
    products: { param: 'updated_after', format: 'iso8601' },
    orders: { param: 'updated_after', format: 'iso8601' },
    dealers: { param: 'updated_after', format: 'iso8601' },
  },

  fieldMap: {
    // The /storees-cdp/export/* endpoints emit Storees-canonical FLAT shape
    // (verified against live GWM payloads), NOT raw Medusa. Money is already in
    // major currency units (₹) — e.g. an iPhone order total of 56490 — so NO
    // divideBy. ids are `customer_id` / `product_id` / `order_id` (not `id`),
    // `name` is pre-concatenated, and fcm_token / push_subscribed are top-level.
    customers: {
      external_id: 'customer_id',
      email: 'email',
      phone: 'phone',
      name: 'name',
      region: 'region',
      city: 'city',
      // CDP export already ships push consent + device token at the top level.
      push_subscribed: 'push_subscribed',
      // source created_at — lets resolveCustomer set first_seen accurately so a
      // resync doesn't relabel historical customers as new.
      source_created_at: 'created_at',
      // B2B: dealer_id is nested under custom_attributes in the export. Surfaced
      // at top level so the customer importer wires it into resolveCustomer's
      // agentExternalDealerId (stamps customers.agent_id / stores for backlink).
      dealer_id: 'custom_attributes.dealer_id',
      custom_attributes: {
        // fcm_token MUST land at custom_attributes.fcm_token — push delivery
        // reads custom_attributes->>'fcm_token'. Source has it at the top level.
        fcm_token: 'fcm_token',
        shop_name: 'custom_attributes.shop_name',
      },
    },

    products: {
      product_id: 'product_id',
      title: 'title',
      product_type: 'product_type',
      base_price: 'base_price',   // already major-unit ₹, NOT cents
      currency: 'currency',
      image_url: 'image_url',
      status: 'status',           // export already emits 'active'/'archived'/'draft'
      collections: 'collections', // already a flat string array
      attributes: 'attributes',
    },

    // CDP-export order shape (verified from live GWM payloads):
    //   - flat customer_id / order_id (NOT `id`)
    //   - flat `total` and `currency` in major units (₹) — no `summary`
    //   - `timestamp` is the order date; `canceled_at` null = active order
    //   - NO fulfillment_status field — importOrderBatch falls back to
    //     canceled_at (null → revenue) when fulfillment_status is absent
    //   - line items under `line_items` with flat product_name / price / qty
    orders: {
      customer_id: 'customer_id',
      order_id: 'order_id',
      canceled_at: 'canceled_at',
      // The CDP export ships the real fulfillment state as top-level
      // `fulfillment_status` (e.g. "delivered"/"not_fulfilled"/…). We map it
      // into our DISPLAY-ONLY status slot: buildOrderRow stamps mapped
      // order_status → properties.status → the customer Orders tab (and, via
      // the merge/overlay, wins over the table's 'pending' placeholder). A
      // full re-sync therefore backfills the real status onto every past order.
      //
      // Deliberately routed to `order_status`, NOT `fulfillment_status`: the
      // connector's revenue gate keys off mapped.fulfillment_status==='delivered'
      // and would otherwise reclassify every non-delivered order as non-revenue.
      // Leaving that slot unmapped keeps revenue on the existing canceled_at
      // fallback — status here is cosmetic, revenue is unchanged.
      order_status: 'fulfillment_status',
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
