# Storees Integration Guide

Complete guide for integrating any platform with Storees CDP. Covers backend webhooks, frontend SDK, mobile SDKs, historical sync, and delivery tracking.

---

## Overview

Storees receives data through three channels:

| Channel | What it captures | Integrated by |
|---------|-----------------|---------------|
| **Backend API** (webhooks) | Orders, customers, cancellations, transactions | Backend team |
| **Web SDK** (JavaScript / React) | Product views, cart actions, browsing, sessions | Frontend team |
| **Mobile SDK** (Flutter / Android / iOS) | Product views, cart actions, app events | Mobile team |

---

## 1. Getting Started

### Create a Project

Via the Storees dashboard onboarding wizard, or via API:

```
POST https://api.storees.io/api/onboarding/projects
Content-Type: application/json

{
  "name": "Your Project Name",
  "domain_type": "ecommerce"   // or "fintech" | "saas" | "custom"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "project": { "id": "project-uuid", "name": "Your Project Name" },
    "api_keys": {
      "key_public": "strs_pub_xxxx",
      "key_secret": "strs_sec_xxxx"
    }
  }
}
```

> Save the `key_secret` immediately — it cannot be retrieved again.

### Credentials

```
Project ID:  <your-project-uuid>
API Key:     strs_pub_xxxx     (public — safe for frontend SDK)
API Secret:  strs_sec_xxxx     (secret — backend only, never expose in client code)
Base URL:    https://api.storees.io
```

---

## 2. Backend Integration (Server-Side Events)

### Authentication

All server-side requests require two headers:

```
X-API-Key: {your_public_key}
X-API-Secret: {your_secret_key}
Content-Type: application/json
```

### Push a Single Event

```
POST /api/v1/events
```

```json
{
  "event_name": "order_completed",
  "customer_id": "your-customer-id",
  "customer_email": "customer@example.com",
  "customer_phone": "+919876543210",
  "timestamp": "2026-04-01T10:30:00Z",
  "idempotency_key": "order_12345",
  "properties": {
    "order_id": "12345",
    "order_total": 4999,
    "currency": "inr",
    "line_items": [
      {
        "product_id": "prod_001",
        "product_name": "Blue T-Shirt",
        "unit_price": 2499,
        "quantity": 2
      }
    ],
    "city": "Mumbai",
    "province": "Maharashtra"
  }
}
```

**Response:**
```json
{ "success": true, "data": { "id": "event-uuid", "deduplicated": false } }
```

### Push Events in Batch (up to 1,000)

```
POST /api/v1/events/batch
```

```json
{
  "events": [
    { "event_name": "order_completed", "customer_id": "cust_1", "properties": { ... } },
    { "event_name": "customer_updated", "customer_email": "user@example.com", "properties": { ... } }
  ]
}
```

### Upsert Customer Profile

```
POST /api/v1/customers
```

```json
{
  "customer_id": "your-customer-id",
  "attributes": {
    "email": "customer@example.com",
    "phone": "+919876543210",
    "name": "Priya Sharma",
    "company_name": "ABC Store",
    "city": "Chennai"
  }
}
```

### Event Payload Reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `event_name` | string | Yes | e.g. `order_completed`, `customer_created` |
| `customer_id` | string | At least one | Your system's customer ID |
| `customer_email` | string | At least one | Customer email |
| `customer_phone` | string | At least one | Customer phone |
| `timestamp` | ISO 8601 | No | Defaults to now. Max 7 days in past |
| `idempotency_key` | string | No | Prevents duplicate processing |
| `properties` | object | No | Event-specific data |

> At least one of `customer_id`, `customer_email`, or `customer_phone` is required.

---

## 3. Standard Events by Domain

### Ecommerce Events

| Event | When to fire | Key properties |
|-------|-------------|----------------|
| `order_completed` | Order placed | `order_id`, `order_total`, `line_items[]`, `city` |
| `order_cancelled` | Order cancelled | `order_id`, `reason` |
| `checkout_started` | Cart → checkout | `cart_id`, `total`, `item_count` |
| `cart_created` | New cart | `cart_id`, `line_items[]`, `total` |
| `customer_created` | New signup | `name`, `email`, `phone` |
| `customer_updated` | Profile changed | Changed fields |

