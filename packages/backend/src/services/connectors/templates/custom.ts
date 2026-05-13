import type { ConnectorTemplate } from '../genericHttpConnector.js'

// Blank template. Use for BFSI, sporttech, edtech, or any bespoke stack.
// Onboarding team fills in endpoints + auth + field map from the client's
// API docs before saving. The "Test Connection" button in the admin UI
// validates the spec by fetching one page from each endpoint.

export const CUSTOM_TEMPLATE: ConnectorTemplate = {
  id: 'custom',
  label: 'Custom HTTP',
  description:
    "Blank template — use for any stack that exposes paginated REST endpoints. Onboarding team fills in endpoints, auth, and field mapping from the client's API docs.",

  auth: {
    type: 'bearer',
    header: 'Authorization',
    valuePrefix: 'Bearer ',
  },

  endpoints: {
    customers: { path: '', method: 'GET', responseDataPath: 'data' },
    products: { path: '', method: 'GET', responseDataPath: 'data' },
    orders: { path: '', method: 'GET', responseDataPath: 'data' },
  },

  pagination: {
    type: 'offset',
    limitParam: 'limit',
    offsetParam: 'offset',
    pageSize: 100,
  },

  incremental: {
    customers: { param: 'updated_at_gte', format: 'iso8601' },
    products: { param: 'updated_at_gte', format: 'iso8601' },
    orders: { param: 'updated_at_gte', format: 'iso8601' },
  },

  fieldMap: {
    customers: {
      external_id: '',
      email: '',
      phone: '',
      name: '',
      custom_attributes: {},
    },
    products: {
      product_id: '',
      title: '',
      product_type: '',
      base_price: '',
      currency: '',
    },
    orders: {
      customer_id: '',
      order_id: '',
      timestamp: '',
      total: '',
      currency: '',
      line_items: {
        sourcePath: '',
        fields: {
          product_id: '',
          quantity: '',
          price: '',
        },
      },
    },
  },
}
