# Storees Client Onboarding Playbook

> **The complete, copy-pasteable playbook for onboarding a new client onto
> Storees. Same shape for every vertical: e-commerce, banking, edtech,
> sporttech, SaaS, B2B. No DB access required. Initial historical data
> migration uses the same endpoints as live event ingestion.**
>
> **Audience:** the new client's engineering lead + Storees onboarding owner.
> **Timeline:** ~1 week from kickoff to fully live with historical data.

---

## 1 · Architecture in 60 seconds

Everything a client sends — live activity OR historical backfill — flows
through one ingestion endpoint:

```
                              ┌──────────────────────────────┐
                              │   POST /api/v1/events        │
                              │   POST /api/v1/events/batch  │   ← live activity
[Browser SDK]   ───┐          │   POST /api/v1/import/*      │   ← historical
[Server events] ───┼─────────▶│                              │
[Bulk import]   ───┘          │   - API-key auth             │
                              │   - Idempotency dedup        │
                              │   - Customer resolution      │
                              └──────────────┬───────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────────┐
                              │   events table (Postgres)    │
                              └──────────────┬───────────────┘
                                             │
                  ┌──────────────────┬──────┴───────┬──────────────────┐
                  ▼                  ▼              ▼                  ▼
            Customer           Trigger        Identity           Campaign
            aggregate          worker         merge              analytics
            worker             (flows)        worker             worker
            (totals, last_seen,
             product catalog)
```

**One pipeline, every input.** No special paths for "historical vs live" —
just an optional `historical: true` flag in event properties so flow
triggers skip retroactive firing.

---

## 2 · What each side provides at kickoff

### Storees gives the client:
1. **Project ID** (UUID) — identifies their tenant in Storees
2. **API key** (`sk_live_...`) — single credential for all endpoints
3. **Endpoint URLs** — `https://api.storees.io` (prod) + staging URL
4. **Two test customer IDs** for integration testing
5. **A 30-minute live "watch session"** during the first smoke test

### Client gives Storees:
1. **Domain type** (`ecommerce` | `fintech` | `edtech` | `sporttech` | `saas` | `custom`)
2. **Field they want to use as the customer external_id** (Medusa cus_id, Auth0 id, etc.)
3. **Their event-bus or webhook outbox capability** (informs which tier of integration to use)
4. **Historical data export** in CSV/JSON (customers + products + orders) for migration

---

## 3 · Day-by-day onboarding timeline

| Day | Storees side | Client side |
|---|---|---|
| 1 | Provision project + API key + signing secret | Read this doc, confirm domain type |
| 2-3 | Watch incoming events, validate auth | Implement live event firing — SDK and/or server-to-server |
| 4 | Provide bulk import endpoint examples + auth | Export historical data, dry-run import on staging |
| 5 | Production import sanity-check + spot-check totals | Run production bulk imports (customers → products → orders) |
| 6 | Validate aggregates match client's source-of-truth | Side-by-side comparison: Storees dashboards vs client's reports |
| 7 | Go-live: enable campaigns + flows | Train marketing team on the admin panel |

After Day 7, the integration runs forever with **zero ops overhead** — events fire from the client app, Storees handles everything downstream.

---

## 4 · Authentication

Every request needs:

```
Authorization: Bearer sk_live_<your_api_key>
Content-Type: application/json
```

That's it. **One credential.** Public-key-only model (same as Stripe's
publishable keys). The key is safe to use from both browser and server
contexts — admin endpoints use a separate JWT-authenticated path.

### Endpoint base URLs

| Env | URL |
|---|---|
| Production | `https://api.storees.io` |
| Staging | `https://staging-api.storees.io` |

### Rate limits (per API key, per minute)

| Endpoint | Limit |
|---|---|
| `/v1/events` (single) | 1,000 |
| `/v1/events/batch` (up to 1000 events) | 100 batches |
| `/v1/import/*` | 2,000 (generous for bulk loads) |

Returns `429 Too Many Requests` with `Retry-After` header when exceeded.

---

## 5 · Live event ingestion (Day 2-3)

