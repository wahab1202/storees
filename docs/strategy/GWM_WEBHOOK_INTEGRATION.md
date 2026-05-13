# GoWelmart → Storees Webhook Integration Spec

> Engineering specification for GoWelmart's team to add real-time event
> publishing to Storees. Replaces the current 5-min FDW polling federation
> with sub-second push events for hot-path activity.
>
> **Audience:** GWM backend engineering team
> **Storees side:** zero new work required — endpoint, auth, and ingestion
> already exist (used today by Storees JS SDK)
> **Estimated GWM effort:** 2-3 weeks for Phase 1 (hot-path events)

---

## Why we're doing this

Storees currently reads GWM's source DB directly via PostgreSQL FDW every
5 minutes. This works but has limits:

- **Latency:** customer activity in GWM appears in Storees after 2-5 min average.
  High-intent flows ("customer placed first order → send welcome email") fire
  ~7min late, by which time the customer has often moved on.
- **Source-DB load:** every Storees federation tick hits GWM's DB. Grows with
  Storees adoption.
- **Tight schema coupling:** any column rename in GWM's schema requires a
  coordinated update in Storees's federation SQL.

Webhooks fix all three: push instead of pull, sub-second latency, decoupled
contracts, GWM's DB load goes to zero.

---

## Architecture

```
┌─────────────────────────┐                ┌──────────────────────────┐
│   GoWelmart (Medusa)    │                │   Storees Backend        │
│                         │                │                          │
│   ┌──────────────────┐  │  HTTPS POST    │  ┌────────────────────┐  │
│   │ Event detector   │──┼───────────────→│  │ /api/v1/events     │  │
│   │ (Medusa subscribers)│ │ signed JSON  │  │ (already exists)   │  │
│   └────────┬─────────┘  │                │  └─────────┬──────────┘  │
│            │            │                │            │             │
│            ▼            │                │            ▼             │
│   ┌──────────────────┐  │                │  ┌────────────────────┐  │
│   │ Outbox queue     │  │                │  │ Event normaliser   │  │
│   │ (durability +    │  │                │  │ → BullMQ           │  │
│   │  retry)          │  │                │  └────────────────────┘  │
│   └──────────────────┘  │                │                          │
└─────────────────────────┘                └──────────────────────────┘
```

GWM detects business events, queues them in an outbox table, and a worker
process POSTs each one to Storees. Storees normalises, persists, and
triggers downstream flows / segments.

---

## Phase 1 — hot-path events (week 1-2)

Implement these four events first. They unlock real-time campaigns + flows
for the biggest customer journeys.

### Event 1: `order_placed`

Fired when a customer completes checkout (NOT draft order creation).

**When to send:** after the order row is committed AND its line items + dealer
assignment are saved. Send-once semantics — if you retry due to network
error, set `idempotency_key` so Storees dedupes.