### Fintech Events

| Event | When to fire | Key properties |
|-------|-------------|----------------|
| `transaction_completed` | Payment/transfer | `amount`, `type` (debit/credit), `channel` |
| `kyc_verified` | KYC completed | `type` (aadhaar/pan) |
| `loan_disbursed` | Loan given | `loan_amount`, `loan_type` |
| `emi_paid` | EMI received | `amount`, `loan_id` |
| `emi_overdue` | EMI missed | `amount`, `days_overdue` |

### SaaS Events

| Event | When to fire | Key properties |
|-------|-------------|----------------|
| `subscription_started` | New subscription | `plan`, `mrr` |
| `feature_used` | Feature interaction | `feature` name |
| `trial_expiring` | Trial ending soon | `days_left` |
| `user_signup` | New user | `name`, `email`, `plan` |

---

## 4. One-Time Historical Sync

Before webhooks go live, push all existing data into Storees.

### Step 1: Push customers first

```javascript
const STOREES_URL = 'https://api.storees.io/api/v1';
const HEADERS = {
  'X-API-Key': process.env.STOREES_API_KEY,
  'X-API-Secret': process.env.STOREES_API_SECRET,
  'Content-Type': 'application/json',
};

const customers = await getAllCustomersFromYourDB();

for (const customer of customers) {
  await fetch(`${STOREES_URL}/customers`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      customer_id: customer.id,
      attributes: {
        email: customer.email,
        phone: customer.phone,
        name: customer.name,
      },
    }),
  });
}
```

### Step 2: Push historical orders in batch

```javascript
const orders = await getAllOrdersFromYourDB();
const BATCH_SIZE = 500;

for (let i = 0; i < orders.length; i += BATCH_SIZE) {
  const batch = orders.slice(i, i + BATCH_SIZE);

  await fetch(`${STOREES_URL}/events/batch`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      events: batch.map(order => ({
        event_name: 'order_completed',
        customer_id: order.customer_id,
        timestamp: order.created_at,
        idempotency_key: `order_${order.id}`,
        properties: {
          order_id: order.id,
          order_total: order.total,
          line_items: order.items.map(item => ({
            product_id: item.product_id,
            product_name: item.title,
            unit_price: item.price,
            quantity: item.quantity,
          })),
        },
      })),
    }),
  });
}
```

### Sync Order
1. **Customers first** — so identity resolution works
2. **Orders** — creates history and CLV
3. **Carts / other events** — additional behavioral data

All events use `idempotency_key` — safe to re-run.

---

## 5. Web Frontend SDK (JavaScript)

### Script Tag (any website)

```html
<script src="https://api.storees.io/sdk/storees.min.js"></script>
<script>
  Storees.init({
    apiKey: 'strs_pub_xxxx',
    apiUrl: 'https://api.storees.io',
  });
</script>
```

Auto-tracks: `page_viewed`, `session_started`, `session_ended`.

### React / Next.js

```bash
npm install @storees/react
```

```tsx
import { StoreesProvider } from '@storees/react';

export default function Layout({ children }) {
  return (
    <StoreesProvider apiKey="strs_pub_xxxx" apiUrl="https://api.storees.io">
      {children}
    </StoreesProvider>
  );
}
```

```tsx
import { useTrack, useIdentify } from '@storees/react';

function ProductPage({ product }) {
  const track = useTrack();
  useEffect(() => {
    track('product_viewed', {
      product_id: product.id,
      product_name: product.title,
      price: product.price,
    });
  }, [product.id]);
}
```

### Identify Customers

```javascript
Storees.identify('customer-id', {
  email: 'user@example.com',
  phone: '+919876543210',
  name: 'Priya Sharma',
});
```

### Frontend Events

