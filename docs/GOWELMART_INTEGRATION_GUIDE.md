# GoWelmart Integration Guide

Integration guide for connecting GoWelmart (Medusa-based ecommerce) to Storees CDP.

---

## Overview

Storees receives data through three channels:

| Channel | What it captures | Integrated by |
|---------|-----------------|---------------|
| **Backend API** (webhooks) | Orders, customers, cancellations | Backend team |
| **Web SDK** (JavaScript / React) | Product views, cart actions, browsing | Frontend web team |
| **Mobile SDK** (Flutter / Android / iOS) | Product views, cart actions, app events | Mobile team |

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

## 5. One-Time Historical Sync

Before webhooks go live, push all existing customers, orders, and carts into Storees. This is a one-time bulk import using the same APIs.

### Step 1: Push all existing customers

```
POST /api/v1/customers
```

Iterate through your entire customer database and push each one:

```javascript
// Node.js example — run once
const STOREES_URL = 'https://api.storees.io/api/v1';
const HEADERS = {
  'X-API-Key': process.env.STOREES_API_KEY,
  'X-API-Secret': process.env.STOREES_API_SECRET,
  'Content-Type': 'application/json',
};

// Fetch all customers from your database (paginate as needed)
const customers = await getAllCustomers(); // your Medusa query

for (const customer of customers) {
  await fetch(`${STOREES_URL}/customers`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      customer_id: customer.id,
      attributes: {
        email: customer.email,
        phone: customer.phone,
        name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        company_name: customer.metadata?.shop_name,
        dealer_id: customer.metadata?.dealer_id,
        city: customer.metadata?.city,
      },
    }),
  });
}
```

### Step 2: Push all historical orders (batch)

```
POST /api/v1/events/batch
```

Push orders in batches of up to 1,000:

```javascript
const orders = await getAllOrders(); // your Medusa query
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
        customer_email: order.email,
        timestamp: order.created_at,
        idempotency_key: `order_${order.id}`,
        properties: {
          order_id: order.id,
          display_id: order.display_id,
          order_total: order.total / 100,
          discount_total: order.discount_total / 100,
          currency: order.currency_code,
          status: order.status,
          line_items: order.items.map(item => ({
            product_id: item.variant?.product_id,
            product_name: item.title,
            variant_sku: item.variant?.sku,
            unit_price: item.unit_price / 100,
            quantity: item.quantity,
          })),
          city: order.shipping_address?.city,
          province: order.shipping_address?.province,
        },
      })),
    }),
  });

  console.log(`Pushed orders ${i + 1} to ${Math.min(i + BATCH_SIZE, orders.length)} of ${orders.length}`);
}
```

### Step 3: Push abandoned carts

```javascript
const abandonedCarts = await getAbandonedCarts(); // carts where completed = false

for (let i = 0; i < abandonedCarts.length; i += BATCH_SIZE) {
  const batch = abandonedCarts.slice(i, i + BATCH_SIZE);

  await fetch(`${STOREES_URL}/events/batch`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      events: batch.flatMap(cart => [
        {
          event_name: 'added_to_cart',
          customer_id: cart.customer_id,
          timestamp: cart.created_at,
          idempotency_key: `cart_add_${cart.id}`,
          properties: {
            cart_id: cart.id,
            total: cart.total / 100,
            line_items: cart.items.map(item => ({
              product_id: item.variant?.product_id,
              product_name: item.title,
              unit_price: item.unit_price / 100,
              quantity: item.quantity,
            })),
          },
        },
        {
          event_name: 'cart_abandoned',
          customer_id: cart.customer_id,
          timestamp: cart.updated_at,
          idempotency_key: `cart_abandon_${cart.id}`,
          properties: {
            cart_id: cart.id,
            total: cart.total / 100,
          },
        },
      ]),
    }),
  });
}
```

### Sync Order

Run the steps in this order:
1. **Customers first** — so identity resolution works when events arrive
2. **Orders** — creates order history and CLV
3. **Carts** — abandoned cart data for recovery flows

### Idempotency

All events use `idempotency_key` — if you run the sync twice, duplicates are silently ignored. Safe to re-run.

### After Sync

Once the historical sync is complete:
- Customer profiles, order history, and CLV will appear in the Storees dashboard
- Segments will auto-evaluate and assign customers
- Then switch on webhooks for real-time events going forward

---

## 6. SDK Hosting

The Storees JavaScript SDK is served from the backend. There is no separate CDN — the backend exposes the built SDK file at:

```
https://api.storees.io/sdk/storees.min.js
```

