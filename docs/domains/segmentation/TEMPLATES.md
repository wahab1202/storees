# Segmentation — Default Templates

> Pre-loaded when project `business_type = 'ecommerce'`. Created via `POST /api/segments/from-template`.

## Template Definitions

### 1. Champion Customers
```json
{
  "name": "Champion Customers",
  "type": "default",
  "description": "Highest value customers — ordered recently, frequently, and spent the most.",
  "filters": {
    "logic": "AND",
    "rules": [
      { "field": "total_orders", "operator": "greater_than", "value": 5 },
      { "field": "total_spent", "operator": "greater_than", "value": 10000 },
      { "field": "days_since_last_order", "operator": "less_than", "value": 30 }
    ]
  }
}
```

### 2. Loyal Customers
```json
{
  "name": "Loyal Customers",
  "type": "default",
  "description": "Regular buyers with consistent purchase patterns.",
  "filters": {
    "logic": "AND",
    "rules": [
      { "field": "total_orders", "operator": "greater_than", "value": 3 },
      { "field": "days_since_last_order", "operator": "less_than", "value": 60 }
    ]
  }
}
```

### 3. Discount Shoppers
```json
{
  "name": "Discount Shoppers",
  "type": "default",
  "description": "Customers who predominantly buy during sales or with coupons.",
  "filters": {
    "logic": "AND",
    "rules": [
      { "field": "discount_order_percentage", "operator": "greater_than", "value": 50 },
      { "field": "total_orders", "operator": "greater_than", "value": 2 }
    ]
  }
}
```

### 4. Window Shoppers
```json
{
  "name": "Window Shoppers",
  "type": "default",
  "description": "High browsing activity but no purchases.",
  "filters": {
    "logic": "AND",
    "rules": [
      { "field": "total_orders", "operator": "is", "value": 0 },
      { "field": "days_since_first_seen", "operator": "greater_than", "value": 7 }
    ]
  }
}
```

### 5. Researchers
```json
{
  "name": "Researchers",
  "type": "default",
  "description": "Frequent product viewers with very few purchases.",
  "filters": {
    "logic": "AND",
    "rules": [
      { "field": "total_orders", "operator": "less_than", "value": 2 },
      { "field": "product_views_count", "operator": "greater_than", "value": 10 }
    ]
  }
}
```

## Rules for Default Segments
- `type = 'default'` segments CANNOT be deleted, only deactivated via `is_active = false`
- Filters CAN be customized after creation (user may adjust thresholds)
- If a default template segment already exists for the project, creating it again should return an error `TEMPLATE_ALREADY_EXISTS`
