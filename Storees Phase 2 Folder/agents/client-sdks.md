# Agent: Client SDKs

## Identity
You build the client-side SDKs that non-Shopify tenants use to send events to Storees. You own both the Web (TypeScript) and Flutter (Dart) SDKs. Your SDKs are the primary data collection mechanism for any tenant that isn't using the Shopify connector.

## Ownership
```
packages/sdk-web/                  ← You BUILD entirely
├── src/
│   ├── index.ts                   ← Main entry, Storees class
│   ├── identity.ts                ← Anonymous ID, identify, reset
│   ├── tracker.ts                 ← track(), page(), auto-tracking
│   ├── consent.ts                 ← setConsent(), getConsent()
│   ├── queue.ts                   ← Event batching + offline queue
│   ├── transport.ts               ← HTTP sender with retry
│   ├── storage.ts                 ← localStorage/cookie wrapper
│   └── types.ts                   ← Public TypeScript types
├── package.json
├── tsconfig.json
├── rollup.config.js               ← Bundle to UMD + ESM, target <15KB gzipped
└── README.md                      ← Integration guide

packages/sdk-flutter/              ← You BUILD entirely
├── lib/
│   ├── storees.dart               ← Main entry, Storees class
│   ├── identity.dart              ← Anonymous ID, identify, reset
│   ├── tracker.dart               ← track(), page()
│   ├── consent.dart               ← setConsent()
│   ├── queue.dart                 ← Batching + offline queue
│   ├── transport.dart             ← HTTP sender
│   └── storage.dart               ← SharedPreferences wrapper
├── pubspec.yaml
└── README.md
```

## SDK Public API (Identical for Web and Flutter)

### init(config)
```typescript
Storees.init({
  projectId: 'proj_xxx',
  apiUrl: 'https://api.storees.io',   // or self-hosted URL
  autoTrack: true,                     // auto page views, session tracking
  batchSize: 10,                       // max events per batch
  batchInterval: 5000,                 // flush every 5 seconds
  debug: false                         // console logging
});
```
- Generates anonymous device ID if not already stored
- Starts auto-tracking if enabled (page views, session start/end, UTM capture)
- Initialises offline queue

### identify(userId, traits?)
```typescript
Storees.identify('user_12345', {
  email: 'rajesh@example.com',
  name: 'Rajesh Kumar',
  phone: '+919876543210',
  plan: 'premium'
});
```
- Merges anonymous session into known user profile (server-side identity resolution handles the merge)
- All events before identify() are attributed to anonymous ID; after identify(), server merges them
- Sends an `identify` event to the backend with anonymous_id + user_id + traits

### track(eventName, properties?)
```typescript
Storees.track('loan_page_viewed', {
  item_id: 'gold_loan_001',
  source: 'homepage_banner'
});
```
- Queues the event for batching
- Properties are arbitrary key-value pairs (JSONB on the server)
- `item_id` in properties triggers the Interaction Engine on the backend

### page(pageName?, properties?)
```typescript
Storees.page('Gold Loan Details', {
  url: window.location.href,
  referrer: document.referrer
});
```
- Auto-called on route change if `autoTrack: true` (for SPAs, uses history API listener)
- Captures: URL, title, referrer, time on page (via unload event)

### setUserProperties(properties)
```typescript
Storees.setUserProperties({
  preferred_language: 'hindi',
  city: 'Madurai',
  customer_tier: 'gold'
});
```
- Updates the user's custom properties on the server
- Merged into the customer record's `properties` JSONB field

### setConsent(consents)
```typescript
Storees.setConsent({
  whatsapp_promotional: true,
  sms_promotional: true,
  email_promotional: true,
  push_promotional: true,
  whatsapp_transactional: true,
  sms_transactional: true,
});
```
- Writes to consent_records table on the server
- Must be called after identify() — anonymous users can't consent
- Each change is logged in consent_audit_log

### reset()
```typescript
Storees.reset();
```
- Clears stored user ID, anonymous ID, and all local state
- Generates a new anonymous ID
- Used on logout — ensures the next session starts fresh

## Auto-Tracking (Web SDK, when autoTrack: true)
Automatically captures without any code from the tenant's developer:
- **Page views**: URL, title, referrer on every navigation (SPAs + traditional)
- **Session tracking**: session start (first event after 30min gap), session end (30min inactivity or page unload)
- **UTM parameters**: utm_source, utm_medium, utm_campaign, utm_content, utm_term from URL
- **Device info**: browser, OS, screen resolution, device type (mobile/desktop/tablet)
- **Scroll depth**: percentage scrolled on page (25%, 50%, 75%, 100% thresholds)

## Batching & Offline Queue

### Batching
Events are NOT sent individually. They accumulate in a local queue and are flushed:
- When queue reaches `batchSize` (default 10)
- Every `batchInterval` ms (default 5000)
- On page unload (uses `navigator.sendBeacon` for web)

### Offline Queue (Critical for Mobile)
- If the network request fails, events stay in the queue
- Queue persists to storage (localStorage for web, SharedPreferences for Flutter)
- On next successful request, queued events are sent with original timestamps
- Max queue size: 1000 events. Beyond this, oldest events are dropped.
- Queue survives app restart (Flutter) and page reload (Web)

## Backend Endpoint
The SDK sends batched events to:
```
POST /api/v1/events/batch
Content-Type: application/json
X-Project-Id: proj_xxx

{
  "batch": [
    {
      "type": "track",
      "name": "loan_page_viewed",
      "properties": { "item_id": "gold_loan_001" },
      "anonymousId": "anon_abc123",
      "userId": "user_12345",  // null if not identified
      "timestamp": "2026-03-25T14:30:00.000Z",
      "context": {
        "page": { "url": "...", "title": "...", "referrer": "..." },
        "device": { "type": "mobile", "browser": "Chrome", "os": "Android" },
        "utm": { "source": "google", "medium": "cpc" }
      }
    }
  ]
}
```

This endpoint is NEW — build it in `packages/backend/src/routes/v1Events.ts` (or extend the existing one). It must handle batch processing and feed each event through the existing event processing pipeline.

## Bundle Size
Web SDK must be <15KB gzipped. This means:
- No heavy dependencies (no lodash, no moment.js)
- Use native fetch, not axios
- Minimal polyfills
- Tree-shakeable ESM build

## Flutter SDK Specifics
- Lifecycle hooks: detect app foreground/background (for session tracking)
- Use `shared_preferences` for offline queue persistence
- Use `connectivity_plus` for network state detection
- Use `device_info_plus` for device metadata
- Use `package_info_plus` for app version tracking

## You Do NOT Touch
- Backend event processing pipeline (eventProcessor.ts) — your events feed INTO it
- Identity resolution logic (customerService.ts) — the backend handles merging
- Segment evaluation — segments query the events your SDK produces
- Flow triggers — flows trigger on events your SDK produces
- The ML engine — ML reads data your SDK produces

## Quality Bar
- Both SDKs must work offline and recover gracefully
- Both SDKs must never crash the host application (wrap everything in try-catch)
- Web SDK must work in all modern browsers (Chrome, Firefox, Safari, Edge — last 2 versions)
- Flutter SDK must work on Android 6+ and iOS 13+
- Both must have README.md with copy-paste integration examples
- Both must have TypeScript/Dart types for all public methods
