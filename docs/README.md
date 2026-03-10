# Storees Documentation Index

## Domain Map

| Domain | Path | Description |
|--------|------|-------------|
| **Data Layer** | `docs/domains/data-layer/` | Database schema, TypeScript types, JSON schemas |
| **UI System** | `docs/domains/ui-system/` | Design system, page specifications, component inventory |
| **Backend** | `docs/domains/backend/` | API routes, event processing pipeline |
| **Integrations** | `docs/domains/integrations/` | Shopify (OAuth, webhooks, sync), Email (Resend) |
| **AI** | `docs/domains/ai/` | AI Segment Builder (NL → FilterConfig), voice input |
| **Segmentation** | `docs/domains/segmentation/` | Filter engine, default templates, lifecycle chart |
| **Flows** | `docs/domains/flows/` | Trigger evaluator, trip state machine, flow templates |
| **Testing** | `docs/domains/testing/` | Integration checkpoints, E2E scenarios, demo script |
| **Sprint** | `docs/sprint/` | Day-by-day schedule, agent assignments |

## Agent Map

| Agent | File | Owns |
|-------|------|------|
| Agent 1 — Backend Core | `.claude/agents/backend.md` | `packages/backend/` |
| Agent 2 — Frontend UI | `.claude/agents/frontend.md` | `packages/frontend/` |
| Agent 3 — Segmentation | `.claude/agents/segments.md` | `packages/segments/` |
| Agent 4 — Flow Engine | `.claude/agents/flows.md` | `packages/flows/` |

## Skill Map

| Skill | File | Invoked As |
|-------|------|-----------|
| Data Layer Rules | `.claude/skills/data-layer-rules.md` | `/data-layer-rules` |
| UI Rules | `.claude/skills/ui-rules.md` | `/ui-rules` |
| Backend Rules | `.claude/skills/backend-rules.md` | `/backend-rules` |
| Segmentation Rules | `.claude/skills/segmentation-rules.md` | `/segmentation-rules` |
| Flow Rules | `.claude/skills/flow-rules.md` | `/flow-rules` |
| Integration Rules | `.claude/skills/integration-rules.md` | `/integration-rules` |

## Reading Order for New Contributors

1. Start with `CLAUDE.md` (root) for project overview and conventions
2. Read `docs/domains/data-layer/SCHEMA.md` for the database foundation
3. Read `docs/domains/data-layer/TYPES.md` for the TypeScript contract
4. Read your agent file in `.claude/agents/` for your specific responsibilities
5. Read the domain docs relevant to your agent
6. Read `docs/sprint/SCHEDULE.md` for what to build each day
