# Live Data Integration → Segment Coverage Plan

> Goal: every segment filter surfaced in the segment builder must have
> populated data for live merchants. Currently the filters exist; whether
> the data is flowing depends on which integration path the merchant uses.
>
> This is mostly **verification + backfill + per-merchant onboarding**, not
> a new build. The two real engineering items are: (1) bulk re-sync runner
> for already-connected Shopify merchants whose customers pre-date the
> address-extraction fix, and (2) a direct-DB connector for merchants
> whose source-of-truth isn't Shopify.

---

## What already works (no code needed)

The segment builder dynamically renders fields from `domainRegistry` +
the dynamic agent-scope injection in `v1Schema.ts`. Every field below
already has a working SQL evaluator path in `packages/segments/src/evaluator.ts`.

| Group | Field | Source of truth | Population status |
|---|---|---|---|
| **Customer Info** | email | `customers.email` | ✅ Set by Shopify sync, SDK identify, /v1/customers, widget opt-in |
| | phone | `customers.phone` | ✅ Same |
| | name | `customers.name` | ✅ Same |
| | email_subscribed / sms_subscribed / push_subscribed / whatsapp_subscribed | `customers.<x>_subscribed` | ✅ Maintained by `consentService.updateConsent` (single source of truth across SDK / admin / webhook / unsub / CTWA / widget) |
| **Purchase History** | total_orders | `customers.total_orders` | ✅ Bumped by `updateCustomerAggregates` after each `order_placed` event |
| | total_spent | `customers.total_spent` | ✅ Same |
| | avg_order_value | `customers.avg_order_value` | ✅ Same |
| | clv | `customers.clv` | ✅ Computed by `computeClv()` on each aggregate update |
| **Engagement (orders)** | first_order_date | `customers.first_order_date` | ✅ Set on first order |
| | last_order_date | `customers.last_order_date` | ✅ Bumped on every order |
| | days_since_last_order | computed from `last_order_date` | ✅ |
| | orders_in_last_30_days / 90_days | computed from `orders` table | ✅ |
| | discount_order_percentage | computed from `orders.discount` | ✅ |
| | last_seen | `customers.last_seen` | ✅ Bumped by every event ingestion + identity resolution |
| | days_since_first_seen | computed from `first_seen` | ✅ |
| **Engagement (email)** | days_since_email_open | `events` (email_read / email_opened) | ✅ Phase E3.2 |
| | days_since_email_click | `events` (email_clicked) | ✅ |
| **B2B** (with `agentScopedAccess`) | agent_id (Dealer) | `customers.agent_id` + `agents` table | ✅ Dynamic field injection in `v1Schema.ts` |
| | region | `customers.region` | ⚠️ See "Gap A" below |
| | city | `customers.city` | ⚠️ Same |
| **Product Filters** | product (has_purchased / has_not_purchased / has_viewed / has_wishlisted) | `orders.line_items` JSONB + `events` table | ✅ Subquery against line_items / event properties |
| | collection (has_purchased from / has_not_purchased from) | `product_collections` + `orders.line_items` | ✅ JOIN through products → collections |
| | product_category (has_purchased / has_viewed) | `products.product_type` | ⚠️ See "Gap B" below |

## The gaps that affect live merchants

### Gap A — `region` / `city` for historical customers

**Cause:** The Shopify default-address extraction was added in commit `2d0dcea`
this session. Customers who were synced **before** that commit ran have
`customers.region = NULL` and `customers.city = NULL` even though Shopify
has the data.

**Effect:** Region / City filters render in the builder but match nothing
for old customers.

**Fix path (one-shot per project, ~30 min):**

For Shopify-connected projects:
```bash
# 1. Find the Shopify-connected projects
psql "$PROD_DB_URL" -c "
  SELECT id, name FROM projects
  WHERE shopify_access_token IS NOT NULL;"

# 2. Trigger a re-sync for each. The new sync code (post-2d0dcea) populates
#    region/city on every customer it processes. Idempotent — orders won't
#    duplicate (uniqueIndex on external_order_id).
curl -X POST "https://api.storees.io/api/integrations/shopify/sync?projectId=<PROJECT_ID>" \
  -H "Authorization: Bearer <ADMIN_JWT>"

# 3. Watch progress
curl "https://api.storees.io/api/integrations/shopify/sync-status?projectId=<PROJECT_ID>"
```