Three integration tiers. **Pick one based on engineering capacity:**

### Tier 1 — SDK (recommended, ~half day)

For browser events (page views, product views, cart adds, button clicks).
Drop one snippet in `<head>`:

```html
<script src="https://api.storees.io/sdk/storees.min.js"></script>
<script>
  Storees.init({
    apiKey: 'sk_live_...',
    endpoint: 'https://api.storees.io'
  })

  // Identify the customer when login/auth happens
  Storees.identify({
    customerId: 'ext_abc_123',   // Their primary id in your system
    email: 'alice@example.com',
    phone: '+919876543210',
    name: 'Alice Rivera'
  })

  // Track any business event
  Storees.track('product_viewed', {
    product_id: 'sku_001',
    product_name: 'Wireless Earbuds Pro',
    product_type: 'Audio',
    price: 4280
  })
</script>
```

SDK handles batching, retries, identity merging. Lost-on-crash but 99.9%+ delivery in practice.

### Tier 2 — Server-to-server HTTP (1-2 days)

For backend events that MUST land (order placed, payment succeeded, account
created). Call from your business logic:

```ts
async function trackToStorees(event: object) {
  await fetch('https://api.storees.io/api/v1/events', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer sk_live_...',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(10_000),
  })
}

// Inside your order-placement handler — fire AFTER the transaction commits:
await trackToStorees({
  event_name: 'order_placed',
  customer_id: order.customer_id,
  timestamp: order.created_at,
  idempotency_key: `order_placed:${order.id}`,
  source: 'server',
  properties: {
    order_id: order.id,
    total: order.total,
    currency: order.currency_code,
    line_items: order.items.map(item => ({
      product_id: item.product_id,
      product_name: item.title,
      product_type: item.product_type,
      product_collection: item.collection,
      quantity: item.quantity,
      price: item.unit_price,
    })),
  },
})
```

Wrap in try/catch; retry on 5xx with exponential backoff. Same delivery characteristics as the SDK.

### Tier 3 — Outbox pattern (1-2 weeks; only if you can't tolerate ANY event loss)

Only pick this if all three are true:
- You can't tolerate any lost events (e.g. order-tracking compliance)
- Your event volume is high (>1000/min sustained)
- You're already comfortable running queue workers

Insert events into a local `storees_outbox` table inside your business
transaction. A separate worker process reads pending rows + POSTs them. On
success, mark delivered. On failure, exponential backoff retry. See the
appendix for the full schema + worker pseudocode.

For most clients, **Tier 1 + Tier 2 is enough.**

---

## 6 · Initial historical data migration (Day 4-5)

The clean break from the GWM/FDW era: **one canonical migration path that
works for every client**. No DB access required. The client exports their
data, posts it to our bulk endpoints.

### Order of operations matters

```
1. /import/customers     ← upload customer profiles first
2. /import/products      ← upload product catalogue
3. /import/orders        ← upload historical orders (links to both above)
```

Orders reference customers (by external_id) and products (by product_id), so
they must already exist. Wrong order = "unresolved" rows in the response.

### Step 1 — Customers

```bash
curl -X POST https://api.storees.io/api/v1/import/customers \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customers": [
      {
        "customer_id": "ext_abc_123",
        "email": "alice@example.com",
        "phone": "+919876543210",
        "name": "Alice Rivera",
        "region": "Tamil Nadu",
        "city": "Chennai",
        "email_subscribed": true
      },
      /* ... up to 1000 per batch ... */
    ]
  }'
```

Response:
```json
{ "success": true, "data": { "resolved": 1000, "failed": 0, "errors": [] } }
```

Chunk client-side: pages of 1000, sequential POSTs. A typical 100K customer
import takes 2-5 minutes.

### Step 2 — Products

The shape supports **every vertical** through `product_type` + `attributes`:

```bash
curl -X POST https://api.storees.io/api/v1/import/products \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {
        "product_id": "sku_001",
        "title": "Wireless Earbuds Pro",
        "product_type": "Audio",
        "vendor": "Brand X",
        "base_price": 4280.00,
        "currency": "INR",
        "image_url": "https://...",
        "status": "active",
        "collections": ["Summer Sale", "Bestsellers"],
        "attributes": {}
      },
      /* ... up to 1000 per batch ... */
    ]
  }'
```

