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

## 7. Push Notification Integration

Push notifications require client-side setup to register devices and obtain tokens. Storees uses **Firebase Cloud Messaging (FCM)** for push delivery.

### Prerequisites

1. Create a [Firebase project](https://console.firebase.google.com)
2. Enable Cloud Messaging in Project Settings → Cloud Messaging
3. Generate a **service account key** (Project Settings → Service Accounts → Generate New Private Key)
4. Configure in Storees: Settings → Messaging Channels → Push → FCM → paste Project ID + Service Account Key JSON

### Web Push (Browser Notifications)

#### Step 1: Add Firebase to your website

```html
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"></script>
<script>
  firebase.initializeApp({
    apiKey: "your-firebase-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    messagingSenderId: "123456789",
    appId: "your-app-id",
  });
</script>
```

#### Step 2: Create a Service Worker

Create `public/firebase-messaging-sw.js` in your web root:

```javascript
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "your-firebase-api-key",
  projectId: "your-project-id",
  messagingSenderId: "123456789",
  appId: "your-app-id",
});

const messaging = firebase.messaging();

// Handle background push notifications
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Notification', {
    body: body || '',
    icon: icon || '/favicon.ico',
    data: payload.data,
  });
});
```

#### Step 3: Request Permission + Register Token with Storees

```javascript
async function registerPushNotifications() {
  const messaging = firebase.messaging();

  // Request notification permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  // Get FCM token
  const token = await messaging.getToken({
    vapidKey: 'your-vapid-key-from-firebase-console',
  });

  // Send token to Storees — stored as customer attribute
  await fetch('https://api.storees.io/api/v1/customers', {
    method: 'POST',
    headers: {
      'X-API-Key': 'strs_pub_xxxx',
      'X-API-Secret': 'strs_sec_xxxx',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: 'your-customer-id',
      attributes: {
        fcm_token: token,
        push_subscribed: true,
      },
    }),
  });

  // Handle foreground messages
  messaging.onMessage((payload) => {
    const { title, body } = payload.notification || {};
    new Notification(title || 'Notification', { body });
  });
}

// Call after user login or on page load
registerPushNotifications();
```

#### React / Next.js Version

```tsx
'use client';
import { useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function usePushNotifications(customerId: string | null) {
  useEffect(() => {
    if (!customerId || typeof window === 'undefined') return;

    async function register() {
      const app = initializeApp(firebaseConfig);
      const messaging = getMessaging(app);

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      });

      // Register token with Storees
      await fetch('/api/v1/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          attributes: { fcm_token: token, push_subscribed: true },
        }),
      });

      // Foreground notification handler
      onMessage(messaging, (payload) => {
        const { title, body } = payload.notification ?? {};
        new Notification(title ?? 'New message', { body });
      });
    }

    register().catch(console.error);
  }, [customerId]);
}
```

### Flutter Push (Android + iOS)

```yaml
# pubspec.yaml
dependencies:
  firebase_core: ^3.0.0
  firebase_messaging: ^15.0.0
```

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

class PushService {
  static Future<void> init() async {
    await Firebase.initializeApp();
    final messaging = FirebaseMessaging.instance;

    // Request permission (iOS requires explicit request)
    await messaging.requestPermission(alert: true, badge: true, sound: true);

    // Get FCM token
    final token = await messaging.getToken();
    if (token != null) {
      // Register with Storees
      Storees.track('push_token_registered', properties: {'fcm_token': token});
      // Also update customer attributes
      // POST /api/v1/customers with { attributes: { fcm_token: token, push_subscribed: true } }
    }

    // Handle token refresh
    messaging.onTokenRefresh.listen((newToken) {
      Storees.track('push_token_registered', properties: {'fcm_token': newToken});
    });

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      // Show local notification or in-app banner
      print('Foreground: ${message.notification?.title}');
    });

    // Handle background/terminated tap
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      Storees.track('push_clicked', properties: {
        'message_id': message.data['message_id'],
      });
    });
  }
}

