# Integrations — Shopify

> **SDK**: `@shopify/shopify-api` v9+
> **API Version**: `2024-01` (stable)
> **Rate Limit**: 4 requests/second (standard plan), implemented as 250ms delay between calls

## OAuth Flow

### Step 1: Install Route
`GET /api/integrations/shopify/install?shop=mystore.myshopify.com`

Redirect user to:
```
https://{shop}/admin/oauth/authorize
  ?client_id={SHOPIFY_API_KEY}
  &scope=read_customers,read_orders,read_products,read_checkouts,read_draft_orders
  &redirect_uri={APP_URL}/api/integrations/shopify/callback
  &state={random_nonce}
```

Store `state` nonce in Redis with 10-minute TTL for CSRF verification.

### Step 2: Callback Route
`GET /api/integrations/shopify/callback?code={code}&hmac={hmac}&shop={shop}&state={state}`

1. Verify `state` matches stored nonce
2. Verify `hmac` parameter
3. Exchange `code` for permanent access token:
   ```
   POST https://{shop}/admin/oauth/access_token
   { client_id, client_secret, code }
   ```
4. Store access token (encrypted) in `projects` table
5. Generate `webhook_secret` for this project
6. Register webhooks (see below)
7. Trigger historical sync job
8. Redirect to frontend: `{FRONTEND_URL}/integrations?connected=true`

### Required Scopes
| Scope | Reason |
|-------|--------|
| `read_customers` | Customer profiles + subscription status |
| `read_orders` | Order history + CLV calculation |
| `read_products` | Product catalog for recommendations |
| `read_checkouts` | Checkout funnel tracking |
| `read_draft_orders` | Cart/checkout recovery data |

## Webhook Registration

After OAuth, register webhooks via Shopify Admin API:

```
POST /admin/api/2024-01/webhooks.json
{
  "webhook": {
    "topic": "orders/create",
    "address": "{APP_URL}/api/webhooks/shopify/{projectId}",
    "format": "json"
  }
}
```

### Topics to Register

| Topic | Priority | Event Mapped To |
|-------|----------|----------------|
| `customers/create` | P0 | `customer_created` |
| `customers/update` | P0 | `customer_updated` |
| `orders/create` | P0 | `order_placed` |
| `orders/fulfilled` | P0 | `order_fulfilled` |
| `orders/cancelled` | P0 | `order_cancelled` |
| `checkouts/create` | P0 | `checkout_started` |
| `carts/create` | P0 | `cart_created` |
| `carts/update` | P1 | `cart_updated` |

Register all P0 topics on Day 1-2. P1 on Day 3+.

### HMAC Verification

```typescript
function verifyShopifyWebhook(rawBody: Buffer, hmacHeader: string, secret: string): boolean {
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader))
}
```

**Critical**: Read raw body BEFORE JSON parsing. Use Express `raw` body parser for webhook routes only.

## Historical Sync

Triggered on first connection. Runs as a BullMQ job.

### Sync Sequence

1. **Customers**: Paginated fetch
   ```
   GET /admin/api/2024-01/customers.json?limit=250&fields=id,email,phone,first_name,last_name,created_at,email_marketing_consent,sms_marketing_consent
   ```
   Follow `Link` header for pagination. Rate limit: 250ms between requests.

2. **Orders per customer**: For each customer, fetch their orders
   ```
   GET /admin/api/2024-01/customers/{id}/orders.json?status=any&limit=250
   ```

3. **For each order**: Create order row, extract line items from `line_items` array.

4. **Calculate aggregates**: After all orders are ingested for a customer:
   - `total_orders = COUNT(orders)`
   - `total_spent = SUM(orders.total)`
   - `avg_order_value = total_spent / total_orders`
   - `clv = total_spent` (simple sum for Phase 1)

5. **Create events**: For each order, create a `TrackedEvent` with:
   - `event_name = 'order_placed'`
   - `platform = 'historical_sync'`
   - `timestamp = order.created_at`

6. **Mark progress**: Update a `sync_status` field on the project:
   - `{ status: 'syncing', progress: 47, customersProcessed: 118, totalCustomers: 250 }`
   - Frontend polls this for the sync progress bar.

### Sync Completion

After sync completes:
- Set `sync_status = { status: 'complete', completedAt: Date, customersProcessed: N, ordersProcessed: M }`
- Run initial segment evaluation for all default templates
- Update lifecycle chart cache

### Demo Optimization

For the demo, limit sync to last 100 customers to keep it fast:
```
GET /admin/api/2024-01/customers.json?limit=100&order=created_at+desc
```

## Webhook → Event Transformation Examples

### orders/create

**Shopify payload** (relevant fields):
```json
{
  "id": 820982911946154508,
  "email": "customer@example.com",
  "total_price": "2998.00",
  "total_discounts": "300.00",
  "currency": "INR",
  "line_items": [
    {
      "product_id": 632910392,
      "title": "Blue Kurta",
      "quantity": 2,
      "price": "1499.00",
      "image": { "src": "https://cdn.shopify.com/..." }
    }
  ],
  "customer": { "id": 207119551 }
}
```

**Transforms to**:
- Upsert customer (resolve by email or customer.id)
- Create `orders` row with line_items JSONB
- Update customer: `total_orders += 1`, `total_spent += 2998`, recalculate `clv`
- Create `TrackedEvent`:
  ```json
  {
    "event_name": "order_placed",
    "customer_id": "<resolved UUID>",
    "platform": "shopify_webhook",
    "properties": {
      "order_id": "820982911946154508",
      "total": 2998.00,
      "discount": 300.00,
      "item_count": 1,
      "items": [{ "product_id": "632910392", "product_name": "Blue Kurta", "quantity": 2, "price": 1499.00 }]
    }
  }
  ```
- Publish event to BullMQ `events` queue

### carts/create

**Shopify payload** (relevant fields):
```json
{
  "id": "cart_abc123",
  "token": "cart_token_xyz",
  "line_items": [
    {
      "product_id": 632910392,
      "title": "Blue Kurta",
      "quantity": 1,
      "price": "1499.00",
      "image": "https://cdn.shopify.com/..."
    }
  ],
  "customer": { "id": 207119551 }
}
```

**Transforms to**:
- Resolve customer by customer.id
- Create `TrackedEvent`:
  ```json
  {
    "event_name": "cart_created",
    "customer_id": "<resolved UUID>",
    "platform": "shopify_webhook",
    "properties": {
      "cart_id": "cart_abc123",
      "cart_value": 1499.00,
      "item_count": 1,
      "items": [{ "product_id": "632910392", "product_name": "Blue Kurta", "quantity": 1, "price": 1499.00, "image_url": "https://..." }],
      "checkout_url": "https://{shop}.myshopify.com/cart/{cart_token}"
    }
  }
  ```

**Note**: The `properties.items` and `properties.checkout_url` are stored in `flow_trips.context` when a flow trip starts, so the abandoned cart email can include product images and a checkout link.
