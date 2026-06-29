# Inbound Order Push — VirpanAI / GoWelmart → Storees (real-time)

How to push orders to Storees the instant they happen, instead of waiting for the
scheduled pull connector. This is the "event way" — the same canonical ingestion
path the SDK and Shopify webhooks use.

> **Audience:** VirpanAI / GoWelmart backend (Praveen). Storees side needs **no new
> code** — this uses the existing live events endpoint, which already writes the
> orders table, updates customer aggregates, **triggers flows**, and is idempotent.

---

## Why push (vs. the pull connector)

| | Pull connector (today) | Push (this doc) |
|---|---|---|
| Trigger | Storees polls every 3h + nightly full | You POST the moment an order happens |
| Lag | up to 3h | seconds |
| Cursor gap | backdated orders can be missed until the nightly full | none — every order is sent explicitly |
| Flows (abandoned-cart etc.) | fire on next pull | fire in real-time |

Best practice is **both**: push for real-time + keep the scheduled full resync as a
reconciliation backstop (pushes can be dropped on outages).

---

## The contract

**Endpoint**
```
POST https://<storees-api-host>/api/v1/events
```
Use the same API host the connector already talks to for this project.

**Auth** — the project's API key (Settings → API Keys, the `sk_live_…` key):
```
X-API-Key: <key_public>
X-API-Secret: <key_secret>
Content-Type: application/json
```

**Body** — one `order_placed` event per order:
```json
{
  "event_name": "order_placed",
  "external_id": "<customer id on your system>",
  "email": "asha@example.com",
  "phone": "+919876543210",
  "timestamp": "2026-06-11T09:32:00.000Z",
  "idempotency_key": "order:<order_id>",
  "properties": {
    "order_id": "<order_id>",
    "total": 26090,
    "currency": "INR",
    "discount": 0,
    "line_items": [
      { "product_id": "9109663351021", "product_name": "Mousse Lipstick Combo", "quantity": 1, "price": 1234 }
    ]
  }
}
```

### Field notes
- **`external_id`** — the customer's id on *your* system (Medusa customer id). Storees
  resolves/creates the customer from this (plus email/phone if given). Required so the
  order links to a customer.
- **`idempotency_key`** — set it to `order:<order_id>`. Storees dedupes on
  `(project_id, idempotency_key)`, so **safe to retry** — re-sending the same order is a
  no-op, never a duplicate. (Storees also dedupes the orders table on `order_id`.)
- **`timestamp`** — when the order actually happened (ISO 8601). Drives time-series
  analytics; don't send "now" for backfilled orders.
- **`total` / `price`** — numeric in the order's currency (major units, e.g. `26090`
  for ₹26,090). Same convention as the VirpanAI export.
- **`line_items`** — canonical names: `product_id`, `product_name`, `quantity`, `price`.
  (Storees also accepts Shopify-style `title`/`unit_price`, but prefer the canonical set.)

### What Storees does on receipt
1. Resolves/creates the customer from `external_id` (+ email/phone).
2. Inserts the order into the `orders` table (idempotent on `order_id`).
3. Updates the customer's aggregates (total spend, order count, last order).
4. Emits a **live** `order_placed` event → **triggers flows** (abandoned-cart recovery,
   win-back, etc.) and segment re-evaluation.

### Response
- `2xx` → accepted (queued for processing). Treat as success.
- `401` → bad/missing API key headers.
- `4xx` → malformed payload (see the body for the reason).

Retry on `5xx`/network/timeout; the `idempotency_key` makes retries safe.

---

## Order updates (fulfilled / cancelled)

To reflect fulfillment or cancellation, send a follow-up event with the **same**
`order_id`:
- `event_name: "order_completed"` → marks the order fulfilled.
- include a cancel flag/timestamp in `properties` for cancellations (coordinate the
  exact field with the Storees team if you need cancel semantics).

---

## Suggested rollout

1. Start by **also** pushing (keep the pull connector on). Pushes give real-time; the
   nightly full resync reconciles anything a push missed.
2. Verify in Storees: the order appears on the customer's **Orders** tab within seconds,
   and the customer's spend aggregate updates.
3. Once push is proven reliable, the pull connector can drop to a daily reconciliation
   pass instead of every 3h.

---

## Reference (Storees side)
- Ingestion endpoint: [v1Events.ts](../../packages/backend/src/routes/v1Events.ts)
- Order persistence + aggregates + dedupe: [eventProcessor.ts](../../packages/backend/src/services/eventProcessor.ts) (`order_placed` case)
- Scheduled pull + nightly full resync backstop: [dataSyncWorker.ts](../../packages/backend/src/workers/dataSyncWorker.ts)
