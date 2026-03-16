# Agent: Frontend UI

> **ID**: Agent 2
> **Color**: Blue
> **Directory**: `packages/frontend/`
> **Consumes**: `packages/shared/` (types only), Backend REST API

## Responsibilities

1. **Next.js App**: Project setup, App Router pages, layouts
2. **Admin Panel UI**: All pages — dashboard, customers, segments, flows, debugger
3. **Components**: shadcn/ui based, design system compliance
4. **Data Fetching**: TanStack Query (React Query v5) for all API calls
5. **Auth**: NextAuth.js session management

## What You Do NOT Build

- Backend logic, database queries, Shopify integration (Agent 1)
- Segment evaluation logic (Agent 3)
- Flow execution logic (Agent 4)
- You only consume the REST API.

## Key Documentation

- `docs/domains/ui-system/DESIGN_SYSTEM.md` — Colors, typography, spacing, component patterns
- `docs/domains/ui-system/PAGES.md` — Page-by-page layout specs with wireframes
- `docs/domains/ui-system/COMPONENTS.md` — Full component inventory with props
- `docs/domains/data-layer/TYPES.md` — API response types to import
- `docs/domains/backend/API_ROUTES.md` — All API endpoints you consume

## Directory Structure

```
packages/frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx            ← Root layout with AppShell
│   │   ├── page.tsx              ← Redirect to /dashboard
│   │   ├── dashboard/page.tsx    ← Dashboard with metric cards
│   │   ├── customers/page.tsx    ← Customer list
│   │   ├── segments/
│   │   │   ├── page.tsx          ← Segment list
│   │   │   ├── create/page.tsx   ← Template selection + create from scratch
│   │   │   └── [id]/page.tsx     ← Segment member list
│   │   ├── flows/
│   │   │   ├── page.tsx          ← Flow list
│   │   │   └── [id]/page.tsx     ← Flow canvas view
│   │   ├── debugger/page.tsx     ← Event stream
│   │   └── integrations/page.tsx ← Shopify connect
│   ├── components/
│   │   ├── layout/               ← AppShell, Sidebar, SidebarItem, PageHeader
│   │   ├── ui/                   ← shadcn/ui components (Button, Table, Card, etc.)
│   │   ├── shared/               ← DataTable, ExpandableRow, Badge variants, EmptyState
│   │   ├── dashboard/            ← MetricCard
│   │   ├── customers/            ← CustomerDetail, OrderHistoryTab, ActivityTab
│   │   ├── segments/             ← FilterBuilder, TemplateCard, LifecycleChart
│   │   ├── flows/                ← FlowCanvas, FlowNode, NodeConfigPanel
│   │   ├── debugger/             ← EventStream, EventRow
│   │   └── integrations/         ← ShopifyConnectButton, SyncProgress
│   ├── hooks/                    ← useCustomers, useSegments, useFlows, etc.
│   ├── lib/
│   │   ├── api.ts                ← API client (fetch wrapper with base URL + auth)
│   │   └── utils.ts              ← cn() utility, formatters
│   └── styles/
│       └── globals.css           ← Tailwind imports + CSS custom properties
├── tailwind.config.ts
├── next.config.ts
├── package.json
└── tsconfig.json
```

## Design Rules

- Sidebar: 240px fixed, `#0D1138` background, white text, `#4F46E5` active indicator
- Content area: `#F5F6FF` background, max-width 1280px centered
- Headings: `#0D1138`, body text: `#1A1A2E`, secondary: `#6B7280`
- Primary buttons: `#4F46E5` background, white text
- Tables: shadcn Table with hover rows, sortable headers, pagination
- Use `cn()` for all conditional class merging
- Never hardcode Tailwind colors — use semantic tokens from design system
- Charts: recharts library, clean line/area/bar charts with subtle grids

## Visual Reference: MoEngage Dashboard

The dashboard UI is modeled after MoEngage's "Key Metrics" dashboard:

### Metric Strip (top of dashboard)
- Horizontal inline band — NOT bordered cards
- Each metric: **label** (small gray), **value** (large bold), **% change** (tiny colored arrow inline)
- All metrics in a single scrollable row with subtle dividers
- Example: `Average DAU  4.6K  1%↗  |  Average MAU  130.4K  0%  |  Revenue  $2.15M  34%↗`

### Chart Grid
- **3 charts per row** (desktop), each in a white card with rounded corners
- Each chart has: **title** with info icon, **sub-stat box** above the chart showing "Last Day: X" and "Average: Y"
- Line charts with clean thin lines, dot markers, subtle grid lines
- Date axis: `1 Jan, 2 Jan, ...` format
- Legend at bottom with colored dots

### Header Bar
- Breadcrumb trail: `Dashboard > Key Metrics`
- Right side: Platform filter ("All" dropdown), Duration date range picker with "Apply" button

### Dashboard Sections (scrollable)
1. Metric strip (customers, activity, revenue, conversions)
2. Charts row 1: Customer activity (DAU/MAU), Events
3. Charts row 2: Domain-specific (Orders/Revenue), Activity feed

## Prompt for Claude Code

```
You are building the admin panel frontend for Storees using Next.js 14 App Router + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query v5 + recharts.

Your directory: packages/frontend/

Read these docs before starting:
- docs/domains/ui-system/DESIGN_SYSTEM.md (colors, typography, patterns)
- docs/domains/ui-system/PAGES.md (page layouts and wireframes)
- docs/domains/ui-system/COMPONENTS.md (component inventory)
- docs/domains/data-layer/TYPES.md (API response types)
- docs/domains/backend/API_ROUTES.md (API endpoints to consume)

Design system:
- Sidebar: #0D1138 bg, white text, #4F46E5 active indicator, 240px fixed width
- Content: #F5F6FF bg, max-w-7xl centered
- CTAs: #4F46E5 bg, white text
- Use shadcn/ui components (Button, Table, Card, Badge, Dialog, Tabs, Popover, Sonner)
- Lucide React for all icons
- Charts: recharts library for all time-series and bar charts
- Look and feel: MoEngage dashboard — metric strip + 3-col chart grid + sub-stats

Import types from packages/shared/types.ts. API base URL from NEXT_PUBLIC_API_URL env var.
DO NOT build backend logic. You only consume the REST API.
```
