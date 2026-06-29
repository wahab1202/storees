# Inbound Order Push — VirpanAI / GoWelmart → Storees (OPTIONAL, future)

> **Read this first.** Orders already sync into Storees via the **pull connector**
> (`/storees-cdp/export/orders`), now bug-fixed and on an **automatic scheduler**
> (incremental every 3h + nightly full resync). **That is the order-sync
> mechanism, and it is sufficient.** This document describes an *optional* future
> enhancement — having GWM **push** each order in real-time — that you do **not**
> need today and that is **not** a replacement for the pull connector.

---

## TL;DR — do you need this? Almost certainly not (yet)

| Question | Answer |
|---|---|
| How do GWM orders get into Storees today? | The **pull connector** — Storees pulls `/storees-cdp/export/orders` on a schedule. |
| Is that enough for segments / analytics / reporting? | **Yes.** It's the correct and sufficient mechanism. |
| Why was M S Mobile's Jun 11 order missing then? | A **bug in the pull** (pagination stopped at 77) + **no scheduler** (stale 10 days). Both are now **fixed** — not a reason to add push. |
| What would push add? | Only **real-time latency** (orders arriving in seconds, triggering flows instantly) and immunity to polling-gap failure modes. |
| Does push replace the pull connector? | **No.** Even with push you keep pull for history + reconciliation (pushes get dropped on outages). Push sits *alongside* pull. |
| When should we build it? | Only if/when **real-time flow triggering** (e.g. abandoned-cart firing the instant an order/cart changes) becomes a concrete requirement. |

**Bottom line:** orders = pull connector + scheduler. Leave push on the shelf
until there's a real-time need; it's additive, not a redo. The webhook work that
*is* required is the **outbound segment sync** (Storees → GWM), a different
direction — see `STOREES_WEBHOOK_SPEC.md`.

---

## If/when you do want real-time order push — the contract

This uses the **existing** `/api/v1/events` endpoint. No new Storees code is
needed; it already writes the orders table, updates aggregates, **triggers
flows**, and dedupes via `idempotency_key`. The only change is on VirpanAI's
side: POST each order as it happens.

**Endpoint**
```
POST https://<storees-api-host>/api/v1/events
```

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
  resolves/creates the customer from this (+ email/phone). Required.
- **`idempotency_key`** — set to `order:<order_id>`. Storees dedupes on
  `(project_id, idempotency_key)`, so **retries are safe** — re-sending an order is a
  no-op, never a duplicate. (The orders table also dedupes on `order_id`.)
- **`timestamp`** — when the order happened (ISO 8601). Don't send "now" for backfills.
- **`total` / `price`** — numeric, major units (`26090` = ₹26,090), same as the export.
- **`line_items`** — canonical names: `product_id`, `product_name`, `quantity`, `price`.

### What Storees does on receipt
1. Resolves/creates the customer from `external_id`.
2. Inserts the order (idempotent on `order_id`).
3. Updates the customer's aggregates.
4. Emits a **live** `order_placed` event → triggers flows + segment re-evaluation.

### Response
- `2xx` → accepted. `401` → bad API key. `4xx` → malformed (see body). Retry `5xx`/network — the `idempotency_key` makes retries safe.

---

## Why you still keep the pull connector even with push

Push is not a silver bullet — webhooks get dropped (downtime, network blips,
source bugs). Every serious CDP pairs real-time push with a **periodic
reconciliation sweep**. For Storees that sweep is the **nightly full resync**
the scheduler already runs. So even in the push end-state:

- **Push** → real-time freshness.
- **Pull (scheduler)** → historical backfill + the safety net that catches
  anything push dropped.

Neither replaces the other. Today we run pull-only, and that's correct.

---

## Reference (Storees side)
- Pull connector + scheduler (the actual order-sync path): [dataSyncWorker.ts](../../packages/backend/src/workers/dataSyncWorker.ts), [dataSyncService.ts](../../packages/backend/src/services/dataSyncService.ts)
- Ingestion endpoint (used only if push is later adopted): [v1Events.ts](../../packages/backend/src/routes/v1Events.ts)
- Order persistence + aggregates + dedupe: [eventProcessor.ts](../../packages/backend/src/services/eventProcessor.ts) (`order_placed` case)
- Outbound segment webhook (the webhook that IS required): `STOREES_WEBHOOK_SPEC.md`
