# Data Layer — JSON Schemas

> These schemas define the structure of JSONB columns across the database. They are the contract between the segmentation engine, flow engine, and the UI builders.

## 1. Filter Schema

**Used in**: `segments.filters`, `flows.trigger_config.filters`, `flows.trigger_config.audience_filter`

```json
{
  "logic": "AND",
  "rules": [
    { "field": "total_orders", "operator": "greater_than", "value": 5 },
    { "field": "total_spent", "operator": "greater_than", "value": 10000 },
    { "field": "days_since_last_order", "operator": "less_than", "value": 30 }
  ]
}
```

### Supported Fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `total_orders` | integer | `customers.total_orders` | Direct column |
| `total_spent` | decimal | `customers.total_spent` | Direct column |
| `avg_order_value` | decimal | `customers.avg_order_value` | Direct column |
| `clv` | decimal | `customers.clv` | Direct column |
| `days_since_last_order` | integer | Computed | `EXTRACT(DAY FROM now() - last_order_date)` |
| `days_since_first_seen` | integer | Computed | `EXTRACT(DAY FROM now() - first_seen)` |
| `email_subscribed` | boolean | `customers.email_subscribed` | Direct column |
| `sms_subscribed` | boolean | `customers.sms_subscribed` | Direct column |
| `product_category_purchased` | string | Computed | Requires JOIN on orders.line_items |
| `has_discount_orders` | boolean | Computed | `EXISTS orders WHERE discount > 0` |
| `discount_order_percentage` | decimal | Computed | `(discount orders / total orders) * 100` |
| `product_views_count` | integer | Computed | `COUNT events WHERE event_name = 'product_viewed'` |

### Supported Operators

| Operator | Applies To | SQL Equivalent |
|----------|-----------|----------------|
| `is` | all types | `= value` |
| `is_not` | all types | `!= value` |
| `greater_than` | numeric | `> value` |
| `less_than` | numeric | `< value` |
| `between` | numeric | `BETWEEN value[0] AND value[1]` |
| `contains` | string | `ILIKE '%value%'` |
| `begins_with` | string | `ILIKE 'value%'` |
| `ends_with` | string | `ILIKE '%value'` |
| `is_true` | boolean | `= true` |
| `is_false` | boolean | `= false` |

---

## 2. Trigger Config Schema

**Used in**: `flows.trigger_config`

```json
{
  "event": "cart_created",
  "filters": {
    "logic": "AND",
    "rules": [
      { "field": "properties.cart_value", "operator": "greater_than", "value": 500 }
    ]
  },
  "audience_filter": {
    "logic": "AND",
    "rules": [
      { "field": "segment", "operator": "is", "value": ["segment_uuid_1"] }
    ]
  },
  "inactivity_time": {
    "value": 30,
    "unit": "minutes"
  }
}
```

### Trigger Event Values (Phase 1)

| Event | Source | Description |
|-------|--------|-------------|
| `product_viewed` | JS SDK / Shopify | Customer viewed a product page |
| `product_added_to_cart` | Shopify webhook | Product added to cart |
| `cart_created` | Shopify webhook | New cart created |
| `checkout_started` | Shopify webhook | Checkout initiated |
| `order_placed` | Shopify webhook | Order completed |
| `order_fulfilled` | Shopify webhook | Order shipped/fulfilled |
| `order_cancelled` | Shopify webhook | Order cancelled |
| `customer_created` | Shopify webhook | New customer registered |
| `enters_segment` | Segment engine | Customer entered a segment |
| `exits_segment` | Segment engine | Customer exited a segment |
| `review_submitted` | Server API | Customer submitted a review |

### Trigger Filter Fields

When `event` is product/cart/order related, filter `field` values use dot notation into the event's `properties` JSONB:

- `properties.product_id` — is / is_not (multi-select)
- `properties.category_id` — is / is_not (multi-select)
- `properties.product_name` — is / contains / begins_with / ends_with
- `properties.price` — is / greater_than / less_than / between
- `properties.cart_value` — is / greater_than / less_than / between
- `properties.cart_quantity` — is / greater_than / less_than / between
- `properties.purchased_quantity` — is / greater_than / less_than / between
- `properties.rating` — is / greater_than / less_than / between

### Audience Filter Fields

- `segment` — is (multi-select segment IDs)
- `customer_id` — is (direct customer ID input)
- `location` — is / is_not
- `gender` — is / is_not
- `age` — is / greater_than / less_than / between

---

## 3. Exit Config Schema

**Used in**: `flows.exit_config`

```json
{
  "event": "order_placed",
  "scope": "any"
}
```

### Default Exit Conditions by Trigger

| Trigger Event | Default Exit Event | Logic |
|---------------|-------------------|-------|
| `product_viewed` | `product_added_to_cart` | Product was added to cart — viewing flow stops |
| `cart_created` | `order_placed` | Customer purchased — cart recovery stops |
| `product_added_to_cart` | `order_fulfilled` | Order completed — abandoned cart stops |
| `order_fulfilled` | `review_submitted` | Review received — feedback request stops |
| `enters_segment` | — | No default exit (manual only) |
| `review_submitted` | — | No default exit |

---

## 4. Flow Node Schema

**Used in**: `flows.nodes` (JSONB array)

```json
[
  { "id": "trigger", "type": "trigger" },
  { "id": "delay_30m", "type": "delay", "config": { "value": 30, "unit": "minutes" } },
  { "id": "check_ordered", "type": "condition", "config": {
      "check": "event_occurred", "event": "order_placed",
      "since": "trip_start", "branches": { "yes": "end_converted", "no": "send_email" }
  }},
  { "id": "send_email", "type": "action", "config": {
      "actionType": "send_email", "templateId": "abandoned_cart_email",
      "dynamicData": ["cart_items", "customer_name", "checkout_url"]
  }},
  { "id": "end_converted", "type": "end", "label": "Converted" },
  { "id": "end_sent", "type": "end", "label": "Email Sent" }
]
```

### Node Types

| Type | Purpose | Config Shape |
|------|---------|-------------|
| `trigger` | Entry point (one per flow) | Optional `TriggerConfig` (usually set at flow level) |
| `delay` | Pause execution | `{ value: number, unit: 'minutes' \| 'hours' \| 'days' }` |
| `condition` | Yes/No branch | `{ check, event?, field?, operator?, value?, since, branches: { yes, no } }` |
| `action` | Execute something | `{ actionType, templateId, subjectOverride?, dynamicData? }` |
| `end` | Terminate trip | `{ label? }` |

### Node Execution Flow

```
trigger → delay → condition → [yes branch] → end
                            → [no branch]  → action → end
```

Nodes reference each other by `id`. The `condition.config.branches.yes` and `.no` values point to the `id` of the next node to execute.
