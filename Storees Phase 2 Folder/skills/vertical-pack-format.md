# Skill: Vertical Pack Format

## When to Use
Invoke this skill when creating, editing, or activating Vertical Packs.

## Pack JSON Structure

### Required Top-Level Keys
```json
{
  "id": "string",              // Unique pack identifier (lowercase, no spaces)
  "name": "string",            // Display name
  "icon": "string",            // Emoji icon
  "description": "string",     // One-line description
  "catalogue": { ... },        // Item catalogue schema + defaults
  "interaction_config": [...], // Event-to-interaction weight mappings
  "prediction_goals": [...],   // AI prediction goal configurations
  "segment_templates": [...],  // Pre-built segment filter definitions
  "flow_templates": [...],     // Pre-built journey skeletons
  "dashboard_templates": [...],// Pre-built analytics dashboard layouts
  "wizard_questions": { ... }  // Onboarding wizard question overrides
}
```

### Catalogue Section
```json
"catalogue": {
  "name": "Products",                    // Catalogue display name
  "item_type_label": "Product",          // What one item is called
  "attribute_schema": [
    {
      "name": "category",                // Attribute key
      "type": "select",                  // "select", "number", "text", "boolean"
      "values": ["Electronics", "Fashion"],  // For select type only
      "weight": 0.25                     // Weight for attribute-based recommendation (0.0-1.0, sum should ≈ 1.0)
    }
  ],
  "default_items": [                     // Items auto-created on pack activation
    {
      "name": "Gold Loan",
      "type": "loan_product",
      "attributes": { "category": "Secured", "interest_min": 9 }
    }
  ]
}
```

### Interaction Config Section
```json
"interaction_config": [
  {
    "event_name": "product_viewed",      // Event name to match
    "interaction_type": "view",          // "view", "engage", "intent", "strong_intent", "conversion"
    "weight": 1.0,                       // Interaction weight for recommendation engine
    "decay_half_life_days": 30           // How fast this interaction loses influence
  }
]
```
The Interaction Engine uses this mapping: when an event matches `event_name`, it creates an Interaction record with the specified `type` and `weight`.

### Prediction Goals Section
```json
"prediction_goals": [
  {
    "name": "Propensity to Purchase",
    "target_event": "order_completed",
    "observation_window_days": 30,
    "prediction_window_days": 7,
    "min_positive_labels": 200,
    "priority": 1,                       // Priority rank from wizard
    "default_status": "active"           // "active" or "paused"
  }
]
```
Top 2-3 by priority are created as "active". Rest are "paused" with status "insufficient_data" until they accumulate enough labels.

### Segment Templates Section
```json
"segment_templates": [
  {
    "name": "Cart Abandoners",
    "description": "Added to cart in last 24h but didn't purchase",
    "icon": "🛒",
    "filter": {
      "operator": "and",
      "conditions": [
        {
          "type": "event",
          "event": "added_to_cart",
          "timeframe": { "type": "relative", "value": 24, "unit": "hours" },
          "count": { "operator": "gte", "value": 1 }
        },
        {
          "type": "not_event",
          "event": "order_completed",
          "timeframe": { "type": "relative", "value": 24, "unit": "hours" }
        }
      ]
    }
  }
]
```
Filters use the same `FilterConfig` schema that the existing segment builder uses. Templates are inserted as segments with `is_template: true` flag.

### Flow Templates Section
```json
"flow_templates": [
  {
    "name": "Abandoned Cart Recovery",
    "description": "Multi-channel reminder for incomplete purchases",
    "category": "retention",              // For gallery filtering
    "channels": ["whatsapp", "sms"],      // Which channels the template uses
    "nodes": [...],                        // Full flow node definitions
    "edges": [...]                         // Full flow edge definitions
  }
]
```

### Dashboard Templates Section
```json
"dashboard_templates": [
  {
    "name": "Revenue Overview",
    "type": "grid",
    "cards": [
      {
        "title": "Total Revenue",
        "type": "big_number",
        "metric": { "event": "order_completed", "property": "amount", "aggregation": "sum" },
        "position": { "col": 0, "row": 0, "width": 3, "height": 1 }
      },
      {
        "title": "Revenue Trend",
        "type": "line_chart",
        "metric": { "event": "order_completed", "property": "amount", "aggregation": "sum", "group_by": "day" },
        "position": { "col": 3, "row": 0, "width": 9, "height": 2 }
      }
    ]
  }
]
```

## Pack Activation Logic

When `verticalPackService.activate(projectId, packId, wizardAnswers)` is called:

```typescript
async function activatePack(projectId: string, packId: string, answers: WizardAnswers) {
  const pack = loadPack(packId);
  
  // 1. Create catalogue
  const catalogue = await catalogueService.create({
    projectId,
    name: pack.catalogue.name,
    itemTypeLabel: pack.catalogue.item_type_label,
    attributeSchema: pack.catalogue.attribute_schema
  });
  
  // 2. Create items from wizard answers (user-selected products)
  // The wizard answers override the pack's default_items
  for (const item of answers.selectedProducts) {
    await itemService.create({ projectId, catalogueId: catalogue.id, ...item });
  }
  
  // 3. Insert interaction configs
  for (const config of pack.interaction_config) {
    await interactionConfigService.create({ projectId, catalogueId: catalogue.id, ...config });
  }
  
  // 4. Create prediction goals (top 2-3 from wizard ranking)
  const topGoals = answers.rankedPriorities.slice(0, 3);
  for (const goalDef of pack.prediction_goals) {
    const isActive = topGoals.some(p => p.maps_to === goalDef.name);
    await predictionGoalService.create({
      projectId,
      ...goalDef,
      status: isActive ? 'active' : 'paused'
    });
  }
  
  // 5. Insert segment templates
  for (const template of pack.segment_templates) {
    await segmentService.createFromTemplate({ projectId, ...template });
  }
  
  // 6. Insert flow templates
  for (const template of pack.flow_templates) {
    await flowService.createFromTemplate({ projectId, ...template, status: 'draft' });
  }
  
  // 7. Insert dashboard templates
  for (const template of pack.dashboard_templates) {
    await dashboardService.createFromTemplate({ projectId, ...template });
  }
  
  // 8. Mark project vertical
  await projectService.update(projectId, { vertical: packId });
}
```

## Idempotency
Pack activation must be idempotent. Running it twice should not create duplicate segments, flows, or dashboards. Use `UPSERT` or check for existing records by name + project_id.

## Pack Deactivation
Removing a pack should delete pack-generated templates but NOT user-created content. Pack-generated items have an `origin: 'pack'` flag. User-created items have `origin: 'user'`.