Response:
```json
{ "success": true, "data": { "imported": 1000, "errors": [] } }
```

Collections are upserted automatically per distinct name. The
`product_collections` junction is populated in the same call.

### Step 3 — Orders (with the `historical` flag)

Each historical order becomes an `order_placed` event with `historical: true`
so flow triggers skip retroactive firing:

```bash
curl -X POST https://api.storees.io/api/v1/import/orders \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [
      {
        "customer_id": "ext_abc_123",
        "order_id": "ord_xyz_789",
        "timestamp": "2025-12-04T10:00:00Z",
        "total": 4280.00,
        "currency": "INR",
        "line_items": [
          {
            "product_id": "sku_001",
            "product_name": "Wireless Earbuds Pro",
            "product_type": "Audio",
            "product_collection": "Summer Sale",
            "quantity": 1,
            "price": 4280
          }
        ]
      },
      /* ... up to 1000 per batch ... */
    ]
  }'
```

Response:
```json
{ "success": true, "data": { "imported": 1000, "deduped": 0, "unresolved": 0, "errors": [] } }
```

What happens server-side:
- Each order becomes an `order_placed` event with `historical: true`
- Idempotency key `order_placed_historical:<order_id>` so re-runs dedup
- **Customer aggregate worker folds the order into `customers.total_orders`,
  `total_spent`, `first_order_date`, `last_order_date`, `avg_order_value`**
- **Trigger worker SKIPS the event** (`historical: true`) so welcome flows
  don't fire for last year's orders
- **Product catalog auto-extracts** from line_items if the product doesn't
  already exist (defense-in-depth alongside step 2)

### Verifying the import

```bash
# Top customers by spend — should match the client's reports within ±2% (tax/shipping rounding)
sudo -u postgres psql storees_prod -P pager=off -c "
  SELECT name, email, total_orders, total_spent, first_order_date, last_order_date
  FROM customers
  WHERE project_id = '<PROJECT_ID>'
    AND total_spent > 0
  ORDER BY total_spent DESC LIMIT 10;
"
```

Spot-check 3-5 customers against the client's source-of-truth. If numbers
match → migration successful. If not, the response's `errors` array will
show specific failures.

---

## 7 · Per-vertical examples (the same endpoint, different `attributes`)

The product shape is vertical-agnostic. Only `product_type` and the
`attributes` JSONB differ between domains. **One pipeline, every business
model.**

### E-commerce (the classic case)
```json
{
  "product_id": "sku_001",
  "title": "Wireless Earbuds Pro",
  "product_type": "Audio",
  "vendor": "Brand X",
  "base_price": 4280.00,
  "currency": "INR",
  "image_url": "https://...",
  "collections": ["Summer Sale", "Bestsellers"]
}
```

### Banking / Fintech (loans, insurance, debit/credit cards)
```json
{
  "product_id": "loan_personal_a",
  "title": "Personal Loan Plus",
  "product_type": "personal_loan",
  "vendor": "Acme Bank",
  "currency": "INR",
  "attributes": {
    "apr_min": 10.5,
    "apr_max": 18.0,
    "max_amount": 500000,
    "tenure_months_max": 60,
    "min_credit_score": 700,
    "category": "unsecured"
  },
  "collections": ["Personal Loans", "Featured"]
}
```

Loan disbursement event:
```json
{
  "event_name": "order_placed",
  "customer_id": "cus_abc",
  "properties": {
    "order_id": "loan_001_disbursed",
    "total": 250000,
    "currency": "INR",
    "line_items": [{
      "product_id": "loan_personal_a",
      "product_name": "Personal Loan Plus",
      "product_type": "personal_loan",
      "quantity": 1,
      "price": 250000
    }]
  }
}
```

The customer's `total_spent` becomes "total disbursed amount." Same column, different domain meaning. Segments work: "customers with total_spent > ₹500K and product_type contains 'personal_loan'."

