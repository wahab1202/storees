# GoWelmart → Storees Event Publishing Spec

> How GoWelmart's backend should send real-time events to Storees, replacing
> the 5-min FDW polling federation for hot-path activity.
>
> **Audience:** GWM backend engineering team
> **Storees side:** zero new work — endpoint, auth, idempotency, and dedup
> already exist (same endpoint the Storees JS SDK uses today)
> **GWM side, minimum effort:** ~1-2 days for a working integration
>
> **Important: no GWM schema changes are required.** The integration is
> outbound HTTP only. Pick the tier below that matches your reliability
> requirements.

---

## TL;DR — three integration tiers, pick one

| Tier | What you do | Effort | When to choose | Drops events? |
|---|---|---|---|---|
| **1. SDK** | Drop in `@storees/sdk`, call `storees.track()` | half day | Default — most clients | Almost never (SDK handles retries) |
| **2. Direct HTTP** | `fetch()` our endpoint from your business logic | 1-2 days | You want full control over the call | On app crash between event + send |
| **3. Outbox** | Same as #2 + a queue table + worker | 1-2 weeks | High-volume + strict at-least-once | Never |

**Recommendation: start with Tier 1 (SDK).** If you ever hit its limits, upgrade
to Tier 2 or Tier 3. You can mix tiers per event-type (e.g. SDK for engagement,
outbox for order_placed).

---

## Why we're doing this at all

The current 5-min FDW federation:
- Adds 2-5 min latency to "customer did X" → "Storees knows"
- Makes "order placed → trigger welcome flow" fire ~7 min late
- Couples Storees to your DB schema (column renames break us)

Push-based events fix all three. Sub-second latency, schema-decoupled.

We're proposing this only for **hot-path events** where latency matters:
- `order_placed`
- `customer_created` / `customer_updated`
- `order_cancelled` / `order_refunded`

Cold-path stuff (product catalog, dealer assignments, historical backfill)
keeps using the FDW federation. You don't have to publish events for
everything — just the things where seconds matter.

---

## Tier 1 — SDK integration (recommended)

This is what most clients use. It's how Storees expects events to arrive.

### Install

```bash
npm install @storees/sdk
```

### Initialize once (at app boot)

```ts
import { Storees } from '@storees/sdk'

const storees = new Storees({
  apiKey: process.env.STOREES_API_KEY,            // we provide this
  endpoint: 'https://api.storees.io',             // or staging URL for dev
  // SDK defaults: batches up to 100 events, flushes every 5 sec or
  // immediately for high-priority events. Retries 3x with exponential
  // backoff. In-memory buffer (lost on process crash — use Tier 3 if
  // that matters).
})
```

### Fire events from your business logic

```ts
// Inside your order-placed handler — right after you commit the order
await storees.track({
  event: 'order_placed',
  customerId: order.customer_id,
  properties: {
    order_id: order.id,
    order_number: order.display_id,
    total: order.total,
    currency: order.currency_code,
    line_items: order.items.map(item => ({
      product_id: item.product_id,
      product_name: item.title,
      product_type: item.product_type,
      product_collection: item.product_collection,
      quantity: item.quantity,
      price: item.unit_price,
    })),
    dealer_id: order.dealer_id,
  },
})

// Customer registration
await storees.identify({
  customerId: newCustomer.id,
  email: newCustomer.email,
  phone: newCustomer.phone,
  name: newCustomer.name,
  region: newCustomer.region,
  city: newCustomer.city,
  dealer_id: newCustomer.dealer_id,
})

// Customer update
await storees.identify({
  customerId: customer.id,
  /* same fields as above — SDK upserts the full profile */
})
```

That's it. The SDK handles:
- Authentication (uses your API key)
- HMAC signing of payloads
- Batching small events together
- Retries with exponential backoff on network failures
- Idempotency (same event called twice = one event in Storees)

No outbox table, no worker process, no queue infrastructure. Just call `track()`
when stuff happens.

