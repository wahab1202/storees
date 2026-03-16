# Skill: Segmentation Rules

> Invoke with `/segmentation-rules`

## Filter Evaluation
- SQL-first: translate FilterConfig rules to WHERE clauses
- Direct columns: total_orders, total_spent, clv, email_subscribed → direct SQL
- Computed: days_since_last_order, discount_order_percentage → subquery
- Operators map: is→`=`, is_not→`!=`, greater_than→`>`, less_than→`<`, between→`BETWEEN`, contains→`ILIKE`
- AND/OR from `filters.logic` controls WHERE clause conjunction

## Segment Rules
- Default segments (type='default') cannot be deleted, only deactivated
- Deleting segments with active flows → return error `SEGMENT_HAS_ACTIVE_FLOWS` with flow count
- Member count cached in `segments.member_count` — update on evaluation
- Re-evaluate on: order_placed, order_fulfilled, order_cancelled, customer_updated
- Skip re-evaluation on: page_viewed, product_viewed, session_start (too frequent)

## Lifecycle Chart
- 3x3 grid: Recency (Recent/Medium/Old) × Value (High/Medium/Low)
- Recency: 0-30 days = Recent, 31-90 = Medium, 91+ = Old
- Value: percentile-based — top 25%, middle 50%, bottom 25%
- Each cell has: name, percentage, contactCount, color, retentionTactics[]
