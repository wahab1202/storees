# Storees — Developer Integration Guide

> How to integrate Storees into your application to track customer events, build profiles, and power segmentation.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [JavaScript SDK (`@storees/sdk`)](#javascript-sdk)
4. [React / Next.js SDK (`@storees/react`)](#react--nextjs-sdk)
5. [Identifying Customers](#identifying-customers)
6. [Tracking Events](#tracking-events)
7. [Batch Event Ingestion](#batch-event-ingestion)
8. [How Storees Processes Your Data](#how-storees-processes-your-data)
9. [Domain-Specific Events](#domain-specific-events)
10. [API Reference](#api-reference)
11. [REST API (Server-Side)](#rest-api-server-side)

---

## Getting Started

### 1. Create a project

During onboarding, you select a **domain type** (`fintech`, `ecommerce`, `saas`, or `custom`). Storees uses the domain type to pre-configure segment templates, metrics, and suggested events for your use case.

### 2. Get your API key

After project creation, you receive:

| Key | Format | Usage |
|-----|--------|-------|
| **Public key** | `sk_live_<48 hex chars>` | Embed in your client-side app. Safe to expose. |
| **Secret key** | `ss_live_<64 hex chars>` | Server-to-server calls only. Shown once — save it. |

For client-side SDKs (browser, mobile), you only need the **public key**. The secret key is for server-side integrations where you need full read/write access.

### 3. Set up environment variables

```env
STOREES_API_URL=https://your-storees-instance.com   # or http://localhost:3003 for local
STOREES_API_KEY=sk_live_your_api_key_here
```

---

## Authentication

All API calls require the `X-API-Key` header:

```
X-API-Key: sk_live_your_api_key_here
```

The API key is tied to your **project**. All events sent with this key automatically belong to that project — you never need to pass a project ID in your requests.

**Rate limit:** 1,000 requests/minute per API key (configurable).

---

## JavaScript SDK

**Package:** `@storees/sdk`

The JavaScript SDK is the recommended way to integrate Storees into any website or SPA. It handles event batching, session management, identity resolution, device context, and offline persistence automatically.

### Script tag installation

```html
<script src="https://your-storees-instance.com/sdk/storees.min.js"></script>
<script>
  Storees.init({
    apiKey: 'sk_live_your_key_here',
    apiUrl: 'https://your-storees-instance.com',
  })
</script>
```

### npm installation

```bash
npm install @storees/sdk
```

```typescript
import Storees from '@storees/sdk'

Storees.init({
  apiKey: 'sk_live_your_key_here',
  apiUrl: 'https://your-storees-instance.com',
})
```

### Configuration

```typescript
Storees.init({
  apiKey: 'sk_live_...',
  apiUrl: 'https://your-storees-instance.com',

  // Auto-tracking (all enabled by default except clicks/scroll)
  autoTrack: {
    pageViews: true,     // Tracks page_viewed on navigation
    sessions: true,      // Tracks session_started / session_ended
    clicks: false,       // Tracks element_clicked (opt-in)
    scroll: false,       // Tracks scroll_depth_reached (opt-in)
    utm: true,           // Captures UTM params from URL
  },

  // GDPR consent
  consent: {
    required: false,     // If true, no events sent until consent given
    defaultCategories: ['necessary', 'analytics'],
  },

  // Batching
  batchSize: 20,         // Flush after 20 events
  flushInterval: 30000,  // Or every 30 seconds

  debug: false,          // Enable console logging
})
```

### SDK methods

```typescript
// Identify a user (anonymous → known)
Storees.identify('user_12345', {
  email: 'jane@example.com',
  name: 'Jane Doe',
  plan: 'premium',
})

// Track a custom event
Storees.track('transaction_completed', {
  amount: 5000,
  type: 'debit',
  channel: 'upi',
})

// Track a page view manually
Storees.page('/dashboard', { section: 'overview' })

// Update user properties without firing an event
Storees.setUserProperties({ kyc_status: 'verified' })

// Set GDPR consent
Storees.setConsent(['necessary', 'analytics', 'marketing'])

// Reset on logout (clears identity + flushes queue)
Storees.reset()
```

### What the SDK handles automatically

| Feature | Description |
|---------|-------------|
| **Event batching** | Queues events and sends them in batches of 20 (or every 30s) |
| **Offline persistence** | Failed events are saved to localStorage and retried on next page load |
| **Session tracking** | Auto-generates session IDs, tracks session start/end with duration |
| **Page views** | Auto-tracks page navigation (initial load + SPA route changes) |
| **Device context** | Captures OS, browser, screen size, language, timezone on every event |
| **UTM capture** | Extracts UTM params from URL and attaches to events |
| **Identity resolution** | Handles anonymous → identified user transition with merge |
| **Idempotency** | Auto-generates unique keys to prevent duplicate events |
| **Page unload** | Flushes pending events via `sendBeacon` before tab close |
| **Pre-init queue** | Calls made before `init()` are queued and replayed |

---

## React / Next.js SDK

**Package:** `@storees/react`

A React wrapper around `@storees/sdk` that provides a provider, hooks, and automatic route tracking for Next.js App Router.

### Installation

```bash
npm install @storees/react
```

### Setup (Next.js App Router)

Create a providers file:

```tsx
// app/providers.tsx
'use client'

import { StoreesProvider, StoreeRouteTracker } from '@storees/react'
import { usePathname } from 'next/navigation'

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <StoreesProvider
      apiKey={process.env.NEXT_PUBLIC_STOREES_API_KEY!}
      apiUrl={process.env.NEXT_PUBLIC_STOREES_API_URL!}
    >
      <StoreeRouteTracker pathname={pathname} />
      {children}
    </StoreesProvider>
  )
}
```

Wrap your layout:

```tsx
// app/layout.tsx
import { Providers } from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### Hooks

```tsx
import { useStorees, useTrack, useIdentify, useEventLog } from '@storees/react'

function LoginButton() {
  const identify = useIdentify()
  const track = useTrack()

  const handleLogin = (user) => {
    identify(user.id, { email: user.email, name: user.name, plan: user.plan })
    track('app_login', { method: 'password', device: 'web' })
  }

  return <button onClick={handleLogin}>Login</button>
}

function TransferForm() {
  const track = useTrack()

  const handleTransfer = (amount, recipient) => {
    // ... your transfer logic ...
    track('transaction_completed', { amount, type: 'debit', channel: 'upi', recipient })
  }

  return <form onSubmit={handleTransfer}>...</form>
}

function DevPanel() {
  const events = useEventLog()  // Real-time event log for dev tools

  return (
    <ul>
      {events.map(e => (
        <li key={e.id}>{e.name} — {e.timestamp.toLocaleTimeString()}</li>
      ))}
    </ul>
  )
}
```

### Available hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useStorees()` | `{ track, identify, page, setUserProperties, reset, isReady }` | Full SDK interface |
| `useTrack()` | `(eventName, properties?) => void` | Track events |
| `useIdentify()` | `(userId, attributes?) => void` | Identify users |
| `usePage()` | `(path?, properties?) => void` | Track page views |
| `useEventLog()` | `EventLogEntry[]` | Subscribe to real-time event log |

### Components

| Component | Props | Description |
|-----------|-------|-------------|
| `<StoreesProvider>` | `apiKey`, `apiUrl`, `config?` | Initializes SDK, provides context |
| `<StoreeRouteTracker>` | `pathname`, `properties?` | Auto-tracks page views on route change |

---

## Identifying Customers

Before tracking events, identify who the customer is. This creates or updates their profile in Storees.

### Endpoint

```
POST /api/v1/customers
```

### Request

```json
{
  "customer_id": "user_12345",
  "attributes": {
    "email": "jane@example.com",
    "phone": "+919876543210",
    "name": "Jane Doe",
    "plan": "premium",
    "city": "Mumbai",
    "signup_date": "2024-01-15"
  }
}
```

### How it works

- `customer_id` is **your system's user ID** — Storees uses it to uniquely identify this customer within your project.
- `email`, `phone`, and `name` are stored as first-class fields on the customer record.
- Everything else in `attributes` is stored as **custom attributes** (JSONB) — you can pass any key-value pairs relevant to your domain.
- If a customer with this `customer_id` already exists, their profile is **merged** (new attributes are added, existing ones are updated).
- If the customer doesn't exist, a new profile is created.

### Response

```json
{
  "success": true,
  "data": { "id": "29300b14-4c94-...", "created": true }
}
```

### When to call identify

- **On login** — send the full customer profile
- **On profile update** — send only the changed attributes (they merge with existing data)
- **On signup** — create the customer in Storees as soon as they register

### Code example

```typescript
async function identify(customerId: string, attributes: Record<string, unknown>) {
  await fetch(`${STOREES_API_URL}/api/v1/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': STOREES_API_KEY,
    },
    body: JSON.stringify({ customer_id: customerId, attributes }),
  })
}

// Usage
await identify('user_12345', {
  email: 'jane@example.com',
  name: 'Jane Doe',
  plan: 'premium',
  kyc_status: 'verified',
})
```

---

## Tracking Events

Send behavioral events whenever a customer performs an action in your app.

### Endpoint

```
POST /api/v1/events
```

### Request

```json
{
  "event_name": "transaction_completed",
  "customer_id": "user_12345",
  "properties": {
    "amount": 5000,
    "type": "debit",
    "channel": "upi",
    "category": "transfer",
    "recipient": "Priya Sharma",
    "currency": "INR"
  },
  "platform": "web",
  "source": "sdk"
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `event_name` | Yes | What happened — e.g. `transaction_completed`, `page_viewed`, `order_placed` |
| `customer_id` | Yes* | Your system's user ID. Alternatively, pass `customer_email` or `customer_phone` |
| `properties` | No | Any key-value data about the event (amounts, categories, page URLs, etc.) |
| `platform` | No | Where it happened — `web`, `ios`, `android`, `api`. Defaults to `api` |
| `source` | No | How it was sent — `sdk`, `webhook`, `api`. Defaults to `api` |
| `timestamp` | No | ISO 8601 timestamp. Defaults to now. Cannot be older than 7 days |
| `session_id` | No | Group events into sessions |
| `idempotency_key` | No | Prevent duplicate events. Same key = same event (ignored on re-send) |

*At least one of `customer_id`, `customer_email`, or `customer_phone` is required.

### Response

```json
{
  "success": true,
  "data": { "id": "event-uuid-here" }
}
```

### Customer resolution

When an event arrives, Storees resolves the customer in this order:

1. Look up by `customer_id` (external ID)
2. If not found, try `customer_email`
3. If not found, try `customer_phone`
4. If still not found, **create a new customer** automatically

This means you can start tracking events before calling `identify()` — the customer is auto-created on first event, and their profile is enriched when you identify them later.

### Code example

```typescript
async function track(
  eventName: string,
  customerId: string,
  properties?: Record<string, unknown>
) {
  await fetch(`${STOREES_API_URL}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': STOREES_API_KEY,
    },
    body: JSON.stringify({
      event_name: eventName,
      customer_id: customerId,
      properties,
      platform: 'web',
      source: 'sdk',
    }),
  })
}

// Usage
await track('page_viewed', 'user_12345', { page: '/dashboard' })
await track('transaction_completed', 'user_12345', { amount: 5000, type: 'debit', channel: 'upi' })
await track('bill_payment_completed', 'user_12345', { biller: 'BESCOM Electricity', amount: 1200 })
```

---

## Batch Event Ingestion

Send up to **1,000 events** in a single API call — useful for historical imports or server-side batch processing.

### Endpoint

```
POST /api/v1/events/batch
```

### Request

```json
{
  "events": [
    {
      "event_name": "transaction_completed",
      "customer_id": "user_12345",
      "properties": { "amount": 5000, "type": "debit" },
      "timestamp": "2025-03-10T14:30:00Z"
    },
    {
      "event_name": "bill_payment_completed",
      "customer_id": "user_12345",
      "properties": { "biller": "Airtel", "amount": 499 }
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "total": 2,
    "succeeded": 2,
    "failed": 0,
    "results": [
      { "index": 0, "id": "evt_abc123" },
      { "index": 1, "id": "evt_def456" }
    ]
  }
}
```

---

## How Storees Processes Your Data

When you send an event, here's what happens inside Storees:

```
Your App                              Storees
   │                                     │
   │  POST /api/v1/events               │
   │  { event_name, customer_id, ... }  │
   │────────────────────────────────────►│
   │                                     │
   │                              1. Validate API key → extract project
   │                              2. Resolve customer (find or create)
   │                              3. Insert event into database
   │                              4. Update customer's last_seen timestamp
   │                              5. Queue metrics recomputation (async)
   │                              6. Queue flow/trigger evaluation (async)
   │                                     │
   │  { success: true, id: "..." }      │
   │◄────────────────────────────────────│
   │                                     │
   │                              ── Background (async) ──
   │                              7. Metrics worker aggregates all events
   │                                 for this customer → writes computed
   │                                 metrics (totals, averages, recency)
   │                              8. Segment evaluator checks if customer
   │                                 enters/exits any segments
   │                              9. Flow triggers fire if conditions match
```

### What gets computed from your events

Storees automatically computes **metrics** from the events you send. These metrics power segments, dashboards, and flows. The specific metrics depend on your domain type.

**Example (fintech domain):**

| Your Events | Computed Metric |
|-------------|----------------|
| `transaction_completed` events | `total_transactions`, `total_debit`, `total_credit`, `avg_transaction_value` |
| Time since last `transaction_completed` | `days_since_last_txn`, `lifecycle_stage` (active/at_risk/dormant/churned) |
| `app_login` events in last 7 days | `logins_last_7d` |
| `bill_payment_completed` events | `bill_payments` count |
| `kyc_verified` / `kyc_expired` events | `kyc_status` |

These computed metrics are then used by **segments** — filter-based groups like "KYC Pending", "High Net Worth", "Dormant Accounts" — that automatically include or exclude customers as their metrics change.

### Custom attributes vs computed metrics

| Source | Set by | Example |
|--------|--------|---------|
| **Custom attributes** | You, via `identify()` | `balance_bracket: "1L-5L"`, `plan: "premium"` |
| **Computed metrics** | Storees, from events | `total_transactions: 42`, `lifecycle_stage: "active"` |

Both are available for segment filters. Custom attributes are useful for data you know at identify-time (plan, tier, region). Computed metrics are derived automatically from behavioral events.

---

## Domain-Specific Events

Each domain has a set of **suggested events** that Storees understands and uses for metrics computation. You can also send any custom event name.

### Fintech

| Event | Key Properties | What Storees computes |
|-------|---------------|----------------------|
| `transaction_completed` | `amount`, `type` (debit/credit), `channel` (upi/neft/imps) | Transaction totals, averages, recency |
| `bill_payment_completed` | `biller`, `amount`, `category` | Bill payment count |
| `app_login` | `method`, `device` | Login frequency (7d) |
| `kyc_verified` | `type` | KYC status → verified |
| `kyc_expired` | — | KYC status → expired |
| `emi_paid` | `amount`, `loan_id` | EMI tracking |
| `emi_overdue` | `amount`, `days_overdue` | Overdue flag |
| `loan_disbursed` | `loan_amount`, `type` | Loan tracking |
| `sip_started` | `amount`, `fund_name` | SIP tracking |

### Ecommerce

| Event | Key Properties | What Storees computes |
|-------|---------------|----------------------|
| `order_placed` | `total`, `item_count`, `order_id` | Order count, total spend, AOV |
| `order_fulfilled` | `order_id` | Fulfillment rate |
| `order_cancelled` | `order_id`, `reason` | Cancellation tracking |
| `cart_created` | `cart_value`, `item_count` | Cart activity |
| `checkout_started` | `cart_value` | Checkout funnel |
| `customer_created` | — | New customer |

### SaaS

| Event | Key Properties | What Storees computes |
|-------|---------------|----------------------|
| `user_signup` | `plan`, `source` | Signup tracking |
| `feature_used` | `feature` | Feature usage count |
| `subscription_started` | `plan`, `amount` | Subscription status |
| `subscription_cancelled` | `reason` | Churn tracking |
| `trial_expiring` | `days_left` | Trial management |
| `user_invited` | `role` | Team growth |

### Universal events (work across all domains)

| Event | Properties |
|-------|-----------|
| `page_viewed` | `page` (URL path), `referrer` |
| `app_login` | `method`, `device` |
| `app_logout` | `session_duration` |

---

## API Reference

### Base URL

```
https://your-storees-instance.com/api/v1
```

### Headers (all endpoints)

```
Content-Type: application/json
X-API-Key: sk_live_your_public_key_here
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/customers` | Create or update a customer profile |
| `POST` | `/api/v1/events` | Track a single event |
| `POST` | `/api/v1/events/batch` | Track up to 1,000 events |

### Error responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request — missing required fields, invalid timestamp |
| `401` | Invalid or missing API key |
| `429` | Rate limit exceeded (1,000/min default) |
| `500` | Server error |

### Idempotency

Pass an `idempotency_key` in your event payload to prevent duplicates. If the same key is sent twice for the same project, the second request returns the original event ID with `deduplicated: true`.

```json
{
  "event_name": "transaction_completed",
  "customer_id": "user_12345",
  "properties": { "amount": 5000 },
  "idempotency_key": "txn_abc_123"
}
```

---

## REST API (Server-Side)

For server-side integrations (Node.js, Python, Go, etc.) where you can't use the browser SDK, call the REST API directly.

### Minimal wrapper (Node.js / TypeScript)

```typescript
const STOREES_API = process.env.STOREES_API_URL
const STOREES_KEY = process.env.STOREES_API_KEY

async function storeesFetch(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${STOREES_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': STOREES_KEY!,
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function identify(customerId: string, attributes: Record<string, unknown>) {
  return storeesFetch('/api/v1/customers', { customer_id: customerId, attributes })
}

export async function track(eventName: string, customerId: string, properties?: Record<string, unknown>) {
  return storeesFetch('/api/v1/events', {
    event_name: eventName,
    customer_id: customerId,
    properties,
    source: 'server',
  })
}
```

### cURL examples

**Identify a customer:**

```bash
curl -X POST https://your-storees.com/api/v1/customers \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_live_your_key_here" \
  -d '{
    "customer_id": "user_12345",
    "attributes": {
      "email": "jane@example.com",
      "name": "Jane Doe",
      "plan": "premium"
    }
  }'
```

**Track an event:**

```bash
curl -X POST https://your-storees.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_live_your_key_here" \
  -d '{
    "event_name": "transaction_completed",
    "customer_id": "user_12345",
    "properties": { "amount": 5000, "type": "debit", "channel": "upi" }
  }'
```

### When to use REST API vs SDK

| Use Case | Recommended |
|----------|------------|
| Browser / SPA / website | `@storees/sdk` (script tag or npm) |
| React / Next.js app | `@storees/react` |
| Node.js backend | REST API |
| Python / Go / Ruby backend | REST API |
| Historical data import | REST API (batch endpoint) |
| Webhook-triggered events | REST API |

---

## Choosing Your Integration

| Package | Install | Best For |
|---------|---------|----------|
| `@storees/sdk` | `<script>` tag or `npm install @storees/sdk` | Any website, vanilla JS, SPAs |
| `@storees/react` | `npm install @storees/react` | React, Next.js, Remix |
| REST API | No install — just HTTP calls | Server-side, scripts, webhooks |

All three methods send data to the same Storees backend and produce identical results. The SDKs add convenience features (batching, sessions, device context, offline persistence) that you'd otherwise have to build yourself.
