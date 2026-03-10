# Segmentation — Filter Evaluation Engine

> **Package**: `packages/segments/`
> **Owner**: Agent 3
> **Consumed by**: Agent 1 (backend API routes), Agent 2 (frontend filter builder)

## Core Interface

```typescript
evaluateFilter(filters: FilterConfig, customer: Customer): boolean
getSegmentMembers(segmentId: string, page?: number, pageSize?: number): PaginatedResponse<Customer>
createFromTemplate(templateName: string, projectId: string): Segment
createFromScratch(name: string, description: string, filters: FilterConfig, projectId: string): Segment
previewCount(filters: FilterConfig, projectId: string): number
getLifecycleChart(projectId: string): LifecycleChartData
reEvaluateCustomer(customerId: string, projectId: string): void
```

## Filter Evaluation Strategy

### SQL-First Approach

Translate filter rules to SQL WHERE clauses wherever possible. Only fall back to JS for complex computed fields.

**Direct column fields** (translate to SQL):
- `total_orders` → `WHERE customers.total_orders > 5`
- `total_spent` → `WHERE customers.total_spent > 10000`
- `avg_order_value` → `WHERE customers.avg_order_value BETWEEN 500 AND 2000`
- `clv` → `WHERE customers.clv > 5000`
- `email_subscribed` → `WHERE customers.email_subscribed = true`
- `sms_subscribed` → `WHERE customers.sms_subscribed = true`

**Computed fields** (require subquery or JOIN):
- `days_since_last_order` → `EXTRACT(DAY FROM now() - (SELECT MAX(created_at) FROM orders WHERE ...))`
- `days_since_first_seen` → `EXTRACT(DAY FROM now() - customers.first_seen)`
- `has_discount_orders` → `EXISTS (SELECT 1 FROM orders WHERE discount > 0)`
- `discount_order_percentage` → Subquery: `(discount_orders / total_orders * 100)`
- `product_views_count` → `COUNT events WHERE event_name = 'product_viewed'`

### Operator to SQL Mapping

| Operator | SQL |
|----------|-----|
| `is` | `= $value` |
| `is_not` | `!= $value` |
| `greater_than` | `> $value` |
| `less_than` | `< $value` |
| `between` | `BETWEEN $value[0] AND $value[1]` |
| `contains` | `ILIKE '%' || $value || '%'` |
| `begins_with` | `ILIKE $value || '%'` |
| `ends_with` | `ILIKE '%' || $value` |
| `is_true` | `= true` |
| `is_false` | `= false` |

### AND/OR Logic
Build WHERE clause dynamically from `filters.logic` and `filters.rules`.

## Segment Re-Evaluation

When events that affect segment membership arrive:

1. Get all active segments for the project
2. Check if customer matches each segment's filter rules
3. If matches and NOT in `customer.segment_ids` → add, increment `member_count`, emit `enters_segment`
4. If NOT matches and IS in `segment_ids` → remove, decrement `member_count`, emit `exits_segment`

**Trigger on**: `order_placed`, `order_fulfilled`, `order_cancelled`, `customer_updated`
**Skip on**: `page_viewed`, `product_viewed`, `session_start` (too frequent, no segment impact)

## Lifecycle Chart Computation

Bucket customers into RFM-style 3x3 grid: recency (days since last order) vs monetary (total spent).

### Bucketing

**Recency**: Recent (0-30 days), Medium (31-90), Old (91+)
**Value**: High (top 25% by spend), Medium (25th-75th), Low (bottom 25%)

### Segment Grid

| Recency/Value | High | Medium | Low |
|---------|------|--------|-----|
| **Recent** | Champions (#10B981) | Loyalists (#34D399) | Recent Customers (#6EE7B7) |
| **Medium** | High Potential (#3B82F6) | Needs Nurturing (#93C5FD) | — |
| **Old** | Can't Lose (#EF4444) | At Risk (#F59E0B) | About to Lose (#F87171) |

### Retention Tactics

| Segment | Tactics |
|---------|---------|
| Champions | Reward with exclusives. Early access. Referral program. |
| Loyalists | Upsell higher-value. Loyalty program invite. Request reviews. |
| Recent Customers | Smooth onboarding. Welcome series. First-purchase follow-up. |
| High Potential | Personalized recommendations. Limited-time offers. Cross-sell. |
| Needs Nurturing | Educational content. Product tips. Re-engagement discounts. |
| Can't Lose | Win-back with strong offer. Personal outreach. Feedback survey. |
| At Risk | Time-sensitive reactivation. "We miss you" messaging. |
| About to Lose | Last-chance discount. Brand value reminder. |
