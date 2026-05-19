# Customer Lifetime Value — Model & Implementation

Reference for what Storees actually computes when it shows you a CLV
number, a health badge, or a churn risk. Source of truth lives in
[`packages/backend/src/services/customerService.ts`](../packages/backend/src/services/customerService.ts)
(`computeClv()`); this doc tracks that function.

---

## TL;DR

For every customer, we compute:

```
CLV  =  Historical (actual past spend)
     +  Predicted (forward-looking 12-month value, churn-adjusted)
```

Predicted is the modeled piece — it's what makes CLV more than just a
synonym for total spend. The model is a retention-adjusted discounted
forecast, dampened by how engaged the customer currently is on the
storefront.

The customer also gets a categorical **Health** label
(`new` / `growing` / `stable` / `declining` / `at_risk` /
`lapsed_engaged` / `churned`) that marketing teams act on directly.

---

## Inputs

| Input | Source | Notes |
|---|---|---|
| `totalSpent` | `customers.total_spent` | Sum of completed-order totals to date. Updated by the aggregate worker on every revenue event. |
| `totalOrders` | `customers.total_orders` | Counter; same worker. |
| `firstOrderDate` | `customers.first_order_date` | Set on first revenue event; never decreases. |
| `lastOrderDate` | `customers.last_order_date` | Set on every revenue event with `GREATEST(...)`. |
| `lastSeenDate` | `customers.last_seen` | Set on **any** event (page view, login, product view, purchase). The engagement signal. |
| `churnRiskScore` (optional) | `customers.metrics.churn_risk` (set by the ML pipeline) | If present and > 0, overrides the heuristic churn probability. |

If `lastOrderDate` is missing (a known import-pipeline edge case), the
model falls back to `lastSeenDate` for "days since last order" — not to
the tenure, which would incorrectly mark imports as churned.

---

## Math

### Historical
```
historical = totalSpent
```

Trivial — what they actually spent. No interpretation.

### Predicted

```
AOV               =  totalSpent / totalOrders
tenureDays        =  max(1, now - firstOrderDate)              # in days
tenureMonths      =  max(1, tenureDays / 30.44)
monthlyFreq       =  totalOrders / tenureMonths

avgGapDays        =  max(1,
                       totalOrders > 1
                         ? (lastOrderDate - firstOrderDate) / (totalOrders - 1)
                         : tenureDays)

daysSinceLastOrder =  lastOrderDate
                         ? max(0, now - lastOrderDate)
                         : lastSeenDate ?? tenureDays

overdueRatio      =  daysSinceLastOrder / avgGapDays
```

**Churn probability** — heuristic unless ML overrides:

| Condition | `churnProb` |
|---|---|
| `churnRiskScore` set (0-100) | `max(0.02, score / 100)` |
| Only ever ordered once | `0.6` (single buyers churn at high base rate) |
| `overdueRatio ≤ 1` | `0.05` |
| `overdueRatio ≤ 2` | `0.15 + (overdueRatio - 1) × 0.2` |
| `overdueRatio ≤ 3` | `0.35 + (overdueRatio - 2) × 0.3` |
| else | `min(0.95, 0.65 + (overdueRatio - 3) × 0.1)` |

**Retention** — converts annual churn to expected purchase lifetime:

```
monthlyChurnRate  =  max(0.01, 1 - (1 - churnProb)^(1/12))
retentionMonths   =  min(36, 1 / monthlyChurnRate)
```

The 36-month cap stops models from inventing 20-year customers off two
data points. The 0.01 floor stops division explosions.

**Engagement multiplier** — `daysSinceLastSeen`:

| Days | Multiplier |
|---|---|
| `≤ 7`  | `× 1.15` |
| `≤ 30` | `× 1.0` |
| `≤ 90` | `× 0.75` |
| `> 90` | `× 0.5` |
| `null` (no `lastSeen`) | `× 1.0` |

**Predicted CLV:**

```
predicted = round(AOV × monthlyFreq × retentionMonths × engagementMultiplier, 2)
```

### Total

```
clv_total = round(historical + max(0, predicted), 2)
```

That's also what's written to the `customers.clv` column.

---

## Health states

Health is **not** a function of the predicted value — it's a
categorical signal teams act on. It combines order recency, expected
purchase cadence, and engagement recency:

| State | Condition | What it means | Marketing action |
|---|---|---|---|
| `new` | `totalOrders = 0` AND `daysSinceLastSeen ≤ 30` | Signed up, no purchase yet, still around | First-purchase nudge / welcome flow |
| `growing` | `overdueRatio ≤ 0.8` | Ordering faster than their historical cadence | Don't disturb; nurture |
| `stable` | `overdueRatio` in `(0.8, 1.5]` | On their normal cadence | Standard campaigns |
| `declining` | `overdueRatio` in `(1.5, 3]` | Late by 1.5–3× the usual gap | Reminder / category cross-sell |
| `at_risk` | `overdueRatio > 3` AND `daysSinceLastSeen ≤ 60` | Way late but still browsing | Win-back offer |
| `lapsed_engaged` | `daysSinceLastOrder > 180` AND `daysSinceLastSeen ≤ 60` | No purchase in 6+ months but still browsing | **Re-engagement target** — different ICP from churned, often the most valuable to nurture |
| `churned` | `daysSinceLastOrder > 180` AND no recent engagement | Gone on both axes | Suppression / exit campaign |