### The trade-off

If your app process crashes between "event happened in DB" and "SDK flushed
to network", that batch is lost. For most clients this is fine because:
- Most events are non-critical (engagement, page views)
- The SDK flushes order/customer events immediately (no batching delay)
- 99.9%+ delivery rate in practice

If losing even one `order_placed` event is unacceptable for you, jump to Tier 3.

---

## Tier 2 — Direct HTTP from your code

Same delivery model as the SDK but without the abstraction. Pick this if:
- You want to see exactly what's going over the wire
- The SDK isn't available for your language (it's TS/Node only today)
- You already have an HTTP client + retry helper you trust

### Single-line integration

```ts
async function trackToStorees(event: StoreesEvent): Promise<void> {
  const body = JSON.stringify(event)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = signPayload(timestamp + '.' + body, STOREES_SIGNING_SECRET)

  await fetch('https://api.storees.io/api/v1/events', {
    method: 'POST',
    headers: {
      'Authorization':       `Bearer ${STOREES_API_KEY}`,
      'Content-Type':        'application/json',
      'X-Storees-Timestamp': timestamp,
      'X-Storees-Signature': `v1,${signature}`,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })
}
```

Call it from your order/customer handlers. Wrap in `try/catch` so errors don't
break your business flow. Optionally retry on 5xx with backoff:

```ts
async function trackWithRetry(event: StoreesEvent, attempt = 0): Promise<void> {
  try {
    await trackToStorees(event)
  } catch (err) {
    if (attempt < 3) {
      await sleep(Math.pow(2, attempt) * 1000)
      return trackWithRetry(event, attempt + 1)
    }
    console.error('Storees track failed', err, event)
  }
}
```

That's the entire integration. No DB tables, no workers. Same reliability
characteristics as the SDK.

---

## Tier 3 — Outbox pattern (only if you need bulletproof delivery)

Pick this **only if** all three are true:
- You can't tolerate any lost events (e.g. order-tracking compliance)
- Your event volume is high (>1000/min sustained)
- You're already comfortable running queue workers

For most clients, **don't pick this.** It's correct engineering but it's
overkill for a marketing CDP integration. The SDK's 99.9% delivery is usually
fine because Storees backfills via FDW or you can rerun a daily reconcile job.

If you genuinely need it, here's the pattern:

### Schema

```sql
CREATE TABLE storees_outbox (
  id              BIGSERIAL PRIMARY KEY,
  event_name      TEXT NOT NULL,
  customer_id     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload         JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_pending
  ON storees_outbox (next_attempt_at)
  WHERE delivered_at IS NULL;
```

### Insert during your business transaction

```sql
BEGIN;
  INSERT INTO orders (...) VALUES (...);
  INSERT INTO storees_outbox (event_name, customer_id, idempotency_key, payload)
    VALUES ('order_placed', $cus, $idempotency, $payload);
COMMIT;
```

If the transaction fails, no outbox row. If it succeeds, the row is durable
even on crash.

### Worker reads + POSTs

A separate process (or cron job) pulls pending rows + POSTs them via the
same `/api/v1/events` endpoint. On success, set `delivered_at = NOW()`. On
failure, bump `next_attempt_at` for exponential backoff.

Pseudocode:

```ts
while (true) {
  const events = await db.query(`
    SELECT id, payload FROM storees_outbox
    WHERE delivered_at IS NULL AND next_attempt_at <= NOW()
    ORDER BY id ASC
    LIMIT 50
    FOR UPDATE SKIP LOCKED
  `)

  for (const event of events) {
    const status = await postToStorees(event.payload)
    if (status === 200 || status === 409) {
      await markDelivered(event.id)
    } else {
      await scheduleRetry(event.id, exponentialBackoff(event.failed_count))
    }
  }

  if (events.length === 0) await sleep(1000)
}
```

Run 2-4 worker instances in parallel; `FOR UPDATE SKIP LOCKED` lets them share
the queue without conflict.

---

