# GoWelmart Integration Guide

Integration guide for connecting GoWelmart (Medusa-based ecommerce) to Storees CDP.

---

## Overview

Storees receives data from GoWelmart through two channels:

| Channel | What it captures | Integrated by |
|---------|-----------------|---------------|
| **Backend API** (webhooks) | Orders, customers, cancellations | GoWelmart backend team |
| **Frontend SDK** (JavaScript) | Product views, cart actions, browsing | GoWelmart frontend team |

---

## 1. Credentials

After project creation, you receive:

```
Project ID:  a3fe60d4-aa5f-4db1-b775-ee926de78611
API Key:     strs_pub_xxxxx    (public — safe for frontend)
API Secret:  strs_sec_xxxxx    (secret — backend only, never expose)
```

- **Frontend SDK** uses only the `API Key` (public)
- **Backend webhooks** use both `API Key` + `API Secret`

---

## 2. Backend Integration (Server-Side Events)

### Authentication

All server-side requests require two headers:

```
X-API-Key: {your_public_key}
X-API-Secret: {your_secret_key}
Content-Type: application/json
```

### Base URL

```
https://api.storees.io/api/v1
```

### Push a Single Event

```
POST /api/v1/events
```

```json
{
  "event_name": "order_completed",
  "customer_id": "cus_01JWFF8ZV1V2Y0DK4CGH67K5X2",
  "customer_email": "ak@gmail.com",
  "customer_phone": "9344558795",
  "timestamp": "2026-04-01T10:30:00Z",
  "idempotency_key": "order_01KM51HNB6BA7HQ1PWJ3GFF4Y9",
  "properties": {
    "order_id": "order_01KM51HNB6BA7HQ1PWJ3GFF4Y9",
    "display_id": 10945,
    "order_total": 49540,
    "discount_total": 0,
    "currency": "inr",
    "status": "pending",
    "line_items": [
      {
        "product_id": "prod_01K6DESD1H5MBAC96N6PB1B05D",
        "product_name": "ONEPLUS 13S 5G FRESH",
        "variant_sku": "17176",
        "unit_price": 49490,
        "quantity": 1
      }
    ],
    "city": "Madurai",
    "province": "Tamil Nadu",
    "postal_code": "625017"
  }
}
```

**Response:**
```json
{ "success": true, "data": { "id": "event-uuid", "deduplicated": false } }
```

### Push Events in Batch (up to 1000)

```
POST /api/v1/events/batch
```

```json
{
  "events": [
    { "event_name": "order_completed", "customer_id": "cus_123", "properties": { ... } },
    { "event_name": "customer_updated", "customer_email": "user@example.com", "properties": { ... } }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 100,
    "succeeded": 98,
    "failed": 2,
    "results": [
      { "index": 0, "id": "event-uuid" },
      { "index": 5, "error": "event_name is required" }
    ]
  }
}
```

---

## 3. Events to Push from GoWelmart Backend

### Required Events

| Event | When to fire | Key properties |
|-------|-------------|----------------|
| `order_completed` | Order is placed | `order_id`, `order_total`, `discount_total`, `currency`, `line_items[]`, `city`, `province` |
| `order_cancelled` | Order is cancelled | `order_id`, `reason` |
| `customer_created` | New customer signs up | `name`, `email`, `phone`, `company_name`, `dealer_id` |
| `customer_updated` | Customer profile changes | Changed fields |

### Recommended Events (for richer analytics)

| Event | When to fire | Key properties |
|-------|-------------|----------------|
| `checkout_started` | Cart moves to checkout | `cart_id`, `total`, `item_count`, `line_items[]` |
| `cart_created` | New cart is created | `cart_id`, `line_items[]`, `total` |
| `cart_updated` | Cart items change | `cart_id`, `line_items[]`, `total` |

### Event Payload Reference

Every event requires:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `event_name` | string | Yes | One of the event names above |
| `customer_id` | string | One of three | GoWelmart's `customer_id` |
| `customer_email` | string | One of three | Customer email |
| `customer_phone` | string | One of three | Customer phone |
| `timestamp` | ISO 8601 | No | Defaults to now. Max 7 days in the past |
| `idempotency_key` | string | No | Prevents duplicate processing. Use `order_{order_id}` for orders |
| `properties` | object | No | Event-specific data |