Customers with `totalOrders = 0` AND no recent `lastSeen` go straight
to `churned`.

The `lapsed_engaged` state is the one that matters most. It used to be
hidden inside `churned` and the result was a steady drip of
"reactivation campaigns" sent to customers who'd actually un-installed
the app — wrong audience. Separating these two saves spend and gives
the engaged-but-not-buying segment its own action.

---

## Where it's computed

Three paths, all routed through `computeClv()` to keep the model
single-source:

| Path | Trigger | File |
|---|---|---|
| Event-driven (hot path) | Every `order_placed` / refund event flowing through BullMQ | `workers/customerAggregateWorker.ts` → `refreshClv()` |
| Bulk recompute (analytics) | `metricsWorker.computeMetrics()` for analytics rollups | `workers/metricsWorker.ts` |
| Admin recalculation | `POST /api/customers/recalculate` | `services/customerService.ts` → `recalculateAllCustomerAggregates()` |

Each does the same two-step:

1. Atomic SQL `UPDATE customers SET total_orders = ..., total_spent =
   ..., last_seen = GREATEST(...)` for race-safe increments.
2. SELECT the fresh row, call `computeClv()`, UPDATE `customers.clv` +
   `customers.metrics` JSONB with the result.

---

## Storage

Three storage points — kept aligned by routing all writes through
`computeClv()`:

| Field | Type | Meaning |
|---|---|---|
| `customers.total_spent` | `decimal(12,2)` | Lifetime spend. The deterministic part. |
| `customers.clv` | `decimal(12,2)` | Total CLV (`clv_total`). What the customer list, segment filters, and template variables read. |
| `customers.metrics.clv_*` | `jsonb` keys | Full breakdown (historical, predicted, total, health, frequency, retention, churn probability, days_since_*). What the customer detail Lifecycle / CLV card reads. |

Why three? Historical reasons + read-perf reasons:

- `total_spent` and `clv` are indexed, sortable, filterable columns —
  the segment evaluator and analytics queries need them as columns.
- `metrics.clv_*` is the JSONB grab-bag the customer detail UI needs
  for its breakdown cards. Putting these in columns each would bloat
  the customer row.

If you find a fourth storage point in code, that's a bug — it should
be reading from one of the three above.

---

## Recomputation

Every revenue event triggers a recompute via the BullMQ aggregate
queue. The aggregate worker is the hot path — ~1 second from event
ingestion to updated `customers.clv`.

Bulk recompute (used for analytics and after schema migrations) is
`recalculateAllCustomerAggregates(projectId)` and processes the whole
project. Migration 0053 ran one of these once for every existing
customer via SQL.

Customers with no orders are recomputed lazily — there's no event for
"customer signed up but didn't buy". Their `clv_health` flips to `new`
or `churned` based on `last_seen`, which IS updated on every event,
so the categorization always reflects current reality even without an
explicit recompute.

---

## What this model is **not**

- **Not an ML model.** It's a heuristic — a retention-adjusted DCF
  with explicit thresholds. The `churn_risk` field, set by the
  separate ML pipeline, can override the heuristic churn probability
  when available. The model deliberately uses a simple formula that
  works on day-1 data; ML refines it later.
- **Not segment-aware.** Average CLV across a segment is a separate
  computation (`AVG(clv)` filtered by segment membership). Per-customer
  CLV doesn't know about segments.
- **Not currency-aware.** All values are in the project's currency
  (INR for Storees-on-Gowelmart). There's no FX conversion at the
  model layer.

---

## Tuning knobs

If a project's CLV numbers feel wrong, the levers are:

1. **The retention cap (36 months).** Too generous for fast-fashion
   categories where customer interest decays in months. Push down
   for that ICP.
2. **The churn probability table.** Currently tuned for monthly-cadence
   shopping (groceries, household). For low-frequency categories
   (furniture, electronics) the `overdueRatio` thresholds need
   widening — a 3× overdue on a 9-month average gap shouldn't be
   at-risk.
3. **The engagement multiplier values.** Conservatively chosen (×1.15
   max). A SaaS or content-driven business where engagement is the
   primary leading indicator might want a steeper curve.
4. **The 180-day churn threshold.** B2B repeat-purchase cycles can run
   12-18 months — using a 180-day threshold mislabels them all
   churned. Worth making per-project configurable in a future pass.

All four of these are constants in `computeClv()` today. None are
per-project yet. When more customers like Gowelmart land, that's a
likely refactor.