| Event | Where | Properties |
|-------|-------|------------|
| `product_viewed` | Product page load | `product_id`, `product_name`, `price` |
| `added_to_cart` | Cart button click | `product_id`, `product_name`, `price`, `quantity` |
| `added_to_wishlist` | Wishlist button | `product_id`, `product_name`, `price` |
| `collection_viewed` | Category page | `collection_name`, `collection_id` |
| `checkout_started` | Checkout page | `cart_id`, `total`, `item_count` |

---

## 6. Mobile SDKs

### Flutter

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class Storees {
  static const String _baseUrl = 'https://api.storees.io/api/v1';
  static String _apiKey = '';
  static String _apiSecret = '';
  static String? _customerId;

  static void init({required String apiKey, required String apiSecret}) {
    _apiKey = apiKey;
    _apiSecret = apiSecret;
  }

  static void identify(String customerId, {String? email, String? phone, String? name}) {
    _customerId = customerId;
    track('customer_identified', properties: {
      if (email != null) 'email': email,
      if (phone != null) 'phone': phone,
      if (name != null) 'name': name,
    });
  }

  static Future<void> track(String eventName, {Map<String, dynamic>? properties}) async {
    try {
      await http.post(
        Uri.parse('$_baseUrl/events'),
        headers: {
          'X-API-Key': _apiKey,
          'X-API-Secret': _apiSecret,
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'event_name': eventName,
          if (_customerId != null) 'customer_id': _customerId,
          'timestamp': DateTime.now().toUtc().toIso8601String(),
          'platform': 'mobile',
          'source': 'flutter_sdk',
          if (properties != null) 'properties': properties,
        }),
      );
    } catch (_) {}
  }

  static void reset() { _customerId = null; }
}
```

### Android (Kotlin)

```kotlin
object Storees {
    private const val BASE_URL = "https://api.storees.io/api/v1"
    private var apiKey = ""
    private var apiSecret = ""
    private var customerId: String? = null

    fun init(apiKey: String, apiSecret: String) {
        this.apiKey = apiKey; this.apiSecret = apiSecret
    }

    fun identify(customerId: String, email: String? = null, phone: String? = null, name: String? = null) {
        this.customerId = customerId
        track("customer_identified", mapOf("email" to email, "phone" to phone, "name" to name).filterValues { it != null })
    }

    fun track(eventName: String, properties: Map<String, Any?>? = null) {
        // Fire-and-forget on IO thread
        kotlinx.coroutines.GlobalScope.launch(Dispatchers.IO) {
            val json = JSONObject().apply {
                put("event_name", eventName)
                customerId?.let { put("customer_id", it) }
                put("timestamp", java.time.Instant.now().toString())
                put("platform", "mobile")
                properties?.let { put("properties", JSONObject(it)) }
            }
            val url = URL("$BASE_URL/events")
            (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("X-API-Key", apiKey)
                setRequestProperty("X-API-Secret", apiSecret)
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
                outputStream.write(json.toString().toByteArray())
                responseCode
                disconnect()
            }
        }
    }

    fun reset() { customerId = null }
}
```

### iOS (Swift)

```swift
final class Storees {
    static let shared = Storees()
    private var apiKey = "", apiSecret = ""
    private var customerId: String?

    func initialize(apiKey: String, apiSecret: String) {
        self.apiKey = apiKey; self.apiSecret = apiSecret
    }

    func identify(customerId: String, email: String? = nil, phone: String? = nil, name: String? = nil) {
        self.customerId = customerId
        var props: [String: Any] = [:]
        if let e = email { props["email"] = e }
        if let p = phone { props["phone"] = p }
        if let n = name { props["name"] = n }
        track("customer_identified", properties: props)
    }

    func track(_ eventName: String, properties: [String: Any]? = nil) {
        var body: [String: Any] = [
            "event_name": eventName,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "platform": "mobile",
        ]
        if let id = customerId { body["customer_id"] = id }
        if let p = properties { body["properties"] = p }

        guard let url = URL(string: "https://api.storees.io/api/v1/events"),
              let data = try? JSONSerialization.data(withJSONObject: body) else { return }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        req.setValue(apiSecret, forHTTPHeaderField: "X-API-Secret")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        URLSession.shared.dataTask(with: req) { _, _, _ in }.resume()
    }

