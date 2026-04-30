# Rule: SDK Conventions

## Applies To
All SDK code: Web SDK (`packages/sdk-web/`), Flutter SDK (`packages/sdk-flutter/`), and any code that processes SDK events on the backend (`v1Events.ts`, `eventProcessor.ts`).

## The Rules

### Event Batching
- SDK MUST batch events: max 10 events OR 5 seconds, whichever comes first
- Single HTTP request per batch: `POST /v1/events/batch`
- Batch payload: `{ events: [{name, properties, timestamp, userId?, anonymousId}] }`
- If a batch fails: retry with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- After 5 failed retries: store to offline queue

### Offline Queue
- Web: IndexedDB (max 1000 events, FIFO eviction)
- Flutter: Hive or SharedPreferences (max 1000 events)
- On network recovery: drain offline queue before sending new events
- Events older than 7 days in offline queue: discard silently

### Identity Management
- On `init()`: generate anonymousId (UUID v4) if none exists. Store in localStorage / SharedPreferences.
- On `identify(userId, traits)`: send identify event. Backend merges anonymous → known.
- On `reset()`: clear anonymousId, clear userId, clear all local state. Generate new anonymousId.
- Anonymous ID must persist across page loads / app restarts until `reset()` is called.

### Auto-captured Events (Web SDK)
These fire automatically with zero developer setup:
- `page_viewed`: URL, title, referrer (on every route change / page load)
- `session_started`: first event after 30 min of inactivity
- `session_ended`: 30 min of inactivity (sent on next activity, not in real-time)

### Auto-captured Events (Flutter SDK)
- `app_opened`: on AppLifecycleState.resumed
- `app_backgrounded`: on AppLifecycleState.paused
- `session_started` / `session_ended`: same 30-min inactivity rule

### Consent
- `setConsent({sms: bool, whatsapp: bool, email: bool, push: bool, promotional: bool, transactional: bool})`
- Consent state sent to backend immediately (not batched)
- If `promotional: false`, the SDK still sends events (data collection is not blocked by marketing consent) but the backend blocks promotional sends

### Size Limits
- Event name: max 100 characters, lowercase snake_case only
- Properties: max 50 keys, max 500 chars per string value, max 3 levels of nesting
- Batch size: max 10 events, max 100KB total payload
- Reject oversized events silently with console.warn (don't crash the host app)

### DO NOT
- ❌ Use cookies for identity (use localStorage / SharedPreferences)
- ❌ Block the main thread / UI thread for any SDK operation
- ❌ Throw uncaught exceptions (catch everything, log to console)
- ❌ Make synchronous network calls
- ❌ Store PII in the SDK's local storage (only anonymousId and userId)