// Call in main.dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await PushService.init();
  Storees.init(apiKey: '...', apiSecret: '...');
  runApp(MyApp());
}
```

### Android Native (Kotlin)

```kotlin
// Add to build.gradle
implementation 'com.google.firebase:firebase-messaging:24.0.0'
```

```kotlin
// MyFirebaseMessagingService.kt
class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // Register token with Storees
        Storees.track("push_token_registered", mapOf("fcm_token" to token))
    }

    override fun onMessageReceived(message: RemoteMessage) {
        message.notification?.let { notification ->
            // Show notification
            val builder = NotificationCompat.Builder(this, "storees_channel")
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(notification.title)
                .setContentText(notification.body)
                .setAutoCancel(true)

            NotificationManagerCompat.from(this).notify(System.currentTimeMillis().toInt(), builder.build())
        }
    }
}
```

```xml
<!-- AndroidManifest.xml -->
<service android:name=".MyFirebaseMessagingService" android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

### iOS Native (Swift)

```swift
// AppDelegate.swift
import FirebaseCore
import FirebaseMessaging

class AppDelegate: NSObject, UIApplicationDelegate, MessagingDelegate, UNUserNotificationCenterDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self

        // Request permission
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            if granted { DispatchQueue.main.async { application.registerForRemoteNotifications() } }
        }
        return true
    }

    // FCM token received
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        Storees.shared.track("push_token_registered", properties: ["fcm_token": token])
    }

    // Foreground notification
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    // Notification tapped
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let data = response.notification.request.content.userInfo
        Storees.shared.track("push_clicked", properties: ["message_id": data["message_id"] as? String ?? ""])
        completionHandler()
    }
}
```

### Syncing Existing FCM Tokens (Historical Backfill)

If your platform already has FCM tokens stored per customer (e.g., in a `device_id` or `fcm_token` field), push them to Storees during the historical sync:

```javascript
// Batch sync existing tokens
const customers = await getAllCustomersFromYourDB();
const BATCH_SIZE = 200;

for (let i = 0; i < customers.length; i += BATCH_SIZE) {
  const batch = customers.slice(i, i + BATCH_SIZE);

  for (const customer of batch) {
    if (!customer.fcm_token && !customer.device_id) continue;

    await fetch('https://api.storees.io/api/v1/customers', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        customer_id: customer.id,
        attributes: {
          fcm_token: customer.fcm_token || customer.device_id,
          push_subscribed: true,
        },
      }),
    });
  }

  console.log(`Synced ${Math.min(i + BATCH_SIZE, customers.length)}/${customers.length} tokens`);
}
```

**Where Storees stores the token:** `customers.custom_attributes.fcm_token`

**Important:** The FCM token is the key that links a customer to their device. Without it, push notifications cannot be delivered — the campaign will show "Failed" for customers missing tokens.

### Real-Time Token Updates

After the initial sync, keep tokens updated by calling the Storees API whenever:

| Event | When | What to send |
|-------|------|-------------|
| App first launch | User opens app for the first time | `fcm_token` + `push_subscribed: true` |
| Token refresh | Firebase calls `onTokenRefresh` | Updated `fcm_token` |
| User login | Customer authenticates | Link `fcm_token` to `customer_id` |
| User logout | Customer signs out | `push_subscribed: false` (optional) |
| Uninstall detected | Token becomes invalid | FCM returns error → Storees auto-disables |

### How Push Delivery Works

```
Storees sends push campaign/flow
  → Reads customer.custom_attributes.fcm_token
  → Calls FCM API: POST fcm.googleapis.com/v1/projects/{id}/messages:send
  → FCM delivers to device
  → Device shows notification
  → User taps → app fires push_clicked event back to Storees
  → Storees records click in activity timeline + updates engagement score
```

### Push Checklist
- [ ] Firebase project created
- [ ] FCM configured in Storees Settings → Channels → Push
- [ ] Service worker added (web) or Firebase SDK initialized (mobile)
- [ ] Permission requested from user
- [ ] FCM token sent to Storees via `POST /api/v1/customers` with `fcm_token` attribute
- [ ] Token refresh handler registered
- [ ] Foreground message handler (show banner/notification)
- [ ] Notification tap handler → track `push_clicked` event
- [ ] Test: send push campaign from Storees → notification appears on device

---

## 8. WhatsApp Opt-In & SMS Consent

