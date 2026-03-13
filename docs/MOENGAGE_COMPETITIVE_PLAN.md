# Storees Platform Evolution — MoEngage-Inspired Roadmap

## Executive Summary

After the MoEngage demo, it's clear their platform operates across **5 pillars**: Data Ingestion → Single Customer View → Analyze → Engage/Inform → Personalize — all powered by **Sherpa AI**. Storees already has a solid CDP + segmentation + flows foundation. This plan maps every MoEngage capability to Storees, identifies gaps, and provides a phased implementation plan.

---

## 1. Architecture Comparison

### MoEngage "Under the Hood"

```
DATA INGESTION                    SHERPA AI
├── Data Warehouse          ┌─── ANALYZE
├── Web & App (SDK)         │    ├── Predictions
├── API (Backend)           │    ├── AI Assistant
├── Offline Data            │    ├── Affinity/RFM Segments
├── App Marketplace         │    ├── Trends, Funnels, Cohorts
│                           │    ├── Path Finder
│   SINGLE CUSTOMER VIEW ───┤    ├── Open Analytics
│                           │    ├── Session & Sources
│   INTEGRATIONS            │    ├── Dashboards
│   ├── mParticle           │    └── Actionable Analytics
│   ├── Segment             │
│   ├── Amplitude           ├─── ENGAGE
│   ├── Mixpanel            │    ├── Optimal Time & Channel
│   ├── AppsFlyer           │    ├── Recommendations
│   ├── Adjust              │    ├── App Push, Web Push
│   ├── Talon.One           │    ├── Cards, On-site Messages
│   └── Shopify             │    ├── Email, SMS, In-apps
│                           │    └── Connectors
│                           │
│                           ├─── INFORM
│                           │    ├── Intelligent Path Optimizer
│                           │    ├── Next Best Action
│                           │    ├── WhatsApp, Google Ads, Facebook
│                           │
│                           └─── PERSONALIZE
│                                ├── Web Personalization
│                                ├── App Personalization
│                                └── Streams + Data Warehouse export
```

### Storees Current State

```
DATA INGESTION                    AI (Groq)
├── Shopify Webhooks        ┌─── ANALYZE
├── V1 REST API             │    ├── AI Segment Builder ✅
├── (No SDK)                │    ├── Lifecycle Chart ✅
│                           │    ├── Dashboard Stats ✅
│   SINGLE CUSTOMER VIEW ✅ │    └── (No funnels/cohorts/paths)
│                           │
│   INTEGRATIONS            ├─── ENGAGE
│   └── Shopify only        │    ├── Email (Resend) ✅
│                           │    ├── Flow Builder ✅
│                           │    ├── Campaigns ✅
│                           │    └── (No push/SMS/WhatsApp)
│                           │
│                           └─── (No Personalize layer)
```

---

## 2. Gap Analysis — Feature by Feature

### 2.1 DATA INGESTION

| MoEngage Feature | Storees Status | Gap | Priority |
|---|---|---|---|
| **SDK (Web & App)** | ❌ Not built | **CRITICAL** — No client-side tracking. Can't capture page views, clicks, sessions, device info | P0 |
| **REST API** | ✅ V1 API exists | Event ingestion, customer upsert, API key auth all working | — |
| **Webhooks (inbound)** | ✅ Shopify webhooks | Working for Shopify events | — |
| **Data Warehouse import** | ❌ Not built | Bulk CSV/SQL import for historical data | P2 |
| **Offline Data** | ❌ Not built | File upload, manual import | P3 |
| **App Marketplace** | ❌ Not built | Pre-built connectors for 3rd party tools | P3 |

### 2.2 SINGLE CUSTOMER VIEW

| Feature | Storees Status | Gap | Priority |
|---|---|---|---|
| **Identity Resolution** | ✅ Multi-identifier | Email, phone, external_id, device_id resolution | — |
| **Profile Unification** | 🟡 Basic | Needs merge logic for anonymous → known user | P1 |
| **360° View** | 🟡 Partial | Has orders/events/segments. Missing: sessions, device info, channel preferences, engagement scores | P1 |
| **Consent Management** | ✅ Built | GDPR consent tracking per channel | — |

### 2.3 ANALYZE (Sherpa AI)

