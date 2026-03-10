# Sprint Schedule — Day-by-Day

## Day 1 — Foundation

| Owner | Tasks |
|-------|-------|
| **Wahab** | Define shared types in `/packages/shared/types.ts`. Set up monorepo (npm workspaces or turborepo). Create Shopify dev store + populate test data. Provision Railway (Postgres + Redis) + Vercel project. |
| **Agent 1** | DB schema + Drizzle migrations. Shopify OAuth flow (install + callback routes). Webhook receiver with HMAC verification. Define API contract types. |
| **Agent 2** | Next.js project setup. NextAuth config. Sidebar layout component (240px, dark). Dashboard shell page. API client with shared types. |
| **Agent 3** | Segment model + CRUD operations. FilterConfig TypeScript types. 5 default template definitions as JSON constants. |
| **Agent 4** | Flow model + CRUD operations. TriggerConfig TypeScript types. BullMQ connection + queue setup. Delayed job scheduler skeleton. |

**Checkpoint**: Monorepo compiles. DB migrations run. Shopify OAuth redirect works.

## Day 2 — Data Pipeline

| Owner | Tasks |
|-------|-------|
| **Wahab** | Test Shopify dev store connection. Verify webhook delivery (ngrok). |
| **Agent 1** | Historical sync worker: paginated customer + order fetch, CLV calc. Webhook handlers: customers/create, customers/update. Customer upsert logic. |
| **Agent 2** | Customer list page: DataTable with pagination, search, column sorting. Connect to `GET /api/customers`. Loading + empty states. |
| **Agent 3** | `evaluateFilter()` function. SQL WHERE clause builder from FilterConfig. Batch evaluation against customers table. |
| **Agent 4** | Trigger evaluator: consume from BullMQ events queue, match against active flows, determine trip creation. |

**Checkpoint**: Customer list shows real Shopify data.

## Day 3 — Customer Detail + Events

| Owner | Tasks |
|-------|-------|
| **Wahab** | **INTEGRATION MERGE #1**: Agent 1 + Agent 2. Fix API contract mismatches. |
| **Agent 1** | Webhook handlers: orders/create, orders/fulfilled, checkouts/create, carts/create. Event processor: normalize → DB → BullMQ publish. |
| **Agent 2** | Customer detail: expand row with tabs. Details tab (profile + subscription badges). Orders tab (multi-item table). Activity tab (event timeline). |
| **Agent 3** | Template instantiation: click template → create segment → evaluate → return count. Segment list API with cached counts. |
| **Agent 4** | Action executor: send email via Resend with {{variable}} substitution. Trip state machine: enter → waiting → check → action → end. |

**Checkpoint**: Segments created from templates show correct member counts.

## Day 4 — Segments + Flow Wiring

| Owner | Tasks |
|-------|-------|
| **Wahab** | **INTEGRATION MERGE #2**: Agent 3 into backend. Segment API routes return real data. |
| **Agent 1** | Segment API routes (GET/POST /segments, GET members, GET lifecycle). Flow API routes (GET/POST /flows, start, stop). |
| **Agent 2** | Segment list page. Template card grid with descriptions. Click-to-create. Segment member list view. |
| **Agent 3** | Create-from-scratch support: arbitrary filter combinations. Lifecycle chart data aggregation (RFM bucketing). |
| **Agent 4** | Abandoned cart flow wiring: cart_created trigger → BullMQ delayed job → check order_placed → send email with cart data. |

**Checkpoint**: Shopify webhook → event in DB → BullMQ job created.

## Day 5 — Flow Builder + Segment Builder UI

| Owner | Tasks |
|-------|-------|
| **Wahab** | **INTEGRATION MERGE #3**: Agent 4 into backend. Full system test: event → queue → trigger → scheduled job. |
| **Agent 1** | Event queue: publish all events to BullMQ. Polish: error handling, retry, webhook edge cases. |
| **Agent 2** | Segment builder page: visual FilterBuilder (AND/OR, dropdowns, value inputs). Lifecycle chart component (colored grid, hover tooltips). |
| **Agent 3** | Segment re-evaluation on new events. Member count updates. Enter/exit segment event emission. |
| **Agent 4** | E2E test: Shopify cart → webhook → trigger → trip → delay (2 min) → condition → email. Fix timing. |

**Checkpoint**: Cart on Shopify → trip starts → delay scheduled → job pending in queue.

## Day 6 — Flow Canvas UI + Polish

| Owner | Tasks |
|-------|-------|
| **Wahab** | **FULL E2E DEMO REHEARSAL #1**. Log all bugs. Triage: fix P0 only. |
| **Agent 1** | Event debugger API (GET /events/stream, polling or SSE). Polish: response times, caching. |
| **Agent 2** | Flow canvas page: visual nodes (trigger → delay → condition → action → end). Flow list + status. Start/Stop buttons. |
| **Agent 3** | Polish: segment edit, delete with flow warning, inactive toggle. Retention tactics content. |
| **Agent 4** | Exit conditions: order_placed cancels abandoned cart trip + jobs. Duplicate trip prevention. |

**Checkpoint**: Full demo script runs without errors.

## Day 7 — Deploy + Rehearse

| Owner | Tasks |
|-------|-------|
| **Wahab** | **DEMO REHEARSAL #2 + #3**. Deploy to production. Pre-trigger backup email. Final fixes. |
| **Agent 1** | Integration testing on Railway. Verify production webhooks. SSL check. |
| **Agent 2** | Dashboard home (metric cards). Event debugger page. UI polish: loading, empty, error states. |
| **Agent 3** | Verify segment counts on production. Fix filter edge cases. |
| **Agent 4** | Run abandoned cart E2E 3x on production. Verify email delivery. Fix race conditions. |

**Checkpoint**: Same demo works on production URLs.
