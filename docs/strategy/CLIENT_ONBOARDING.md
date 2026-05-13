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
[Storees admin]                ┌──────────────────────────────┐
   "Sync Now"  ───┐            │   POST /api/v1/events        │
                  │            │   POST /api/v1/events/batch  │   ← live activity
[Browser SDK]   ──┼──┐         │   POST /api/v1/import/*      │   ← historical
[Server events] ──┼──┼────────▶│                              │
[Data-source     ─┘  │         │   - API-key auth             │
 connector]──────────┘         │   - Idempotency dedup        │
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

**One pipeline, every input.** No special paths for "historical vs live" — just an optional `historical: true` flag in event properties so flow triggers skip retroactive firing.

Two ways to feed data into the pipeline:
1. **Data-source connectors (§6)** — Storees pulls from the client's API on demand. The recommended setup for nearly every client. Onboarding configures it once; marketing presses Sync Now from then on.
2. **Live event firing (§5)** — Client's app pushes events as they happen (order placed, KYC completed, etc.) via SDK or server-to-server HTTP. Optional but valuable for real-time flows + campaigns between syncs.

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
3. **Base URL of their admin API + an API key** — Storees uses these to commission a data-source connector (§6). For VirpanAI-backed stores the mapping is pre-filled; for any other stack, they also hand over **their API docs** for customers/products/orders endpoints so we can write the field mapping
4. **(Optional, only if no API)** Static CSV/JSON exports — Storees falls back to the manual bulk import path in §6.5

---

## 3 · Day-by-day onboarding timeline

| Day | Storees side | Client side |
|---|---|---|
| 1 | Provision project + API key. **Commission the data-source connector** (§6) — pick template, enter base URL + API key, run Test Connection | Hand over their API base URL + admin API key. Confirm domain type |
| 2 | **Trigger first full sync** from the Data Sources page. Watch logs, fix any field-mapping issues from the client's API docs | Available to answer field-mapping questions |
| 3 | Spot-check Storees admin: customer count, top customers by spend, product catalogue completeness | Side-by-side: their dashboard vs Storees admin |
| 4-5 | Watch incoming events validate auth | Implement live event firing — SDK and/or server-to-server (§5) for real-time updates between syncs |
| 6 | Confirm aggregates match within ±2%, flip default segments live | Train marketing team |
| 7 | Go-live: enable campaigns + flows | Marketing presses **Sync Now** before each campaign launch (or relies on incremental for live events) |

After Day 7, the integration runs forever with **zero ops overhead** — connector pulls run on demand from the admin UI, live events fire from the client app, Storees handles everything downstream.

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

## 4.5 · Identity, custom attributes & compliance

### Identity resolution (how Storees decides "is this the same customer?")

Storees uses a **three-tier lookup** to resolve every incoming event to a customer row, in this order:

1. **`external_id`** — your system's primary key (Medusa `cus_...`, Auth0 `auth0|...`, your member id). Always prefer this when available.
2. **`email`** — exact match, unique per project.
3. **`phone`** — exact match (E.164 format: `+919876543210`), unique per project.

If a match is found at any tier, the existing row is updated. If no match, a new customer row is created. **Always send as many identifiers as you have** — Storees auto-merges when later events fill in gaps (e.g. an anonymous `product_viewed` followed by a logged-in `order_placed` will retroactively attribute the earlier view to the resolved customer via `identityMergeWorker`).

| Scenario | Recommended `customer_id` field |
|---|---|
| Logged-in user | `external_id` (your system's id) |
| Anonymous browser visitor | Storees-issued session id (SDK handles this) |
| Multi-system client (e.g. CRM id + auth id + member id) | Pick ONE as `external_id`. Pass the rest as `properties.alt_ids` for reference |

### Custom customer attributes (vertical-specific fields)

Beyond the canonical fields (name/email/phone/region/city/subscribed), every customer has a `custom_attributes` JSONB bag you can populate with arbitrary domain-specific fields. **These are fully queryable in segments.**

Set them via `customer_created` / `customer_updated` events or `/import/customers`:

```json
{
  "event_name": "customer_updated",
  "customer_id": "ext_abc_123",
  "properties": {
    "custom_attributes": {
      "kyc_status": "verified",
      "credit_score": 742,
      "risk_band": "low",
      "member_tier": "gold",
      "lifetime_claims": 2,
      "annual_premium": 18000
    }
  }
}
```

Update keys merge into existing attributes (deep-merge per key). Setting a key to `null` clears it. Once a key appears on any customer in the project, it shows up in the segment builder under "Custom attributes."

**Conventions:**
- `snake_case` keys, scalar values (string/number/boolean) or short arrays — avoid nested objects (harder to query)
- Use the canonical fields (name/email/phone) for those fields — don't duplicate them into `custom_attributes`
- Don't put PII you can avoid (passport numbers, full PAN) — see Compliance below

### Compliance: PII, data residency, retention, right-to-erasure

| Concern | Storees default | How to configure |
|---|---|---|
| **PII at rest** | Email/phone/name stored unencrypted in Postgres. Sensitive `custom_attributes` (e.g. account numbers) should be hashed client-side. | Talk to Storees onboarding before storing PAN, Aadhaar, bank-account numbers, or KYC documents — these need column-level encryption (services/encryption.ts) enabled per project. |
| **Data residency** | Production Postgres lives in `ap-south-1` (Mumbai). | For EU clients with GDPR Art 45 concerns, an EU-region project can be provisioned on request (separate Postgres, separate API base URL). |
| **Retention** | Events retained indefinitely; customers retained until deletion is requested. | Per-project event TTL can be configured (e.g. 24 months) — events beyond TTL are dropped from the events table but aggregates on customers are preserved. |
| **Right-to-erasure (DPDPA §11 / GDPR Art 17)** | Supported via dedicated endpoint. | `DELETE /api/v1/customers/<external_id>` purges the customer row + ALL related events + all flow trips. Returns `{ purged: { customer: 1, events: N, trips: M } }`. Idempotent — re-running on a non-existent customer returns 404. |
| **Consent / unsubscribe** | `email_subscribed` / `sms_subscribed` flags on customer + per-channel suppression list (`services/consentService.ts`). | Update via `customer_updated` events OR the SDK's `Storees.unsubscribe(channel)` call. Suppressed customers automatically excluded from campaigns regardless of segment membership. |

### Sandbox vs production credentials

Every project gets two API keys: `sk_test_...` (staging endpoint, isolated data) and `sk_live_...` (production). **Never share keys between environments** — staging customers must not leak into production aggregates. The CI smoke tests should run against staging only; production cutover is a manual key swap in the client's secret manager.

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

## 5.5 · The `order_placed` contract (read this — most onboarding bugs live here)

`order_placed` is the single most consequential event in Storees. **Every revenue number, every "high-value customer" segment, every flow that fires on a purchase — all of it derives from this one event's `properties.total`.** Get this wrong and the entire dashboard lies.

Past incident: a client wired `order_placed` from their order-created hook before payment captured, so every event arrived with `total: 0`. Their customers showed ₹20 lifetime value when the real number was ₹50,000+. The aggregator was working perfectly — it was just being fed zeros.

### What `properties.total` MUST be

The **final, authoritative, post-tax, post-discount, post-shipping** amount the customer paid, **in the major currency unit** (₹, $, €), as a positive number. **Not** a string. **Not** the subtotal. **Not** the cart's running total. **Not** zero "we'll backfill it later."

| Source field | Use this? | Why |
|---|---|---|
| `order.total` (final paid) | ✅ Yes | The right field |
| `order.grand_total` | ✅ Yes | Same thing, different name |
| `order.subtotal` | ❌ No | Excludes tax/shipping |
| `order.total_before_discount` | ❌ No | Inflates revenue |
| `cart.total` at checkout | ❌ No | Cart ≠ order; carts get abandoned, modified, repriced |
| Tax / shipping in isolation | ❌ No | Common copy-paste bug |

### When to fire the event

**Fire `order_placed` ONCE, AFTER the order is finalized AND the total field is stable.** The right hook is whichever lifecycle event in your system means "this customer paid us money for these items."

- ✅ `order.payment_captured` — total is locked, money received
- ✅ `order.completed` — terminal state, total final
- ✅ Inside the DB transaction that flips the order from `pending` → `paid`
- ❌ `order.created` — total may be `0` or `null` until payment captures
- ❌ `order.draft_saved` — not a real order yet
- ❌ `cart.checkout_started` — that's `checkout_started`, a different event

If your platform fires order-creation events before payment, **wait for the payment-capture event** and emit `order_placed` from there.

### `cart_updated` ≠ `order_placed`

`cart_updated` is intent. `order_placed` is revenue. They have similar payloads but the aggregator treats them completely differently:

| Event | Affects `total_spent`? | Affects `total_orders`? | Fires flow triggers? |
|---|---|---|---|
| `order_placed` | ✅ Yes | ✅ Yes | ✅ Yes (unless `historical: true`) |
| `cart_updated` | ❌ No (only `last_seen`) | ❌ No | Only cart-abandonment flows |

If a customer's cart hits ₹1450 but the eventual order is ₹0 (or doesn't fire), `total_spent` stays at zero. That's correct — Storees can only count revenue it's told about.

### Pre-flight validator (run before going live)

Drop this near your order-event emitter. It catches the AK-class bug before it reaches Storees:

```ts
function validateOrderPlaced(payload: {
  customer_id: string
  properties: { order_id: string; total: number; currency: string; line_items: any[] }
}) {
  const { properties: p } = payload
  if (!payload.customer_id) throw new Error('missing customer_id')
  if (!p.order_id) throw new Error('missing order_id')
  if (typeof p.total !== 'number') throw new Error(`total is ${typeof p.total}, expected number`)
  if (p.total <= 0) throw new Error(`total is ${p.total} — refusing to send a zero/negative order_placed`)
  if (!p.currency || p.currency.length !== 3) throw new Error(`currency must be a 3-letter ISO code, got ${p.currency}`)
  if (!Array.isArray(p.line_items) || p.line_items.length === 0) throw new Error('line_items empty')
  const lineItemSum = p.line_items.reduce((s, li) => s + li.price * li.quantity, 0)
  // Allow 5% slack for tax/shipping/discount — anything wider is suspicious
  const drift = Math.abs(lineItemSum - p.total) / p.total
  if (drift > 0.5) {
    console.warn(`[storees] line_items sum (${lineItemSum}) drifts >50% from total (${p.total}) — verify mapping`)
  }
}
```

The `total <= 0` guard alone would have caught the GWM incident on day one.

### Currency

Always include `currency` as a 3-letter ISO code (`INR`, `USD`, `EUR`). If a single project mixes currencies (rare), Storees compares totals as-is — meaning ₹100 and $100 are treated the same numerically. Either normalize to one currency client-side or talk to Storees about per-currency aggregates.

---

## 6 · Data source connectors (the recommended setup — Day 1-2)

**This is the primary onboarding path.** Onboarding team commissions one connector per client, once. After that, marketing presses **Sync Now** in the Storees admin whenever they want fresh data. The client doesn't write any code, doesn't run any scripts, doesn't grant DB access.

Works for any vertical (BFSI, sporttech, edtech, ecommerce, custom) and any stack (Node, Java, Go, Python, Rails, .NET, mainframe) — anything that exposes paginated REST endpoints for customers, products, and orders.

### What a connector is

A connector is a per-project record in Storees storing:
- **Base URL** of the client's API
- **API key** (encrypted at rest via the existing encryption service)
- **Template** — pre-filled field mapping (`virpanai` for VirpanAI-backed stores, `custom` for everything else)
- **Last-synced-at timestamps** — per entity, so subsequent runs are incremental

Storees pulls data from the configured endpoints in batches, maps each record to the canonical Storees shape, and feeds it through the same import pipeline used by `/v1/import/*`. The aggregator folds the imported events into `total_spent`/`total_orders`/etc. exactly as it would for live events.

### Step-by-step: commissioning a connector

**Storees onboarding owner does this once. ~15 minutes per client.**

1. **Open Storees admin → Data Sources** (sidebar, admin-only)
2. **Click "Add Connector"**
3. **Pick a template:**
   - `VirpanAI` for VirpanAI-backed stores (GWM and similar) — field mapping pre-filled
   - `Custom HTTP` for any other stack — you'll fill in field mappings from the client's API docs
4. **Fill in:**
   - **Connector name** — internal label (e.g. "Acme Bank Production")
   - **Base URL** — the root of the client's API (e.g. `https://api.acme-bank.com`)
   - **API key / Bearer token** — the credential they gave you (encrypted on save)
5. **Click "Save & continue"**
6. **Click "Test"** on the new connector card — Storees fetches one record from each endpoint and shows the raw + mapped form so you can verify the field mapping before committing to a full sync. If the mapping is wrong, edit the connector's `configOverride` to adjust field paths and re-test.
7. **Click "Sync Now"** — kicks off the first full sync. Watch the history table on the same page: rows update in real-time as customers → products → orders complete.

### How sync runs work

| Behavior | Detail |
|---|---|
| **First sync** | Always full — there's no `last_synced_at` baseline yet |
| **Subsequent syncs** | Default to incremental — pulls only records where `updated_at >= last_synced_at` |
| **Full resync button** | Emergency "everything from scratch" — use for schema migration on the client's side, suspected data drift, or after a partial-failure recovery |
| **Per-entity isolation** | If `products` fails mid-run, `customers` and `orders` still complete; sync ends as `partial`. `last_synced_at` advances only for successful entities |
| **Idempotency** | Order events use `idempotency_key='order_placed_historical:<order_id>'` — re-running a sync doesn't double-count |
| **Pagination** | Configurable per template (offset / page / cursor). VirpanAI template defaults to offset+limit at 100/page |

### Logs and observability

Every sync run writes line-level logs to `data_source_sync_logs`. Surface from the admin UI:

- **Sync history table** on each connector card — last 25 runs, expandable to see logs
- **Filter by level** — `all` / `error` / `warn`
- **Each log entry** shows: entity type (customer/product/order), entity ID (e.g. the failing `order_id`), the human-readable message, and an optional JSON payload (e.g. the raw source record + the mapped result)

Common log scenarios to know:
- `Order <id> has total 0 — skipping` — connector saw an order with zero total. Indicates field-mapping bug on the client's side (firing `order_placed` from the wrong lifecycle hook — see §5.5).
- `Customer has no external_id, email, or phone` — record can't be identity-resolved, dropped.
- `HTTP 401 from /admin/orders` — API key wrong/expired. Fix the connector's auth value and retry.

### When to use a custom template instead of VirpanAI

The `VirpanAI` template ships with field mappings for the VirpanAI/Medusa-v2 schema. For any other stack:

1. Pick **Custom HTTP** when adding the connector
2. Get the client's API docs for their customers, products, orders endpoints
3. In the connector's `configOverride`, set:
   - `endpoints.{customers,products,orders}.path` — the actual URL path
   - `endpoints.*.responseDataPath` — where the array lives in the response (e.g. `data`, `customers`, `results`)
   - `fieldMap.{customers,products,orders}.*` — map their fields → Storees canonical (`email`, `total`, `order_id`, etc.)
   - `incremental.*.param` if their API supports filtering by updated_at (e.g. `?updated_after=...`)
4. Run **Test** to validate the mapping before triggering a full sync

The field-mapping syntax supports dot-paths, array indices (`variants[0].prices[0].amount`), concat (`{ concat: [first_name, last_name] }`), numeric transforms (`{ from: total, divideBy: 100 }`), and array projection (`{ fromArray: collections, field: title }`). See `services/connectors/genericHttpConnector.ts` for the full schema.

### Manual sync triggers (emergency / refresh)

The **Sync Now** and **Full Resync** buttons on the connector card are the canonical interventions for:

- Client's system had a data quality issue that's now fixed → Full Resync to rebuild Storees totals from clean source
- Marketing wants the dashboard up-to-date right now → Sync Now (incremental, ~30 seconds for typical volumes)
- Client added a new product category or customer segment to their system → Sync Now picks it up on the next incremental
- Something looks wrong → Test button shows whether the auth/endpoints/mapping are healthy without writing to Storees

Manual triggers are the only triggers right now — there's no scheduled cron. Add one in Phase 2 if marketing teams ask for nightly auto-refresh.

---

## 6.5 · Manual bulk import (fallback path)

The clean break from the GWM/FDW era: **one canonical migration path that
works for every client**. No DB access required. The client exports their
data, posts it to our bulk endpoints.

**When to use this instead of a connector:**
- Client has no queryable API at all — only CSV/JSON exports out of their system
- One-shot migration where setting up a connector is overhead (e.g. acquiring a competitor and importing their static customer list)
- Testing the data shape end-to-end before wiring a connector (rare)

For everything else, prefer the connector flow above.

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

## 7.5 · Product lifecycle states (BFSI, sporttech, subscriptions)

E-commerce has one revenue moment: payment captures, order ships. Done. BFSI products, memberships, and bookings have **multi-stage lifecycles** — and the most common onboarding mistake is firing `order_placed` at the wrong stage and breaking `total_spent`.

### The pattern: lifecycle events vs. revenue events

> **Only fire `order_placed` when net revenue actually arrives.** Use custom events for every other state change.

| Event class | Examples | Affects `total_spent`? | Use for |
|---|---|---|---|
| **Revenue event** | `order_placed`, `order_refunded`, `order_cancelled` | ✅ Yes | Real money in/out |
| **Lifecycle event** (custom) | `loan_approved`, `policy_bound`, `booking_confirmed`, `subscription_started`, `subscription_renewed` | ❌ No (only `last_seen`) | Segments, flows, funnels |

Both event types land in the same events table and are filterable in segments + flows. The only thing that distinguishes them is whether the aggregator increments revenue.

### BFSI — Loan product lifecycle

```
applied → approved → disbursed → repaying (N events) → closed
```

```ts
// Stage 1 — Application submitted (custom event, no revenue)
{ event_name: 'loan_applied',
  properties: { loan_id: 'L_001', product_id: 'loan_personal_a', amount_requested: 250000 } }

// Stage 2 — Approved (custom event, no revenue, useful for "send congrats" flow)
{ event_name: 'loan_approved',
  properties: { loan_id: 'L_001', approved_amount: 250000, apr: 12.5, tenure_months: 36 } }

// Stage 3 — Disbursed (THIS is the order_placed — revenue inflow)
{ event_name: 'order_placed',
  idempotency_key: 'loan_disbursed:L_001',
  properties: { order_id: 'L_001', total: 250000, currency: 'INR',
                line_items: [{ product_id: 'loan_personal_a', ... }] } }

// Stage 4 — Each EMI payment is its own order_placed (recurring revenue)
{ event_name: 'order_placed',
  idempotency_key: 'emi_paid:L_001:installment_07',
  properties: { order_id: 'L_001_emi_07', total: 8350, currency: 'INR',
                line_items: [{ product_id: 'loan_personal_a', product_name: 'EMI installment 7', ... }] } }

// Stage 5 — Loan closed (custom event, no revenue)
{ event_name: 'loan_closed',
  properties: { loan_id: 'L_001', closed_reason: 'paid_in_full' } }
```

Result: `total_spent` = disbursement + every EMI = lifetime loan revenue from this customer. Marketing can segment on `customers with active loans` (joined `loan_approved` AND not joined `loan_closed`) or `customers who missed EMI` (`emi_paid` event count < expected).

### BFSI — Insurance policy lifecycle

```
quoted → bound → premium_paid (N events) → claim_filed → claim_settled
```

Same pattern: `policy_bound` is a custom event (no revenue), each `premium_paid` is an `order_placed` (recurring revenue). Claim payouts are `order_refunded` (revenue decrement).

### Sporttech — Booking lifecycle

```
booking_made → booking_confirmed → slot_attended | no_show | cancelled
```

```ts
// Booking created — order_placed fires NOW (customer paid), but slot is in the future
{ event_name: 'order_placed',
  timestamp: '2026-05-13T05:42Z',                  // when they paid
  idempotency_key: 'booking:B_555',
  properties: { order_id: 'B_555', total: 1200, currency: 'INR',
                line_items: [{ product_id: 'arena_north_a', ... }],
                slot_start: '2026-05-15T18:00Z',   // when they play
                slot_end:   '2026-05-15T19:00Z' } }

// If they no-show or cancel within window — custom event for funnel analysis
{ event_name: 'booking_no_show',
  properties: { booking_id: 'B_555', slot_start: '2026-05-15T18:00Z' } }

// Refund-eligible cancellation
{ event_name: 'order_refunded',
  idempotency_key: 'booking_cancelled:B_555',
  properties: { order_id: 'B_555', total: 1200, currency: 'INR', reason: 'customer_cancelled' } }
```

The `slot_start` in properties powers "send reminder 2h before slot" flows and "X% no-show rate" segments.

### Memberships & subscriptions

Recurring access (gym membership, SaaS, streaming) follows the same rule: **each billing cycle fires an `order_placed`.**

```ts
// First billing
{ event_name: 'order_placed',
  idempotency_key: 'subscription:S_42:cycle_1',
  properties: { order_id: 'S_42_c1', total: 999, currency: 'INR',
                line_items: [{ product_id: 'plan_gold', product_name: 'Gold — Monthly', ... }],
                subscription_id: 'S_42', cycle_number: 1 } }

// Lifecycle event when plan tier changes (no revenue impact at this moment)
{ event_name: 'subscription_upgraded',
  properties: { subscription_id: 'S_42', from_plan: 'plan_silver', to_plan: 'plan_gold' } }

// Cancellation — this is the END of the subscription, not a refund
{ event_name: 'subscription_cancelled',
  properties: { subscription_id: 'S_42', effective_date: '2026-06-01' } }
```

**Don't** fire `order_refunded` for cancellation — they got the service. **Do** fire `order_refunded` only if money is actually returned (e.g. unused prepaid balance).

### The "one rule" that prevents 90% of BFSI/sporttech onboarding bugs

**Walk through your product lifecycle on a whiteboard. For every transition, ask: "Did the customer just pay us, or did we just pay them back?" If yes → revenue event. If no → custom event.** Send both — never collapse a lifecycle event into a fake `order_placed` to "show activity" on the customer, and never skip emitting a revenue event because "we already sent a `loan_approved`."

---

## 8 · Live event reference

These are the events the customer aggregate worker pays attention to. Every other event still lands in the events table and updates `last_seen` — useful for segments + flows but doesn't move revenue numbers.

### `order_placed` (revenue increment)

> **Read section 5.5 before wiring this event.** `properties.total` MUST be the final paid amount in the major currency unit. The aggregator trusts this number absolutely — there is no second source of truth.

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

## 8.5 · Custom events (declaring your own)

Beyond the canonical events in section 8, **any event name is valid**. Send `loan_approved`, `booking_confirmed`, `policy_renewed`, `kyc_completed`, `claim_filed` — whatever your domain needs. There's no registration step; Storees auto-discovers event names from the events table.

### What "just send it" means

```bash
curl -X POST https://api.storees.io/api/v1/events \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "event_name": "loan_approved",
    "customer_id": "ext_abc_123",
    "timestamp": "2026-05-13T05:42:17Z",
    "idempotency_key": "loan_approved:L_001",
    "source": "server",
    "properties": {
      "loan_id": "L_001",
      "approved_amount": 250000,
      "apr": 12.5,
      "tenure_months": 36,
      "product_id": "loan_personal_a"
    }
  }'
```

Within minutes the event:
- Lands in the events table
- Bumps `customer.last_seen`
- Becomes filterable in the segment builder under "Event-based filters" → event name `loan_approved`
- Becomes selectable as a trigger in the flow builder
- Property keys (`approved_amount`, `apr`, etc.) auto-populate as filterable fields once Storees has seen ≥1 event with that key

No backend deploy needed. No schema migration. The first event of a new name self-registers the event type for the admin UI.

### Naming conventions

| Convention | Example | Reason |
|---|---|---|
| `snake_case` event names | ✅ `loan_approved` ❌ `LoanApproved` / `loan-approved` | Consistency with canonical events; URL-safe |
| Past tense verbs | ✅ `policy_renewed` ❌ `renew_policy` | Events are facts that already happened |
| Domain-scoped, not generic | ✅ `claim_filed` ❌ `form_submitted` | "Form submitted" tells marketing nothing |
| `snake_case` property keys | ✅ `approved_amount` ❌ `approvedAmount` | Same reason — Postgres JSONB convention |

### Reserved property keys (don't use these for custom data)

Storees uses these property keys with specific semantics — overloading them will cause silent bugs:

| Key | Used by | Meaning |
|---|---|---|
| `total` | `order_placed`, `order_refunded`, `order_cancelled` | Revenue amount (numeric, major currency unit) |
| `currency` | revenue events | ISO 3-letter code |
| `line_items` | revenue events | Array of `{product_id, product_name, quantity, price, ...}` |
| `historical` | bulk-imported events | `true` skips flow triggers |
| `order_id` | revenue events | Idempotency partial — pair with `idempotency_key` |
| `session_id` | anonymous events | Bridge to identity-merge worker |

Everything else is yours. Common safe keys: `loan_id`, `policy_id`, `booking_id`, `subscription_id`, `claim_id`, `apr`, `approved_amount`, `tenure_months`, `risk_band`, etc.

### How custom events power segments and flows

Once a custom event has fired at least once for a project, marketing can use it like any built-in event:

**Segment example — "customers approved but not disbursed in 7 days" (drop-off risk):**
- Did event `loan_approved` in last 30 days
- AND did NOT do event `order_placed` where `properties.loan_id` matches in last 7 days

**Flow trigger example — "send congrats SMS when KYC completes":**
- Trigger: event `kyc_completed`
- Filter: `properties.kyc_status = 'verified'`
- Action: send SMS template `kyc_success`

### When to NOT use a custom event

- ❌ For revenue — always use `order_placed` / `order_refunded` (otherwise `total_spent` lies)
- ❌ For updating customer profile fields — use `customer_updated` so the canonical fields stay in sync
- ❌ For pure UI events with no marketing value (`button_hovered`, `modal_opened`) — these inflate the events table without driving any segment or flow. Track them in your product analytics tool (Mixpanel/Amplitude), not Storees.

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
- [ ] **AOV sanity check**: run the query below — if the average `order_placed.total` is suspiciously low (e.g. < ₹50) for a vertical where real orders are larger, the client is sending the wrong field

```sql
-- Are we receiving believable order totals?
SELECT
  COUNT(*)                                                        AS order_events,
  ROUND(AVG((properties->>'total')::numeric), 2)                  AS avg_total,
  MIN((properties->>'total')::numeric)                            AS min_total,
  MAX((properties->>'total')::numeric)                            AS max_total,
  COUNT(*) FILTER (WHERE (properties->>'total')::numeric = 0)     AS zero_totals,
  COUNT(*) FILTER (WHERE (properties->>'total')::numeric < 10)    AS suspicious_small
FROM events
WHERE project_id = '<PROJECT_ID>'
  AND event_name = 'order_placed'
  AND received_at > NOW() - INTERVAL '24 hours';
-- zero_totals > 0  → client is firing the event too early in the order lifecycle
-- avg_total way below client's stated AOV → client is mapping the wrong field
```

- [ ] **Cart-vs-order parity check**: for customers who have both a `cart_updated` and an `order_placed` in the last 24h, the order total should be in the same ballpark as the most recent cart total (within ~2x — taxes, shipping, partial-cart purchases account for normal drift)

```sql
-- Latest cart vs latest order, per customer (catches the AK-class bug instantly)
WITH latest_cart AS (
  SELECT DISTINCT ON (customer_id)
    customer_id, (properties->>'total')::numeric AS cart_total, timestamp
  FROM events
  WHERE project_id = '<PROJECT_ID>'
    AND event_name = 'cart_updated'
    AND received_at > NOW() - INTERVAL '24 hours'
  ORDER BY customer_id, timestamp DESC
),
latest_order AS (
  SELECT DISTINCT ON (customer_id)
    customer_id, (properties->>'total')::numeric AS order_total, timestamp
  FROM events
  WHERE project_id = '<PROJECT_ID>'
    AND event_name = 'order_placed'
    AND received_at > NOW() - INTERVAL '24 hours'
  ORDER BY customer_id, timestamp DESC
)
SELECT lc.customer_id, lc.cart_total, lo.order_total,
       ROUND(lo.order_total / NULLIF(lc.cart_total, 0), 2) AS ratio
FROM latest_cart lc JOIN latest_order lo USING (customer_id)
WHERE lo.order_total < lc.cart_total * 0.1   -- order is <10% of cart → red flag
ORDER BY lc.cart_total DESC LIMIT 20;
```

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

### "Customer's `total_spent` is much lower than their cart values" (the AK bug)
- **Cause:** Client is firing `order_placed` from the wrong lifecycle hook — typically `order.created` (before payment) instead of `order.payment_captured` (after). The event lands with `total: 0` or a stub value, while their `cart_updated` events correctly show the real basket total.
- **Check:**
  ```sql
  SELECT timestamp, properties->>'order_id' AS order_id,
         (properties->>'total')::numeric AS total
  FROM events
  WHERE customer_id = '<CUSTOMER_UUID>'
    AND event_name = 'order_placed'
  ORDER BY timestamp DESC;
  -- If totals are 0 or tiny while cart_updated shows real amounts → confirmed
  ```
- **Fix:** Two-part recovery:
  1. **Client side:** Move the emit call to fire AFTER the order's total is final (post-payment-capture). Add the pre-flight validator from section 5.5 so this can never regress silently.
  2. **Storees side (backfill):** Don't simply re-POST — the existing bad events keep their old idempotency keys and a re-import would create duplicates under different keys (`order_placed:X` vs `order_placed_historical:X`). Instead, **delete the bad events and let catch-up replay the fixed ones**:
     ```sql
     -- 1. Wipe the zero-total order_placed events
     DELETE FROM events
     WHERE project_id = '<PROJECT_ID>'
       AND event_name = 'order_placed'
       AND (properties->>'total')::numeric < 1;

     -- 2. Reset affected customers' aggregates so catch-up recomputes from scratch
     UPDATE customers SET
       total_orders = 0, total_spent = 0,
       first_order_date = NULL, last_order_date = NULL, avg_order_value = 0
     WHERE project_id = '<PROJECT_ID>'
       AND id IN (SELECT DISTINCT customer_id FROM events
                  WHERE project_id = '<PROJECT_ID>' AND event_name = 'order_placed');

     -- 3. Mark surviving order events as unprocessed so the worker re-folds them
     UPDATE events SET processed_at = NULL
     WHERE project_id = '<PROJECT_ID>' AND event_name = 'order_placed';
     ```
     Then have the client `/v1/import/orders` the corrected historical orders. Restart the backend (`pm2 restart storees-backend`) to trigger startup catch-up.

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