| Feature | Storees Status | Gap | Priority |
|---|---|---|---|
| **Predictions** | ❌ Not built | Churn prediction, purchase probability, LTV forecasting | P1 |
| **AI Assistant** | ✅ Segment builder | Works via Groq. Needs expansion to general analytics queries | P2 |
| **Affinity/RFM Segments** | 🟡 Partial | RFM data exists (recency/frequency/monetary in customer aggregates). Needs auto-classification into segments | P1 |
| **Trends** | ❌ Not built | Time-series event trends, metric trends | P1 |
| **Funnels** | ❌ Not built | Define step sequences, measure drop-off rates | P1 |
| **Cohorts** | ❌ Not built | Group users by first action date, track retention | P2 |
| **Path Finder** | ❌ Not built | Visualize common user journeys, predict next action | P2 |
| **Open Analytics** | ❌ Not built | Email/push open rates, click tracking | P1 |
| **Session & Sources** | ❌ Not built | Track user sessions, UTM sources, referrers (needs SDK) | P1 |
| **Dashboards** | ✅ Basic | Needs customizable dashboards with drag-drop widgets | P2 |
| **Actionable Analytics** | ❌ Not built | Auto-generated insights with recommended actions | P3 |

### 2.4 ENGAGE

| Feature | Storees Status | Gap | Priority |
|---|---|---|---|
| **Optimal Time & Channel** | ❌ Not built | Per-customer best time + channel prediction (MoEngage's killer feature) | P1 |
| **Recommendations** | ❌ Not built | Product/content recommendations based on behavior | P2 |
| **Email** | ✅ Resend | Working. Needs delivery tracking webhooks | — |
| **SMS** | ❌ Templates exist, no sending | Integrate Twilio or similar | P1 |
| **App Push** | ❌ Not built | FCM/APNs integration (needs SDK) | P1 |
| **Web Push** | ❌ Not built | Service worker + push API (needs SDK) | P1 |
| **In-app Messages** | ❌ Not built | SDK-rendered banners/modals/tooltips | P2 |
| **Cards** | ❌ Not built | Persistent notification cards in-app | P3 |
| **On-site Messages** | ❌ Not built | Website popups, banners, slide-ins | P2 |
| **WhatsApp** | ❌ Not built | WhatsApp Business API integration | P1 |
| **Connectors** | ❌ Not built | Webhook-out to external systems | P2 |

### 2.5 INFORM

| Feature | Storees Status | Gap | Priority |
|---|---|---|---|
| **Intelligent Path Optimizer** | ❌ Not built | AI optimizes flow paths based on conversion data | P2 |
| **Next Best Action** | ❌ Not built | AI recommends which action to take for each customer | P2 |
| **Google Ads** | ❌ Not built | Audience sync to Google Ads | P2 |
| **Facebook** | ❌ Not built | Audience sync to Facebook Custom Audiences | P2 |

### 2.6 PERSONALIZE

| Feature | Storees Status | Gap | Priority |
|---|---|---|---|
| **Web Personalization** | ❌ Not built | Dynamic content based on segments (needs SDK) | P2 |
| **App Personalization** | ❌ Not built | In-app content personalization (needs SDK) | P2 |
| **Data Warehouse export** | ❌ Not built | Stream events/profiles to external warehouse | P3 |

### 2.7 INTEGRATIONS

| Feature | Storees Status | Gap | Priority |
|---|---|---|---|
| **Shopify** | ✅ Built | OAuth + webhooks + REST API | — |
| **CDP connectors** (Segment, mParticle) | ❌ Not built | Receive events from CDPs | P2 |
| **Analytics** (Amplitude, Mixpanel) | ❌ Not built | Forward events to analytics platforms | P3 |
| **Attribution** (AppsFlyer, Adjust) | ❌ Not built | Install attribution data | P3 |
| **Coupon management** (Talon.One) | ❌ Not built | Dynamic coupon generation | P3 |

---

## 3. SDK Design — The Critical Missing Piece

The SDK is the foundation for most missing features. Without it, Storees can only react to server-side events (webhooks, API calls). With it, Storees can track everything MoEngage tracks.

### 3.1 SDK Architecture

```
┌─────────────────────────────────────────────────┐
│                  STOREES SDK                     │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Identity  │  │  Events  │  │   Device &   │  │
│  │ Manager   │  │  Tracker │  │   Session    │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   Push   │  │  In-App  │  │    Consent   │  │
│  │ Handler  │  │ Messages │  │   Manager    │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │         Network Layer (Batch + Retry)     │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
          │                    ▲
          ▼                    │
   POST /api/v1/events    Push / In-App
   (batched, compressed)   (SSE or WebSocket)
```

### 3.2 SDK Variants

| SDK | Technology | Use Case |
|-----|-----------|----------|
| **Web SDK** (`storees.js`) | JavaScript/TypeScript, ~15KB gzipped | Websites, SPAs, Shopify storefronts |
| **React Native SDK** | JS bridge wrapper | Mobile apps (React Native) |
| **Flutter SDK** | Dart package | Mobile apps (Flutter) |
| **iOS SDK** | Swift package | Native iOS apps |
| **Android SDK** | Kotlin library | Native Android apps |
| **Node.js SDK** | Server-side TypeScript | Backend event ingestion |

**Phase 1: Web SDK + Node.js SDK only** (covers banking web apps + server-side)

### 3.3 Web SDK API Design

```typescript
// Initialize
Storees.init({
  projectId: 'proj_xxxxx',
  apiKey: 'sk_live_xxxxx',
  apiEndpoint: 'https://api.storees.io',
  autoTrack: {
    pageViews: true,      // automatic page view tracking
    sessions: true,        // session start/end
    clicks: true,          // element click tracking (with data-storees-* attrs)
    forms: true,           // form submission tracking
    scroll: true,          // scroll depth tracking
    utm: true,             // UTM parameter capture
  },
  pushNotifications: {
    enabled: true,
    serviceWorkerPath: '/storees-sw.js',
    vapidKey: 'BxxxVAPIDxxx'
  },
  consent: {
    requireOptIn: true,    // GDPR mode — no tracking until consent
    consentCategories: ['analytics', 'marketing', 'personalization']
  }
});

// Identify user (anonymous → known)
Storees.identify('user_123', {
  email: 'wahab@example.com',
  phone: '+919876543210',
  name: 'Wahab',
  plan: 'premium',
  // any custom attributes
});

// Track events
Storees.track('product_viewed', {
  product_id: 'prod_456',
  product_name: 'Premium Widget',
  price: 2999,          // in paise/cents
  category: 'electronics',
  source: 'recommendation'
});

// Track page views (auto or manual)
Storees.page('Product Detail', {
  product_id: 'prod_456',
  referrer: document.referrer
});

// User attributes (progressive profiling)
Storees.setUserProperties({
  preferred_language: 'en',
  loyalty_tier: 'gold',
  last_branch_visited: 'Mumbai Central'
});

// Consent management
Storees.setConsent({
  analytics: true,
  marketing: true,
  personalization: false
});

// Push notification registration
Storees.push.requestPermission();
Storees.push.onMessage((notification) => {
  // handle foreground notifications
});

// In-app messages
Storees.inApp.onDisplay((message) => {
  // SDK auto-renders, but hook available for custom handling
});

// Reset (logout)
Storees.reset();
```

### 3.4 Data Points Collected by SDK

**Automatic (no code required):**

| Category | Data Points |
|----------|------------|
| **Device** | OS, browser, screen resolution, device type (mobile/desktop/tablet), language, timezone |
| **Session** | Session ID, start time, duration, page count, referrer, landing page |
| **UTM** | utm_source, utm_medium, utm_campaign, utm_term, utm_content |
| **Page** | URL, title, referrer, time on page, scroll depth |
| **Network** | IP (→ geo: country, city, region), ISP, connection type |
| **App** | App version, SDK version, install date, first seen, last seen |

**Tracked (developer instruments):**

| Category | Data Points |
|----------|------------|
| **Identity** | User ID, email, phone, name, custom attributes |
| **Events** | Event name, timestamp, properties (any JSON), source |
| **Commerce** | Product views, add to cart, checkout, purchase, wishlist |
| **Banking/Fintech** | Login, transaction, bill payment, loan application, KYC steps |
| **Engagement** | Feature usage, button clicks, search queries, form fills |

### 3.5 SDK Network Layer

```
Client Events → Local Queue (IndexedDB)
  → Batch every 30s OR 20 events (whichever first)
  → POST /api/v1/events/batch (gzip compressed)
  → Retry with exponential backoff (1s, 2s, 4s, 8s, max 60s)
  → Offline queue (persist to localStorage, flush on reconnect)
```

---

## 4. Implementation Plan — Phased Roadmap

### Phase 1: SDK Foundation + Enhanced Data Collection (Week 1-2)

**Goal**: Ship a Web SDK that tracks everything needed to power analytics & engagement.

#### 1A: Web SDK Core (`packages/sdk/`)

```
packages/sdk/
├── src/
│   ├── core/
│   │   ├── client.ts          # Main Storees client
│   │   ├── config.ts          # Configuration & defaults
│   │   ├── queue.ts           # Event batching & retry
│   │   ├── storage.ts         # localStorage/IndexedDB persistence
│   │   └── network.ts         # HTTP client with retry
│   ├── modules/
│   │   ├── identity.ts        # User identification & anonymous IDs
│   │   ├── events.ts          # Event tracking
│   │   ├── pageTracker.ts     # Auto page view tracking
│   │   ├── sessionTracker.ts  # Session management
│   │   ├── clickTracker.ts    # Click tracking (data attributes)
│   │   ├── scrollTracker.ts   # Scroll depth tracking
│   │   ├── utmTracker.ts      # UTM parameter capture
│   │   ├── deviceInfo.ts      # Device & browser detection
│   │   └── consent.ts         # Consent management
│   ├── channels/
│   │   ├── push.ts            # Web push notifications
│   │   └── inApp.ts           # In-app message rendering
│   ├── index.ts               # Public API
│   └── types.ts               # SDK types
├── dist/                       # Built output
│   ├── storees.min.js          # UMD bundle (~15KB gzip)
│   ├── storees.esm.js          # ESM for bundlers
│   └── storees-sw.js           # Service worker for push
├── package.json
└── tsconfig.json
```

**Tasks:**
1. Create SDK package with TypeScript + Rollup build
2. Implement core client with init/identify/track/page/reset
3. Implement event batching (30s/20 events) with IndexedDB queue
4. Implement retry with exponential backoff + offline persistence
5. Auto-tracking: page views (SPA-aware with History API), sessions, device info, UTM
6. Consent module (GDPR opt-in before tracking)
7. Build UMD + ESM bundles, aim for <15KB gzipped
8. CDN-hostable script tag: `<script src="https://cdn.storees.io/v1/storees.min.js">`

#### 1B: Backend — Batch Event Ingestion

**New/modified endpoints:**
- `POST /api/v1/events/batch` — Accept batched events (up to 100 per request)
- `POST /api/v1/identify` — User identification with merge logic
- `POST /api/v1/sessions` — Session start/end events
- `GET /api/v1/push/vapid` — VAPID public key for web push
- `POST /api/v1/push/subscribe` — Register push subscription

**New tables:**
```sql
-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID REFERENCES customers(id),
  anonymous_id TEXT,
  session_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  page_count INTEGER DEFAULT 0,
  landing_page TEXT,
  exit_page TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  device JSONB,           -- {os, browser, screenRes, deviceType, language, timezone}
  geo JSONB,              -- {country, city, region, ip}
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Push subscriptions
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID REFERENCES customers(id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, endpoint)
);

-- In-app messages
CREATE TABLE in_app_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,       -- 'banner' | 'modal' | 'tooltip' | 'slide_in'
  content JSONB NOT NULL,   -- {title, body, cta, image, style}
  trigger_config JSONB,     -- when to show
  audience_filter JSONB,    -- who sees it (FilterConfig)
  status TEXT DEFAULT 'draft',
  priority INTEGER DEFAULT 0,
  frequency_cap JSONB,      -- {max_impressions, per_session, per_day}
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### 1C: Anonymous → Known User Merge

```
Anonymous user browses → anonymous_id = 'anon_abc123'
  - Events stored with anonymous_id
  - Session tracked

User logs in → Storees.identify('user_456', {email: '...'})
  - Backend resolves: find customer by email/phone/external_id
  - Merge: reassign all events + sessions from anon_abc123 → customer user_456
  - Deduplicate: if customer already exists, merge properties (latest wins)
```

---

### Phase 2: Analytics Engine (Week 2-3)

**Goal**: Build the "Analyze" pillar — funnels, trends, cohorts, RFM, path finder.

#### 2A: Trends & Time-Series Analytics

**New service**: `analyticsService.ts`

```typescript
// Trends — event counts over time
GET /api/analytics/trends
  ?event=product_viewed
  &granularity=day|week|month
  &from=2025-01-01&to=2025-03-12
  &segment_id=optional

// Response: { labels: ['Jan 1', ...], datasets: [{name: 'product_viewed', data: [123, ...]}] }
```

**Implementation**: SQL aggregation with `date_trunc()` on events table, cached in Redis.

#### 2B: Funnel Analysis

```typescript
// Define a funnel
POST /api/analytics/funnels
{
  name: 'Purchase Funnel',
  steps: [
    { event: 'page_viewed', filter: { page: '/products' } },
    { event: 'product_viewed' },
    { event: 'cart_created' },
    { event: 'checkout_started' },
    { event: 'order_placed' }
  ],
  window: '7d',  // conversion window
  from: '2025-01-01',
  to: '2025-03-12'
}

// Response
{
  steps: [
    { event: 'page_viewed', count: 10000, pct: 100 },
    { event: 'product_viewed', count: 6500, pct: 65, dropoff: 35 },
    { event: 'cart_created', count: 2000, pct: 20, dropoff: 69 },
    { event: 'checkout_started', count: 1200, pct: 12, dropoff: 40 },
    { event: 'order_placed', count: 800, pct: 8, dropoff: 33 }
  ],
  overall_conversion: 8
}
```

**Implementation**: Sequential event matching per customer with time window constraints. SQL CTEs with window functions.

#### 2C: Cohort Retention

```typescript
GET /api/analytics/cohorts
  ?cohort_event=customer_created    // what groups users
  &return_event=order_placed        // what counts as "retained"
  &granularity=week
  &from=2025-01-01&to=2025-03-12

// Response: retention matrix
{
  cohorts: [
    { period: 'Jan W1', size: 500, retention: [100, 45, 32, 28, 25, 22, 20, 18, 15, 12] },
    { period: 'Jan W2', size: 620, retention: [100, 48, 35, 30, 27, ...] },
    ...
  ]
}
```

#### 2D: RFM Segmentation (Auto-Classification)

Already have the raw data (`last_seen`, `order_count`, `total_spent`). Need:

```typescript
// Auto-classify all customers into RFM scores (1-5 per dimension)
POST /api/analytics/rfm/compute

// Uses quintile-based scoring:
// Recency: days since last_seen (lower = better)
// Frequency: order_count (higher = better)
// Monetary: total_spent (higher = better)

// Maps to named segments:
// Champions (R:5,F:5,M:5), Loyal (R:4-5,F:4-5,M:4-5),
// At Risk (R:2,F:4-5,M:4-5), Lost (R:1,F:1-2,M:1-2), etc.
```

**New table**: `customer_rfm_scores` or add `rfm_score JSONB` to customers table.

#### 2E: Path Finder

```typescript
GET /api/analytics/paths
  ?start_event=page_viewed
  &end_event=order_placed     // optional
  &max_steps=6
  &min_users=10               // filter noise
  &from=2025-01-01&to=2025-03-12

// Response: Sankey diagram data
{
  nodes: [
    { id: 'page_viewed', count: 10000 },
    { id: 'product_viewed', count: 6500 },
    ...
  ],
  links: [
    { source: 'page_viewed', target: 'product_viewed', value: 4200 },
    { source: 'page_viewed', target: 'search_performed', value: 2100 },
    ...
  ]
}
```

**Implementation**: Event sequence analysis with SQL window functions (`LEAD`/`LAG`). Aggregate into path nodes/edges. Frontend uses a Sankey or flow diagram (D3.js or Recharts).

#### 2F: Session & Source Analytics

```typescript
GET /api/analytics/sources
  ?metric=customers|sessions|conversions
  &from=...&to=...

// Response
{
  sources: [
    { source: 'google', medium: 'organic', sessions: 5000, conversions: 200, revenue: 150000 },
    { source: 'facebook', medium: 'paid', sessions: 3000, conversions: 150, revenue: 120000 },
    ...
  ]
}
```

---

### Phase 3: Multi-Channel Engagement (Week 3-4)

**Goal**: Build the "Engage" pillar — SMS, push, WhatsApp, in-app messages.

#### 3A: Channel Providers

| Channel | Provider | Integration |
|---------|----------|-------------|
| **Email** | Resend (existing) | ✅ Already built |
| **SMS** | Twilio or MSG91 | REST API, delivery webhooks |
| **Web Push** | Web Push Protocol (VAPID) | Service worker, no vendor needed |
| **App Push** | Firebase Cloud Messaging (FCM) | FCM HTTP v1 API |
| **WhatsApp** | WhatsApp Business API (via Gupshup/Twilio) | Template messages + media |
| **In-App** | Self-built (SDK renders) | SSE/WebSocket for real-time delivery |

#### 3B: Unified Message Service

```typescript
// packages/backend/src/services/messageService.ts

type Channel = 'email' | 'sms' | 'push' | 'web_push' | 'whatsapp' | 'in_app';

interface SendMessageParams {
  projectId: string;
  customerId: string;
  channel: Channel;
  templateId: string;
  templateVars: Record<string, any>;
  scheduledAt?: Date;                    // for optimal time
  metadata?: Record<string, any>;
}

async function sendMessage(params: SendMessageParams): Promise<CommunicationLogEntry> {
  // 1. Check consent for this channel
  // 2. Check DND hours for this customer
  // 3. Check frequency cap
  // 4. Resolve template + interpolate variables
  // 5. Dispatch to channel provider
  // 6. Log to communication_log
  // 7. Return delivery status
}
```

#### 3C: Delivery Tracking

```
Send → Queued → Sent → Delivered → Opened → Clicked → Converted
                  ↓
               Bounced/Failed
```

**Webhook receivers for each provider:**
- Resend: `POST /api/webhooks/resend` (delivered, opened, clicked, bounced)
- Twilio: `POST /api/webhooks/twilio` (sent, delivered, failed)
- FCM: delivery receipts via FCM data messages

**New table extension** to `communication_log`:
```sql
ALTER TABLE communication_log ADD COLUMN
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT;
```

#### 3D: In-App Message System

```
Backend creates in_app_message → stored in DB
  → SDK polls GET /api/v1/messages (or SSE stream)
  → SDK evaluates trigger rules client-side
  → SDK renders message (banner/modal/tooltip/slide-in)
  → SDK reports impression/click/dismiss → POST /api/v1/events
```

#### 3E: Frequency Capping & DND

```typescript
// Per-customer channel preferences
interface ChannelPreferences {
  dnd_start: string;     // "22:00" (customer timezone)
  dnd_end: string;       // "08:00"
  max_per_day: {
    email: 3,
    sms: 2,
    push: 5,
    whatsapp: 1
  };
  preferred_channel: 'email' | 'sms' | 'push' | 'whatsapp';
}
```

---

### Phase 4: AI Intelligence Layer — "Storees AI" (Week 4-5)

**Goal**: Build the equivalent of Sherpa AI — predictions, optimal time, channel optimization.

#### 4A: Engagement Scoring

Every customer gets a real-time engagement score (0-100) based on:

```
Engagement Score = w1 × recency + w2 × frequency + w3 × depth + w4 × breadth

Where:
  recency  = decay function of days since last activity
  frequency = events per week (normalized)
  depth    = avg session duration / pages per session
  breadth  = unique features/pages used
```

**Implementation**: Computed by `metricsWorker.ts` on every event. Stored in customers table.

#### 4B: Optimal Send Time

Per-customer best time to send based on historical engagement patterns.

```typescript
// Analyze: for each customer, when do they open emails / engage with push?
// Group their activity by hour-of-day and day-of-week
// Find peak engagement windows

interface OptimalSendTime {
  customer_id: string;
  email: { hour: number; day: number; confidence: number };
  sms: { hour: number; day: number; confidence: number };
  push: { hour: number; day: number; confidence: number };
  timezone: string;
}

// Algorithm:
// 1. Collect all engagement events (email_opened, push_clicked, etc.) per customer
// 2. Bucket by hour_of_day (0-23) in customer's timezone
// 3. Weight recent activity higher (exponential decay)
// 4. Smooth with Bayesian prior (population average)
// 5. Pick top-2 windows
// 6. Fallback: use population-level optimal time if <10 data points
```

**New table**: `customer_send_preferences` or add to customer JSONB.

#### 4C: Best Channel Prediction

```typescript
// For each customer, which channel gets the best engagement?
// Based on historical open/click/conversion rates per channel

interface ChannelScore {
  email: { open_rate: number; click_rate: number; score: number };
  sms: { open_rate: number; click_rate: number; score: number };
  push: { open_rate: number; click_rate: number; score: number };
  whatsapp: { open_rate: number; click_rate: number; score: number };
  recommended: Channel;
}

// Flow builder integration: "Send via Best Channel" node type
// Instead of hardcoding email, the flow picks the best channel per customer
```

#### 4D: Churn Prediction

```typescript
// Features for churn model:
// - Days since last purchase
// - Order frequency trend (increasing/decreasing)
// - Average time between orders
// - Recent email engagement (opens/clicks declining?)
// - Session frequency trend
// - Customer lifetime (days since first event)

// Simple scoring model (no ML needed for v1):
function calculateChurnRisk(customer: CustomerMetrics): number {
  const daysSinceLastOrder = daysBetween(customer.lastOrderAt, now());
  const avgOrderGap = customer.totalDays / customer.orderCount;
  const overdueRatio = daysSinceLastOrder / avgOrderGap;

  // If overdue by 2x their average gap, high churn risk
  // Weighted with engagement score
  const churnScore = sigmoid(overdueRatio - 1.5) * (1 - customer.engagementScore / 100);
  return Math.round(churnScore * 100);
}
```

#### 4E: Next Best Action

AI-powered recommendation for what to do with each customer:

```typescript
type NextAction =
  | { type: 'send_offer'; channel: Channel; template: string; reason: string }
  | { type: 'win_back'; channel: Channel; incentive: string; reason: string }
  | { type: 'upsell'; products: string[]; reason: string }
  | { type: 'do_nothing'; reason: string };

// Uses Groq LLM with customer context:
async function getNextBestAction(customer: Customer, recentEvents: Event[]): Promise<NextAction> {
  // Construct prompt with customer profile, RFM, engagement, churn risk
  // Ask LLM to recommend action
}
```

#### 4F: Expanded AI Assistant

Extend the existing AI segment builder to handle general analytics queries:

```
User: "Show me customers who haven't ordered in 30 days but opened an email last week"
→ Generates segment filter + explains reasoning

User: "What's my best performing channel this month?"
→ Queries analytics API, returns insights

User: "Why are we losing customers in the Gold segment?"
→ Analyzes churn patterns, surfaces common drop-off points
```

---

### Phase 5: Advanced Analytics UI (Week 5-6)

**Goal**: Frontend for all analytics features.

#### New Pages

| Page | Components |
|------|-----------|
| `/analytics` | Analytics dashboard hub |
| `/analytics/funnels` | Funnel builder + visualization |
| `/analytics/cohorts` | Retention matrix heatmap |
| `/analytics/paths` | Sankey diagram path finder |
| `/analytics/trends` | Time-series charts with event picker |
| `/analytics/rfm` | RFM grid with customer distribution |
| `/analytics/sources` | Source/medium breakdown |

#### Key Visualizations

- **Funnel**: Horizontal bar chart with drop-off percentages (like Amplitude)
- **Cohort**: Heatmap grid (rows = cohorts, columns = periods, color = retention %)
- **Path Finder**: Sankey diagram (D3.js) showing event flow
- **RFM**: 2D grid with customer counts per cell
- **Trends**: Line/area charts with event comparisons (Recharts)

---

### Phase 6: Personalization & Connectors (Week 6-7)

#### 6A: Web Personalization (via SDK)

```typescript
// SDK fetches personalization rules
Storees.personalize.onReady((rules) => {
  // rules = [{ selector: '.hero-banner', content: '<div>...', segment: 'champions' }]
  // SDK applies DOM modifications based on customer's segments
});

// Backend API
GET /api/v1/personalize
  // Returns personalization rules for current customer based on their segments
```

#### 6B: Outbound Connectors

- **Webhook-out**: Fire HTTP POST to external URL on events/segment changes
- **Google Ads**: Sync segment members to Google Ads Customer Match
- **Facebook**: Sync to Facebook Custom Audiences via Marketing API
- **Slack**: Send alerts to Slack channels on segment/flow triggers

#### 6C: Data Export

- CSV export for segments, customers, events
- Scheduled export to S3/GCS (data warehouse)
- Real-time event stream via webhooks

---

## 5. Database Schema Additions Summary

```sql
-- Phase 1: SDK support
sessions, push_subscriptions, in_app_messages

-- Phase 2: Analytics
funnels (saved funnel definitions)
customer_rfm_scores (or JSONB on customers)

-- Phase 3: Multi-channel
Extend communication_log (delivery tracking columns)
channel_preferences (per-customer DND, frequency caps)

-- Phase 4: AI
customer_predictions (engagement_score, churn_risk, optimal_send_time, best_channel)
next_best_actions (computed recommendations)

-- Phase 6: Connectors
outbound_webhooks (URL, events, filters)
audience_syncs (google_ads, facebook audience IDs)
```

---

## 6. Priority Execution Order

```
WEEK 1-2: SDK Foundation
  ├── Web SDK core (init, identify, track, page)
  ├── Event batching + offline queue
  ├── Auto-tracking (page views, sessions, UTM, device)
  ├── Batch ingestion endpoint
  ├── Anonymous → known user merge
  └── Consent module

WEEK 2-3: Analytics Engine
  ├── Trends (time-series aggregation)
  ├── Funnel analysis
  ├── RFM auto-classification
  ├── Session & source analytics
  ├── Cohort retention
  └── Path finder

WEEK 3-4: Multi-Channel
  ├── SMS (Twilio/MSG91)
  ├── Web Push (VAPID)
  ├── WhatsApp (Gupshup/Twilio)
  ├── Unified message service
  ├── Delivery tracking webhooks
  ├── In-app messages (SDK rendering)
  └── Frequency capping + DND

WEEK 4-5: AI Intelligence
  ├── Engagement scoring
  ├── Optimal send time
  ├── Best channel prediction
  ├── Churn prediction
  ├── Next best action (LLM)
  └── Expanded AI assistant

WEEK 5-6: Analytics UI
  ├── Funnel visualization
  ├── Cohort heatmap
  ├── Path finder (Sankey)
  ├── RFM grid
  ├── Trends charts
  └── Source analytics

WEEK 6-7: Personalization & Connectors
  ├── Web personalization (SDK)
  ├── Outbound webhooks
  ├── Google Ads audience sync
  ├── Facebook audience sync
  ├── Data export (CSV, scheduled)
  └── Slack integration
```

---

## 7. SDK Integration Guide (for Banking App)

### Step 1: Install

```bash
npm install @storees/sdk
# or
<script src="https://cdn.storees.io/v1/storees.min.js"></script>
```

### Step 2: Initialize (in banking app's main entry)

```typescript
import Storees from '@storees/sdk';

Storees.init({
  projectId: 'proj_banking_app',
  apiKey: 'sk_live_xxxxx',
  autoTrack: {
    pageViews: true,
    sessions: true,
    clicks: true
  },
  consent: { requireOptIn: true }
});
```

### Step 3: Identify on Login

```typescript
// After successful login
Storees.identify(user.customerId, {
  email: user.email,
  phone: user.phone,
  name: user.name,
  accountType: user.accountType,   // savings, current, etc.
  kycStatus: user.kycStatus,
  branch: user.branch
});
```

### Step 4: Track Banking Events

```typescript
// Transaction completed
Storees.track('transaction_completed', {
  type: 'upi_transfer',
  amount: 150000,        // in paise
  currency: 'INR',
  recipient_type: 'p2p',
  status: 'success'
});

// EMI payment
Storees.track('emi_paid', {
  loan_id: 'loan_789',
  emi_number: 5,
  amount: 1200000,       // in paise
  on_time: true
});

// Feature discovery
Storees.track('feature_used', {
  feature: 'mutual_funds',
  action: 'explore',
  source: 'home_banner'
});

// KYC step
Storees.track('kyc_step_completed', {
  step: 'aadhaar_verification',
  step_number: 2,
  total_steps: 4
});
```

### Step 5: Push Notifications

```typescript
// Request permission
const granted = await Storees.push.requestPermission();
if (granted) {
  // SDK automatically registers the service worker
  // Push subscription is sent to backend
  console.log('Push notifications enabled');
}
```

---

## 8. Key Differentiators vs MoEngage

| Aspect | MoEngage | Storees |
|--------|----------|---------|
| **Pricing** | Enterprise ($$$) | Self-hosted / affordable SaaS |
| **Data ownership** | Their cloud | Your infrastructure |
| **Shopify integration** | Via connector | Native, first-class |
| **AI model** | Proprietary (Sherpa) | Open (Groq/Llama, swappable) |
| **Customization** | Limited | Full source access |
| **SDK size** | ~50KB+ | Target <15KB |
| **Privacy** | Standard | GDPR-first, consent-by-default |
| **Multi-domain** | Generic | Domain-aware (ecom, fintech, SaaS schemas) |

---

## 9. Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK bundle size bloat | Slow page loads | Tree-shaking, lazy-load channels |
| Event volume overwhelms DB | Backend crashes | BullMQ batching, Redis buffering, partitioned events table |
| Funnel/path queries slow | Bad UX | Pre-compute aggregates, materialized views, Redis cache |
| Optimal time model accuracy | Wrong send times | Bayesian prior from population, min 10 data points before personalization |
| Multi-channel delivery failures | Messages not sent | Circuit breaker per provider, fallback chain (push → email → SMS) |
| Anonymous merge conflicts | Data loss | Idempotent merge, conflict resolution rules (latest wins for attrs, union for events) |

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| SDK integration time | < 30 minutes for basic setup |
| SDK bundle size | < 15KB gzipped |
| Event ingestion latency | < 500ms (p99) |
| Funnel query response time | < 2s for 30-day window |
| Optimal time accuracy | > 60% of messages opened within predicted window |
| Channel optimization lift | > 15% improvement in engagement vs random channel |
| Dashboard page load | < 1.5s |
