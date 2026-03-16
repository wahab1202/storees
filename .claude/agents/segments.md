# Agent: Segmentation Engine

> **ID**: Agent 3
> **Color**: Green
> **Directory**: `packages/segments/`
> **Consumed by**: Agent 1 (imports service for API routes)

## Responsibilities

1. **Filter Evaluation**: `evaluateFilter()` — translate FilterConfig to SQL WHERE clauses
2. **Segment CRUD**: Create from template, create from scratch, update, delete
3. **Membership Management**: Batch evaluation, member count caching, re-evaluation on events
4. **Lifecycle Chart**: RFM-style bucketing and aggregation
5. **Template Definitions**: 5 default e-commerce segment templates

## Key Documentation

- `docs/domains/segmentation/ENGINE.md` — Filter evaluation logic, SQL translation, re-evaluation rules
- `docs/domains/segmentation/TEMPLATES.md` — 5 default templates with full JSON definitions
- `docs/domains/data-layer/JSON_SCHEMAS.md` — FilterConfig schema, operators, supported fields
- `docs/domains/data-layer/TYPES.md` — All type definitions

## Directory Structure

```
packages/segments/
├── src/
│   ├── index.ts              ← Exported service interface
│   ├── evaluator.ts          ← evaluateFilter(), buildWhereClause(), batchEvaluate()
│   ├── templates.ts          ← Default template definitions (JSON constants)
│   ├── lifecycle.ts          ← getLifecycleChart() — RFM bucketing
│   ├── membership.ts         ← reEvaluateCustomer(), updateMemberCounts()
│   └── types.ts              ← Re-export from shared (convenience)
├── package.json
└── tsconfig.json
```

## Prompt for Claude Code

```
You are building the segmentation engine for Storees as a service module (not a standalone app).

Tech: TypeScript. Read/write PostgreSQL via Drizzle ORM (shared DB connection from packages/backend).

Your directory: packages/segments/

Read these docs:
- docs/domains/segmentation/ENGINE.md (filter evaluation, SQL translation, re-evaluation)
- docs/domains/segmentation/TEMPLATES.md (5 default templates)
- docs/domains/data-layer/JSON_SCHEMAS.md (filter schema, operators, fields)

Export these functions:
1. evaluateFilter(filters: FilterConfig, customer: Customer): boolean
2. getSegmentMembers(segmentId, page?, pageSize?): PaginatedResponse<Customer>
3. createFromTemplate(templateName, projectId): Segment
4. createFromScratch(name, description, filters, projectId): Segment
5. previewCount(filters, projectId): number
6. getLifecycleChart(projectId): LifecycleChartData
7. reEvaluateCustomer(customerId, projectId): void

SQL-first: translate filter rules to WHERE clauses. Fall back to JS only for computed fields.
Import types from packages/shared/types.ts.
```