### EdTech (courses, certifications, subscriptions)
```json
{
  "product_id": "course_des_101",
  "title": "Design Fundamentals",
  "product_type": "course",
  "vendor": "Skills Academy",
  "base_price": 4999.00,
  "currency": "INR",
  "attributes": {
    "instructor": "Priya Rao",
    "duration_weeks": 8,
    "level": "beginner",
    "certification": true,
    "language": "en"
  },
  "collections": ["Design", "Beginner-Friendly"]
}
```

Enrollment is an `order_placed` event with `total = tuition`. Total spent = total tuition paid. Segments like "customers who completed any beginner course" become trivial.

### SportTech (arenas, memberships, bookings)
```json
{
  "product_id": "arena_north_a",
  "title": "North Field — Premium",
  "product_type": "arena",
  "base_price": 1200.00,
  "currency": "INR",
  "image_url": "https://...",
  "attributes": {
    "capacity": 22,
    "sport": "football",
    "city": "Chennai",
    "covered": true,
    "peak_hour_multiplier": 1.5
  },
  "collections": ["Premium Fields"]
}
```

Bookings fire `order_placed` with the arena id + slot time in properties.

---

## 8 · Live event reference

These are the events the customer aggregate worker pays attention to. Every other event still lands in the events table and updates `last_seen` — useful for segments + flows but doesn't move revenue numbers.

### `order_placed` (revenue increment)
```json
{
  "event_name": "order_placed",
  "customer_id": "ext_abc_123",
  "timestamp": "2026-05-13T05:42:17.123Z",
  "idempotency_key": "order_placed:ord_xyz",
  "source": "server",
  "properties": {
    "order_id": "ord_xyz",
    "total": 4280.00,
    "currency": "INR",
    "line_items": [{
      "product_id": "sku_001",
      "product_name": "...",
      "product_type": "Audio",
      "product_collection": "Summer Sale",
      "quantity": 1,
      "price": 4280
    }],
    "dealer_id": "deal_optional"
  }
}
```

Effect:
- `customer.total_orders += 1`
- `customer.total_spent += properties.total`
- `customer.first_order_date = LEAST(existing, timestamp)`
- `customer.last_order_date = GREATEST(existing, timestamp)`
- `customer.avg_order_value` recomputed
- Products auto-upserted from `line_items`
- Flow triggers fire (unless `historical: true`)

### `order_refunded` / `order_cancelled` (revenue decrement)
```json
{
  "event_name": "order_refunded",
  "customer_id": "ext_abc_123",
  "timestamp": "2026-05-15T10:00:00Z",
  "idempotency_key": "order_refunded:ord_xyz",
  "properties": {
    "order_id": "ord_xyz",
    "total": 4280.00,
    "currency": "INR",
    "reason": "customer_request"
  }
}
```

Effect: `customer.total_spent` decremented (floored at 0). `total_orders` preserved (the order existed; just refunded).

### `customer_created`
```json
{
  "event_name": "customer_created",
  "customer_id": "ext_abc_123",
  "timestamp": "2026-05-13T05:42:17.123Z",
  "idempotency_key": "customer_created:ext_abc_123",
  "properties": {
    "email": "alice@example.com",
    "phone": "+919876543210",
    "name": "Alice Rivera",
    "region": "Tamil Nadu",
    "city": "Chennai"
  }
}
```

Use `Storees.identify({...})` from the SDK as the convenience equivalent. Either way, upserts the customer profile.

### `customer_updated`
Same shape as `customer_created` but with `idempotency_key` including a
timestamp so multiple updates per customer dedup individually. Use whenever
a profile field changes.

### Engagement events (optional but valuable)
- `product_viewed` — drives product-affinity segments
- `cart_updated` — feeds cart-abandonment flows
- `wishlist_added` — repurchase intent
- `category_browsed` — interest signals
- `search_performed` — intent + product gaps
- `checkout_started` — abandonment flow trigger

These bump `last_seen` and create event rows that segments + flows can query — but don't directly move revenue aggregates.