    func reset() { customerId = nil }
}
```

---

## 7. Delivery Tracking

When Storees sends messages (email, SMS, WhatsApp, push), delivery receipts flow back automatically:

| Channel | Sent | Delivered | Read/Opened | Clicked | Failed |
|---------|------|-----------|-------------|---------|--------|
| Email (Resend) | Yes | Yes | Yes | Yes | Yes |
| SMS (Twilio/Gupshup/etc) | Yes | Yes | No | Yes (short URL) | Yes |
| WhatsApp | Yes | Yes | Yes | No | Yes |
| Push (FCM) | Yes | Yes | No | Yes | Yes |

Webhook endpoints:
- Resend: `POST /api/webhooks/resend`
- Twilio: `POST /api/webhooks/channel/twilio`
- Gupshup: `POST /api/webhooks/channel/gupshup`
- Bird: `POST /api/webhooks/channel/bird`
- Vonage: `POST /api/webhooks/channel/vonage`
- WhatsApp (Meta): `POST /api/webhooks/channel/whatsapp`

All delivery data feeds into: engagement scoring, optimal send time, best channel prediction, campaign analytics, and customer activity timeline.

---

## 8. What Storees Does With Your Data

| Data | Storees Feature |
|------|----------------|
| `order_completed` | CLV, order history, RFM segments, revenue analytics |
| `product_viewed` | "Viewed but didn't buy" segments, product analytics |
| `added_to_cart` + no order | Cart abandonment flows, recovery campaigns |
| `session_started/ended` | Engagement scoring, dormancy detection |
| `customer_created` | Onboarding flows, welcome campaigns |
| All events | Funnel analysis, cohort retention, AI predictions, lifecycle segmentation |

---

## 9. Rate Limits & Idempotency

| Limit | Value |
|-------|-------|
| Single events | 1,000 requests/minute per API key |
| Batch events | 1,000 events per batch, 100 batches/minute |
| SDK events | Batched client-side (20 events or 30s interval) |

**Idempotency keys** prevent duplicate processing:
| Event | Key format |
|-------|-----------|
| `order_completed` | `order_{order_id}` |
| `customer_created` | `cust_{customer_id}` |
| `cart_created` | `cart_{cart_id}` |

---

## 10. Testing

```bash
curl -X POST https://api.storees.io/api/v1/events \
  -H "X-API-Key: strs_pub_xxxx" \
  -H "X-API-Secret: strs_sec_xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "event_name": "order_completed",
    "customer_email": "test@example.com",
    "properties": {
      "order_id": "test_001",
      "order_total": 999,
      "line_items": [{"product_name": "Test Product", "unit_price": 999, "quantity": 1}]
    }
  }'
```

Verify: Dashboard → Customers → find test customer → Activity tab should show the event.

---

## Integration Checklist

### Backend Team
- [ ] Set `STOREES_API_KEY` and `STOREES_API_SECRET` in your env
- [ ] Push historical customers via `POST /api/v1/customers`
- [ ] Push historical orders via `POST /api/v1/events/batch`
- [ ] Add webhook for new orders → `order_completed`
- [ ] Add webhook for cancellations → `order_cancelled`
- [ ] Add webhook for new customers → `customer_created`
- [ ] Test with cURL, verify in Storees dashboard

### Frontend Team
- [ ] Add SDK script tag or install `@storees/react`
- [ ] Call `init()` with project API key
- [ ] Call `identify()` on login / authenticated pages
- [ ] Track `product_viewed` on product detail pages
- [ ] Track `added_to_cart` on cart button clicks
- [ ] Track `added_to_wishlist` on wishlist button clicks
- [ ] Test: browse product → check customer activity in dashboard

### Mobile Team
- [ ] Copy SDK wrapper class into project
- [ ] Call `init()` in app startup
- [ ] Call `identify()` on login
- [ ] Track product/cart/wishlist events
- [ ] Call `reset()` on logout
- [ ] Test: open product → check activity in dashboard