Storees enforces consent checks before sending promotional messages. You must collect and sync consent status.

### Update Subscription Status

```javascript
// When user opts in or out of a channel
await fetch('https://api.storees.io/api/v1/customers', {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify({
    customer_id: 'cust_123',
    attributes: {
      email_subscribed: true,
      sms_subscribed: true,
      push_subscribed: true,
      whatsapp_subscribed: true,   // set false to block WhatsApp
    },
  }),
});
```

### WhatsApp Opt-In Flow

WhatsApp Business requires explicit opt-in. Common patterns:
1. **Website checkbox**: "I agree to receive updates on WhatsApp" → set `whatsapp_subscribed: true`
2. **WhatsApp keyword**: Customer sends "START" to your WhatsApp number → your backend calls Storees API
3. **QR code**: Customer scans QR → opens WhatsApp → sends first message → your backend updates Storees

### SMS Consent (India DND compliance)

For Indian phone numbers, ensure:
- Customer gave explicit consent (checkbox, form, or verbal)
- Transactional SMS can be sent to DND numbers
- Promotional SMS **cannot** be sent to DND-registered numbers
- Set `sms_subscribed: false` for DND numbers

### Email Unsubscribe

Storees email templates include `{{unsubscribe_url}}` — this links to a preference page. When a customer unsubscribes:
- Resend webhook fires `email.complained` or unsubscribe event
- Storees auto-sets `email_subscribed: false`
- Future promotional emails are blocked (transactional still delivered)

---

## 9. Shopify Integration (OAuth)

If your platform is Shopify-based, use the built-in OAuth flow instead of manual API integration.

### Setup

1. Go to Storees Dashboard → Integrations → Connect Shopify
2. Enter your `.myshopify.com` domain
3. Authorize the app (redirects to Shopify OAuth)
4. Storees auto-registers webhooks and starts historical sync

### What's Automated

| Data | How | Frequency |
|------|-----|-----------|
| Customers | Synced from Shopify API | Initial sync + webhooks |
| Orders | Synced from Shopify API | Initial sync + webhooks |
| Products | Synced from Shopify API | Initial sync |
| Collections | Synced from Shopify API | Initial sync |
| Cart events | Shopify webhooks | Real-time |
| Checkout events | Shopify webhooks | Real-time |

### Shopify Webhooks Registered

```
customers/create → customer_created
customers/update → customer_updated
orders/create → order_placed
orders/fulfilled → order_fulfilled
orders/cancelled → order_cancelled
checkouts/create → checkout_started
carts/create → cart_created
```

### After Shopify Connection

- All customer data, orders, and products appear in Storees
- Segments auto-evaluate against synced data
- You still need the **frontend SDK** on your Shopify storefront for `product_viewed` and browsing events:

```liquid
<!-- theme.liquid, before </body> -->
<script src="https://api.storees.io/sdk/storees.min.js"></script>
<script>
  Storees.init({ apiKey: 'strs_pub_xxxx', apiUrl: 'https://api.storees.io' });
  {% if customer %}
    Storees.identify('{{ customer.id }}', {
      email: '{{ customer.email }}',
      name: '{{ customer.first_name }} {{ customer.last_name }}',
    });
  {% endif %}
</script>
```

For product pages, add to `product.liquid`:
```liquid
<script>
  Storees.track('product_viewed', {
    product_id: '{{ product.id }}',
    product_name: '{{ product.title | escape }}',
    product_type: '{{ product.type | escape }}',
    price: {{ product.price | divided_by: 100.0 }},
  });
</script>
```

---

## 10. Delivery Tracking (all channels)

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

## 11. What Storees Does With Your Data

| Data | Storees Feature |
|------|----------------|
| `order_completed` | CLV, order history, RFM segments, revenue analytics |
| `product_viewed` | "Viewed but didn't buy" segments, product analytics |
| `added_to_cart` + no order | Cart abandonment flows, recovery campaigns |
| `session_started/ended` | Engagement scoring, dormancy detection |
| `customer_created` | Onboarding flows, welcome campaigns |
| All events | Funnel analysis, cohort retention, AI predictions, lifecycle segmentation |

---

## 12. Rate Limits & Idempotency

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

## 13. Testing

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