**Payload:**
```json
{
  "event_name": "order_placed",
  "customer_id": "cus_01K571QCJEYJX2YTFAQJWK183P",
  "timestamp": "2026-05-13T05:42:17.123Z",
  "idempotency_key": "order_placed:order_01K8AZ2QXY3...",
  "session_id": null,
  "source": "server",
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

### Event 2: `customer_created`

When a new customer registers.

```json
{
  "event_name": "customer_created",
  "customer_id": "cus_01K8...",
  "timestamp": "2026-05-13T05:42:17.123Z",
  "idempotency_key": "customer_created:cus_01K8...",
  "source": "server",
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

### Event 3: `customer_updated`

When key customer fields change (name, email, phone, region, city, dealer).
Coalesce changes within a 5-second window into one event.

```json
{
  "event_name": "customer_updated",
  "customer_id": "cus_01K8...",
  "timestamp": "2026-05-13T05:42:17.123Z",
  "idempotency_key": "customer_updated:cus_01K8...:1715579337123",
  "source": "server",
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

Send the full current state under `properties`, not just diffs — Storees uses
the full payload to upsert the customer row.

### Event 4: `order_cancelled` and `order_refunded`

```json
{
  "event_name": "order_cancelled",
  "customer_id": "cus_01K571QCJEYJX2YTFAQJWK183P",
  "timestamp": "2026-05-13T06:01:23Z",
  "idempotency_key": "order_cancelled:order_01K8AZ2QXY3...",
  "source": "server",
  "properties": {
    "order_id": "order_01K8AZ2QXY3...",
    "cancellation_reason": "customer_request"
  }
}
```

---

## Phase 2 — engagement events (week 3+, optional)

These let Storees build real-time engagement metrics + behavioural segments
without needing the Storees JS SDK on every page. Implement once Phase 1 is
stable in prod.

| Event | When |
|---|---|
| `product_viewed` | Customer opens a product detail page |
| `cart_updated` | Item added/removed from cart |
| `wishlist_added` | Item saved to wishlist |
| `category_browsed` | Category page viewed |
| `search_performed` | Customer searches catalog |
| `checkout_started` | Customer enters checkout flow but not yet placed |

Payload shape: same envelope as Phase 1, with `properties` matching the event.

---

## Endpoint, auth, and signing

### URL

| Env | URL |
|---|---|
| Production | `https://api.storees.io/api/v1/events` |
| Staging | `https://staging-api.storees.io/api/v1/events` |

### Auth — API key + HMAC

You'll receive two values from Storees admin:

1. **API key** (public id): `sk_live_<random>` — sent in `Authorization: Bearer <key>` header
2. **Webhook signing secret**: 32-byte random string — used to compute the HMAC on each payload

Per-request signature:

```
sig_payload = "${timestamp}.${request_body}"
signature   = base64( HMAC_SHA256(signing_secret, sig_payload) )
```

Headers on every POST:

```
Authorization:        Bearer sk_live_<your_key>
Content-Type:         application/json
X-Storees-Timestamp:  1715579337     # epoch seconds
X-Storees-Signature:  v1,<base64>    # may carry multiple "v1,..." entries
                                     # separated by spaces during rotation
```

Storees rejects requests where:
- `Authorization` doesn't match a known API key
- `X-Storees-Timestamp` is more than 5 minutes off from server time
- `X-Storees-Signature` doesn't match the recomputed HMAC

### Response codes

| Code | Meaning | What to do |
|---|---|---|
| `200 OK` | Accepted, queued for processing | Mark event delivered, advance outbox |
| `400 Bad Request` | Malformed JSON or missing required field | Log, do NOT retry — fix the bug |
| `401 Unauthorized` | Bad API key or signature | Stop sending, check credentials |
| `409 Conflict` | Idempotency key already seen | Treat as success, advance outbox |
| `429 Too Many Requests` | Rate-limited | Honour `Retry-After` header, exponential backoff |
| `500/502/503/504` | Storees error | Retry with exponential backoff |
| `timeout` | Network issue | Retry with exponential backoff |

---

## Outbox pattern (required, not optional)

Don't POST directly from your business-logic transactions. Use the outbox
pattern — it's the only way to guarantee at-least-once delivery while keeping
your transactional consistency.

### Why

If you POST inside the transaction that created the order:
- Webhook succeeds, transaction fails → customer not actually checked out, Storees thinks they did
- Transaction succeeds, webhook fails → Storees never sees the event

If you POST after the transaction commits, before logging the success:
- Process crashes between commit and POST → event lost

The outbox pattern fixes both. Atomically insert a "to-publish" row inside
the business transaction. A separate worker process reads from the outbox
and POSTs. If the POST fails, the row stays in the outbox for retry.

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
  failed_count    INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_pending
  ON storees_outbox (next_attempt_at)
  WHERE delivered_at IS NULL;
```

### Worker loop (pseudocode)

```ts
async function publishLoop() {
  while (true) {
    const events = await db.query(`
      SELECT id, payload FROM storees_outbox
      WHERE delivered_at IS NULL AND next_attempt_at <= NOW()
      ORDER BY id ASC
      LIMIT 50 FOR UPDATE SKIP LOCKED
    `)

    for (const event of events) {
      try {
        const sig = signPayload(event.payload, SIGNING_SECRET)
        const res = await fetch('https://api.storees.io/api/v1/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'X-Storees-Timestamp': Math.floor(Date.now() / 1000).toString(),
            'X-Storees-Signature': `v1,${sig}`,
          },
          body: JSON.stringify(event.payload),
          signal: AbortSignal.timeout(10_000),
        })

        if (res.status === 200 || res.status === 409) {
          await db.query(
            `UPDATE storees_outbox SET delivered_at = NOW() WHERE id = $1`,
            [event.id],
          )
        } else if (res.status === 400 || res.status === 401) {
          // Bug or auth issue — don't retry forever
          await db.query(
            `UPDATE storees_outbox
             SET failed_count = failed_count + 1,
                 last_error = $2,
                 next_attempt_at = NOW() + INTERVAL '1 hour'
             WHERE id = $1`,
            [event.id, `${res.status}: ${await res.text()}`],
          )
        } else {
          // 5xx, timeout, network — exponential backoff
          const delay = Math.min(60 * Math.pow(2, event.failed_count), 3600)
          await db.query(
            `UPDATE storees_outbox
             SET failed_count = failed_count + 1,
                 last_error = $2,
                 next_attempt_at = NOW() + ($3 || ' seconds')::INTERVAL
             WHERE id = $1`,
            [event.id, `${res.status}`, delay],
          )
        }
      } catch (err) {
        // Network failure — also exponential backoff
      }
    }

    if (events.length === 0) await sleep(1000)
  }
}
```

Run 2-4 worker instances in parallel. `FOR UPDATE SKIP LOCKED` lets them
process the queue concurrently without stepping on each other.

---

## Initial backfill

Webhooks only cover events going forward. You still need a one-time batch
import of historical data.

Two options:

**A. Keep the existing Storees FDW federation running.** It already pulled
all 16K customers + 16K products. Once webhooks are stable in prod, Storees
disables the FDW cron and webhooks take over. **Recommended** — zero work.

**B. Send historical events via the same outbox.** For every existing order,
generate an `order_placed` event with the original `created_at` and queue
it. The endpoint accepts past timestamps. Higher throughput needed but gives
you a single uniform pipeline.

Pick A unless you specifically need to retire the FDW connection.

---

## Testing protocol

### 1. Local development against staging

Storees provides a staging endpoint. Use it for all development.

```bash
curl -X POST https://staging-api.storees.io/api/v1/events \
  -H "Authorization: Bearer sk_test_<your_staging_key>" \
  -H "Content-Type: application/json" \
  -H "X-Storees-Timestamp: $(date +%s)" \
  -H "X-Storees-Signature: v1,<computed_sig>" \
  -d '{
    "event_name": "order_placed",
    "customer_id": "test_cus_001",
    "timestamp": "2026-05-13T05:42:17.123Z",
    "idempotency_key": "test_001",
    "properties": { "order_id": "test_order_001", "total": 100 }
  }'
