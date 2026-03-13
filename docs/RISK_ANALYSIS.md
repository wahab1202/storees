# Storees Platform — Risk Analysis & Enhancement Study

Before building any MoEngage-inspired features, this document identifies every problem, bottleneck, race condition, and breaking point in the current system — and what needs to be fixed before, during, and after each phase.

---

## Table of Contents

1. [Critical: Race Conditions (Data Corruption)](#1-critical-race-conditions)
2. [Critical: Event Pipeline Bottlenecks (System Collapse at Scale)](#2-critical-event-pipeline-bottlenecks)
3. [Critical: Missing Infrastructure (Blocks SDK)](#3-critical-missing-infrastructure)
4. [High: Database Performance](#4-high-database-performance)
5. [High: Type System & Schema Gaps](#5-high-type-system--schema-gaps)
6. [High: Segment Evaluator Limitations](#6-high-segment-evaluator-limitations)
7. [Medium: Error Handling & Reliability](#7-medium-error-handling--reliability)
8. [Medium: Security & Auth Concerns](#8-medium-security--auth-concerns)
9. [Low: Frontend & UX Risks](#9-low-frontend--ux-risks)
10. [Enhancement Compatibility Matrix](#10-enhancement-compatibility-matrix)
11. [Pre-Build Fixes (Must Do Before Phase 1)](#11-pre-build-fixes)
12. [Phase-by-Phase Risk Map](#12-phase-by-phase-risk-map)

---

## 1. Critical: Race Conditions

These are data corruption bugs that exist **right now** and will get exponentially worse with SDK traffic.

### 1.1 Customer Identity Resolution — Duplicate Customers

**File:** `packages/backend/src/services/customerService.ts`
**Function:** `resolveCustomer()`

```
Request A: resolveCustomer(email="user@example.com")
Request B: resolveCustomer(email="user@example.com")

Timeline:
  A: SELECT ... WHERE email = 'user@example.com' → NOT FOUND
  B: SELECT ... WHERE email = 'user@example.com' → NOT FOUND (race!)
  A: INSERT INTO customers ... → customer_1
  B: INSERT INTO customers ... → customer_2 (DUPLICATE!)
```

**Impact:** Duplicate customer records. Events split across two profiles. Segment counts inflated. Flow trips doubled.
**Current risk:** Low (webhooks are sequential per Shopify). **After SDK:** Critical (100s of concurrent identify calls).
**No unique constraint on (project_id, email)** — duplicates will persist silently.

**Fix:**
```sql
-- Add unique partial indexes
CREATE UNIQUE INDEX idx_customers_email ON customers(project_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_customers_phone ON customers(project_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX idx_customers_external ON customers(project_id, external_id) WHERE external_id IS NOT NULL;
```
```typescript
// Use INSERT ... ON CONFLICT for atomic upsert
const [customer] = await db.insert(customers)
  .values({ projectId, email, phone, ... })
  .onConflictDoUpdate({ target: [customers.projectId, customers.email], set: { updatedAt: new Date() } })
  .returning({ id: customers.id });
```

### 1.2 Customer Aggregate Updates — Lost Writes

**File:** `packages/backend/src/services/customerService.ts`
**Function:** `updateCustomerAggregates()`

```
Customer has: totalOrders=10, totalSpent=50000

Order A (₹200): READ totalOrders=10
Order B (₹300): READ totalOrders=10  (before A writes!)
Order A: WRITE totalOrders=11, totalSpent=70000
Order B: WRITE totalOrders=11, totalSpent=80000  (overwrites A!)

Result: totalOrders=11 (should be 12), totalSpent=80000 (should be 100000)
```

**Impact:** CLV, avgOrderValue, totalSpent all wrong. Segments based on monetary value will have wrong membership.
**Current risk:** Medium (concurrent Shopify webhooks for same customer). **After SDK:** Critical.

**Fix:**
```typescript
// Use atomic PostgreSQL increment instead of read-then-write
await db.execute(sql`
  UPDATE customers SET
    total_orders = total_orders + 1,
    total_spent = total_spent + ${orderTotal},
    avg_order_value = (total_spent + ${orderTotal}) / (total_orders + 1),
    clv = (total_spent + ${orderTotal}) * 1.2,
    updated_at = NOW()
  WHERE id = ${customerId}
`);
```

### 1.3 Flow Trip Deduplication — Double Emails

**File:** `packages/backend/src/workers/triggerWorker.ts`
**Function:** `evaluateFlowTrigger()`

```
Event: cart_abandoned fires twice in <10ms (webhook retry)

Trip A: SELECT ... WHERE flowId AND customerId AND status='active' → NOT FOUND
Trip B: SELECT ... WHERE flowId AND customerId AND status='active' → NOT FOUND (race!)
Trip A: INSERT INTO flow_trips → trip_1
Trip B: INSERT INTO flow_trips → trip_2 (DUPLICATE!)
```

**Impact:** Customer receives 2x abandoned cart emails. Brand damage.

**Fix:**
```sql
CREATE UNIQUE INDEX idx_flow_trips_active ON flow_trips(flow_id, customer_id)
  WHERE status IN ('active', 'waiting');
```
```typescript
// Use INSERT ... ON CONFLICT DO NOTHING
const [trip] = await db.insert(flowTrips)
  .values({ flowId, customerId, status: 'active', ... })
  .onConflictDoNothing()
  .returning({ id: flowTrips.id });
if (!trip) return null; // Already had active trip
```

### 1.4 Order Deduplication — Duplicate Orders

**File:** `packages/backend/src/services/eventProcessor.ts`
**Function:** `handleSideEffects()`

Same check-then-insert pattern. Shopify sends webhook retries if first response was slow.

**Fix:** Already has `external_order_id` — just needs unique constraint + ON CONFLICT.

### 1.5 Idempotency Check — Duplicate Events

**File:** `packages/backend/src/routes/v1Events.ts`

Check-then-insert on `idempotency_key`. Two identical SDK requests race.

**Fix:** Already has `idx_events_idempotency` unique index. Use `ON CONFLICT DO NOTHING` instead of check-then-insert.

### 1.6 Exit Event vs Active Trip — Email Sent After Exit

**File:** `packages/backend/src/services/flowExecutor.ts`

```
Customer triggers exit event → trip updated to 'exited'
Meanwhile: advanceTrip() already past the status check, executing send_email
Result: Email sends even though customer already exited
```

**Fix:** Re-check trip status immediately before executing each action node:
```typescript
const [fresh] = await db.select({ status: flowTrips.status }).from(flowTrips).where(eq(flowTrips.id, tripId));
if (fresh.status === 'exited') return; // Bail out
```

---

## 2. Critical: Event Pipeline Bottlenecks

### 2.1 Batch Event Processing — Sequential N+1

**File:** `packages/backend/src/routes/v1Events.ts` (POST /api/v1/events/batch)

```
1000 events processed in a for-loop:
  Each event: 3 customer queries + 1 event insert + N entity upserts
  Total: ~6000 sequential database queries
  Response time: 30-60 seconds (will timeout)
```

**Impact:** SDK sends batched events (20-100 per request). Current implementation will timeout.

**Fix:**
1. Group events by customer identifier → resolve customers in bulk
2. Use `INSERT INTO events VALUES ... (batch)` for bulk insert
3. Publish to queue in bulk (`addBulk()`)
4. Target: <2s for 100-event batch

### 2.2 Worker Concurrency — Undersized

| Worker | Current | Events/sec Capacity | SDK Load | Gap |
|--------|---------|-------------------|----------|-----|
| Trigger | 5 | ~5/sec | 100+/sec | **20x undersized** |
| Metrics | 10 | ~10/sec | 100+/sec | **10x undersized** |
| Flow | 5 | ~5/sec | 20+/sec | **4x undersized** |
| Campaign | 1 | ~1/sec | 5+/sec | **5x undersized** |

**Impact:** Queue backlog grows indefinitely. Events processed hours late. Flow triggers delayed.

**Fix:**
```typescript
// Increase concurrency based on load
const triggerWorker = new Worker('events', processJob, { concurrency: 50 });
const metricsWorker = new Worker('metrics', processJob, { concurrency: 30 });
const flowWorker = new Worker('flow-actions', processJob, { concurrency: 20 });
const campaignWorker = new Worker('campaigns', processJob, { concurrency: 5 });
```
Also: add queue monitoring to detect backlog.

### 2.3 Metrics Worker — 11 Queries Per Event (Fintech)

**File:** `packages/backend/src/workers/metricsWorker.ts`

Fintech domain runs 11-13 separate COUNT/SUM queries per event. At 100 events/sec = 1,300 queries/sec just for metrics.

**Fix:** Consolidate into 1-2 queries with CASE statements:
```sql
SELECT
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE event_name = 'transaction_completed') AS transactions,
  SUM(CASE WHEN properties->>'type' = 'debit' THEN (properties->>'amount')::numeric ELSE 0 END) AS debit_total,
  SUM(CASE WHEN properties->>'type' = 'credit' THEN (properties->>'amount')::numeric ELSE 0 END) AS credit_total,
  ...
FROM events WHERE project_id = $1 AND customer_id = $2
```

### 2.4 Trigger Worker — Evaluates ALL Flows Per Event

**File:** `packages/backend/src/workers/triggerWorker.ts`

Every event triggers:
1. Fetch ALL active flows for project (1 query)
2. Loop through each flow (potentially 100+)
3. Per flow: 3-4 queries (audience check, trip dedup)

**At 100 flows × 100 events/sec = 30,000-40,000 queries/sec**

**Fix:**
1. Pre-index flows by trigger event name (HashMap in Redis)
2. Only evaluate flows whose trigger matches the incoming event
3. Batch audience checks (single query for multiple flows)

### 2.5 Exit Event Processing — O(n) Per Event

**File:** `packages/backend/src/services/flowExecutor.ts`

Every event checks ALL active + waiting trips for that customer, then fetches each flow's exit config.

**At 50 trips × 100 events/sec = 5,000 queries/sec**

**Fix:** Pre-index exit events per flow. Only check trips for flows that have matching exit events.

### 2.6 Database Connection Pool — Default 10

No explicit pool configuration. PostgreSQL default = 10 connections.

**At 100 events/sec:** All 10 connections exhausted instantly. Remaining requests queue indefinitely.

**Fix:**
```typescript
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 50,                    // 50 connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```
For production: add PgBouncer as connection pooler.

---

## 3. Critical: Missing Infrastructure

These must exist before the SDK can work.

### 3.1 No Rate Limiting Enforcement

**File:** `packages/backend/src/middleware/apiKeyAuth.ts`

The `apiKeys` table has a `rateLimit` column (default 1000/min). **But no code enforces it.**

**Impact:** SDK clients can send unlimited requests. A single misconfigured SDK could DDoS the backend.

**Fix:** Redis-backed sliding window rate limiter:
```typescript
const key = `rate:${apiKeyId}:${Math.floor(Date.now() / 60000)}`;
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, 120); // 2 min TTL
if (count > rateLimit) return res.status(429).json({ error: 'Rate limit exceeded' });
```

### 3.2 No Body Size Configuration

**File:** `packages/backend/src/index.ts`

`express.json()` uses default 100KB limit. SDK batch of 100 events (~200 bytes each) = 20KB (fine). But 1000 events with rich properties could exceed 100KB.

**Fix:**
```typescript
app.use(express.json({ limit: '1mb' }));
```

### 3.3 No CORS for SDK Origins

**File:** `packages/backend/src/index.ts`

Current CORS only allows `FRONTEND_URL`. SDK will send requests from customer websites/apps.

**Fix:** V1 API routes need separate CORS config allowing any origin (controlled by API key):
```typescript
app.use('/api/v1', cors({ origin: '*', methods: ['POST', 'GET'] }));
app.use('/api', cors({ origin: FRONTEND_URL }));  // Admin routes
```

### 3.4 No Sessions Table

SDK will track sessions (start, end, duration, pages, device info). No table to store them.

### 3.5 No Push Subscription Storage

SDK will register push subscriptions. No table to store endpoint/keys.

### 3.6 No Gzip/Compression Support

SDK should send compressed event batches. Backend needs `compression` middleware:
```typescript
import compression from 'compression';
app.use(compression());
```

---

## 4. High: Database Performance

### 4.1 Missing Indexes

| Query Pattern | Current Index | Needed |
|---|---|---|
| Flow trip lookup by (flow, customer, status) | None | `(flow_id, customer_id, status)` |
| Events by customer + event name | `(project_id, customer_id, timestamp)` | `(project_id, customer_id, event_name, timestamp)` |
| JSONB property queries (metrics) | None | GIN index on `properties` for hot paths |
| Customer by email (identity resolution) | None | `UNIQUE (project_id, email) WHERE email IS NOT NULL` |
| Customer by phone | None | `UNIQUE (project_id, phone) WHERE phone IS NOT NULL` |
| Customer by external_id | None | `UNIQUE (project_id, external_id) WHERE external_id IS NOT NULL` |
| Sessions by customer | N/A (table doesn't exist) | `(project_id, customer_id, started_at DESC)` |

### 4.2 Events Table Growth

Current: all events in one table. At 1000 events/sec = 86M events/day.

**Fix:** Time-based partitioning:
```sql
CREATE TABLE events (
  ...
) PARTITION BY RANGE (received_at);

CREATE TABLE events_2025_w10 PARTITION OF events
  FOR VALUES FROM ('2025-03-03') TO ('2025-03-10');
```

### 4.3 JSONB Property Scans

Metrics worker queries `(properties->>'type')::text = 'debit'` on every transaction event. Full table scan per customer.

**Fix:** Materialized views for hot aggregates, or store denormalized fields.

---

## 5. High: Type System & Schema Gaps

### 5.1 Missing Types for New Features

| Feature | Missing Type | Location |
|---|---|---|
| Sessions | `Session` type | `packages/shared/src/types.ts` |
| Push subscriptions | `PushSubscription` type | `packages/shared/src/types.ts` |
| In-app messages | `InAppMessage` type | `packages/shared/src/types.ts` |
| Customer predictions | `CustomerPrediction` type | `packages/shared/src/types.ts` |
| Device info | `DeviceInfo` type | `packages/shared/src/types.ts` |
| Analytics queries | `FunnelConfig`, `CohortConfig`, `PathConfig` | `packages/shared/src/types.ts` |
| Engagement score | Field on Customer | `packages/shared/src/types.ts` |
| Optimal send time | `SendTimePreference` type | `packages/shared/src/types.ts` |

### 5.2 Enum Extensions Needed

```typescript
// FilterOperator — missing:
'in_last_n_days' | 'not_in_last_n_days' |    // time-windowed
'rfm_score_gte' | 'rfm_score_lte' |           // RFM
'prediction_gte' | 'prediction_lte' |          // Predictions
'session_count_gte' | 'session_duration_gte'   // Sessions

// TemplateChannel — missing:
'in_app'

// ActionNode.actionType — missing:
'send_in_app' | 'send_webhook' | 'update_attribute' | 'add_to_segment'

// EventPlatform — needs:
'sdk_web' | 'sdk_ios' | 'sdk_android' | 'sdk_react_native'
```

### 5.3 Constants — Missing Events

```typescript
// SDK_EVENTS (new constant needed)
'page_viewed', 'session_started', 'session_ended',
'button_clicked', 'form_submitted', 'scroll_depth',
'search_performed', 'feature_used', 'screen_viewed',
'notification_received', 'notification_clicked', 'notification_dismissed',
'in_app_shown', 'in_app_clicked', 'in_app_dismissed',
'push_subscribed', 'push_unsubscribed',
'consent_granted', 'consent_revoked'
```

---

## 6. High: Segment Evaluator Limitations

### 6.1 No Window Function Support

**File:** `packages/segments/src/evaluator.ts`

Current evaluator can do: "total_orders > 5" or "total_spent > 10000"

Cannot do: "orders in last 30 days > 3" or "sessions this week > 5"

**Reason:** `fieldToSqlExpression()` maps fields to customer columns, not to subqueries with date ranges.

**Fix:** Add windowed aggregate support:
```typescript
case 'orders_in_last_30_days':
  return sql`(SELECT COUNT(*) FROM orders WHERE customer_id = customers.id AND created_at > NOW() - INTERVAL '30 days')`;
case 'sessions_in_last_7_days':
  return sql`(SELECT COUNT(*) FROM sessions WHERE customer_id = customers.id AND started_at > NOW() - INTERVAL '7 days')`;
```

### 6.2 JS Evaluation Returns False for Complex Filters

**File:** `packages/segments/src/evaluator.ts` (line 273-277)

Product-based filters (`has_purchased`, `has_not_purchased`) return `false` in JS evaluation mode. This is intentional (needs DB subquery). But it means:

- Flow audience filters using product rules will **always exclude customers** when evaluated in JS
- New filter types (session, RFM, prediction) will have the same problem

**Fix:** All audience filter evaluation in flow triggers must use SQL path, never JS fallback.

### 6.3 No Prediction-Based Segmentation

Cannot create segments like "churn risk > 80%" or "engagement score < 20". Evaluator has no access to prediction data.

**Fix:** Store predictions as customer attributes (in `metrics` JSONB), then add field mappings:
```typescript
case 'churn_risk':
  return sql`(customers.metrics->>'churn_risk')::numeric`;
case 'engagement_score':
  return sql`(customers.metrics->>'engagement_score')::numeric`;
```

---

## 7. Medium: Error Handling & Reliability

### 7.1 No Dead-Letter Queue

**File:** `packages/backend/src/services/eventProcessor.ts` (line 87-90)

```typescript
} catch (err) {
  console.error(`Event processing failed for ${eventName}:`, err)
  // TODO: write to dead_letter_events table
}
```

Webhook events that fail processing are **permanently lost**. No retry, no audit trail.

**Fix:** Create `dead_letter_events` table. On failure, persist the raw payload for manual replay.

### 7.2 Shopify Sync Worker — No Retries

**File:** `packages/backend/src/services/queue.ts`

```typescript
shopifySyncQueue: { attempts: 1 }  // No retries!
```

If Shopify historical sync fails (rate limit, network error), the entire sync is lost.

**Fix:** Increase to `attempts: 3` with exponential backoff.

### 7.3 Generic Error Messages in Batch API

**File:** `packages/backend/src/routes/v1Events.ts`

```typescript
} catch (err) {
  results.push({ index: i, error: 'Processing failed' })
}
```

Clients get no actionable error info. SDK can't distinguish between validation error vs server error.

**Fix:** Return specific error categories: `'validation_error'`, `'identity_resolution_failed'`, `'rate_limited'`, `'server_error'`.

### 7.4 No Queue Monitoring

No visibility into queue depth, processing rate, or backlog. If queues back up, nobody knows.

**Fix:** Add BullMQ dashboard (bull-board) or export metrics to monitoring:
```typescript
const queueMetrics = await eventsQueue.getJobCounts();
// { active, waiting, completed, failed, delayed }
```

---

## 8. Medium: Security & Auth Concerns

### 8.1 API Key Hash Verification Is Synchronous

**File:** `packages/backend/src/middleware/apiKeyAuth.ts`

`hashSecret()` uses `crypto.createHash('sha256')` — CPU-bound, blocks event loop.

**At 1000 req/sec:** Event loop blocked for ~1ms per request = 1 second of blocking per second (100% CPU).

**Fix:** Use `crypto.subtle.digest()` (async) or cache validated keys in Redis for 5 minutes.

### 8.2 API Key Last-Used Update — Write Storm

Every authenticated request fires a non-blocking DB write:
```typescript
db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});
```

**At 1000 req/sec = 1000 writes/sec** to api_keys table.

**Fix:** Batch updates. Cache in Redis, flush to DB every 60 seconds.

### 8.3 Data Masking — Violation Info Leakage

**File:** `packages/backend/src/middleware/dataMasking.ts`

When data masking rejects a request, it returns which fields triggered detection. This could help an attacker probe the masking rules.

**Fix:** Log violations server-side only. Return generic error to client.

### 8.4 No Request Signing for SDK

SDK sends API key in header. If intercepted (MITM on non-HTTPS), key is compromised.

**Fix for production:** Require HTTPS. Add request timestamp + HMAC signature to prevent replay attacks.

---

## 9. Low: Frontend & UX Risks

### 9.1 TanStack Query Cache Invalidation

Adding new data sources (sessions, predictions, analytics) will need careful cache invalidation. Current hooks invalidate on known query keys — new queries need to be added.

### 9.2 Dashboard Performance with Analytics

Current dashboard makes 2 API calls (stats + activity). Adding trends, funnels, RFM will add 5+ API calls per page load.

**Fix:** Aggregate dashboard endpoint that returns all widgets in one call, with Redis caching.

### 9.3 Bundle Size Growth

Adding analytics visualizations (Sankey diagram, heatmap, funnel chart) will require D3.js or heavy charting libraries.

**Fix:** Dynamic imports (`next/dynamic`) for analytics pages. Only load chart libraries on analytics routes.

### 9.4 Real-Time Updates

Current UI is poll-based (TanStack Query refetch intervals). SDK data arrives in real-time but dashboard shows stale data.

**Fix (later):** Add WebSocket/SSE for live dashboard updates.

---

## 10. Enhancement Compatibility Matrix

Will the new feature **break** existing functionality?

| New Feature | Customers | Segments | Flows | Campaigns | Dashboard | Events API |
|---|---|---|---|---|---|---|
| **Web SDK** | Safe (new source) | Safe | Safe | Safe | Safe | **Needs batch fix** |
| **Sessions table** | Safe (new relation) | **Needs evaluator update** | Safe | Safe | Safe | Safe |
| **Push channel** | Safe | Safe | **Needs new action** | **Needs new channel** | Safe | Safe |
| **SMS channel** | Safe | Safe | **Needs new action** | **Needs new channel** | Safe | Safe |
| **WhatsApp channel** | Safe | Safe | **Needs new action** | **Needs new channel** | Safe | Safe |
| **In-app messages** | Safe | Safe | **Needs new action** | N/A | Safe | Safe |
| **Funnel analytics** | Safe | Safe | Safe | Safe | **New page** | Safe |
| **Cohort analytics** | Safe | Safe | Safe | Safe | **New page** | Safe |
| **Path finder** | Safe | Safe | Safe | Safe | **New page** | Safe |
| **RFM segments** | Safe | **Needs evaluator** | Safe | Safe | Safe | Safe |
| **Predictions** | **Needs metrics field** | **Needs evaluator** | **Needs condition** | Safe | **New widget** | Safe |
| **Optimal send time** | **Needs preference field** | Safe | **Needs scheduler** | **Needs scheduler** | Safe | Safe |
| **Engagement scoring** | **Needs score field** | **Needs evaluator** | Safe | Safe | **New widget** | Safe |

Legend: **Bold** = requires code changes to existing modules. Safe = no changes needed.

---

## 11. Pre-Build Fixes (Must Do BEFORE Phase 1)

These fixes must be applied before adding any new features. They address existing bugs and infrastructure gaps.

### Priority 0 — Race Condition Fixes (Day 1)

| # | Fix | File | Effort |
|---|---|---|---|
| 1 | Add unique partial indexes on customers (email, phone, external_id) | Migration 0005 | 30 min |
| 2 | Rewrite `resolveCustomer()` to use INSERT ON CONFLICT | customerService.ts | 1 hour |
| 3 | Rewrite `updateCustomerAggregates()` to use atomic SQL increments | customerService.ts | 30 min |
| 4 | Add unique index on flow_trips (flow_id, customer_id) WHERE status IN ('active','waiting') | Migration 0005 | 15 min |
| 5 | Add unique index on orders (project_id, external_order_id) | Migration 0005 | 15 min |
| 6 | Use ON CONFLICT for idempotency key instead of check-then-insert | v1Events.ts | 30 min |

### Priority 0 — Infrastructure Fixes (Day 1)

| # | Fix | File | Effort |
|---|---|---|---|
| 7 | Configure `express.json({ limit: '1mb' })` | index.ts | 5 min |
| 8 | Add rate limiting middleware (Redis sliding window) | middleware/rateLimiter.ts | 2 hours |
| 9 | Add CORS config for SDK origins on /api/v1/* | index.ts | 15 min |
| 10 | Increase DB connection pool to 50 | db/index.ts | 10 min |
| 11 | Increase worker concurrency (trigger→50, metrics→30, flow→20) | workers/*.ts | 15 min |
| 12 | Add compression middleware | index.ts | 10 min |

### Priority 1 — Performance Fixes (Day 2)

| # | Fix | File | Effort |
|---|---|---|---|
| 13 | Consolidate fintech metrics into 1-2 aggregate queries | metricsWorker.ts | 2 hours |
| 14 | Add missing database indexes (see Section 4.1) | Migration 0005 | 30 min |
| 15 | Rewrite batch event route to use bulk inserts | v1Events.ts | 3 hours |
| 16 | Pre-index flows by trigger event name in Redis | triggerWorker.ts | 2 hours |
| 17 | Optimize exit event processing (EXISTS subquery) | flowExecutor.ts | 1 hour |

### Priority 1 — Reliability Fixes (Day 2)

| # | Fix | File | Effort |
|---|---|---|---|
| 18 | Create dead_letter_events table + write failed events | eventProcessor.ts, migration | 1 hour |
| 19 | Add retries to shopify sync worker (attempts: 3) | queue.ts | 5 min |
| 20 | Return specific error categories in batch API | v1Events.ts | 30 min |
| 21 | Add trip status re-check before action execution | flowExecutor.ts | 15 min |
| 22 | Cache API key validation in Redis (5 min TTL) | apiKeyAuth.ts | 1 hour |

**Total effort for pre-build fixes: ~2 days**

---

## 12. Phase-by-Phase Risk Map

### Phase 1: SDK Foundation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SDK event volume overwhelms batch endpoint | High | Backend crashes | Fix batch processing FIRST (Pre-build #15) |
| Duplicate customers from concurrent identify() | High | Data corruption | Fix race conditions FIRST (Pre-build #1-2) |
| Queue backlog from SDK events | High | Delayed flows/triggers | Increase concurrency FIRST (Pre-build #11) |
| CORS blocks SDK requests | Certain | SDK non-functional | Configure CORS (Pre-build #9) |
| Body size limit rejects large batches | Medium | SDK events lost | Increase limit (Pre-build #7) |
| Anonymous→known merge loses events | Medium | Incomplete profiles | Design merge as atomic transaction |
| SDK bundle size exceeds 15KB target | Low | Slow page loads | Tree-shake, lazy-load modules |

### Phase 2: Analytics Engine

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Funnel queries too slow (full event scan) | High | Bad UX (>5s) | Pre-compute, materialized views, time partition events |
| Path finder combinatorial explosion | Medium | Query timeout | Cap max_steps, min_users threshold, sample data |
| Cohort heatmap with 52 weeks × 52 cohorts | Medium | Memory spike | Server-side pagination, limit to 12-week window |
| RFM scoring conflicts with existing segment evaluator | Low | Wrong segment membership | Test evaluator changes against all existing segments |
| Analytics queries compete with event writes | Medium | Write latency spikes | Use read replica for analytics queries |

### Phase 3: Multi-Channel

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SMS/WhatsApp provider rate limits | High | Messages delayed | Per-provider queue with rate limiting |
| Push notification permission denied | Medium | Low push reach | Graceful fallback to email |
| In-app message rendering breaks host app | Medium | SDK causes crashes | Sandboxed iframe rendering, error boundary |
| Channel selection logic conflicts with existing email-only flows | Low | Existing flows break | Backward compatible: default to email if no channel specified |
| Frequency capping blocks important transactional messages | Medium | Missed notifications | Priority levels: transactional bypasses caps |

### Phase 4: AI Intelligence

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Optimal send time with <10 data points | High | Random/wrong times | Bayesian prior from population average |
| Churn prediction false positives | Medium | Annoying win-back emails | Confidence threshold, human review for high-value customers |
| LLM (Groq) API downtime | Medium | Next Best Action unavailable | Fallback to rule-based recommendations |
| Engagement score formula tuning | Medium | Scores meaningless | A/B test score-based targeting vs random |
| Prediction computation load | Low | Background job lag | Run predictions in batch (nightly), cache results |

### Phase 5: Analytics UI

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| D3.js/charting library bloats bundle | High | Slow page loads | Dynamic imports, code splitting |
| Dashboard with 10+ API calls | High | Slow load time | Aggregate endpoint with Redis cache |
| Sankey diagram unreadable with 100+ paths | Medium | Useless visualization | Prune low-volume paths, group "other" |
| Real-time dashboard expectations | Medium | Stale data complaints | Add SSE for live metric updates |

### Phase 6: Personalization & Connectors

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Web personalization causes layout shift (CLS) | High | Bad Core Web Vitals | Anti-flicker snippet, server-side rendering preference |
| Google/Facebook API changes | Medium | Broken audience sync | Abstract behind adapter pattern, monitor API changelogs |
| Outbound webhook failures | Medium | Data not reaching external systems | Retry queue with dead-letter, webhook delivery dashboard |
| Data export volume (millions of rows) | Medium | Timeout/memory crash | Streaming CSV, chunked export, S3 presigned URLs |

---

## Summary: What Breaks If We Don't Fix First

| If we skip... | What breaks |
|---|---|
| Race condition fixes | Duplicate customers, wrong CLV, double emails |
| Rate limiting | Single SDK client can DDoS backend |
| CORS config | SDK can't connect at all |
| Body size limit | Batch events rejected |
| Worker concurrency increase | Queues backlog, triggers delayed by hours |
| Connection pool increase | Database connection timeouts under load |
| Batch endpoint optimization | SDK event ingestion times out (30s+) |

**Bottom line:** 2 days of pre-build fixes will prevent the entire platform from collapsing when SDK traffic arrives. Every hour spent here saves days of debugging later.