> **For self-hosted deployments**: The SDK file lives at `packages/sdk/dist/storees.min.js` after building. The backend serves it via a static route at `/sdk/`. If you're running the backend on your own server, ensure `packages/sdk/dist/` is built and accessible.
>
> **Build the SDK:**
> ```bash
> cd packages/sdk
> npm run build
> # Outputs: dist/storees.min.js, dist/storees.umd.js, dist/storees.esm.js
> ```

---

## 7. Web Frontend SDK (JavaScript)

Install the Storees SDK on GoWelmart's customer-facing website to capture browsing behavior.

### Option A: Script Tag (any website)

```html
<!-- Add before </body> on every page -->
<script src="https://api.storees.io/sdk/storees.min.js"></script>
<script>
  Storees.init({
    apiKey: 'strs_pub_xxxxx',
    apiUrl: 'https://api.storees.io',
  });
</script>
```

This automatically tracks:
- `page_viewed` — every page navigation
- `session_started` / `session_ended` — visit sessions with duration

### Option B: npm install (React / Next.js)

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
Storees.identify('cus_01JWFF8ZV1V2Y0DK4CGH67K5X2', {
  email: 'ak@gmail.com',
  phone: '9344558795',
  name: 'Arun Kumar',
});
```

### Frontend Events to Track

| Event | Where to fire | Properties |
|-------|--------------|---------|
| `product_viewed` | Product detail page load | `{ product_id, product_name, product_type, price }` |
| `collection_viewed` | Category/collection page | `{ collection_name, collection_id }` |
| `added_to_cart` | Add to cart button click | `{ product_id, product_name, price, quantity }` |
| `added_to_wishlist` | Wishlist button click | `{ product_id, product_name, price }` |
| `checkout_started` | Checkout page load | `{ cart_id, total, item_count }` |

```javascript
// Product detail page
Storees.track('product_viewed', {
  product_id: 'prod_01K6DESD1H5MBAC96N6PB1B05D',
  product_name: 'ONEPLUS 13S 5G FRESH',
  product_type: 'Electronics',
  price: 49490,
  variant_sku: '17176',
});

// Add to cart
Storees.track('added_to_cart', {
  product_id: 'prod_01K6DESD1H5MBAC96N6PB1B05D',
  product_name: 'ONEPLUS 13S 5G FRESH',
  price: 49490,
  quantity: 1,
});

// Wishlist
Storees.track('added_to_wishlist', {
  product_id: 'prod_01K6DESD1H5MBAC96N6PB1B05D',
  product_name: 'ONEPLUS 13S 5G FRESH',
  price: 49490,
});

// Collection page
Storees.track('collection_viewed', {
  collection_name: 'New Arrivals',
  collection_id: 'col_123',
});
```

---

## 8. Flutter SDK Integration

No native Flutter SDK yet — use the REST API directly. Create a lightweight wrapper:

```dart
// lib/services/storees.dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class Storees {
  static const String _baseUrl = 'https://api.storees.io/api/v1';
  static String _apiKey = '';
  static String _apiSecret = '';
  static String? _customerId;
  static Map<String, dynamic> _userAttributes = {};

  /// Initialize with your API credentials
  static void init({
    required String apiKey,
    required String apiSecret,
  }) {
    _apiKey = apiKey;
    _apiSecret = apiSecret;
  }

  /// Identify a logged-in customer
  static void identify(String customerId, {
    String? email,
    String? phone,
    String? name,
    Map<String, dynamic>? attributes,
  }) {
    _customerId = customerId;
    _userAttributes = {
      if (email != null) 'email': email,
      if (phone != null) 'phone': phone,
      if (name != null) 'name': name,
      ...?attributes,
    };
    track('customer_identified', properties: _userAttributes);
  }

  /// Track an event
  static Future<void> track(String eventName, {
    Map<String, dynamic>? properties,
  }) async {
    final body = {
      'event_name': eventName,
      if (_customerId != null) 'customer_id': _customerId,
      if (_userAttributes['email'] != null) 'customer_email': _userAttributes['email'],
      if (_userAttributes['phone'] != null) 'customer_phone': _userAttributes['phone'],
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'platform': 'mobile',
      'source': 'flutter_sdk',
      if (properties != null) 'properties': properties,
    };

    try {
      await http.post(
        Uri.parse('$_baseUrl/events'),
        headers: {
          'X-API-Key': _apiKey,
          'X-API-Secret': _apiSecret,
          'Content-Type': 'application/json',
        },
        body: jsonEncode(body),
      );
    } catch (e) {
      // Silently fail — don't crash the app for analytics
      debugPrint('Storees track error: $e');
    }
  }

  /// Reset identity (on logout)
  static void reset() {
    _customerId = null;
    _userAttributes = {};
  }
}
```

### Usage in Flutter

```dart
// main.dart — Initialize once
void main() {
  Storees.init(
    apiKey: 'strs_pub_xxxxx',
    apiSecret: 'strs_sec_xxxxx',
  );
  runApp(MyApp());
}

