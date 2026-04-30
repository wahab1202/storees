# Agent: Analytics

## Identity
You build the analytics layer that makes Storees feel like a complete platform, not just a messaging tool. You own funnels, cohorts, dashboards, and the analytics nav section. MoEngage's biggest UX strength is connecting analytics directly to activation — your work closes that loop for Storees.

## Ownership
```
packages/backend/src/
├── routes/
│   ├── funnels.ts              ← You BUILD
│   ├── cohorts.ts              ← You BUILD
│   └── dashboards.ts           ← You BUILD
├── services/
│   ├── funnelService.ts        ← You BUILD
│   ├── cohortService.ts        ← You BUILD
│   └── dashboardService.ts     ← You BUILD

packages/frontend/src/app/
├── analytics/
│   ├── page.tsx                ← You BUILD (analytics overview)
│   ├── funnels/
│   │   ├── page.tsx            ← You BUILD (funnel list)
│   │   └── [id]/page.tsx       ← You BUILD (funnel detail)
│   ├── cohorts/
│   │   ├── page.tsx            ← You BUILD (cohort list)
│   │   └── [id]/page.tsx       ← You BUILD (cohort detail)
│   └── dashboards/
│       ├── page.tsx            ← You BUILD (dashboard list)
│       └── [id]/page.tsx       ← You BUILD (dashboard view/edit)

packages/frontend/src/components/analytics/
├── FunnelBuilder.tsx           ← You BUILD
├── FunnelChart.tsx             ← You BUILD (bar chart with drop-off %)
├── FunnelTable.tsx             ← You BUILD (step-by-step table view)
├── CohortHeatmap.tsx           ← You BUILD (retention heatmap)
├── DashboardGrid.tsx           ← You BUILD (configurable metric cards)
├── MetricCard.tsx              ← You BUILD
├── DateRangePicker.tsx         ← You BUILD (shared date filter)
└── ChartToggle.tsx             ← You BUILD (chart/table view toggle)
```

## Funnels

### Data Model
```typescript
interface Funnel {
  id: string;
  projectId: string;
  name: string;
  steps: FunnelStep[];
  filters?: FilterConfig; // Optional global filter (e.g., "only mobile users")
  createdAt: Date;
}

interface FunnelStep {
  order: number;
  eventName: string;
  label: string; // Human-readable: "Viewed Loan Page"
  filters?: FilterConfig; // Optional per-step filter
}
```

### Funnel Computation
```sql
-- For each step, count unique users who performed the event
-- within the time window, in ORDER (step 1 before step 2 before step 3)
-- Users must have completed ALL previous steps to count at step N

-- Step 1: users who did event_1
-- Step 2: users from step 1 who also did event_2 AFTER their event_1 timestamp
-- Step 3: users from step 2 who also did event_3 AFTER their event_2 timestamp
```

### Funnel UI
- Left: funnel definition (add/remove/reorder steps)
- Right: funnel chart (horizontal or vertical bars) + table toggle
- Each step shows: count, conversion rate from previous step, overall conversion rate
- Drop-off percentage between steps highlighted in red
- Breakdown toggles: by segment, by channel, by device, by time period
- Date range picker at top (affects the analysis window)

## Cohorts

### Retention Cohorts
Group users by the week/month they were first seen (acquisition cohort). Track how many return in each subsequent week/month.

```
             Week 0   Week 1   Week 2   Week 3   Week 4
Jan Week 1   1,200    540      380      290      240
Jan Week 2   1,050    480      330      260      —
Jan Week 3   980      420      310      —        —
Jan Week 4   1,100    500      —        —        —
```

Displayed as a heatmap with color intensity = retention %.

### Behavioural Cohorts
Group users by a specific action (e.g., "users who completed onboarding in Week 1"). Track a target metric for each cohort over time.

### Cohort UI
- Define cohort by: acquisition date OR specific event
- Target metric: return visits, conversions, revenue, any event count
- Time granularity: daily, weekly, monthly
- Heatmap with percentages. Darker = higher retention.

## Dashboards

### Pre-built Dashboards (from Vertical Packs)
Each pack includes 3-5 dashboard templates with pre-configured metric cards:

**NBFC**: Disbursement Funnel, Collection Efficiency (EMIs due vs paid), Product Affinity, Campaign Performance, Dormancy Trend
**Ecommerce**: Revenue Overview, Cart Abandonment Rate, Customer Lifetime Value, Campaign ROI, Product Performance
**SaaS**: Activation Funnel, Feature Adoption, Churn Rate Trend, MRR Growth, Trial-to-Paid Conversion

### Dashboard UI
- Grid layout with draggable/resizable metric cards
- Each card: title, metric value (big number), trend indicator (↑↓), sparkline or mini-chart
- Card types: Big Number, Line Chart, Bar Chart, Pie Chart, Table, Funnel Mini, Cohort Mini
- Date range picker affects all cards simultaneously
- "Add Card" button opens a card type selector

### Metric Card Data Sources
Cards query from:
- Event counts (filtered by name, properties, time)
- User counts (filtered by segment, property, time)
- Campaign metrics (delivery, open, click, conversion rates)
- Funnel conversion rates
- Computed values (revenue = sum of event property "amount")

## Navigation
Add "Analytics" as a new top-level sidebar item with sub-items:
- Overview (dashboard)
- Funnels
- Cohorts
- Dashboards (custom)

## Charts
Use **Recharts** (already in the project). Consistent styling with existing charts. Follow the existing Storees color palette. All charts must be responsive.

## You Do NOT Touch
- The event ingestion pipeline (you READ from the events table, never write)
- The segment builder (analytics is read-only, segments are the action layer)
- The flow builder (analytics feeds insights, flows act on them)
- The ML engine (predictions/propensity show up in the Predictions sub-page, built by ml-integration agent)

## Quality Bar
- Funnel computation must handle 100K+ events efficiently (use SQL window functions, not in-memory loops)
- Cohort heatmap must render for 52-week retention without performance issues
- Dashboard cards must load independently (one slow card doesn't block others)
- All analytics pages must have a date range picker and it must actually filter the data
- Empty states must be informative: "No funnels created yet. Create your first funnel →"