```

Expected response: `{"success": true, "data": {"event_id": "evt_..."}}`

### 2. End-to-end smoke

Pre-prod checklist:

- [ ] Send 1 `customer_created` event for a test customer — confirm it appears in Storees admin
- [ ] Send 1 `order_placed` event for that customer — confirm the order shows up in their timeline
- [ ] Wait 1 minute, check the same `order_placed` payload sends again — confirm `409 Conflict` returned (dedup works)
- [ ] Tamper with the signature header by one char — confirm `401 Unauthorized`
- [ ] Send with a 10-minute-old timestamp — confirm `401 Unauthorized` (replay protection)
- [ ] Restart your outbox worker mid-burst — confirm no events lost or duplicated

### 3. Production rollout

- Day 1: deploy outbox + worker, disabled flag
- Day 2: turn on `customer_created` events only (lowest volume)
- Day 3-4: monitor — check Storees dashboard for arrival rate, latency, errors
- Day 5: turn on `order_placed`
- Day 6+: turn on remaining events

Roll back at any point by flipping the flag — outbox keeps queueing, just
stops POSTing.

---

## Observability

### What GWM should monitor

- **Outbox depth** — pending events waiting to send. Healthy: < 100 at any time. Alert: > 1000 sustained for 5+ min.
- **Webhook success rate** — `delivered_at` rows / total rows in last hour. Healthy: > 99%. Alert: < 95%.
- **Per-event latency** — time from `created_at` to `delivered_at`. Healthy: p95 < 5 sec. Alert: p95 > 30 sec.
- **Failed-count distribution** — events that hit retry. Healthy: < 1% of total. Alert: > 5%.

### What Storees exposes to GWM

Storees admin has a "Data Sources" page that shows, per project:
- Total events ingested in last 24h, broken down by event type
- Last event arrival time per event type
- Rejection counts (signature failures, dedup hits, validation errors)

The same data is queryable via `GET /api/admin/federation-status` for
programmatic monitoring on the GWM side.

---

## Reference — full event envelope

Every event uses this envelope. `event_name` and `properties` vary.

```json
{
  "event_name": "<required snake_case>",
  "customer_id": "<required Medusa customer id>",
  "timestamp": "<ISO 8601, when the event actually happened>",
  "idempotency_key": "<unique per event; format suggested: <event>:<entity_id>:<unix>>",
  "session_id": "<optional, for engagement events>",
  "source": "server",
  "properties": {
    /* event-specific shape per the type definitions above */
  }
}
```

Rules:
- `event_name`: snake_case, must match a published type — see Phase 1 + Phase 2 lists
- `customer_id`: Medusa's `cus_*` id. Storees joins to its `customers.external_id` column
- `timestamp`: when it happened, NOT when the webhook fires (could differ by hours for retried events)
- `idempotency_key`: must be globally unique. Storees stores these for 24h; same key arriving twice → `409 Conflict`. Recommended pattern: `<event_name>:<entity_id>:<unix_ms>`
- `source`: always `"server"` for GWM-published events (distinguishes from SDK-published browser events)

---

## Timeline + handoff

Suggested phasing:

| Week | GWM Work | Storees Work |
|---|---|---|
| 1 | Build outbox table + worker; integrate with order/customer event detectors | Provision API key + signing secret on staging |
| 2 | Implement Phase 1 events (`order_placed`, `customer_created`, `customer_updated`, `order_cancelled`); integration test on staging | (idle — already implemented) |
| 3 | Prod rollout with feature flag; turn on events incrementally | Monitor inbound, validate flows fire correctly |
| 4 | Phase 2 engagement events (optional) | (idle) |
| 5+ | Storees disables FDW cron once webhook coverage is verified | Switch off federation worker for GWM project |

**First handoff package from Storees to GWM (when you're ready to start):**
1. Staging + prod API keys (one each)
2. Staging + prod signing secrets (one each)
3. Two test customer IDs to use during integration
4. A live "I'll watch for incoming" window for the first smoke test

Ping wahab@waioz.com to kick off provisioning.