> At least one of `customer_id`, `customer_email`, or `customer_phone` is required. Storees uses these to resolve the customer identity.

---

## 4. Medusa Webhook Integration

Add these webhooks to your Medusa backend. Fire them on the corresponding Medusa events:

```javascript
// medusa-config.js or a subscriber plugin

const STOREES_URL = 'https://api.storees.io/api/v1/events';
const HEADERS = {
  'X-API-Key': process.env.STOREES_API_KEY,
  'X-API-Secret': process.env.STOREES_API_SECRET,
  'Content-Type': 'application/json',
};

// On order.placed
async function onOrderPlaced(order) {
  await fetch(STOREES_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      event_name: 'order_completed',
      customer_id: order.customer_id,
      customer_email: order.email,
      timestamp: order.created_at,
      idempotency_key: `order_${order.id}`,
      properties: {
        order_id: order.id,
        display_id: order.display_id,
        order_total: order.total / 100, // Medusa stores in smallest unit
        discount_total: order.discount_total / 100,
        shipping_total: order.shipping_total / 100,
        currency: order.currency_code,
        status: order.status,
        fulfillment_status: order.fulfillment_status,
        line_items: order.items.map(item => ({
          product_id: item.variant?.product_id,
          product_name: item.title,
          variant_sku: item.variant?.sku,
          unit_price: item.unit_price / 100,
          quantity: item.quantity,
        })),
        city: order.shipping_address?.city,
        province: order.shipping_address?.province,
        postal_code: order.shipping_address?.postal_code,
      },
    }),
  });
}

// On order.canceled
async function onOrderCanceled(order) {
  await fetch(STOREES_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      event_name: 'order_cancelled',
      customer_id: order.customer_id,
      idempotency_key: `cancel_${order.id}`,
      properties: {
        order_id: order.id,
        reason: order.metadata?.cancel_reason || 'unknown',
      },
    }),
  });
}

// On customer.created
async function onCustomerCreated(customer) {
  await fetch(STOREES_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      event_name: 'customer_created',
      customer_id: customer.id,
      customer_email: customer.email,
      customer_phone: customer.phone,
      idempotency_key: `cust_create_${customer.id}`,
      properties: {
        name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        company_name: customer.metadata?.shop_name,
        dealer_id: customer.metadata?.dealer_id,
      },
    }),
  });
}
```

---

## 5. Frontend SDK Integration (Storefront)

Install the Storees SDK on GoWelmart's customer-facing website to capture browsing behavior.

### Option A: Script Tag

```html
<!-- Add before </body> on every page -->
<script src="https://api.storees.io/sdk/storees.min.js"></script>
<script>
  storees.init({
    apiKey: 'strs_pub_xxxxx',
    apiUrl: 'https://api.storees.io',
  });
</script>
```

This automatically tracks:
- `page_viewed` — every page navigation
- `session_started` / `session_ended` — visit sessions with duration

### Option B: React SDK (if using React/Next.js)

```bash
npm install @storees/react
```

```tsx
// app/layout.tsx or _app.tsx
import { StoreesProvider } from '@storees/react';

export default function Layout({ children }) {
  return (
    <StoreesProvider
      apiKey="strs_pub_xxxxx"
      apiUrl="https://api.storees.io"
    >
      {children}
    </StoreesProvider>
  );
}
```

```tsx
// In any component
import { useTrack, useIdentify } from '@storees/react';

function ProductPage({ product }) {
  const track = useTrack();
  const identify = useIdentify();

  useEffect(() => {
    track('product_viewed', {
      product_id: product.id,
      product_name: product.title,
      product_type: product.type,
      price: product.price,
    });
  }, [product.id]);

  return <div>...</div>;
}
```

### Identify Logged-In Customers

When a customer logs in or is identified, call `identify()` to link their browsing to their profile:

```javascript
// After login or on authenticated pages
storees.identify('cus_01JWFF8ZV1V2Y0DK4CGH67K5X2', {
  email: 'ak@gmail.com',
  phone: '9344558795',
  name: 'Arun Kumar',
});
```

### Frontend Events to Track

| Event | Where to fire | Example |
|-------|--------------|---------|
| `product_viewed` | Product detail page load | `{ product_id, product_name, product_type, price }` |
| `collection_viewed` | Category/collection page | `{ collection_name, collection_id }` |
| `added_to_cart` | Add to cart button click | `{ product_id, product_name, price, quantity }` |
| `added_to_wishlist` | Wishlist button click | `{ product_id, product_name, price }` |
| `checkout_started` | Checkout page load | `{ cart_id, total, item_count }` |

