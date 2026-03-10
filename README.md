# Storees

Shopify marketing automation platform — CDP + segmentation engine + flow builder + multi-channel notifications.

## Architecture

```
storees/
├── packages/
│   ├── shared/      # Types, constants, utilities (all packages depend on this)
│   ├── backend/     # Express API, Drizzle ORM, BullMQ workers, Shopify integration
│   ├── frontend/    # Next.js 14 admin panel (App Router + Tailwind + TanStack Query)
│   ├── segments/    # SQL-first filter evaluation engine
│   └── flows/       # Trigger evaluator, trip state machine, flow templates
├── docs/            # Domain-based documentation
└── turbo.json       # Turborepo config
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, TanStack Query v5, React Flow |
| Backend | Express, TypeScript, Drizzle ORM |
| Database | PostgreSQL |
| Queue | BullMQ (Redis-backed) |
| Email | Resend API |
| Shopify | @shopify/shopify-api (OAuth + webhooks) |

## Prerequisites

- Node.js >= 20
- PostgreSQL
- Redis

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

**Backend** (`packages/backend/.env`):

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/storees
REDIS_URL=redis://localhost:6379
SHOPIFY_API_KEY=your_key
SHOPIFY_API_SECRET=your_secret
RESEND_API_KEY=re_xxx
DEMO_DELAY_MINUTES=2
APP_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

**Frontend** (`packages/frontend/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_PROJECT_ID=<from seed script output>
```

### 3. Initialize database

```bash
cd packages/backend
npm run db:migrate
```

### 4. Seed demo data

Creates a project with 20 customers, 40+ orders, 80+ events, segments, and an abandoned cart flow — no Shopify required.

```bash
cd packages/backend
npm run seed
```

Copy the project ID from the output into `packages/frontend/.env.local`.

### 5. Start development

```bash
# From root — starts backend (3001) + frontend (3000)
npm run dev
```

Or individually:

```bash
cd packages/backend && npm run dev   # http://localhost:3001
cd packages/frontend && npm run dev  # http://localhost:3000
```

## Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Metric cards (customers, orders, revenue, CLV) + activity feed |
| `/customers` | Searchable, sortable table with expandable detail rows |
| `/segments` | Segment cards with member counts, re-evaluate button |
| `/flows` | Flow list with status controls, links to visual builder |
| `/flows/[id]` | Drag-and-drop flow builder (React Flow) with node config panel |
| `/debugger` | Live event stream with auto-refresh |
| `/integrations` | Shopify connection status |
| `/settings` | Project configuration |

## Key Features

- **Customer CDP**: Identity resolution, aggregate metrics, segment membership
- **Segmentation Engine**: SQL-first evaluation with nested boolean groups, product purchase filters, date/frequency filters
- **Flow Builder**: Visual drag-and-drop canvas with trigger, delay, condition, and multi-channel action nodes
- **Exit Conditions**: Flow-level exit events (e.g., order_placed exits abandoned cart flow)
- **Multi-Channel Actions**: Email, SMS, Push, WhatsApp action nodes
- **Shopify Integration**: OAuth install, webhook ingestion, historical sync
- **Event Pipeline**: normalize → validate → resolve → enrich → persist → publish

## Shopify Integration (Live Store)

To connect a real Shopify store instead of using seed data:

1. Set `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` in backend `.env`
2. Visit `http://localhost:3001/api/integrations/install?shop=yourstore.myshopify.com`
3. Complete OAuth — webhooks auto-register, historical sync starts
4. Default segments + flows are created automatically

## Typecheck

```bash
npm run typecheck  # All packages via Turborepo
```