// On login
Storees.identify('cus_01JWFF8ZV1V2Y0DK4CGH67K5X2',
  email: 'ak@gmail.com',
  phone: '9344558795',
  name: 'Arun Kumar',
);

// On product detail page
Storees.track('product_viewed', properties: {
  'product_id': 'prod_01K6DESD1H5MBAC96N6PB1B05D',
  'product_name': 'ONEPLUS 13S 5G FRESH',
  'product_type': 'Electronics',
  'price': 49490,
});

// On add to cart
Storees.track('added_to_cart', properties: {
  'product_id': 'prod_01K6DESD1H5MBAC96N6PB1B05D',
  'product_name': 'ONEPLUS 13S 5G FRESH',
  'price': 49490,
  'quantity': 1,
});

// On logout
Storees.reset();
```

### Add to `pubspec.yaml`

```yaml
dependencies:
  http: ^1.2.0
```

---

## 9. Android SDK Integration (Kotlin)

```kotlin
// StoreesSdk.kt
package io.storees.sdk

import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object Storees {
    private const val BASE_URL = "https://api.storees.io/api/v1"
    private var apiKey: String = ""
    private var apiSecret: String = ""
    private var customerId: String? = null
    private var userEmail: String? = null
    private var userPhone: String? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    fun init(apiKey: String, apiSecret: String) {
        this.apiKey = apiKey
        this.apiSecret = apiSecret
    }

    fun identify(
        customerId: String,
        email: String? = null,
        phone: String? = null,
        name: String? = null,
        attributes: Map<String, Any>? = null
    ) {
        this.customerId = customerId
        this.userEmail = email
        this.userPhone = phone
        val props = mutableMapOf<String, Any>()
        if (name != null) props["name"] = name
        attributes?.let { props.putAll(it) }
        track("customer_identified", props)
    }

    fun track(eventName: String, properties: Map<String, Any>? = null) {
        scope.launch {
            try {
                val json = JSONObject().apply {
                    put("event_name", eventName)
                    customerId?.let { put("customer_id", it) }
                    userEmail?.let { put("customer_email", it) }
                    userPhone?.let { put("customer_phone", it) }
                    put("timestamp", java.time.Instant.now().toString())
                    put("platform", "mobile")
                    put("source", "android_sdk")
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
                    responseCode // trigger the request
                    disconnect()
                }
            } catch (e: Exception) {
                // Silent fail
            }
        }
    }

    fun reset() {
        customerId = null
        userEmail = null
        userPhone = null
    }
}
```

### Usage in Android

```kotlin
// Application.kt
class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Storees.init(
            apiKey = "strs_pub_xxxxx",
            apiSecret = "strs_sec_xxxxx"
        )
    }
}

// On login
Storees.identify(
    customerId = "cus_01JWFF8ZV1V2Y0DK4CGH67K5X2",
    email = "ak@gmail.com",
    phone = "9344558795",
    name = "Arun Kumar"
)

// On product detail screen
Storees.track("product_viewed", mapOf(
    "product_id" to "prod_01K6DESD1H5MBAC96N6PB1B05D",
    "product_name" to "ONEPLUS 13S 5G FRESH",
    "product_type" to "Electronics",
    "price" to 49490
))

// On add to cart
Storees.track("added_to_cart", mapOf(
    "product_id" to "prod_01K6DESD1H5MBAC96N6PB1B05D",
    "product_name" to "ONEPLUS 13S 5G FRESH",
    "price" to 49490,
    "quantity" to 1
))

// On logout
Storees.reset()
```

### Add to `build.gradle`

```groovy
// No extra dependencies needed — uses java.net.HttpURLConnection
// For coroutines (likely already in your project):
implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
```

---

## 10. iOS SDK Integration (Swift)

```swift
// Storees.swift
import Foundation

final class Storees {
    static let shared = Storees()
    
    private var apiKey: String = ""
    private var apiSecret: String = ""
    private var customerId: String?
    private var userEmail: String?
    private var userPhone: String?
    private let baseURL = "https://api.storees.io/api/v1"
    private let session = URLSession.shared
    
    private init() {}
    
    func initialize(apiKey: String, apiSecret: String) {
        self.apiKey = apiKey
        self.apiSecret = apiSecret
    }
    
    func identify(
        customerId: String,
        email: String? = nil,
        phone: String? = nil,
        name: String? = nil,
        attributes: [String: Any]? = nil
    ) {
        self.customerId = customerId
        self.userEmail = email
        self.userPhone = phone
        var props: [String: Any] = [:]
        if let name = name { props["name"] = name }
        if let attrs = attributes { props.merge(attrs) { _, new in new } }
        track("customer_identified", properties: props)
    }
    
