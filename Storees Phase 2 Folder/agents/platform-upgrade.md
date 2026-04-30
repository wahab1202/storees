# Agent: Platform Upgrade

## Identity
You upgrade the existing Storees platform from a Shopify-specific tool to a vertical-agnostic CDP. You own the Generic Item Catalogue, the Interaction Engine, and the critical segment-triggered flows bug fix.

## Ownership
```
packages/backend/src/
├── db/
│   └── schema.ts              ← You MODIFY (add items + interactions tables)
├── routes/
│   ├── items.ts               ← You BUILD (CRUD for generic items)
│   ├── catalogues.ts          ← You BUILD (catalogue management)
│   └── interactionConfig.ts   ← You BUILD (event→interaction weight mapping CRUD)
├── services/
│   ├── itemService.ts         ← You BUILD
│   ├── catalogueService.ts    ← You BUILD
│   ├── interactionEngine.ts   ← You BUILD (listens to events, writes interactions)
│   └── segmentService.ts      ← You FIX (add enters/exits_segment event emission)

packages/shared/src/
├── types.ts                   ← You MODIFY (add Item, Interaction, Catalogue types)
└── constants.ts               ← You MODIFY (add interaction type constants)
```

## Priority 1: Fix Segment-Triggered Flows (Day 1, ~10 lines)

In `segmentService.evaluateSegment()`, after computing `toAdd` and `toRemove` arrays, add:

```typescript
// After batch updating customer_segments table:

// Emit enters_segment events for newly added members
for (const customerId of toAdd) {
  await eventsQueue.add('segment_event', {
    projectId,
    customerId,
    name: STANDARD_EVENTS.ENTERS_SEGMENT,
    properties: { segmentId, segmentName: segment.name }
  });
}

// Emit exits_segment events for removed members
for (const customerId of toRemove) {
  await eventsQueue.add('segment_event', {
    projectId,
    customerId,
    name: STANDARD_EVENTS.EXITS_SEGMENT,
    properties: { segmentId, segmentName: segment.name }
  });
}
```

This unblocks segment-triggered flows. The constants already exist in `shared/constants.ts`. The flow trigger evaluator already handles these event names. Only the emission was missing.

## Priority 2: Generic Item Catalogue

### Database Schema Additions
```sql
-- catalogues table
CREATE TABLE catalogues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  item_type_label TEXT NOT NULL DEFAULT 'Item',
  attribute_schema JSONB DEFAULT '[]',
  -- attribute_schema: [{name, type, values?, weight?}]
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- items table
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  catalogue_id UUID NOT NULL REFERENCES catalogues(id),
  external_id TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  attributes JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, catalogue_id, external_id)
);

-- interactions table
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  item_id UUID NOT NULL REFERENCES items(id),
  interaction_type TEXT NOT NULL,
  weight FLOAT NOT NULL,
  source_event_id UUID REFERENCES events(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_interactions_customer ON interactions(customer_id);
CREATE INDEX idx_interactions_item ON interactions(item_id);
CREATE INDEX idx_interactions_created ON interactions(created_at);

-- interaction_config table
CREATE TABLE interaction_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  catalogue_id UUID NOT NULL REFERENCES catalogues(id),
  event_name TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  weight FLOAT NOT NULL DEFAULT 1.0,
  decay_half_life_days INT DEFAULT 30,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, catalogue_id, event_name)
);
```

### Shopify Product Migration
Existing Shopify products must be migrated to the generic Items table:
1. Create a default catalogue for each Shopify-connected project: `name="Products", item_type_label="Product"`
2. Copy products to items table: `type="product"`, `attributes={category, brand, price, image_url, ...}`
3. The existing product-related segment filters continue to work — they just query the items table instead

### Item API
- `POST /api/catalogues` — create catalogue with attribute schema
- `GET /api/catalogues` — list catalogues for project
- `POST /api/items` — create item (validates attributes against catalogue schema)
- `GET /api/items?catalogue_id=X` — list items with filtering
- `PUT /api/items/:id` — update item
- `POST /api/items/bulk` — bulk import (CSV or JSON array)

## Priority 3: Interaction Engine

### How It Works
The Interaction Engine is a BullMQ worker that listens to processed events and checks if the event matches any configured interaction mapping for the project.

```typescript
// interactionEngine.ts
export async function processEventForInteractions(event: StoredEvent) {
  const configs = await getInteractionConfigs(event.projectId);
  const mapping = configs.find(c => c.eventName === event.name);
  
  if (!mapping) return; // This event doesn't map to an interaction
  
  // Extract item_id from event properties
  const itemId = event.properties?.item_id || event.itemId;
  if (!itemId) return; // No item associated with this event
  
  // Verify item exists
  const item = await getItem(itemId, event.projectId);
  if (!item) return;
  
  // Write interaction
  await db.insert(interactions).values({
    projectId: event.projectId,
    customerId: event.customerId,
    itemId: item.id,
    interactionType: mapping.interactionType,
    weight: mapping.weight,
    sourceEventId: event.id,
    createdAt: event.createdAt,
  });
}
```

Register this as a step in the existing event processing pipeline (eventProcessor.ts), after identity resolution and event persistence.

## You Do NOT Touch
- The flow execution engine (triggerWorker.ts, flowExecutor.ts, flowWorker.ts)
- The segment evaluation engine (evaluator.ts) — except the bug fix emission
- The Shopify integration (webhooks.ts, shopifyService.ts) — except adding the item migration
- Frontend components — those belong to other agents
- Anything in `packages/ml/`

## Quality Bar
- The segment-triggered flows fix must be deployed first — it's blocking Pinnacle
- Item Catalogue API must handle bulk import of 50,000+ items efficiently (streaming, not load-all-in-memory)
- Interaction Engine must process events without adding >10ms latency to the event pipeline
- All new tables must have `project_id` (multi-tenant)
- All new Drizzle schemas must have proper TypeScript types exported via shared/types.ts
