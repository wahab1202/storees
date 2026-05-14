# GWM Bulk Import — Integration Handoff

> **Audience:** Siddharth (GWM eng) + Wahab (Storees onboarding owner)
> **Goal:** Import GWM's customers, products, and historical orders into Storees via three HTTP endpoints. No database access, no SSH, no shared infra. Three POSTs in the right order from GWM's side, two validation checks from Storees' side.
> **Estimated time:** 30 min setup + 5–10 min per 10K records.

---

## What's been built since the FDW cutover

Storees now exposes three idempotent bulk-import endpoints under `/api/v1/import/*`. They feed the same pipeline that live events flow through, so:

- Customer aggregates (`total_spent`, `total_orders`, `first_order_date`, `last_order_date`, `avg_order_value`) update automatically.
- Flow triggers **skip** historical events (so a "welcome email" flow won't fire for orders from last year).
- The product catalogue auto-extracts from order line-items even if `/import/products` is skipped.
- Re-running an import is safe — idempotency keys dedupe on the server.

---

## 1 · Credentials & endpoints

Storees onboarding will hand over **two values** in Slack/email:

```
PROJECT_ID = <UUID>
API_KEY    = sk_live_...   (or sk_test_... for staging)
```

The API key is the only credential — same one for all three endpoints, same one for live events later. Treat it like a Stripe secret key.

**Endpoint base URLs:**

| Env | Base URL |
|---|---|
| Production | `https://api.storees.io` |
| Staging | `https://staging-api.storees.io` |

**Every request needs these two headers:**

```
Authorization: Bearer sk_live_...
Content-Type: application/json
```

**Project scoping** is via query string: `?projectId=<PROJECT_ID>` on every request.

**Rate limit:** 2000 requests/min per API key on `/import/*` (generous — designed for bulk loads).

---

## 2 · Order of operations (matters)

```
Step 1.  /api/v1/import/customers   ← upload customers first
Step 2.  /api/v1/import/products    ← upload product catalogue
Step 3.  /api/v1/import/orders      ← upload historical orders (references 1 + 2)
```

Orders reference customers by `customer_id` (your VirpanAI/Medusa `cus_id`) and products by `product_id`. If you POST orders before customers, the unresolved customer rows error out. Re-run order import after customer import — idempotency dedupes.

**Max batch size:** 1000 records per request. Chunk client-side.

---

## 3 · Endpoint reference

### 3.1 · `/api/v1/import/customers`

Upserts customer profiles. No events emitted — the `customers` table itself is updated. Identity resolves by `customer_id` (preferred), then `email`, then `phone`. If a customer already exists, fields are updated (latest wins for `name`/`email_subscribed`; `region`/`city` only fill if currently `NULL` so other-source data isn't clobbered).

**Request:**

```bash
curl -X POST "https://api.storees.io/api/v1/import/customers?projectId=<PROJECT_ID>" \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customers": [
      {
        "customer_id": "cus_01ABC...",
        "email": "alice@example.com",
        "phone": "+919876543210",
        "name": "Alice Rivera",
        "region": "Tamil Nadu",
        "city": "Chennai",
        "email_subscribed": true,
        "sms_subscribed": false
      }
    ]
  }'
```

**Required:** at least one of `customer_id`, `email`, or `phone` per row.
**Optional:** everything else.

**Response:**

```json
{
  "success": true,
  "data": {
    "resolved": 1000,
    "failed": 0,
    "errors": []
  }
}
```

If `failed > 0`, `errors[]` contains `{ index, error }` for up to 20 failed rows.

### 3.2 · `/api/v1/import/products`

Upserts the product catalogue. Collections are auto-created and linked via the `product_collections` junction.

**Request:**

```bash
curl -X POST "https://api.storees.io/api/v1/import/products?projectId=<PROJECT_ID>" \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {
        "product_id": "prod_01XYZ...",
        "title": "Wireless Earbuds Pro",
        "product_type": "Audio",
        "vendor": "Brand X",
        "base_price": 4280.00,
        "currency": "INR",
        "image_url": "https://cdn.gowelmart.com/...",
        "status": "active",
        "collections": ["Summer Sale", "Bestsellers"]
      }
    ]
  }'
```

**Required:** `product_id` only.
**Optional:** everything else — but `title`, `product_type`, and `base_price` are what powers the segment-builder pickers, so populate them.
**`status` accepted values:** `active` | `archived` | `draft`.

**Response:**

```json
{ "success": true, "data": { "imported": 1000, "errors": [] } }
```

### 3.3 · `/api/v1/import/orders`

Each historical order becomes an `order_placed` event in Storees flagged with `historical: true`. Idempotency key is `order_placed_historical:<order_id>` — re-running this import is safe (server-side `ON CONFLICT DO NOTHING`).

**Request:**

```bash
curl -X POST "https://api.storees.io/api/v1/import/orders?projectId=<PROJECT_ID>" \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [
      {
        "customer_id": "cus_01ABC...",
        "order_id": "order_01KRG562V2CY40V6N3B979J0JC",
        "timestamp": "2026-04-12T14:30:00Z",
        "total": 4280.00,
        "currency": "INR",
        "line_items": [
          {
            "product_id": "prod_01XYZ...",
            "product_name": "Wireless Earbuds Pro",
            "product_type": "Audio",
            "product_collection": "Summer Sale",
            "quantity": 1,
            "price": 4280
          }
        ]
      }
    ]
  }'
```

**Required:** `customer_id`, `order_id`, `timestamp`, `total`.
**`timestamp`** must be ISO 8601 (e.g. `2026-04-12T14:30:00Z`). Use the order's *original* creation time, not the import time — Storees needs this to compute `first_order_date`/`last_order_date` correctly.

**Response:**

```json
{
  "success": true,
  "data": {
    "imported": 1000,
    "deduped": 0,
    "unresolved": 0,
    "errors": []
  }
}
```

- `imported` — orders newly inserted.
- `deduped` — orders whose `order_id` was already imported (safe, no-op).
- `unresolved` — orders whose `customer_id` couldn't be matched. Run `/import/customers` for those, then re-run `/import/orders`.

---

## 4 · ⚠ The `total` contract (read this before writing the export script)

**`properties.total` is the single most consequential field in this entire integration.** It drives every revenue number in Storees: customer LTV, segment thresholds, campaign attribution, churn risk. Get this wrong and the entire dashboard lies.

### What `total` MUST be

The **final, authoritative, post-tax, post-discount, post-shipping** amount the customer paid, **in the major currency unit** (₹, not paise), as a **positive number**. Not a string. Not the subtotal. Not the cart's running total. Not zero "we'll backfill it later."

| Source field in your DB | Use this? | Notes |
|---|---|---|
| `order.total` (final paid) | ✅ Yes | The right field |
| `order.grand_total` | ✅ Yes | Same thing, different name |
| `order.total` in **cents** (Medusa default) | ⚠ Yes — **but divide by 100** | Medusa stores money as integer cents |
| `order.subtotal` | ❌ No | Excludes tax/shipping |
| `order.total_before_discount` | ❌ No | Inflates revenue |
| `cart.total` at checkout | ❌ No | Cart ≠ order |

**Past incident:** A previous integration wired the export from `order.created` hook before payment captured. Every event arrived with `total: 0`. Customers showed ₹20 lifetime value when the real number was ₹50K+. Don't repeat that.

### When to read `total`

Read it from the order after the payment is finalized — `order.status IN ('captured', 'completed', 'paid')`. If you read it from a pending order, you may get zero.

### Drop-in validator for your export script

```ts
function validateOrderRow(o: {
  customer_id: string
  order_id: string
  timestamp: string
  total: number
  currency: string
  line_items: Array<{ price: number; quantity: number }>
}) {
  if (!o.customer_id) throw new Error('missing customer_id')
  if (!o.order_id) throw new Error('missing order_id')
  if (typeof o.total !== 'number') throw new Error(`total is ${typeof o.total}, expected number`)
  if (o.total <= 0) throw new Error(`total is ${o.total} — refusing to send a zero/negative order`)
  if (!o.currency || o.currency.length !== 3) throw new Error(`currency must be 3-letter ISO, got ${o.currency}`)
  const sum = (o.line_items ?? []).reduce((s, li) => s + (li.price ?? 0) * (li.quantity ?? 0), 0)
  if (sum > 0 && Math.abs(sum - o.total) / o.total > 0.5) {
    console.warn(`[storees] line_items sum (${sum}) drifts >50% from total (${o.total}) on ${o.order_id} — verify`)
  }
}
```

The `total <= 0` guard alone catches the most common bug.

---

## 5 · VirpanAI / Medusa field mapping

GWM runs on Medusa v2. Suggested mapping from Medusa entities to Storees import payloads:

### Customers

| Storees field | Medusa source | Notes |
|---|---|---|
| `customer_id` | `customer.id` | Will become Storees `external_id` |
| `email` | `customer.email` | |
| `phone` | `customer.phone` | E.164 format ideally |
| `name` | `${customer.first_name} ${customer.last_name}` | Trim whitespace, skip empty parts |
| `region` | `address.province` of default billing address | |
| `city` | `address.city` of default billing address | |
| `email_subscribed` | `customer.has_account` OR custom field | |

### Products

| Storees field | Medusa source | Notes |
|---|---|---|
| `product_id` | `product.id` | |
| `title` | `product.title` | |
| `product_type` | `product.type.value` | If product has a type |
| `vendor` | `product.collection.title` | Or your own vendor logic |
| `base_price` | `product.variants[0].prices[0].amount / 100` | **Divide by 100** — Medusa stores cents |
| `currency` | `product.variants[0].prices[0].currency_code` | 3-letter ISO |
| `image_url` | `product.thumbnail` | |
| `status` | `product.status` | Map to `active`/`archived`/`draft` |
| `collections` | `product.collections.map(c => c.title)` | Array of names |

### Orders

| Storees field | Medusa source | Notes |
|---|---|---|
| `customer_id` | `order.customer_id` | Must match a `customer_id` you imported in step 1 |
| `order_id` | `order.id` | |
| `timestamp` | `order.created_at` as ISO 8601 | |
| `total` | `order.total / 100` | **Divide by 100** — Medusa stores cents. See §4. |
| `currency` | `order.currency_code` | 3-letter ISO |
| `line_items` | `order.items` mapped per below | |

Per line item:

| Storees field | Medusa source |
|---|---|
| `product_id` | `item.product_id` |
| `product_name` | `item.title` |
| `product_type` | `item.product.type.value` |
| `product_collection` | `item.product.collection.title` |
| `quantity` | `item.quantity` |
| `price` | `item.unit_price / 100` |

---

## 6 · Recommended export & POST loop

```ts
const CHUNK = 1000
const HEADERS = {
  'Authorization': `Bearer ${process.env.STOREES_API_KEY}`,
  'Content-Type': 'application/json',
}
const url = (path: string) =>
  `https://api.storees.io/api/v1/import/${path}?projectId=${process.env.STOREES_PROJECT_ID}`

async function postBatch(path: string, payload: object) {
  const res = await fetch(url(path), { method: 'POST', headers: HEADERS, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}: ${await res.text()}`)
  return res.json()
}

async function importInChunks<T>(path: string, key: string, all: T[]) {
  for (let i = 0; i < all.length; i += CHUNK) {
    const slice = all.slice(i, i + CHUNK)
    const result = await postBatch(path, { [key]: slice })
    console.log(`[${path}] ${i + slice.length}/${all.length} — `, result.data)
    if (result.data.errors?.length) console.error('errors:', result.data.errors)
  }
}

// Run in this exact order
await importInChunks('customers', 'customers', allCustomers)
await importInChunks('products',  'products',  allProducts)
await importInChunks('orders',    'orders',    allOrders.map(o => { validateOrderRow(o); return o }))
```

---

## 7 · Idempotency & re-running

| Endpoint | Idempotency key |
|---|---|
| `/import/customers` | Resolves on `external_id` → `email` → `phone`. Re-import = upsert; same row updated. |
| `/import/products` | Resolves on `product_id`. Re-import = upsert. |
| `/import/orders` | Server uses `order_placed_historical:<order_id>` as the events idempotency key. Re-import = no-op (`deduped` counter increments). |

**Safe to re-run any of these any number of times.** Useful for incremental backfill (e.g. "import only orders newer than 2026-01-01" on day 2, then "everything else" on day 3).

---

## 8 · Validation queries (Storees side)

After GWM finishes the three imports, Storees onboarding will run these to confirm the data landed clean:

```sql
-- (a) Total customers + how many have orders
SELECT
  COUNT(*) AS total_customers,
  COUNT(*) FILTER (WHERE total_orders > 0) AS customers_with_orders,
  SUM(total_spent) AS lifetime_revenue
FROM customers
WHERE project_id = '<PROJECT_ID>';

-- (b) AOV sanity check — catches the AK-class "zero total" bug
SELECT
  COUNT(*) AS order_events,
  ROUND(AVG((properties->>'total')::numeric), 2) AS avg_total,
  COUNT(*) FILTER (WHERE (properties->>'total')::numeric = 0) AS zero_totals,
  COUNT(*) FILTER (WHERE (properties->>'total')::numeric < 10) AS suspicious_small
FROM events
WHERE project_id = '<PROJECT_ID>'
  AND event_name = 'order_placed';
-- zero_totals > 0 → the export is firing too early in the lifecycle
-- avg_total way below GWM's stated AOV → wrong field mapped

-- (c) Top-10 customers by spend (spot-check vs GWM's reports)
SELECT name, email, total_orders, total_spent, first_order_date, last_order_date
FROM customers
WHERE project_id = '<PROJECT_ID>' AND total_spent > 0
ORDER BY total_spent DESC LIMIT 10;
```

If (b) returns `zero_totals > 0` or `avg_total` is way off GWM's real AOV → stop, fix the export, re-run. Don't go live with bad totals.

---

## 9 · Common errors & fixes

| Error / symptom | Cause | Fix |
|---|---|---|
| `HTTP 401 Unauthorized` | Wrong/expired API key | Confirm `Authorization: Bearer sk_live_...` header |
| `HTTP 400 customers array required` | Wrong key in payload | Use `{ "customers": [...] }` (plural) not `{ "customer": ... }` |
| `HTTP 400 Batch size limited to 1000` | Sending more than 1000 in one POST | Chunk client-side |
| `unresolved > 0` in orders response | Order's `customer_id` not yet imported | Run `/import/customers` first, then re-run `/import/orders` (idempotent) |
| Customer totals don't match GWM | See §4 + §8(b) | Almost always wrong field mapped for `total` |
| `failed > 0` in customers response | Bad email format or missing all of `customer_id`/`email`/`phone` | Check `errors[]` array in response |
| Timeouts on large imports | One batch too big | Reduce batch size to 500 |

---

## 10 · Go-live checklist

Run through this with Storees onboarding owner on the call:

- [ ] `/import/customers` returns `failed: 0` for first batch
- [ ] Customer count in Storees admin matches GWM's customer count (±0.1%)
- [ ] `/import/products` returns `errors: []`
- [ ] Product picker dropdown in Storees segment builder shows real product names
- [ ] `/import/orders` returns `unresolved: 0` after re-run
- [ ] Validation query (b) shows `zero_totals = 0` and `avg_total` matches GWM's reported AOV within ~5%
- [ ] Top-10 customers by spend match GWM's revenue reports (±2% for tax/shipping rounding)
- [ ] A new live order placed on the GWM frontend lands in Storees within 30s (proves the live-event path also works)

Once all eight check, the integration is **live**. Marketing teams on Storees can start building segments, flows, and campaigns against real GWM data immediately.

---

## Appendix · What's next after bulk import

After this handoff, the long-term integration plan is:

1. **Live events** — keep the existing live `order_placed` / `cart_updated` / etc. flowing via the same `/api/v1/events` endpoint (separate doc).
2. **Data Source Connector** — when GWM wants Storees to pull on demand without GWM running export scripts, Storees onboarding will commission a **VirpanAI connector** from the Projects → Data Sources page. Zero code on GWM's side at that point. Until then, the bulk-import path covers both initial migration and ad-hoc refresh.
3. **Incremental refresh** — if GWM wants daily/weekly catch-up imports between connector commissioning, just re-run `/import/orders` with `created_at > <last_import_time>` from your DB. Idempotency handles dedup.

Questions? Ping Storees onboarding owner on Slack. Hard blockers (>2h debugging) → escalate to Wahab directly.