## Shared reference (all tiers)

These details apply regardless of which tier you pick.

### Endpoint

| Env | URL |
|---|---|
| Production | `https://api.storees.io/api/v1/events` |
| Staging    | `https://staging-api.storees.io/api/v1/events` |

### Auth — API key + HMAC

We provide two values per environment:

- **API key**: `sk_live_<random>` → `Authorization: Bearer ...`
- **Signing secret**: 32-byte random → used to compute HMAC

```
sig_payload = "${timestamp}.${request_body}"
signature   = base64( HMAC_SHA256(signing_secret, sig_payload) )
```

Required headers on every POST:
```
Authorization:        Bearer <api_key>
Content-Type:         application/json
X-Storees-Timestamp:  <unix_seconds>
X-Storees-Signature:  v1,<base64_sig>
```

The SDK (Tier 1) handles all of this automatically.

### Event envelope

Every event uses the same shape:

```json
{
  "event_name": "<snake_case>",
  "customer_id": "<gwm cus_* id>",
  "timestamp": "<ISO 8601 — when it actually happened>",
  "idempotency_key": "<unique per event — same key twice returns 409>",
  "source": "server",
  "properties": { /* event-specific */ }
}
```

Recommended idempotency key pattern: `<event_name>:<entity_id>` (e.g.
`order_placed:order_01K8AZ2QXY3...`). Same key arriving twice returns
`409 Conflict` — treat as success.

### Hot-path events to publish

Implement these four first. Storees triggers flows + updates segments based on them.

**`order_placed`** — customer completes checkout
```json
{
  "event_name": "order_placed",
  "customer_id": "cus_01K571QCJEYJX2YTFAQJWK183P",
  "timestamp": "2026-05-13T05:42:17.123Z",
  "idempotency_key": "order_placed:order_01K8AZ2QXY3...",
  "properties": {
    "order_id": "order_01K8AZ2QXY3...",
    "order_number": 1234,
    "total": 4280.00,
    "currency": "INR",
    "line_items": [
      {
        "product_id": "prod_01K571QCJEYJX2YTFAQJWK183P",
        "product_name": "NARZO20PRO(6+64GB)",
        "product_type": "Mobile",
        "product_collection": "Smartphones",
        "quantity": 1,
        "price": 4280.00
      }
    ],
    "dealer_id": "deal_01K7X..."
  }
}
```

**`customer_created`** — new customer registers
```json
{
  "event_name": "customer_created",
  "customer_id": "cus_01K8...",
  "timestamp": "2026-05-13T05:42:17.123Z",
  "idempotency_key": "customer_created:cus_01K8...",
  "properties": {
    "email": "alex@example.com",
    "phone": "+919876543210",
    "name": "Alex Rivera",
    "region": "Tamil Nadu",
    "city": "Chennai",
    "dealer_id": "deal_01K7X..."
  }
}
```

**`customer_updated`** — key fields changed
```json
{
  "event_name": "customer_updated",
  "customer_id": "cus_01K8...",
  "timestamp": "2026-05-13T05:42:17.123Z",
  "idempotency_key": "customer_updated:cus_01K8...:1715579337123",
  "properties": {
    "changed": ["phone", "city"],
    "email": "alex@example.com",
    "phone": "+919876543299",
    "name": "Alex Rivera",
    "region": "Tamil Nadu",
    "city": "Coimbatore",
    "dealer_id": "deal_01K7X..."
  }
}
```

Send the full current state under `properties` (not just diffs) — Storees upserts.

**`order_cancelled`** / **`order_refunded`** — same shape as order_placed minus line_items.

### Response codes

| Code | Meaning | What to do |
|---|---|---|
| `200 OK` | Accepted | Mark delivered |
| `400 Bad Request` | Malformed payload | Log + don't retry (bug) |
| `401 Unauthorized` | Bad key/signature | Stop sending, check credentials |
| `409 Conflict` | Idempotency dedup | Treat as success |
| `429 Too Many Requests` | Rate-limited | Honour `Retry-After` |
| `5xx` / timeout | Storees problem | Retry with backoff |