---

## 9 · Go-live checklist (Day 7)

Run these in order. Each gate must pass before proceeding.

### Auth + signing
- [ ] Admin can hit `/api/v1/events` with a real key and receive `200`
- [ ] Tampered signature returns `401` (if HMAC enabled per project)
- [ ] Re-sending the same `idempotency_key` returns `200/409` and doesn't duplicate

### Customer ingestion
- [ ] Customer count in Storees admin matches client's source
- [ ] Top-10 customers by `total_spent` match client's revenue reports (±2% for tax/shipping rounding)
- [ ] `last_seen` populates within seconds of a live `track()` call
- [ ] Customer profile fields (region, city, name, email) populated for >90% of customers

### Product catalogue
- [ ] Product picker dropdown in segment builder shows real product names
- [ ] Category dropdown populates with actual product types
- [ ] Collection dropdown shows the imported collection names
- [ ] Spot-check 5 products: title/vendor/image render correctly in admin

### Order pipeline
- [ ] Historical orders show in customer timelines with correct totals
- [ ] A test live `order_placed` event from server-side increments the customer's total_spent within seconds
- [ ] `has_purchased <product>` segment filter returns customers who bought that product
- [ ] `has_purchased <category>` works

### Flows + campaigns
- [ ] A welcome flow set to trigger on `order_placed` fires on a NEW order
- [ ] The same flow does NOT fire on historical orders (`historical: true`)
- [ ] A test email campaign sends to the test customer successfully

### Monitoring
- [ ] Aggregator backlog (`events WHERE processed_at IS NULL`) stays near zero
- [ ] No `[customer-aggregate] failed` errors in backend logs over 24h
- [ ] Live event delivery rate from client app > 99%

---

## 10 · Monitoring + ongoing ops

### Client side (Storees provides URLs for these)

The client's eng team monitors:

```ts
// Outbound rate (events/min) from their app — log this in their existing metrics
// Success rate (% of POSTs returning 200/409)
// Per-event-type latency (track → send time)
```

If they're on Tier 3 (outbox), also: outbox depth should stay near zero.

### Storees side (your team)

```bash
# Single-line aggregate worker health
sudo -u postgres psql storees_prod -P pager=off -c "
  SELECT
    COUNT(*) FILTER (WHERE processed_at IS NULL) AS pending,
    COUNT(*) FILTER (WHERE processed_at IS NOT NULL) AS done,
    MAX(received_at) FILTER (WHERE processed_at IS NULL) AS oldest_pending
  FROM events
  WHERE project_id = '<PROJECT_ID>'
    AND received_at > NOW() - INTERVAL '1 hour';
"
# pending should stay < 50 during normal load
# oldest_pending should never exceed 5 minutes
```

```bash
# Total event arrival rate per event type (last 24h)
sudo -u postgres psql storees_prod -P pager=off -c "
  SELECT event_name, COUNT(*) AS count, MAX(received_at) AS latest
  FROM events
  WHERE project_id = '<PROJECT_ID>'
    AND received_at > NOW() - INTERVAL '24 hours'
  GROUP BY event_name
  ORDER BY count DESC LIMIT 20;
"
```

### Dashboards in the Storees admin

Per-project page surfaces:
- Customer count + new this week
- Event arrival rate (line chart, last 7 days)
- Top events by volume
- Pending aggregation backlog
- Customer aggregate snapshot (total revenue, AOV, etc.)

---

## 11 · Common failure modes + recovery

### "My customers show zero total_spent"
- **Cause:** order events arriving but `properties.total` missing/malformed
- **Check:** `SELECT properties FROM events WHERE event_name='order_placed' LIMIT 5`
- **Fix:** Client side — ensure `total` is a positive number, not a string

### "Customer counts don't match my system"
- **Cause:** `external_id` mismatch — Storees customers keyed differently than client expected
- **Check:** `SELECT external_id FROM customers WHERE project_id=... LIMIT 5` — do these look like the client's customer ids?
- **Fix:** Re-run `/import/customers` with the correct `customer_id` field

