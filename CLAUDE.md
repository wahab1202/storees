# Storees — Development Guidelines

## Project Context

Storees is a **Shopify marketing automation platform** — a CDP + segmentation engine + flow builder + multi-channel notification system. This is a 7-day sprint to build a demo-ready product using Claude Code agent swarms.

The goal: connect a live Shopify store, ingest real customer/order data, display it in a professional admin panel, run customer segmentation, and execute an automated abandoned cart email flow end-to-end.

### Documentation (domain-based structure)
- `docs/README.md` — Documentation index with domain map
- `docs/domains/data-layer/` — Database schema (Postgres), TypeScript types, JSON schemas
- `docs/domains/ui-system/` — Design system, page specs, component inventory
- `docs/domains/backend/` — API routes, event processing pipeline
- `docs/domains/integrations/` — Shopify OAuth/webhooks/sync, Resend email
- `docs/domains/segmentation/` — Filter engine, templates, lifecycle chart
- `docs/domains/flows/` — Trigger evaluator, trip state machine, flow templates
- `docs/domains/testing/` — Integration checkpoints, demo script, risk mitigation
- `docs/sprint/` — Day-by-day schedule, agent task assignments

### Agents & Skills
- `.claude/agents/` — 4 domain agents (backend, frontend, segments, flows)
- `.claude/skills/` — 6 domain skills (invocable as `/data-layer-rules`, `/ui-rules`, etc.)
- `.claude/rules/` — Path-specific rules auto-loaded when editing matching files

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query v5
- **Backend**: Node.js + TypeScript + Express (or Hono) + Drizzle ORM
- **Database**: PostgreSQL + Redis (Upstash)
- **Event Queue**: BullMQ (Redis-backed)
- **Email**: Resend API
- **Shopify**: @shopify/shopify-api + Shopify Admin REST/GraphQL API
- **Auth**: NextAuth.js or Clerk (admin panel auth only)
- **Hosting**: Vercel (frontend) + Railway (backend + Postgres + Redis)

### Monorepo Structure
```
storees/
├── packages/
│   ├── shared/          ← ALL AGENTS READ (types.ts, constants.ts, utils.ts)
│   ├── backend/         ← Agent 1 (Express, routes, Shopify, DB, workers)
│   ├── frontend/        ← Agent 2 (Next.js, pages, components, hooks)
│   ├── segments/        ← Agent 3 (evaluator, templates, lifecycle)
│   └── flows/           ← Agent 4 (trigger, executor, scheduler, actions)
├── docs/                ← All documentation
├── .claude/             ← Agent prompts, skills, rules
├── package.json         ← Workspace root
└── turbo.json           ← Turborepo config
```

## Code Conventions

### Naming
- **Components**: `PascalCase.tsx` (`CustomerList.tsx`, `SegmentBuilder.tsx`)
- **Utils/services**: `camelCase.ts` (`shopifyService.ts`, `filterEvaluator.ts`)
- **Hooks**: `useCamelCase.ts` (`useCustomers.ts`, `useSegments.ts`)
- **Types**: `type PascalCase` (use `type` over `interface`, except for React component props)
- **Constants**: `UPPER_SNAKE_CASE` (`STANDARD_EVENTS`, `SEGMENT_TEMPLATES`)
- **Database columns**: `snake_case` in Postgres, `camelCase` in TypeScript — map at boundaries
- **Prices/money**: Always in smallest currency unit as integers (cents/paise), never floats

### Imports
1. React/Next → 2. Third-party → 3. `@/` alias imports → 4. Relative imports
- Use `import type { ... }` for type-only imports
- Use `@/components/ui/*` for shadcn, `@/lib/*` for shared utilities

### Style
- Semantic color tokens from the design system — never hardcode Tailwind colors
- `cn()` utility for conditional class merging
- Co-locate tests: `file.ts` → `file.test.ts`

### API Conventions
- All API responses use `ApiResponse<T>` or `PaginatedResponse<T>` wrapper types
- All error responses include `{ success: false, error: "message" }`
- Pagination: `?page=1&pageSize=25` query params, response includes `pagination` object
- Dates: ISO 8601 strings in API, `Date` objects in TypeScript

### Database Conventions
- All tables have `id` (UUID), `created_at`, `updated_at`
- Multi-tenant: every table has `project_id` column
- JSONB for flexible schemas (filters, properties, line_items, nodes)
- Use Drizzle ORM for type-safe queries
- Migrations in `packages/backend/src/db/migrations/`

## Environment Variables

### Backend (`packages/backend/.env`)
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
RESEND_API_KEY=...
DEMO_DELAY_MINUTES=2          # Set to 30 for production, 2 for demo
APP_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

### Frontend (`packages/frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

## Commit Convention
```
type(scope): brief description

- Detail 1
- Detail 2
```
Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
Scopes: `backend`, `frontend`, `segments`, `flows`, `shared`, `docs`

## Design Context

### Users
Enterprise marketing teams managing customer segments, automated flows, multi-channel campaigns, and engagement analytics. They need sophisticated, reliable tools — not toys.

### Brand Personality
Professional, intelligent, reliable — like MoEngage or HubSpot. Clean, serious, trustworthy.

### Aesthetic Direction
Refined minimalism. Indigo accent (#4F46E5) on soft blue-gray (#F5F6FF). Light mode. Inter font. No decorative elements, no dark-mode-everything, no bouncy animations.

### Design Principles
1. **Information density over decoration** — enterprise users want data, not whitespace
2. **Consistency is trust** — same patterns everywhere
3. **Quiet confidence** — smooth 150-250ms transitions, no flash
4. **Every pixel earns its place** — icons convey meaning, color signals status
5. **Show, don't tell** — data viz over text, inline metrics over modals

See `.impeccable.md` for full design context and token reference.