For projects whose customers came from a non-Shopify import (e.g.
GowelMart's `_source = gowelmart_import` rows): use the
`gowelmart_agent_backfill.sql` template, adapted to extract from
`custom_attributes.country` (region) and `custom_attributes.postal_code`
(city) — already exists.

**Verification SQL:**
```sql
SELECT
  COUNT(*) AS total,
  COUNT(region) AS with_region,
  COUNT(city) AS with_city,
  COUNT(DISTINCT region) AS distinct_regions,
  COUNT(DISTINCT city) AS distinct_cities
FROM customers WHERE project_id = '<PROJECT_ID>';
```

Target: `with_region` and `with_city` should be >90% of `total` for any
project where the source data has addresses.

### Gap B — `product_category` (product_type)

**Cause:** Product `product_type` is populated by Shopify sync (it comes
through the `/products.json` API). For projects that imported products
from `events.line_items` (like the GowelMart backfill), `product_type` is
empty — the comment in `gowelmart_products_backfill.sql` flags this:
*"Categories (product_type) are NOT derivable from line_items — fetch from
the Medusa API separately."*

**Effect:** "has purchased from category X" / "has viewed in category Y"
segments render but the dropdown options are empty.

**Fix path:**

For Shopify-connected projects: run the products-sync portion of
`syncProducts` (`packages/backend/src/workers/syncWorker.ts:215-241`) —
already pulls `product_type` from the Shopify API. The same re-sync
trigger from Gap A handles this.

For non-Shopify (e.g. Medusa, custom): build a small per-source product
catalog sync (see Phase 2 below).

### Gap C — `has_viewed product` requires SDK on storefront

**Cause:** `product_viewed` events are fired client-side by the Storees JS
SDK (`Storees('track', 'product_viewed', { product_id, ... })`). They're
not derivable from Shopify webhooks — Shopify doesn't tell us when a
customer browses a product, only when they buy.

**Effect:** `has_viewed` filters render but match nothing if the merchant
hasn't installed the SDK on their storefront.

**Fix path:** part of merchant onboarding — `docs/integrations/SHOPIFY_ONBOARDING.md`
section 4 already walks through SDK install in `theme.liquid` +
`product-template.liquid`. Make this a checklist item before declaring
the merchant "live."

---

## The plan — three phases

### Phase 1: Confirm and backfill Shopify-connected projects (1-2 days)

For every project with `shopify_access_token IS NOT NULL`:

| Step | What | Verification |
|---|---|---|
| 1.1 | Run sync coverage audit | SQL above for each project |
| 1.2 | Trigger re-sync where coverage <90% on region/city | `POST /api/integrations/shopify/sync` |
| 1.3 | Confirm `products.product_type` populated | `SELECT COUNT(*) FROM products WHERE project_id=X AND product_type <> ''` |
| 1.4 | Walk merchant through SDK install (or confirm done) | `product_viewed` events appearing in events table |
| 1.5 | Build segments for each Field above and confirm member counts > 0 | Manual through admin panel |

**Owner:** ops/devops can drive 1.1-1.3; engineering reviews 1.4.

### Phase 2: Direct DB connector for non-Shopify merchants (5-7 days, build-out)

Required when a merchant's source-of-truth is **not** Shopify (e.g.
Medusa, WooCommerce, custom Postgres / MySQL). Three components:

#### 2.1 Schema (~half day)