```javascript
// Product detail page
storees.track('product_viewed', {
  product_id: 'prod_01K6DESD1H5MBAC96N6PB1B05D',
  product_name: 'ONEPLUS 13S 5G FRESH',
  product_type: 'Electronics',
  price: 49490,
  variant_sku: '17176',
});

// Add to cart
storees.track('added_to_cart', {
  product_id: 'prod_01K6DESD1H5MBAC96N6PB1B05D',
  product_name: 'ONEPLUS 13S 5G FRESH',
  price: 49490,
  quantity: 1,
});

// Wishlist
storees.track('added_to_wishlist', {
  product_id: 'prod_01K6DESD1H5MBAC96N6PB1B05D',
  product_name: 'ONEPLUS 13S 5G FRESH',
  price: 49490,
});

// Collection page
storees.track('collection_viewed', {
  collection_name: 'New Arrivals',
  collection_id: 'col_123',
});
```

---

## 6. What Storees Does With This Data

| Data Source | Storees Feature |
|-------------|----------------|
| `order_completed` | Customer spend, order history, RFM segments, revenue analytics |
| `product_viewed` | "Viewed but didn't buy" segments, product analytics, recommendations |
| `added_to_cart` + no order | Cart abandonment flows, recovery emails |
| `added_to_wishlist` | Wishlist-based segments, price drop notifications |
| `session_started/ended` | Engagement scoring, dormancy detection |
| `customer_created` | New customer onboarding flows |
| All events combined | Funnel analysis, cohort retention, lifecycle segmentation |

---

## 7. Testing the Integration

### Test a single event via cURL

```bash
curl -X POST https://api.storees.io/api/v1/events \
  -H "X-API-Key: strs_pub_xxxxx" \
  -H "X-API-Secret: strs_sec_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "event_name": "order_completed",
    "customer_email": "test@gowelmart.com",
    "properties": {
      "order_id": "test_order_001",
      "order_total": 999,
      "line_items": [{"product_name": "Test Product", "unit_price": 999, "quantity": 1}]
    }
  }'
```

**Expected response:**
```json
{ "success": true, "data": { "id": "...", "deduplicated": false } }
```

### Verify in Storees Dashboard

1. Go to **dashboard.storees.io** → select GoWelmart project
2. Navigate to **Customers** — the test customer should appear
3. Click the customer → **Activity** tab should show the event

---

## 8. Rate Limits

| Limit | Value |
|-------|-------|
| Single events | 1,000 requests/minute per API key |
| Batch events | 1,000 events per batch, 100 batches/minute |
| SDK events | Batched client-side (20 events or 30s interval) |

---

## 9. Idempotency

Use `idempotency_key` to prevent duplicate events:

| Event | Recommended key format |
|-------|----------------------|
| `order_completed` | `order_{order_id}` |
| `order_cancelled` | `cancel_{order_id}` |
| `customer_created` | `cust_create_{customer_id}` |
| `cart_created` | `cart_{cart_id}` |
| `checkout_started` | `checkout_{cart_id}` |

If the same `idempotency_key` is sent twice, the second request is silently ignored.

---

## Summary Checklist

### GoWelmart Backend Team
- [ ] Set `STOREES_API_KEY` and `STOREES_API_SECRET` in Medusa env
- [ ] Add webhook for `order.placed` → push `order_completed`
- [ ] Add webhook for `order.canceled` → push `order_cancelled`
- [ ] Add webhook for `customer.created` → push `customer_created`
- [ ] Add webhook for `customer.updated` → push `customer_updated`
- [ ] Test with cURL, verify in Storees dashboard

### GoWelmart Frontend Team
- [ ] Add Storees SDK script tag (or install `@storees/react`)
- [ ] Call `init()` with project API key
- [ ] Call `identify()` on login/authenticated pages
- [ ] Add `product_viewed` tracking on product detail pages
- [ ] Add `added_to_cart` tracking on cart button clicks
- [ ] Add `added_to_wishlist` tracking on wishlist button clicks
- [ ] Add `collection_viewed` on category pages
- [ ] Test: view product → check customer activity in Storees dashboard
