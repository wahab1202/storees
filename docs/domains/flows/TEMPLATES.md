# Flows — Templates

> Pre-built flow templates that users can create with one click. The template pre-fills trigger config, nodes, and a default email template.

## Template 1: Abandoned Cart Recovery

**Trigger**: `cart_created`
**Exit**: `order_placed`
**Channel**: Email

### Full Flow Definition
```json
{
  "name": "Abandoned Cart Recovery",
  "description": "Send recovery email when a customer adds to cart but doesn't checkout",
  "trigger_config": {
    "event": "cart_created",
    "filters": {
      "logic": "AND",
      "rules": [{ "field": "properties.cart_value", "operator": "greater_than", "value": 0 }]
    },
    "inactivity_time": { "value": 30, "unit": "minutes" }
  },
  "exit_config": {
    "event": "order_placed",
    "scope": "any"
  },
  "nodes": [
    { "id": "trigger", "type": "trigger" },
    { "id": "delay_30m", "type": "delay", "config": { "value": 30, "unit": "minutes" } },
    { "id": "check_ordered", "type": "condition", "config": {
        "check": "event_occurred", "event": "order_placed",
        "since": "trip_start", "branches": { "yes": "end_converted", "no": "send_email" }
    }},
    { "id": "send_email", "type": "action", "config": {
        "actionType": "send_email", "templateId": "abandoned_cart_default",
        "dynamicData": ["cart_items", "customer_name", "checkout_url"]
    }},
    { "id": "end_converted", "type": "end", "label": "Converted" },
    { "id": "end_sent", "type": "end", "label": "Email Sent" }
  ]
}
```

### Associated Email Template
- **Template ID**: `abandoned_cart_default`
- **Subject**: `{{customer_name}}, you left something behind!`
- **Body**: See `docs/domains/integrations/EMAIL.md` for full HTML

### Demo Configuration
- Set env `DEMO_DELAY_MINUTES=2` to override the 30-minute delay
- The condition check still runs — it checks if `order_placed` event exists since trip start

---

## Template 2: Post-Purchase Review Request

**Trigger**: `order_fulfilled`
**Exit**: `review_submitted`
**Channel**: Email

### Full Flow Definition
```json
{
  "name": "Post-Purchase Review Request",
  "description": "Ask customers to review their purchase after order is delivered",
  "trigger_config": {
    "event": "order_fulfilled",
    "filters": null,
    "inactivity_time": null
  },
  "exit_config": {
    "event": "review_submitted",
    "scope": "any"
  },
  "nodes": [
    { "id": "trigger", "type": "trigger" },
    { "id": "delay_3d", "type": "delay", "config": { "value": 3, "unit": "days" } },
    { "id": "check_reviewed", "type": "condition", "config": {
        "check": "event_occurred", "event": "review_submitted",
        "since": "trip_start", "branches": { "yes": "end_reviewed", "no": "send_email" }
    }},
    { "id": "send_email", "type": "action", "config": {
        "actionType": "send_email", "templateId": "review_request_default",
        "dynamicData": ["customer_name", "order_items", "review_url"]
    }},
    { "id": "end_reviewed", "type": "end", "label": "Already Reviewed" },
    { "id": "end_sent", "type": "end", "label": "Review Request Sent" }
  ]
}
```

### Associated Email Template
- **Template ID**: `review_request_default`
- **Subject**: `How was your order, {{customer_name}}?`
- **Body**: Simple email thanking customer, showing ordered items, CTA button to leave a review

---

## Template Creation Flow

When user clicks "Create from Template" in the UI:

1. `POST /api/flows/from-template` with `{ templateName: "abandoned_cart", projectId }`
2. Backend loads template definition (above JSON)
3. Creates the associated email template if it doesn't exist
4. Creates the flow with `status = 'draft'`
5. Returns the created flow
6. Frontend redirects to flow canvas for the user to review and activate
