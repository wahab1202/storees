# Rule: Multi-Tenant

## Applies To
All database queries, all API routes, all services across the entire codebase.

## The Rule
Storees is multi-tenant. Every table has a `project_id` column. Every query MUST filter by `project_id`. Tenant data must NEVER leak across projects.

## Enforcement
```typescript
// ❌ WRONG — missing project_id filter
const customers = await db.select().from(customers);

// ❌ WRONG — project_id from user input without validation
const customers = await db.select().from(customers).where(eq(customers.projectId, req.body.projectId));

// ✅ CORRECT — project_id from authenticated session
const projectId = req.auth.projectId; // Set by auth middleware
const customers = await db.select().from(customers).where(eq(customers.projectId, projectId));
```

## New Tables
Every new table MUST include:
```sql
project_id UUID NOT NULL REFERENCES projects(id)
```
With an index:
```sql
CREATE INDEX idx_<table>_project ON <table>(project_id);
```

## API Routes
Every API route handler MUST extract `projectId` from the authenticated session, never from request body or query parameters:
```typescript
router.get('/api/items', auth, async (req, res) => {
  const projectId = req.auth.projectId; // From auth middleware
  const items = await itemService.list(projectId);
  // ...
});
```

## ML Engine
ML models are trained per-tenant. The `prepare.py` script takes `--tenant_id` parameter. Model artifacts are stored in `models/<model_name>/<tenant_id>/latest/`. Redis cache keys include project_id: `reco:<project_id>:user:<user_id>`.
