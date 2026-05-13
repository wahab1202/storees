# Client Onboarding — Storees Event Integration

> **The standard, universal onboarding path for every Storees client.**
> Same shape for ecommerce, fintech, SaaS, B2B. No DB access required.
> No bespoke SQL. The same endpoints handle live activity, historical
> backfill, and aggregate maintenance.

---

## The three things a client integrates

| | What | Who builds | Effort |
|---|---|---|---|
| **1. Live SDK events** | Browser events: page views, product views, cart adds, etc. | Drop in `<script>` snippet | ~30 min |
| **2. Server events** | Order placed, customer created, customer updated | Call our API from their backend | 1-2 days |
| **3. Historical backfill** | Past orders + customers loaded once at onboarding | One-time CSV upload or API bulk POST | a few hours |

That's it. No DB access, no schema mapping, no per-client SQL. Same for every merchant.

---

## How Storees uses what they send

Every event flows through one pipeline:

```
                       ┌────────────────────────────┐
                       │  POST /api/v1/events       │
[browser SDK]    ─────►│  POST /api/v1/events/batch │
[server-to-server API] │  POST /api/v1/import/*     │
                       └─────────────┬──────────────┘
                                     │
                       ┌─────────────┴──────────────┐
                       │   events table             │
                       │  (project_id, customer_id, │
                       │   event_name, properties,  │
                       │   timestamp, idempotency)  │
                       └─────────────┬──────────────┘
                                     │
                ┌──────────┬─────────┼──────────┬──────────┐
                ▼          ▼         ▼          ▼          ▼
            triggers   metrics  customer    identity   campaign
            worker     worker   aggregate   merge      analytics
                                worker      worker
            (skip
            historical
            events)

```

- **Trigger worker** → fires flow trips for matching customers. Skips `historical: true` events so backfills don't spam emails.
- **Metrics worker** → recomputes per-segment aggregates for dashboards.
- **Customer aggregate worker** → folds order_placed / refunded / cancelled into `customers.total_orders / total_spent / first_order_date / last_order_date / avg_order_value`. Bumps `last_seen` on any event.
- **Identity merge worker** → links anonymous browser sessions to known customers post-login, replays prior events.
- **Campaign analytics** → conversion tracking against goals.

The customer aggregate worker is what keeps `total_spent` etc. fresh. **No FDW. No cron polling a source DB. Just events.**

---

## Onboarding flow per client

### Day 1 — provision

1. Create the project in Storees admin
2. Generate an API key:
   ```bash
   curl -X POST "https://api.storees.io/api/api-keys?projectId=<PROJECT_ID>" \
     -H "Authorization: Bearer <ADMIN_JWT>" \
     -d '{ "name": "Production server" }'
   # response includes key_public: sk_live_<random>
   ```
3. Share the `key_public` with the client. That's their only credential.

### Day 2 — wire live events

Client integrates one or both:

**SDK (browser)** — paste a snippet into their site `<head>`:
```html
<script src="https://api.storees.io/sdk/storees.min.js"></script>
<script>
  Storees.init({ apiKey: 'sk_live_...' })
  Storees.identify({ customerId, email, name })
  Storees.track('product_viewed', { product_id, price })
</script>
```

**Server-to-server API** — they call our endpoint from their backend on
order placement / customer signup. See [GWM_WEBHOOK_INTEGRATION.md](
./GWM_WEBHOOK_INTEGRATION.md) — generic spec, applies to any client.
Tier 1 (SDK package) is the recommended starting point.

### Day 3-7 — historical backfill

Bulk import the client's past data so dashboards aren't empty.

**Step 1 — upload customers** (do this first; orders reference customers):

```bash
curl -X POST https://api.storees.io/api/v1/import/customers \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customers": [
      { "customer_id": "ext_abc_123", "email": "a@b.com", "name": "Alex",
        "region": "Tamil Nadu", "city": "Chennai" },
      /* ... up to 1000 per batch ... */
    ]
  }'
```

Response: `{ "resolved": N, "failed": M, "errors": [...] }`

**Step 2 — upload historical orders**:

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
          { "product_id": "p_001", "product_name": "Item",
            "product_type": "Apparel", "product_collection": "Summer",
            "quantity": 1, "price": 4280 }
        ]
      },
      /* ... up to 1000 per batch ... */
    ]
  }'
```

Response: `{ "imported": N, "deduped": M, "unresolved": K, "errors": [...] }`

What happens server-side:
- Each order becomes an `order_placed` event with `historical: true`
- Aggregator folds it into `customers.total_spent / total_orders / first_order_date / last_order_date`
- Trigger worker skips it (no flow firing for last-year orders)
- Idempotency key = `order_placed_historical:<order_id>` — re-uploading the same batch dedupes silently

For files larger than 1000 records, chunk client-side and POST sequentially.

### Day 8 — verify

```bash
# Top customers by spend — should reflect imported history
curl "https://api.storees.io/api/customers?projectId=<id>&orderBy=total_spent" \
  -H "Authorization: Bearer <admin_jwt>"
```

### Going forward

- Live events keep aggregates fresh (sub-second after each order_placed)
- Backfill complete — no further imports needed
- Storees admin dashboards show real numbers
- Segments + flows work against full history

---

## Why this is the universal path

| Problem with FDW federation | How event-based fixes it |
|---|---|
| Needed source DB access | Just API key, no DB access |
| Per-client SQL (foreign tables, sync functions) | Same endpoint, every client |
| Schema coupling — client renames column, Storees breaks | Versioned by Storees, schema-stable |
| 5-min latency floor | Sub-second |
| Production DB read load grows with each merchant | Zero source-DB load |
| Hard to onboard a SaaS / non-Postgres source | Any language that can HTTP POST works |
| Bespoke ops per merchant | One set of monitoring + dashboards |

---

## Reference — file locations

| File | Purpose |
|---|---|
| `packages/backend/src/routes/v1Events.ts` | Live event ingestion endpoint |
| `packages/backend/src/routes/v1Import.ts` | Bulk historical import endpoints |
| `packages/backend/src/workers/customerAggregateWorker.ts` | Folds events → customer aggregates |
| `packages/backend/src/workers/triggerWorker.ts` | Fires flow trips on event (skips `historical: true`) |
| `packages/backend/src/db/migrations/0040_events_processed_at.sql` | Adds idempotency column |
| `docs/strategy/GWM_WEBHOOK_INTEGRATION.md` | Per-client integration spec (SDK / direct API / outbox tiers) |
