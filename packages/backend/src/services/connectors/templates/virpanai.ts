import type { ConnectorTemplate } from '../genericHttpConnector.js'

export const VIRPANAI_TEMPLATE: ConnectorTemplate = {
  id: 'virpanai',
  label: 'VirpanAI',
  description:
    'Default mapping for VirpanAI-backed stores (GWM and similar). Pulls customers, products, and orders via the VirpanAI Admin API.',

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

  // VirpanAI/Medusa Admin API doesn't publish a strict rate limit but it
  // appreciates breathing room. 100ms between pages → max 10 requests/sec
  // per entity, well within typical infra tolerances.
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
