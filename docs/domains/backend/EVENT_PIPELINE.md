# Backend — Event Processing Pipeline

> Events are the heartbeat of the system. Every customer action flows through this pipeline before reaching segments, flows, or analytics.

## Pipeline Architecture

```
Shopify Webhook / SDK / API
         │
         ▼
   ┌─────────────┐
   │ API Gateway  │  Auth check (webhooks: HMAC verify. SDK/API: Bearer token)
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  Normalizer  │  Transform source-specific payload → standard TrackedEvent
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  Validator   │  Schema validation, dedupe check, required fields
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  Identity    │  Resolve customer: external_id → internal UUID
   │  Resolver    │  Create customer if new. Update last_seen.
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  Enricher    │  Add project context. Update customer aggregates
   │              │  (total_orders, total_spent, clv on order events)
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  Persister   │  Write TrackedEvent to events table
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  Publisher   │  Publish to BullMQ 'events' queue
   └──────┬──────┘
          │
   ┌──────┴───────────────────────┐
   ▼                              ▼
┌───────────┐              ┌───────────┐
│  Segment  │              │   Flow    │
│ Evaluator │              │  Trigger  │
│  Worker   │              │  Worker   │
└───────────┘              └───────────┘
```

## BullMQ Queue Configuration

### Queue: `events`
- **Publisher**: Event processor (after persisting to DB)
- **Consumers**: Segment evaluator worker, Flow trigger worker
- **Concurrency**: 10 (process 10 events simultaneously)
- **Retry**: 3 attempts with exponential backoff (1s, 5s, 30s)
- **Payload**: Full `TrackedEvent` object

### Queue: `flow-actions`
- **Publisher**: Flow engine (when scheduling delayed actions)
- **Consumers**: Flow action executor worker
- **Concurrency**: 5
- **Delay**: Configurable per job (e.g., 30 minutes for abandoned cart)
- **Payload**: `{ flowTripId, nodeId, action }` object

### Queue: `shopify-sync`
- **Publisher**: Manual trigger via API or on first OAuth connection
- **Consumers**: Sync worker
- **Concurrency**: 1 (single sync at a time per project)
- **Rate limit**: 4 requests/second (Shopify limit), implemented as 250ms delay between API calls

## Webhook Processing

### HMAC Verification
Every Shopify webhook must be verified before processing:
```
1. Read raw request body (before JSON parsing)
2. Compute HMAC-SHA256 with project's webhook_secret
3. Compare against X-Shopify-Hmac-Sha256 header
4. Reject if mismatch (return 401)
```

### Webhook → Standard Event Mapping

| Shopify Topic | Standard Event | Customer Resolution | Side Effects |
|---------------|---------------|-------------------|-------------|
| `customers/create` | `customer_created` | Create new customer profile | — |
| `customers/update` | `customer_updated` | Update existing profile | Update subscription status |
| `orders/create` | `order_placed` | Resolve by email/phone | Create order row. Update `total_orders`, `total_spent`, `clv`. |
| `orders/fulfilled` | `order_fulfilled` | Via order's customer | Update order status to `fulfilled`. Set `fulfilled_at`. |
| `orders/cancelled` | `order_cancelled` | Via order's customer | Update order status to `cancelled`. Recalculate aggregates. |
| `checkouts/create` | `checkout_started` | Resolve by email | — |
| `carts/create` | `cart_created` | Resolve by customer_id or email | Event properties include cart items for flow context |
| `carts/update` | `cart_updated` | Via existing cart's customer | — |

### Customer Resolution Logic
```
1. If webhook has customer_id → look up by external_id
2. If not found and has email → look up by email
3. If not found and has phone → look up by phone
4. If still not found → create new customer with available data
5. Always update last_seen = now()
```

## Critical Rules

1. **Historical sync events NEVER trigger flows.** Check `platform !== 'historical_sync'` before publishing to BullMQ.
2. **Deduplication**: Hash `(project_id, event_name, customer_id, timestamp)`. If duplicate found within 5-second window, skip.
3. **Idempotency**: Shopify may send the same webhook multiple times. Use `external_order_id` / webhook `X-Shopify-Webhook-Id` header to dedupe.
4. **Order of operations**: Always persist to DB BEFORE publishing to queue. If queue publish fails, event is still recorded and can be replayed.
5. **Error handling**: If any pipeline step fails, log the error + raw payload to a `dead_letter_events` table for manual inspection. Never lose data silently.
