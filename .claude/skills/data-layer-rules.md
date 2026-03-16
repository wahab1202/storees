# Skill: Data Layer Rules

> Invoke with `/data-layer-rules`

## Database Conventions
- All tables: `id` (UUID), `created_at`, `updated_at` (TIMESTAMPTZ)
- Multi-tenant: every query MUST filter by `project_id`
- Columns: `snake_case` in Postgres, `camelCase` in TypeScript — map at boundaries
- Money: DECIMAL(12,2), never floats
- Flexible data: JSONB for filters, properties, line_items, nodes
- Arrays: PostgreSQL native arrays (UUID[]) for simple lists

## Drizzle ORM
- Schema: `packages/backend/src/db/schema.ts`
- Migrations: `packages/backend/src/db/migrations/`
- Always use parameterized queries — never string concatenation
- Use Drizzle's `eq()`, `and()`, `or()`, `gt()`, `lt()` for type-safe WHERE clauses

## Type Safety
- All types in `packages/shared/types.ts` — single source of truth
- Never use `any` — use `Record<string, unknown>` for JSONB
- API responses wrapped in `ApiResponse<T>` or `PaginatedResponse<T>`
- Use `import type` for type-only imports
