# Agent: Backend Core

> **ID**: Agent 1
> **Color**: Red
> **Directory**: `packages/backend/`
> **Consumes**: `packages/shared/`, `packages/segments/` (service import), `packages/flows/` (service import)
> **Publishes**: REST API, BullMQ events queue

## Responsibilities

1. **Database**: Schema definition, Drizzle ORM setup, migrations
2. **Shopify Integration**: OAuth flow, webhook receiver + HMAC verification, historical data sync
3. **Event Processing**: Normalize Shopify webhooks → standard TrackedEvent → persist to DB → publish to BullMQ
4. **REST API**: All routes consumed by the frontend (customers, segments, flows, dashboard, events)
5. **API Contract**: Define TypeScript interfaces in `packages/shared/types.ts`

## What You Do NOT Build

- Frontend UI (Agent 2)
- Segment filter evaluation logic (Agent 3 — you import their service)
- Flow trigger/execution logic (Agent 4 — you import their service)

## Key Documentation

- `docs/domains/data-layer/SCHEMA.md` — All table definitions
- `docs/domains/data-layer/TYPES.md` — TypeScript types contract
- `docs/domains/backend/API_ROUTES.md` — All API endpoints
- `docs/domains/backend/EVENT_PIPELINE.md` — Event processing architecture
- `docs/domains/integrations/SHOPIFY.md` — OAuth, webhooks, sync

## Directory Structure

```
packages/backend/
├── src/
│   ├── index.ts              ← Express app entry, middleware, route mounting
│   ├── routes/
│   │   ├── customers.ts      ← GET /customers, GET /customers/:id, etc.
│   │   ├── segments.ts       ← All segment routes (calls segmentService)
│   │   ├── flows.ts          ← All flow routes (calls flowService)
│   │   ├── integrations.ts   ← Shopify OAuth install/callback/status/sync
│   │   ├── webhooks.ts       ← POST /webhooks/shopify/:projectId
│   │   ├── dashboard.ts      ← GET /dashboard/metrics
│   │   └── events.ts         ← GET /events/stream
│   ├── services/
│   │   ├── shopifyService.ts ← OAuth, API calls, webhook verification
│   │   ├── eventProcessor.ts ← Normalize → validate → resolve identity → persist → publish
│   │   └── syncService.ts    ← Historical customer + order sync
│   ├── db/
│   │   ├── schema.ts         ← Drizzle schema definitions
│   │   ├── migrations/       ← SQL migration files
│   │   ├── client.ts         ← Drizzle client initialization
│   │   └── queries/          ← Reusable query functions
│   ├── workers/
│   │   ├── syncWorker.ts     ← BullMQ worker for historical sync
│   │   └── eventWorker.ts    ← BullMQ worker that fans out to segment + flow evaluation
│   └── middleware/
│       ├── auth.ts           ← Session/token verification
│       └── errorHandler.ts   ← Global error handler
├── package.json
└── tsconfig.json
```

## Prompt for Claude Code

```
You are building the backend for Storees, a Shopify marketing automation platform. This is a 7-day sprint for a demo-ready product.

Tech: Node.js + TypeScript + Express + PostgreSQL (Drizzle ORM) + Redis (ioredis) + BullMQ.

Your directory: packages/backend/

Read these docs before starting:
- docs/domains/data-layer/SCHEMA.md (database tables)
- docs/domains/data-layer/TYPES.md (TypeScript types — import from packages/shared/)
- docs/domains/backend/API_ROUTES.md (all endpoints to implement)
- docs/domains/backend/EVENT_PIPELINE.md (event processing architecture)
- docs/domains/integrations/SHOPIFY.md (OAuth, webhooks, sync)

Rules:
- Import ALL types from packages/shared/types.ts. Never create duplicate type definitions.
- All API responses use ApiResponse<T> or PaginatedResponse<T> wrappers.
- All database queries filter by project_id (multi-tenant).
- Webhook routes use raw body parser for HMAC verification.
- Historical sync events have platform = 'historical_sync' and must NOT be published to BullMQ.
- Use console.log for debugging. Add TODO comments for future cleanup.
- Prioritize working code over perfect code.
```