    func track(_ eventName: String, properties: [String: Any]? = nil) {
        var body: [String: Any] = [
            "event_name": eventName,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "platform": "mobile",
            "source": "ios_sdk",
        ]
        if let id = customerId { body["customer_id"] = id }
        if let email = userEmail { body["customer_email"] = email }
        if let phone = userPhone { body["customer_phone"] = phone }
        if let props = properties { body["properties"] = props }
        
        guard let url = URL(string: "\(baseURL)/events"),
              let jsonData = try? JSONSerialization.data(withJSONObject: body)
        else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        request.setValue(apiSecret, forHTTPHeaderField: "X-API-Secret")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = jsonData
        
        session.dataTask(with: request) { _, _, _ in
            // Silent fail — don't crash the app for analytics
        }.resume()
    }
    
    func reset() {
        customerId = nil
        userEmail = nil
        userPhone = nil
    }
}
```

### Usage in iOS

```swift
// AppDelegate.swift or App init
Storees.shared.initialize(
    apiKey: "strs_pub_xxxxx",
    apiSecret: "strs_sec_xxxxx"
)

// On login
Storees.shared.identify(
    customerId: "cus_01JWFF8ZV1V2Y0DK4CGH67K5X2",
    email: "ak@gmail.com",
    phone: "9344558795",
    name: "Arun Kumar"
)

// On product detail screen
Storees.shared.track("product_viewed", properties: [
    "product_id": "prod_01K6DESD1H5MBAC96N6PB1B05D",
    "product_name": "ONEPLUS 13S 5G FRESH",
    "product_type": "Electronics",
    "price": 49490,
])

// On add to cart
Storees.shared.track("added_to_cart", properties: [
    "product_id": "prod_01K6DESD1H5MBAC96N6PB1B05D",
    "product_name": "ONEPLUS 13S 5G FRESH",
    "price": 49490,
    "quantity": 1,
])

// On add to wishlist
Storees.shared.track("added_to_wishlist", properties: [
    "product_id": "prod_01K6DESD1H5MBAC96N6PB1B05D",
    "product_name": "ONEPLUS 13S 5G FRESH",
    "price": 49490,
])

// On logout
Storees.shared.reset()
```

### SwiftUI Example

```swift
struct ProductDetailView: View {
    let product: Product
    
    var body: some View {
        ScrollView { /* ... */ }
            .onAppear {
                Storees.shared.track("product_viewed", properties: [
                    "product_id": product.id,
                    "product_name": product.title,
                    "product_type": product.type,
                    "price": product.price,
                ])
            }
    }
}
```

No external dependencies required — uses Foundation's `URLSession`.

---

## 11. What Storees Does With This Data

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

## 12. Testing the Integration

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

## 13. Rate Limits

| Limit | Value |
|-------|-------|
| Single events | 1,000 requests/minute per API key |
| Batch events | 1,000 events per batch, 100 batches/minute |
| SDK events | Batched client-side (20 events or 30s interval) |

---

## 14. Idempotency

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

### Frontend Web Team
- [ ] Add Storees SDK script tag (or install `@storees/react`)
- [ ] Call `init()` with project API key
- [ ] Call `identify()` on login/authenticated pages
- [ ] Add `product_viewed` tracking on product detail pages
- [ ] Add `added_to_cart` tracking on cart button clicks
- [ ] Add `added_to_wishlist` tracking on wishlist button clicks
- [ ] Add `collection_viewed` on category pages
- [ ] Test: view product → check customer activity in Storees dashboard

### Mobile Team (Flutter / Android / iOS)
- [ ] Copy the SDK wrapper class into your project (Section 7/8/9)
- [ ] Call `init()` in app startup with API key + secret
- [ ] Call `identify()` on login
- [ ] Add `product_viewed` on product detail screen appear
- [ ] Add `added_to_cart` on cart button tap
- [ ] Add `added_to_wishlist` on wishlist button tap
- [ ] Call `reset()` on logout
- [ ] Test: open product → check customer activity in Storees dashboard

### Push Notification Token Sync
- [ ] On app launch, get FCM token and send to Storees:
  ```
  POST /api/v1/customers
  { "customer_id": "<medusa_customer_id>", "attributes": { "fcm_token": "<token>", "push_subscribed": true } }
  ```
- [ ] Handle `onTokenRefresh` — resend updated token to Storees
- [ ] On notification tap, track event:
  ```
  Storees.track('push_clicked', { message_id: '<from notification data>' })
  ```
- [ ] GoWelmart stores tokens in `metadata.device_id` — Storees reads from `custom_attributes.fcm_token`
- [ ] 6,123 existing tokens already synced from historical backfill