### "Aggregator backlog growing"
- **Cause:** Worker crashed or DB connection lost
- **Check:** `pm2 logs storees-backend --err | tail -50`
- **Fix:** `pm2 restart storees-backend` — startup catch-up will clear the backlog

### "Historical orders aren't reflected in customer totals"
- **Cause:** Bulk import succeeded but worker didn't process them (e.g. backend wasn't restarted, or worker was running stale code)
- **Check:** `SELECT COUNT(*) FROM events WHERE idempotency_key LIKE 'order_placed_historical:%' AND processed_at IS NULL`
- **Fix:** `pm2 restart storees-backend` (triggers startup catch-up to process unprocessed events)

### "Flow trip fired retroactively for an old order"
- **Cause:** Historical import didn't include `historical: true` flag
- **Check:** `SELECT properties->>'historical' FROM events WHERE id=...`
- **Fix:** The flow trip already fired — it's too late to undo. For future imports, ensure all historical orders go through `/v1/import/orders` (which auto-adds the flag) rather than `/v1/events`.

### "Live events arriving but aggregates aren't moving"
- **Cause:** Customer external_id in event doesn't match any customer row (orphan event)
- **Check:** `SELECT customer_id FROM events e LEFT JOIN customers c ON c.id = e.customer_id WHERE c.id IS NULL LIMIT 5`
- **Fix:** Client should fire `customer_created` / `identify` before order events. Or run `/import/customers` first.

---

## Appendix A — Outbox pattern (Tier 3 only)

For high-volume B2B clients who can't tolerate ANY lost events.

### Schema (client side)
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
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_outbox_pending ON storees_outbox (next_attempt_at)
  WHERE delivered_at IS NULL;
```

### Insert during business transaction
```sql
BEGIN;
  INSERT INTO orders (...) VALUES (...);
  INSERT INTO storees_outbox (event_name, customer_id, idempotency_key, payload)
    VALUES ('order_placed', $cus_id, $idempotency, $payload);
COMMIT;
```

### Worker (pseudocode)
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
    const res = await postToStorees(event.payload)
    if (res.status === 200 || res.status === 409) {
      await markDelivered(event.id)
    } else {
      await scheduleRetry(event.id, exponentialBackoff(event.failed_count))
    }
  }
  if (events.length === 0) await sleep(1000)
}
```

Run 2-4 workers in parallel. `FOR UPDATE SKIP LOCKED` lets them share the queue safely.

---

## Appendix B — File index (Storees side)

| File | Purpose |
|---|---|
| `packages/backend/src/routes/v1Events.ts` | Live event ingestion (`/v1/events`, `/v1/events/batch`) |
| `packages/backend/src/routes/v1Import.ts` | Bulk import endpoints (`/v1/import/customers`, `/products`, `/orders`) |
| `packages/backend/src/services/customerService.ts` | Customer resolution / upsert logic |
| `packages/backend/src/services/productCatalogService.ts` | Shared product+collection upsert (event line-items + bulk import both route through here) |
| `packages/backend/src/workers/customerAggregateWorker.ts` | Folds events into customer aggregates; auto-extracts products from line items; runs startup catch-up |
| `packages/backend/src/workers/triggerWorker.ts` | Fires flow trips on events (skips `historical: true`) |
| `packages/backend/src/db/migrations/0040_events_processed_at.sql` | Aggregator idempotency column |
| `packages/backend/src/db/migrations/0042_products_vertical_agnostic.sql` | `attributes` JSONB + `base_price` + `currency` |

---

## Appendix C — Versioning + breaking changes

The `/v1/*` namespace is stable. Future additive fields (new event types,
new optional properties) won't break existing clients. Breaking changes will
land at `/v2/*` with a 12-month overlap.

The event envelope (`event_name`, `customer_id`, `timestamp`, `idempotency_key`,
`source`, `properties`) is contract; the contents of `properties` are
free-form per event_name.

---

**Questions during onboarding:** ping the Storees onboarding owner. Most
clients hit "live with historical data" in 5-7 calendar days end-to-end.