```sql
CREATE TABLE data_source_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type VARCHAR(30) NOT NULL,    -- 'postgres' | 'mysql' | 'medusa' | 'woocommerce'
  config JSONB NOT NULL,               -- encrypted; connection url + credentials + selected tables
  field_mapping JSONB NOT NULL,        -- { customers: { id: 'user_id', email: 'email_address', phone: 'mobile' }, orders: {...} }
  schedule_cron VARCHAR(50),           -- '0 */6 * * *' (every 6h); null = manual only
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(20),        -- 'success' | 'failed' | 'running'
  last_sync_error TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Connection credentials encrypted with the existing `ENCRYPTION_KEY` via
`encryption.ts`.

#### 2.2 Generic sync worker (~3 days)

`workers/dataSourceSyncWorker.ts`:
- Per `data_source_connections` row, on cron schedule
- Connects via standard `pg` / `mysql2` driver (allowlist host / port at
  config time to prevent SSRF on internal IPs)
- Reads in pages (cursor-based by `id` or `updated_at`)
- Maps source columns → Storees columns per `field_mapping`
- Uses `resolveCustomer` for upsert (existing identity-resolution path)
- Records each historical order through `processHistoricalEvent` so
  aggregates auto-update via `updateCustomerAggregates`
- Logs per-sync stats to `last_sync_status` + `last_sync_error`

#### 2.3 Admin UI for connection + mapping (~2 days)

New page `/integrations/data-source`:
- "Connect a database" wizard: source type → connection details → test
- Field mapping screen: shows merchant's tables/columns on the left,
  Storees fields on the right, drag to map
- Preview: "We'd import 12,450 customers and 38,200 orders. Proceed?"
- Save → enqueue first sync → show progress

**Risks:**
- Connection from prod backend to merchant's prod DB requires firewall /
  IP allowlist coordination. Document this as a prerequisite.
- Some merchants will refuse direct DB access — fall back to either
  REST API (already wired via `/api/v1/customers` + `/api/v1/events`) or
  a CSV import wizard.

### Phase 3: Coverage dashboard per project (1 day)

A new admin page `/admin/coverage` showing:

| Field | Population | Sample value |
|---|---|---|
| email | 14,890 / 15,465 (96%) | wahab@waioz.com |
| region | 746 / 15,465 (4.8%) | IN |
| city | 4,903 / 15,465 (31%) | Bangalore |
| total_orders | 12,300 / 15,465 (79%) | 3 |
| has SDK product_viewed | 0 / 15,465 (0%) | — |
| ... | | |

Drives the merchant-facing "what's missing for your segment to be
useful" view. Quick to build (one SQL query per field), high signal.

---

## Field mapping cheat-sheet — for Phase 2 / direct-DB connector

What each Storees field needs from the merchant's source DB:

| Storees field | Source DB column (typical names) | Notes |
|---|---|---|
| `customers.external_id` | `users.id` / `customers.id` | Required — primary key for identity resolution |
| `customers.email` | `users.email` | One of email/phone required |
| `customers.phone` | `users.phone` / `mobile_number` | E.164 format ideal; we'll normalise +91-prefix |
| `customers.name` | `users.name` / `first_name + last_name` | Optional |
| `customers.region` | `users.state` / `address.province` | State or region code |
| `customers.city` | `users.city` / `address.city` | |
| `customers.first_order_date` | `MIN(orders.created_at)` | Computed from orders, not stored separately |
| `customers.last_order_date` | `MAX(orders.created_at)` | Same |
| `customers.total_orders` | `COUNT(orders)` | Same |
| `customers.total_spent` | `SUM(orders.total_amount)` | Convert paise/cents to integer |
| `orders.external_order_id` | `orders.id` / `order_number` | Required for dedup |
| `orders.total` | `orders.total_amount` | Integer (smallest currency unit) |
| `orders.line_items` | `JSON_AGG(order_items)` | Each item: { productId, productName, quantity, price } |
| `products.shopify_product_id` (or `external_product_id`) | `products.id` / `sku` | Required |
| `products.title` | `products.name` / `products.title` | |
| `products.product_type` | `products.category` / `products.type` | What "category" segments filter on |
| `collections.title` | `categories.name` | Used for collection segments |
| `product_collections` | join table from products → categories | |

The mapping JSON the admin pastes/builds:

```json
{
  "customers": {
    "external_id": "user_id",
    "email": "email_address",
    "phone": "mobile",
    "name": "full_name",
    "region": "state",
    "city": "city"
  },
  "orders": {
    "external_order_id": "order_number",
    "customer_id": "user_id",
    "total": "total_amount_paise",
    "currency": "currency_code",
    "created_at": "placed_at",
    "line_items_query": "SELECT product_id, product_name, qty, price FROM order_items WHERE order_id = $1"
  },
  "products": {
    "external_id": "id",
    "title": "name",
    "product_type": "category_name"
  }
}
```

---

## Time + ordering recommendation

| Phase | Effort | Who | When |
|---|---|---|---|
| **1.1-1.3** Coverage audit + Shopify re-sync | 1 day | Engineering or DevOps with SQL access | This week |
| **1.4-1.5** SDK install walk-through per merchant | 1 day per merchant | Customer success / engineering pair | Per onboarding |
| **3** Coverage dashboard | 1 day | Engineering | Next week |
| **2** Direct-DB connector | 5-7 days | Engineering | Trigger when first non-Shopify merchant signs |

For **today**, start with Phase 1.1: run the coverage audit SQL on each
of your 5 projects and find out which ones already have good data and
which need re-sync. That's the single highest-signal action — it tells
you whether segments are usable per project before you onboard anyone.

---

## Verification SQL — paste-runnable per-project audit

```sql
-- Replace <PROJECT_ID> with the actual UUID
WITH stats AS (
  SELECT
    (SELECT COUNT(*) FROM customers WHERE project_id = '<PROJECT_ID>') AS total_customers,
    (SELECT COUNT(*) FROM customers WHERE project_id = '<PROJECT_ID>' AND email IS NOT NULL) AS with_email,
    (SELECT COUNT(*) FROM customers WHERE project_id = '<PROJECT_ID>' AND phone IS NOT NULL) AS with_phone,
    (SELECT COUNT(*) FROM customers WHERE project_id = '<PROJECT_ID>' AND region IS NOT NULL) AS with_region,
    (SELECT COUNT(*) FROM customers WHERE project_id = '<PROJECT_ID>' AND city IS NOT NULL) AS with_city,
    (SELECT COUNT(*) FROM customers WHERE project_id = '<PROJECT_ID>' AND total_orders > 0) AS with_orders,
    (SELECT COUNT(*) FROM customers WHERE project_id = '<PROJECT_ID>' AND first_order_date IS NOT NULL) AS with_first_order,
    (SELECT COUNT(*) FROM customers WHERE project_id = '<PROJECT_ID>' AND last_order_date IS NOT NULL) AS with_last_order,
    (SELECT COUNT(*) FROM products WHERE project_id = '<PROJECT_ID>') AS total_products,
    (SELECT COUNT(*) FROM products WHERE project_id = '<PROJECT_ID>' AND product_type <> '') AS with_category,
    (SELECT COUNT(*) FROM collections WHERE project_id = '<PROJECT_ID>') AS total_collections,
    (SELECT COUNT(*) FROM events WHERE project_id = '<PROJECT_ID>' AND event_name = 'product_viewed') AS product_view_events
)
SELECT
  total_customers,
  ROUND(100.0 * with_email / NULLIF(total_customers,0), 1) AS pct_email,
  ROUND(100.0 * with_phone / NULLIF(total_customers,0), 1) AS pct_phone,
  ROUND(100.0 * with_region / NULLIF(total_customers,0), 1) AS pct_region,
  ROUND(100.0 * with_city / NULLIF(total_customers,0), 1) AS pct_city,
  ROUND(100.0 * with_orders / NULLIF(total_customers,0), 1) AS pct_with_orders,
  ROUND(100.0 * with_first_order / NULLIF(total_customers,0), 1) AS pct_first_order_date,
  total_products,
  ROUND(100.0 * with_category / NULLIF(total_products,0), 1) AS pct_product_with_category,
  total_collections,
  product_view_events
FROM stats;
```

Run for each project — the row tells you which segment filters are
usable today. <50% on any field = that filter will produce confusing
results in the segment builder; either backfill from source, or hide
the field for that project until coverage improves.