---

## Initial backfill

Webhooks only cover events from now forward. Historical data already lives in
Storees via the FDW federation — 16K+ customers and product catalog are
already synced. Once your webhook integration is stable, we'll disable the
FDW cron for the GWM project.

**You don't need to backfill historical events.** Don't replay every order
ever placed. The FDW federation has already loaded that.

---

## Testing

### Local smoke test

```bash
# Generate signature
TS=$(date +%s)
BODY='{"event_name":"order_placed","customer_id":"test_cus_001","timestamp":"2026-05-13T05:42:17Z","idempotency_key":"test_001","properties":{"order_id":"test_order_001","total":100}}'
SIG=$(echo -n "$TS.$BODY" | openssl dgst -sha256 -hmac "$STOREES_SIGNING_SECRET" -binary | base64)

curl -X POST https://staging-api.storees.io/api/v1/events \
  -H "Authorization: Bearer $STOREES_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Storees-Timestamp: $TS" \
  -H "X-Storees-Signature: v1,$SIG" \
  -d "$BODY"
```

Expected: `{"success": true, "data": {"event_id": "evt_..."}}`

### Pre-prod checklist

- [ ] One `customer_created` event lands → confirm in Storees admin → Customers
- [ ] One `order_placed` for that customer → confirm in their timeline
- [ ] Re-send the same `order_placed` → confirm `409 Conflict` (dedup works)
- [ ] Tamper one char in signature → confirm `401 Unauthorized`

### Rollout

Day 1: enable `customer_created` (lowest volume — sanity check)
Day 2-3: monitor — check Storees `/api/federation-status` for arrival rate
Day 4: enable `order_placed`
Day 5+: enable rest

Flag-gate at the call site — flip back to "do nothing" if anything is
off. The Storees FDW federation keeps running in parallel until you're confident.

---

## Observability

Both sides have visibility:

**On your side** — log every call:
- Outbound rate (events/min)
- Success rate (% of POSTs returning 200/409)
- Per-event-type latency

If you go Tier 3 (outbox), also monitor outbox depth (should stay near zero).

**On Storees side** — `GET /api/federation-status?projectId=<your_id>` returns:
- Last event arrival time per event type
- Total events ingested in last 24h
- Rejection counts (signature failures, validation errors)

Same URL is what we use internally — poll it for monitoring on your end too.

---

## Handoff package

When you're ready to start, ping wahab@waioz.com for:

1. Staging + prod API keys
2. Staging + prod signing secrets
3. Two test customer IDs to integration-test against
4. A live "I'll watch" window for the first smoke test

**Suggested first commit:** Tier 1 (SDK) for `order_placed` only, gated behind
a feature flag, in staging. Once that's green for 24h, expand to other events
and flip prod.

---

## FAQ

**Q: Do we have to add tables to our DB?**
A: No. Tiers 1 and 2 require zero schema changes. Tier 3 has an outbox table
but is opt-in for the rare case where you can't lose any events.

**Q: What if our app crashes mid-flush?**
A: Tier 1/2: the in-memory batch is lost. For most events this is fine; the
FDW federation will catch up the order on its next 5-min tick. For events
where this matters, upgrade to Tier 3.

**Q: Do we have to publish ALL events or just some?**
A: Just the ones where latency matters. The FDW federation keeps syncing
everything else. You can publish just `order_placed` and let FDW handle the
rest.

**Q: How is this different from the JS SDK in our storefront?**
A: Same endpoint, same auth. The browser SDK fires user-side events
(`product_viewed`, `cart_updated`). This server-side integration fires
events from your backend transactions (`order_placed`, `customer_created`).
They're complementary; you can use both.

**Q: What's the latency budget?**
A: Storees adds < 100ms server-side processing per event. Your network +
your processing dominates. Practical end-to-end latency: 200-500ms for a
single event call.
