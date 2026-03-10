# STOREES — 7-Day Sprint Requirements

> **Internal Document — WAIOZ**
> **Sprint Start:** Week of March 10, 2026
> **Sprint Owner:** Wahab
> **Purpose:** Build a demo-ready Shopify marketing automation platform using Claude Code agent swarms

---

## 1. Sprint Objective

Build a functional, demo-ready marketing automation admin panel called **Storees** that connects to a live Shopify store, ingests real customer and order data, displays it in a professional CDP interface, runs basic customer segmentation, and executes at least one automated email flow triggered by a Shopify event.

> **This is not a mockup.** It must work with real Shopify data, real customer profiles, and send a real email when triggered.

### 1.1 What "Demo-Ready" Means

The demo must survive a 30-minute live walkthrough where you:

1. Connect a Shopify dev store in front of the client (OAuth flow, webhook setup)
2. Show real customers populating in the admin panel within seconds
3. Click into a customer profile and see their order history, activity, and subscription status
4. Create a segment using the visual filter builder (e.g., "customers who ordered in last 30 days")
5. Show the lifecycle stage chart with real segment distribution
6. Set up an abandoned cart flow — trigger: product added to cart + 30 min inactivity → send email
7. Trigger it live by adding a product to cart on the Shopify store, wait, and show the email arriving

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui | Fast to build, SSR for admin panel, shadcn gives production-grade UI components instantly |
| **Backend API** | Node.js (Express or Hono) + TypeScript | Shopify SDK is Node-native. TypeScript gives Claude Code better autocomplete and fewer bugs |
| **Database** | PostgreSQL + Redis (Upstash) | Postgres for profiles, orders, segments. Redis for event queue, session cache, real-time segment evaluation |
| **Event Queue** | BullMQ (Redis-backed) | Production-grade job queue for event processing, flow execution, delayed triggers. No Kafka overhead for demo |
| **Email** | Resend (or SMTP) | Resend has a generous free tier, excellent API, and works in 5 minutes |
| **Shopify** | @shopify/shopify-api + Shopify Admin REST/GraphQL API | Official SDK. Handles OAuth, webhooks, rate limiting |
| **Auth** | NextAuth.js or Clerk | Admin panel login. Not Shopify customer auth — this is for the Storees admin user |

---

## 3. Core Database Schema

### 3.1 Table: `projects`

Multi-tenant: each Shopify store is a project.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| name | VARCHAR | Project/store name |
| shopify_domain | VARCHAR | e.g., `mystore.myshopify.com` |
| shopify_access_token | VARCHAR (encrypted) | OAuth access token |
| business_type | ENUM | `ecommerce`, `booking`, `saas`, `general` |
| webhook_secret | VARCHAR | For verifying Shopify webhooks |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 3.2 Table: `customers`

Unified customer profile. CLV calculated from orders.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| project_id | UUID | FK → projects |
| external_id | VARCHAR | Shopify customer ID |
| email | VARCHAR | |
| phone | VARCHAR | |
| name | VARCHAR | |
| first_seen | TIMESTAMP | First interaction |
| last_seen | TIMESTAMP | Last interaction |
| total_orders | INTEGER | Running count |
| total_spent | DECIMAL | Running total |
| avg_order_value | DECIMAL | Calculated |
| clv | DECIMAL | Customer lifetime value |
| email_subscribed | BOOLEAN | |
| sms_subscribed | BOOLEAN | |
| push_subscribed | BOOLEAN | |
| whatsapp_subscribed | BOOLEAN | |
| segment_ids | UUID[] | Array of segment memberships |
| custom_attributes | JSONB | Flexible key-value store |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 3.3 Table: `orders`

Order history for customer detail view.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| project_id | UUID | FK → projects |
| customer_id | UUID | FK → customers |
| external_order_id | VARCHAR | Shopify order ID |
| status | ENUM | `pending`, `fulfilled`, `cancelled`, `refunded` |
| total | DECIMAL | Order total |
| discount | DECIMAL | Discount applied |
| currency | VARCHAR | e.g., `INR`, `USD` |
| line_items | JSONB | Array of {product_id, product_name, quantity, price, image_url} |
| created_at | TIMESTAMP | Order date |
| fulfilled_at | TIMESTAMP | Fulfilment date |

### 3.4 Table: `events`

All tracked events. Powers analytics and flow triggers.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| project_id | UUID | FK → projects |
| customer_id | UUID | FK → customers (nullable for anonymous) |
| event_name | VARCHAR | e.g., `product_viewed`, `checkout_started` |
| properties | JSONB | Event-specific data |
| platform | VARCHAR | `web`, `mobile`, `server`, `shopify_webhook` |
| session_id | VARCHAR | For session grouping |
| timestamp | TIMESTAMP | When the event occurred |
| received_at | TIMESTAMP | When the system received it |

**Index**: `(project_id, event_name, timestamp)` for flow trigger queries.
**Index**: `(project_id, customer_id, timestamp)` for customer activity timeline.

### 3.5 Table: `segments`

Segment definitions. Filters stored as structured JSON.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| project_id | UUID | FK → projects |
| name | VARCHAR | Segment name |
| type | ENUM | `default`, `custom` |
| description | TEXT | |
| filters | JSONB | Filter configuration (see Filter Schema below) |
| member_count | INTEGER | Cached count, updated on evaluation |
| is_active | BOOLEAN | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 3.6 Table: `flows`

Flow definitions with trigger + node graph.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| project_id | UUID | FK → projects |
| name | VARCHAR | Flow name |
| description | TEXT | |
| trigger_config | JSONB | Trigger type, filters, inactivity time (see Trigger Schema below) |
| exit_config | JSONB | Exit conditions |
| nodes | JSONB | Array of flow nodes in order (see Node Schema below) |
| status | ENUM | `draft`, `active`, `paused` |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 3.7 Table: `flow_trips`

Tracks each customer's journey through a flow.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| flow_id | UUID | FK → flows |
| customer_id | UUID | FK → customers |
| status | ENUM | `active`, `waiting`, `completed`, `exited` |
| current_node_id | VARCHAR | Which node the customer is currently at |
| context | JSONB | Data from the triggering event (cart items, product info, etc.) |
| entered_at | TIMESTAMP | |
| exited_at | TIMESTAMP | |

### 3.8 Table: `scheduled_jobs`

Delayed actions (e.g., send email after 30 min).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| flow_trip_id | UUID | FK → flow_trips |
| execute_at | TIMESTAMP | When to execute |
| action | JSONB | What to do (send email, check condition, etc.) |
| status | ENUM | `pending`, `executed`, `cancelled` |
| created_at | TIMESTAMP | |

### 3.9 Table: `email_templates`

Email templates for flow actions.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| project_id | UUID | FK → projects |
| name | VARCHAR | Template name |
| subject | VARCHAR | Email subject (supports {{variables}}) |
| html_body | TEXT | HTML content (supports {{variables}}) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

---

## 4. JSON Schemas

### 4.1 Filter Schema (for Segments)

```json
{
  "logic": "AND",
  "rules": [
    {
      "field": "total_orders",
      "operator": "greater_than",
      "value": 5
    },
    {
      "field": "total_spent",
      "operator": "greater_than",
      "value": 10000
    },
    {
      "field": "days_since_last_order",
      "operator": "less_than",
      "value": 30
    }
  ]
}
```

**Supported fields:**
- `total_orders` — integer
- `total_spent` — decimal
- `avg_order_value` — decimal
- `clv` — decimal
- `days_since_last_order` — integer (computed from last order date)
- `days_since_first_order` — integer
- `email_subscribed` — boolean
- `sms_subscribed` — boolean
- `product_category_purchased` — string (checks order line items)
- `has_discount_orders` — boolean
- `discount_order_percentage` — decimal (% of orders with discounts)

**Supported operators:**
- `is`, `is_not` — exact match
- `greater_than`, `less_than`, `between` — numeric comparison
- `contains`, `begins_with`, `ends_with` — string matching
- `is_true`, `is_false` — boolean

### 4.2 Trigger Config Schema (for Flows)

```json
{
  "event": "cart_created",
  "filters": {
    "logic": "AND",
    "rules": [
      {
        "field": "properties.cart_value",
        "operator": "greater_than",
        "value": 500
      }
    ]
  },
  "audience_filter": {
    "logic": "AND",
    "rules": [
      {
        "field": "segment",
        "operator": "is",
        "value": ["segment_uuid_1", "segment_uuid_2"]
      }
    ]
  },
  "inactivity_time": {
    "value": 30,
    "unit": "minutes"
  }
}
```

**Supported trigger events (Phase 1):**
- `product_viewed`
- `product_added_to_cart`
- `cart_created`
- `checkout_started`
- `order_placed`
- `order_fulfilled`
- `order_cancelled`
- `customer_created`
- `enters_segment`
- `exits_segment`
- `review_submitted`

### 4.3 Flow Node Schema

```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "trigger",
      "config": { /* trigger_config as above */ }
    },
    {
      "id": "node_2",
      "type": "delay",
      "config": {
        "value": 30,
        "unit": "minutes"
      }
    },
    {
      "id": "node_3",
      "type": "condition",
      "config": {
        "check": "event_occurred",
        "event": "order_placed",
        "since": "trip_start",
        "branches": {
          "yes": "node_end",
          "no": "node_4"
        }
      }
    },
    {
      "id": "node_4",
      "type": "action",
      "config": {
        "action_type": "send_email",
        "template_id": "template_uuid",
        "subject_override": "You left something in your cart!",
        "dynamic_data": ["cart_items", "customer_name", "checkout_url"]
      }
    },
    {
      "id": "node_end",
      "type": "end"
    }
  ]
}
```

**Supported node types:**
- `trigger` — entry point, one per flow
- `delay` — wait for X minutes/hours/days
- `condition` — yes/no branch based on event check or attribute check
- `action` — send email (Phase 1), send push/SMS/WhatsApp (Phase 2+)
- `end` — exit point

---

## 5. Default Segment Templates

These are pre-loaded when a project is created with business_type = `ecommerce`.

### Template 1: Champion Customers

```json
{
  "name": "Champion Customers",
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

### Template 2: Loyal Customers

```json
{
  "name": "Loyal Customers",
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

### Template 3: Discount Shoppers

```json
{
  "name": "Discount Shoppers",
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

### Template 4: Window Shoppers

```json
{
  "name": "Window Shoppers",
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

### Template 5: Researchers

```json
{
  "name": "Researchers",
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

---

## 6. Abandoned Cart Flow Template

The pre-built flow that must work end-to-end for the demo.

### Flow Definition

```json
{
  "name": "Abandoned Cart Recovery",
  "description": "Send recovery email when a customer adds to cart but doesn't checkout",
  "trigger_config": {
    "event": "cart_created",
    "filters": {
      "logic": "AND",
      "rules": [
        { "field": "properties.cart_value", "operator": "greater_than", "value": 0 }
      ]
    },
    "inactivity_time": { "value": 30, "unit": "minutes" }
  },
  "exit_config": {
    "event": "order_placed",
    "scope": "any_order"
  },
  "nodes": [
    {
      "id": "trigger",
      "type": "trigger"
    },
    {
      "id": "delay_30m",
      "type": "delay",
      "config": { "value": 30, "unit": "minutes" }
    },
    {
      "id": "check_ordered",
      "type": "condition",
      "config": {
        "check": "event_occurred",
        "event": "order_placed",
        "since": "trip_start",
        "branches": { "yes": "end_converted", "no": "send_email" }
      }
    },
    {
      "id": "send_email",
      "type": "action",
      "config": {
        "action_type": "send_email",
        "template_id": "abandoned_cart_email",
        "dynamic_data": ["cart_items", "customer_name", "checkout_url"]
      }
    },
    {
      "id": "end_converted",
      "type": "end",
      "label": "Converted"
    },
    {
      "id": "end_sent",
      "type": "end",
      "label": "Email Sent"
    }
  ]
}
```

### Abandoned Cart Email Template (HTML)

```html
Subject: {{customer_name}}, you left something behind!

<div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
  <div style="background: #0F1D40; padding: 24px; text-align: center;">
    <h1 style="color: #FFFFFF; margin: 0;">Your cart is waiting</h1>
  </div>

  <div style="padding: 24px;">
    <p>Hi {{customer_name}},</p>
    <p>You left some items in your cart. Complete your purchase before they sell out!</p>

    {{#each cart_items}}
    <div style="display: flex; padding: 12px; border-bottom: 1px solid #E5E7EB;">
      <img src="{{this.image_url}}" width="80" height="80" style="object-fit: cover; border-radius: 8px;" />
      <div style="margin-left: 16px;">
        <p style="margin: 0; font-weight: bold;">{{this.product_name}}</p>
        <p style="margin: 4px 0; color: #6B7280;">Qty: {{this.quantity}}</p>
        <p style="margin: 0; color: #D9A441; font-weight: bold;">{{this.price}}</p>
      </div>
    </div>
    {{/each}}

    <div style="text-align: center; padding: 24px 0;">
      <a href="{{checkout_url}}" style="background: #D9A441; color: #FFFFFF; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
        Complete Your Purchase
      </a>
    </div>
  </div>

  <div style="background: #F7F3EB; padding: 16px; text-align: center; color: #6B7280; font-size: 12px;">
    <p>If you have any questions, reply to this email.</p>
    <p><a href="{{unsubscribe_url}}" style="color: #6B7280;">Unsubscribe</a></p>
  </div>
</div>
```

---

## 7. Shopify Integration Specification

### 7.1 OAuth Flow

1. User clicks "Connect Shopify" in admin panel
2. Redirect to: `https://{shop}.myshopify.com/admin/oauth/authorize?client_id={API_KEY}&scope={SCOPES}&redirect_uri={CALLBACK_URL}&state={NONCE}`
3. Scopes required: `read_customers`, `read_orders`, `read_products`, `read_checkouts`, `read_draft_orders`
4. Shopify redirects back with `code`
5. Exchange code for permanent access token via POST to `https://{shop}.myshopify.com/admin/oauth/access_token`
6. Store access token (encrypted) in projects table

### 7.2 Webhook Registration

After OAuth, register these webhooks via Shopify Admin API:

| Shopify Topic | Maps To Event | Priority |
|---------------|--------------|----------|
| `customers/create` | `customer_created` | P0 |
| `customers/update` | `customer_updated` | P0 |
| `orders/create` | `order_placed` | P0 |
| `orders/fulfilled` | `order_fulfilled` | P0 |
| `orders/cancelled` | `order_cancelled` | P0 |
| `checkouts/create` | `checkout_started` | P0 |
| `carts/create` | `cart_created` | P0 |
| `carts/update` | `cart_updated` | P1 |
| `products/create` | `product_created` (catalog) | P2 |
| `products/update` | `product_updated` (catalog) | P2 |

Webhook endpoint: `POST /api/webhooks/shopify/{project_id}`

All webhooks must be verified using HMAC-SHA256 with the webhook secret.

### 7.3 Historical Sync

On first connection, run a background job that:

1. Paginated fetch of all customers via `GET /admin/api/2024-01/customers.json?limit=250`
2. For each customer, fetch their orders via `GET /admin/api/2024-01/customers/{id}/orders.json`
3. Transform and insert into `customers` and `orders` tables
4. Calculate CLV = sum of all order totals
5. Calculate `avg_order_value` = total_spent / total_orders
6. Mark historical events with `platform: 'historical_sync'` — these do NOT trigger flows

Rate limiting: Shopify allows 4 requests/second for standard plans. Use a queue with 250ms delay between requests.

### 7.4 Webhook → Event Transformation

Example: Shopify `orders/create` webhook → standard events:

```
Incoming Shopify Webhook:
{
  "id": 820982911946154508,
  "email": "customer@example.com",
  "total_price": "2998.00",
  "line_items": [
    {
      "product_id": 632910392,
      "title": "Blue Kurta",
      "quantity": 2,
      "price": "1499.00"
    }
  ],
  "discount_codes": [
    { "code": "SAVE10", "amount": "300.00" }
  ]
}

Transforms to:

Event 1: {
  event_name: "order_placed",
  customer_id: <resolved from email>,
  properties: {
    order_id: "820982911946154508",
    total: 2998.00,
    discount: 300.00,
    item_count: 1,
    items: [
      { product_id: "632910392", product_name: "Blue Kurta", quantity: 2, price: 1499.00 }
    ]
  },
  platform: "shopify_webhook"
}

Also updates customer profile:
  total_orders += 1
  total_spent += 2998.00
  last_seen = now()
  clv = recalculate()
```

---

## 8. Feature Scope — What Gets Built This Week

### P0 — Non-Negotiable (Must work for demo)

| # | Feature | Acceptance Criteria | Day Target |
|---|---------|-------------------|------------|
| 1 | Shopify OAuth + Store Connection | Click "Connect Shopify" → OAuth flow → store connected → access token saved | Day 1–2 |
| 2 | Webhook Registration | Auto-register webhooks for customers, orders, checkouts, carts on Shopify store | Day 1–2 |
| 3 | Historical Sync | Pull last 12 months of customers + orders via Shopify Admin API. Populate customer profiles with CLV. | Day 2–3 |
| 4 | Customer List View | Paginated table: name, email, phone, segment badges, CLV, subscription status, last active. Sorted by last active. Search. | Day 2–3 |
| 5 | Customer Detail View | Expand row → tabs: Details (profile + subscriptions), Order History (multi-item table), Activity (event timeline) | Day 3 |
| 6 | Segment List + Create from Template | List of segments with member count. 5 starter templates. Click template → creates segment → shows members. | Day 3–4 |
| 7 | Flow Builder Canvas (Basic) | Visual canvas: Trigger → Delay → Condition → Email action → End. Select trigger, configure delay, select template. Start/Stop. | Day 5–6 |
| 8 | Abandoned Cart Flow (Working E2E) | Shopify cart webhook → 30 min inactivity → send email with cart items. Must actually send via Resend. | Day 6 |

### P1 — Makes It Convincing

| # | Feature | Acceptance Criteria | Day Target |
|---|---------|-------------------|------------|
| 9 | Segment Builder (Create from Scratch) | Visual filter builder: AND/OR logic, filter by order count, total spent, last order date, email subscription | Day 4–5 |
| 10 | Lifecycle Stage Chart | RFM-style grid showing segment distribution with percentages and counts. Hover → retention tactics popup. | Day 4–5 |
| 11 | Real-time Event Debugger | Live stream of incoming webhooks and events. Shows event name, customer, timestamp, properties. | Day 6–7 |

### P2 — Polish (Skip if running out of time)

| # | Feature | Acceptance Criteria | Day Target |
|---|---------|-------------------|------------|
| 12 | Dashboard Home | Total customers, active 7d, total orders, avg CLV, returning %. Metric cards, not charts. | Day 7 |

---

## 9. Agent Swarms Architecture

### 9.1 Four Parallel Agents

```
┌─────────────────────────────────────────────────────────────┐
│                     WAHAB (Orchestrator)                      │
│  - Defines shared types on Day 1                             │
│  - Runs integration merges on Day 2, 3, 4, 5                │
│  - Resolves conflicts and runs E2E tests                     │
└──────┬──────────┬──────────┬──────────┬─────────────────────┘
       │          │          │          │
  ┌────▼────┐ ┌──▼──────┐ ┌▼────────┐ ┌▼─────────┐
  │ AGENT 1 │ │ AGENT 2 │ │ AGENT 3 │ │ AGENT 4  │
  │ Backend │ │ Frontend│ │ Segments│ │ Flows    │
  │  Core   │ │  UI     │ │ Engine  │ │ Engine   │
  └─────────┘ └─────────┘ └─────────┘ └──────────┘
```

### 9.2 Agent Responsibilities

**AGENT 1 — Backend Core (Red)**
- Database schema + migrations (Drizzle ORM)
- Shopify OAuth flow with @shopify/shopify-api
- Webhook receiver and HMAC verification
- Historical data sync (customers + orders)
- Event processing pipeline (normalize webhooks → standard events → write to DB → publish to BullMQ)
- REST API routes for all frontend consumption
- API contract definition (TypeScript interfaces in /packages/shared)

**AGENT 2 — Frontend UI (Blue)**
- Next.js 14 App Router project setup
- Auth (NextAuth)
- Sidebar navigation layout (dark sidebar #0F1D40, white content, gold #D9A441 accents)
- Pages: /dashboard, /customers, /customers/[id], /segments, /segments/create, /flows, /flows/[id], /debugger
- Data fetching with TanStack Query
- All UI components using shadcn/ui
- Responsive design (desktop-first, but not broken on tablet)

**AGENT 3 — Segmentation Engine (Green)**
- Segment model CRUD
- Filter evaluation engine: `evaluateFilter(filter: FilterConfig, customer: Customer): boolean`
- Batch evaluation: `getSegmentMembers(segmentId: string): Customer[]`
- Template instantiation: `createFromTemplate(templateName: string, projectId: string): Segment`
- Lifecycle chart computation: `getLifecycleChart(projectId: string): LifecycleData`
- Segment re-evaluation on new events (customer gets new order → re-check segment membership)
- Member count caching and update

**AGENT 4 — Flow Engine (Purple)**
- Flow model CRUD
- Trigger evaluator: match incoming event against active flow trigger configs
- Trip state machine: enter → active → waiting (delay) → action → complete/exit
- Delay scheduler: use BullMQ delayed jobs
- Condition evaluator: check if event occurred since trip start
- Action executor: send email via Resend API
- Exit condition handler: if exit event fires, cancel all pending jobs for the trip
- Abandoned cart flow template pre-loader

### 9.3 Monorepo Structure

```
storees/
├── packages/
│   ├── shared/              ← ALL AGENTS READ THIS
│   │   ├── types.ts         ← API types, DB model types, event schemas
│   │   ├── constants.ts     ← Event names, filter operators, node types
│   │   └── utils.ts         ← Shared utilities
│   │
│   ├── backend/             ← AGENT 1
│   │   ├── src/
│   │   │   ├── routes/      ← API route handlers
│   │   │   ├── services/    ← Shopify service, event processor
│   │   │   ├── db/          ← Schema, migrations, queries
│   │   │   ├── workers/     ← BullMQ workers (sync, event processing)
│   │   │   └── index.ts     ← Express app entry
│   │   └── package.json
│   │
│   ├── frontend/            ← AGENT 2
│   │   ├── src/
│   │   │   ├── app/         ← Next.js App Router pages
│   │   │   ├── components/  ← UI components
│   │   │   ├── hooks/       ← Custom hooks, data fetching
│   │   │   └── lib/         ← API client, utilities
│   │   └── package.json
│   │
│   ├── segments/            ← AGENT 3
│   │   ├── src/
│   │   │   ├── evaluator.ts ← Filter evaluation engine
│   │   │   ├── templates.ts ← Default segment template definitions
│   │   │   ├── lifecycle.ts ← Lifecycle chart computation
│   │   │   └── index.ts     ← Exported service interface
│   │   └── package.json
│   │
│   └── flows/               ← AGENT 4
│       ├── src/
│       │   ├── trigger.ts   ← Trigger evaluation
│       │   ├── executor.ts  ← Node execution engine
│       │   ├── scheduler.ts ← Delayed job scheduling
│       │   ├── actions/     ← Action handlers (email, etc.)
│       │   ├── templates.ts ← Flow template definitions
│       │   └── index.ts     ← Exported service interface
│       └── package.json
│
├── package.json             ← Workspace root
└── turbo.json               ← Turborepo config (optional)
```

---

## 10. Day-by-Day Sprint Schedule

### Day 1 — Foundation

| Agent | Tasks |
|-------|-------|
| **You (Wahab)** | Define all TypeScript interfaces in `/packages/shared/types.ts`. Set up monorepo. Create Shopify dev store with test data. Set up Railway (Postgres + Redis) and Vercel project. |
| **Agent 1** | DB schema + migrations. Shopify OAuth flow (install route, callback route, token storage). Webhook receiver endpoint with HMAC verification. API contract doc. |
| **Agent 2** | Next.js project setup. NextAuth configuration. Sidebar layout component. Dashboard shell page. API client setup with typed interfaces from shared. |
| **Agent 3** | Segment model + CRUD operations. Filter schema TypeScript types. 5 default template definitions as JSON. |
| **Agent 4** | Flow model + CRUD operations. Trigger config TypeScript types. BullMQ connection setup. Delayed job scheduler skeleton. |

### Day 2 — Data Pipeline

| Agent | Tasks |
|-------|-------|
| **You** | Verify Shopify dev store connection. Test webhook delivery. First integration check. |
| **Agent 1** | Historical sync: paginated customer fetch, order fetch, CLV calculation. Webhook handlers: `customers/create`, `customers/update`. Customer upsert logic. |
| **Agent 2** | Customer list page: table with pagination, search bar, column sorting. Connect to Agent 1's `/api/customers` endpoint. Loading and empty states. |
| **Agent 3** | Filter evaluation engine: `evaluateFilter()` function. Test with sample data. Batch evaluation: given filter rules, query customers table with SQL WHERE clauses. |
| **Agent 4** | Trigger evaluator: receive event from BullMQ queue, check against all active flow triggers, determine if new trip should start. |

### Day 3 — Customer Detail + Events

| Agent | Tasks |
|-------|-------|
| **You** | Integration merge: Agent 1 + Agent 2. Customer list should show real Shopify data. Fix any API contract mismatches. |
| **Agent 1** | Webhook handlers: `orders/create`, `orders/fulfilled`, `checkouts/create`, `carts/create`. Event processor: normalize Shopify webhooks into standard events, write to events table, publish to BullMQ. |
| **Agent 2** | Customer detail view: expand row with tabs. Details tab (profile info, subscription toggles). Order History tab (table with line item expansion). Activity tab (event timeline from events API). |
| **Agent 3** | Segment template instantiation: click template → create segment → run evaluation → return member count. Segment list API: return all segments with cached member counts. |
| **Agent 4** | Action executor: send email via Resend API with template variable substitution. Flow trip state machine: enter → waiting → check → action → end. |

### Day 4 — Segments + Flow Wiring

| Agent | Tasks |
|-------|-------|
| **You** | Integration merge: Agent 3 into backend. Segment API routes should return real data. Test segment template creation. |
| **Agent 1** | Segment API routes: `GET /api/segments`, `POST /api/segments`, `GET /api/segments/:id/members`, `GET /api/segments/lifecycle`. Flow API routes: `GET /api/flows`, `POST /api/flows`, `POST /api/flows/:id/start`, `POST /api/flows/:id/stop`. |
| **Agent 2** | Segment list page (table with member counts, type badges, actions menu). Create from template page (5 template cards with description, click to create). Segment member list view. |
| **Agent 3** | Create from scratch: filter builder UI support (provide filter evaluation for arbitrary rule combinations). Lifecycle chart data: bucket customers into RFM-style groups, return percentages and counts. |
| **Agent 4** | Abandoned cart flow template: wire up cart_created trigger → 30 min BullMQ delayed job → check for order_placed → send email with cart item data. |

### Day 5 — Flow Builder + Segment Builder UI

| Agent | Tasks |
|-------|-------|
| **You** | Integration merge: Agent 4 into backend. Event queue should be processing webhooks end-to-end. Full system test: Shopify event → event queue → flow trigger → scheduled job. |
| **Agent 1** | Event queue integration: publish all processed events to BullMQ. Flow engine subscribes and evaluates triggers. Polish: error handling, retry logic, webhook verification edge cases. |
| **Agent 2** | Segment builder page: visual filter builder with AND/OR toggle, field dropdown, operator dropdown, value input. Lifecycle stage chart component (grid layout with colored cells, percentages, hover tooltips). |
| **Agent 3** | Segment re-evaluation: when new order event arrives, re-check affected segments. Update member counts. Handle edge cases (customer enters and exits same segment). |
| **Agent 4** | End-to-end test: create cart on Shopify dev store → webhook fires → trigger matches → trip created → delay (use 2 min for testing) → condition check → email sent. Fix timing issues. |

### Day 6 — Flow Builder UI + Polish

| Agent | Tasks |
|-------|-------|
| **You** | Full E2E demo rehearsal #1. Identify and log all bugs. Prioritize fixes. |
| **Agent 1** | Event debugger API: `GET /api/events/stream` (SSE or polling endpoint returning last N events). Polish: response time optimization, add caching where needed. |
| **Agent 2** | Flow builder canvas page: visual layout showing trigger → delay → condition → action → end as connected nodes. Flow list page with status badges. Start/Stop flow buttons. |
| **Agent 3** | Polish: segment edit, segment delete with active-flow warning, inactive toggle. Retention tactics popup content for lifecycle chart hover. |
| **Agent 4** | Post-purchase review request flow template (bonus). Polish: exit conditions (order_placed = exit abandoned cart), duplicate trip prevention (don't start new trip if customer already in active trip for same flow). |

### Day 7 — Deploy + Test + Rehearse

| Agent | Tasks |
|-------|-------|
| **You** | Full E2E demo rehearsal #2 and #3. Deploy to production. Final bug fixes. Prepare backup plan (pre-triggered email in inbox). |
| **Agent 1** | Full integration testing on Railway deployment. Verify Shopify webhooks arrive at production URL. SSL and security check. |
| **Agent 2** | Dashboard home page (metric cards: total customers, active 7d, total orders, avg CLV, returning %). Event debugger page (live event stream table). UI polish: loading states, empty states, error boundaries. |
| **Agent 3** | Integration testing with production data. Verify segment counts are accurate. Fix any filter evaluation edge cases found during testing. |
| **Agent 4** | Run abandoned cart demo 3 times end-to-end on production. Verify email delivery. Fix any timing or race condition issues. |

---

## 11. Integration Checkpoints

| When | What | Success Criteria |
|------|------|-----------------|
| **End of Day 1** | Monorepo compiles, DB migrations run, Shopify OAuth redirect works | Can click "Connect Shopify" and get redirected to Shopify |
| **End of Day 2** | Agent 1 + Agent 2 merged. Customer list shows Shopify data | Open /customers → see real customer names and emails from Shopify store |
| **End of Day 3** | Agent 3 merged. Segments functional | Create "Champion Customers" from template → see matching customers listed |
| **End of Day 4** | Agent 4 merged. Events flowing through queue | Shopify webhook arrives → event appears in events table → BullMQ job created |
| **End of Day 5** | Full pipeline working | Cart created on Shopify → trip starts → delay scheduled → job pending in queue |
| **End of Day 6** | Demo rehearsal passes | Full 30-minute demo script runs without errors |
| **End of Day 7** | Production deployment verified | Same demo works on production URLs with production Shopify store |

---

## 12. Contract-First: Shared Types (Day 1 Priority)

This file MUST be created before any agent starts coding. It is the single source of truth.

```typescript
// /packages/shared/types.ts

// ============ DATABASE MODELS ============

export interface Project {
  id: string;
  name: string;
  shopifyDomain: string;
  shopifyAccessToken: string;
  businessType: 'ecommerce' | 'booking' | 'saas' | 'general';
  webhookSecret: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  projectId: string;
  externalId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  firstSeen: Date;
  lastSeen: Date;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  clv: number;
  emailSubscribed: boolean;
  smsSubscribed: boolean;
  pushSubscribed: boolean;
  whatsappSubscribed: boolean;
  segmentIds: string[];
  customAttributes: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  projectId: string;
  customerId: string;
  externalOrderId: string;
  status: 'pending' | 'fulfilled' | 'cancelled' | 'refunded';
  total: number;
  discount: number;
  currency: string;
  lineItems: LineItem[];
  createdAt: Date;
  fulfilledAt: Date | null;
}

export interface LineItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  imageUrl?: string;
}

export interface TrackedEvent {
  id: string;
  projectId: string;
  customerId: string | null;
  eventName: string;
  properties: Record<string, any>;
  platform: 'web' | 'mobile' | 'server' | 'shopify_webhook' | 'historical_sync';
  sessionId: string | null;
  timestamp: Date;
  receivedAt: Date;
}

export interface Segment {
  id: string;
  projectId: string;
  name: string;
  type: 'default' | 'custom';
  description: string;
  filters: FilterConfig;
  memberCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Flow {
  id: string;
  projectId: string;
  name: string;
  description: string;
  triggerConfig: TriggerConfig;
  exitConfig: ExitConfig | null;
  nodes: FlowNode[];
  status: 'draft' | 'active' | 'paused';
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowTrip {
  id: string;
  flowId: string;
  customerId: string;
  status: 'active' | 'waiting' | 'completed' | 'exited';
  currentNodeId: string;
  context: Record<string, any>;
  enteredAt: Date;
  exitedAt: Date | null;
}

export interface ScheduledJob {
  id: string;
  flowTripId: string;
  executeAt: Date;
  action: Record<string, any>;
  status: 'pending' | 'executed' | 'cancelled';
  createdAt: Date;
}

export interface EmailTemplate {
  id: string;
  projectId: string;
  name: string;
  subject: string;
  htmlBody: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============ FILTER & FLOW SCHEMAS ============

export interface FilterConfig {
  logic: 'AND' | 'OR';
  rules: FilterRule[];
}

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value: any;
}

export type FilterOperator =
  | 'is' | 'is_not'
  | 'greater_than' | 'less_than' | 'between'
  | 'contains' | 'begins_with' | 'ends_with'
  | 'is_true' | 'is_false';

export interface TriggerConfig {
  event: string;
  filters?: FilterConfig;
  audienceFilter?: FilterConfig;
  inactivityTime?: { value: number; unit: 'minutes' | 'hours' | 'days' };
}

export interface ExitConfig {
  event: string;
  scope: 'any' | 'matching';
}

export type FlowNode =
  | TriggerNode
  | DelayNode
  | ConditionNode
  | ActionNode
  | EndNode;

export interface TriggerNode {
  id: string;
  type: 'trigger';
  config?: TriggerConfig;
}

export interface DelayNode {
  id: string;
  type: 'delay';
  config: { value: number; unit: 'minutes' | 'hours' | 'days' };
}

export interface ConditionNode {
  id: string;
  type: 'condition';
  config: {
    check: 'event_occurred' | 'attribute_check';
    event?: string;
    field?: string;
    operator?: FilterOperator;
    value?: any;
    since: 'trip_start' | 'flow_start';
    branches: { yes: string; no: string };
  };
}

export interface ActionNode {
  id: string;
  type: 'action';
  config: {
    actionType: 'send_email' | 'send_push' | 'send_sms' | 'send_whatsapp';
    templateId: string;
    subjectOverride?: string;
    dynamicData?: string[];
  };
}

export interface EndNode {
  id: string;
  type: 'end';
  label?: string;
}

// ============ API RESPONSE TYPES ============

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CustomerListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: 'lastSeen' | 'totalSpent' | 'clv' | 'name';
  sortOrder?: 'asc' | 'desc';
  segmentId?: string;
}

export interface LifecycleChartData {
  segments: LifecycleSegment[];
  metrics: {
    returningCustomerPercentage: number;
    avgPurchaseFrequency: number;
    avgPurchaseValue: number;
    avgClv: number;
  };
}

export interface LifecycleSegment {
  name: string;
  label: string;
  percentage: number;
  contactCount: number;
  position: { row: number; col: number };
  color: string;
  retentionTactics: string[];
}

export interface EventStreamItem {
  id: string;
  eventName: string;
  customerName: string | null;
  customerEmail: string | null;
  properties: Record<string, any>;
  platform: string;
  timestamp: Date;
}

// ============ CONSTANTS ============

export const STANDARD_EVENTS = {
  // Shopify-sourced
  PRODUCT_VIEWED: 'product_viewed',
  PRODUCT_ADDED_TO_CART: 'product_added_to_cart',
  CART_CREATED: 'cart_created',
  CART_UPDATED: 'cart_updated',
  CHECKOUT_STARTED: 'checkout_started',
  ORDER_PLACED: 'order_placed',
  ORDER_FULFILLED: 'order_fulfilled',
  ORDER_CANCELLED: 'order_cancelled',
  CUSTOMER_CREATED: 'customer_created',
  CUSTOMER_UPDATED: 'customer_updated',
  REVIEW_SUBMITTED: 'review_submitted',

  // Segment-based
  ENTERS_SEGMENT: 'enters_segment',
  EXITS_SEGMENT: 'exits_segment',

  // Universal
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  PAGE_VIEWED: 'page_viewed',
} as const;

export const SEGMENT_TEMPLATES = [
  'champion_customers',
  'loyal_customers',
  'discount_shoppers',
  'window_shoppers',
  'researchers',
] as const;
```

---

## 13. Agent Prompts

### Agent 1 — Backend Core

```
You are building the backend for Storees, a Shopify marketing automation
platform. This is a 7-day sprint to create a demo-ready product.

Tech stack: Node.js + TypeScript + Express + PostgreSQL (Drizzle ORM) +
Redis (ioredis) + BullMQ.

Your directory: /packages/backend/

Your responsibilities:
1. Database schema and migrations using Drizzle ORM
2. Shopify OAuth flow using @shopify/shopify-api v9+
3. Webhook receiver with HMAC-SHA256 verification
4. Historical data sync from Shopify Admin API (customers + orders)
5. Event processing: normalize Shopify webhooks → standard events → DB + BullMQ
6. REST API routes consumed by the frontend

CRITICAL: Import and use types from /packages/shared/types.ts for all
API responses. The frontend agent is building against these types.

DO NOT build: frontend UI, segmentation logic, flow engine logic.
These are built by other agents and will be imported as services.

Expose integration points:
- POST /api/events/process — called by webhook handler, writes event and
  publishes to BullMQ 'events' queue
- Import segmentService from /packages/segments for segment API routes
- Import flowService from /packages/flows for flow API routes

Prioritize working code over perfect code. Use console.log for debugging.
Add TODO comments for things to clean up later.
```

### Agent 2 — Frontend UI

```
You are building the admin panel frontend for Storees, a Shopify marketing
automation platform.

Tech stack: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui +
TanStack Query (React Query v5).

Your directory: /packages/frontend/

Design system:
- Sidebar: #0F1D40 (deep blue) background, white text, gold (#D9A441) active indicator
- Content area: white background
- Headings: #0F1D40
- Body text: #212121
- Accent/CTAs: #D9A441 (warm gold)
- Subtle backgrounds: #F7F3EB (cream)
- Use shadcn/ui components (Button, Table, Card, Badge, Dialog, Tabs, Popover, Sheet)
- Look and feel: clean like Omnisend/Klaviyo admin panel

Pages to build:
1. /dashboard — metric cards (total customers, active 7d, total orders, avg CLV, returning %)
2. /customers — paginated table with search, sortable columns, expand row for detail
3. /segments — list view + create from template (card grid) + create from scratch (filter builder)
4. /flows — list view + flow canvas (visual node editor showing trigger→delay→condition→action→end)
5. /debugger — live event stream table (auto-refresh every 2 seconds)

Import types from /packages/shared/types.ts for all API responses.
API base URL comes from NEXT_PUBLIC_API_URL environment variable.

DO NOT build: backend logic, database queries, Shopify integration.
You only consume the REST API.
```

### Agent 3 — Segmentation Engine

```
You are building the segmentation engine for Storees as a service module.

Tech stack: TypeScript. You read/write to PostgreSQL via Drizzle ORM.

Your directory: /packages/segments/

Export these functions:
1. evaluateFilter(filters: FilterConfig, customer: Customer): boolean
   — Given filter rules and a customer object, return true if customer matches
2. getSegmentMembers(segmentId: string, page?: number, pageSize?: number): PaginatedResponse<Customer>
   — Return customers matching the segment's filter rules
3. createFromTemplate(templateName: string, projectId: string): Segment
   — Create a segment from one of the 5 default templates
4. createFromScratch(name: string, filters: FilterConfig, projectId: string): Segment
   — Create a custom segment with arbitrary filter rules
5. getLifecycleChart(projectId: string): LifecycleChartData
   — Compute RFM-style lifecycle stage distribution
6. reEvaluateCustomer(customerId: string, projectId: string): void
   — After a customer event, check all segments and update membership

Import types from /packages/shared/types.ts.

For evaluateFilter, translate filter rules to SQL WHERE clauses where possible
for performance. Only fall back to JS-level evaluation for complex cases.

The 5 default templates are defined in the requirements doc. Each has a name,
description, and FilterConfig JSON.

For lifecycle chart, bucket customers into these groups based on recency
(days since last order) and monetary value (total spent):
- Champions (recent + high value)
- Loyalists (recent + medium value)
- Recent Customers (recent + low value)
- High Potential (medium recency + high value)
- Needs Nurturing (medium recency + medium value)
- About to Lose (old + high value)
- At Risk (old + medium value)
- Can't Lose (very old + high value)
```

### Agent 4 — Flow Engine

```
You are building the flow/journey engine for Storees as a service module.

Tech stack: TypeScript + BullMQ (for job scheduling) + Resend (for email).

Your directory: /packages/flows/

Export these functions:
1. evaluateTrigger(event: TrackedEvent, projectId: string): FlowTrip[]
   — Check if event matches any active flow's trigger. If yes, create trip(s).
2. executeNode(trip: FlowTrip, node: FlowNode): void
   — Execute the given node for the trip (delay, condition, action, end)
3. handleDelayComplete(jobId: string): void
   — Called by BullMQ when a delayed job fires. Advances the trip to next node.
4. handleExitEvent(event: TrackedEvent): void
   — Check if event matches any active trip's exit condition. If yes, exit trip.
5. getFlowTemplates(): FlowTemplate[]
   — Return pre-built flow templates (abandoned cart, post-purchase review)

BullMQ queues:
- 'events' queue: consumed by evaluateTrigger(). Published by Agent 1.
- 'flow-actions' queue: delayed jobs for flow execution.

For the abandoned cart flow:
1. cart_created event → evaluateTrigger matches → create trip
2. Schedule delayed job: 30 minutes (configurable, use 2 min for demo)
3. When delay fires → check: did customer place an order since trip started?
4. If yes → mark trip as 'exited' (converted)
5. If no → send email via Resend with cart items from trip.context

Resend API key comes from RESEND_API_KEY environment variable.
Email from address: configured per project (default: noreply@storees.io).

CRITICAL for demo: The email MUST contain the customer's name, cart items
with product names and prices, and a checkout URL back to the Shopify store.

Import types from /packages/shared/types.ts.
```

---

## 14. Demo Script

Rehearse this 3 times before the Pinnacle meeting.

1. **"Let me show you Storees, our marketing automation platform built for Shopify merchants."** → Open dashboard, show metric cards.

2. **"First, let me connect a Shopify store."** → Click Connect Shopify. OAuth flow completes. Show customers populating in real-time as historical sync runs.

3. **"Here's the customer data platform. Every customer has a complete profile."** → Click into a customer. Show tabs: details (profile + subscription channels), orders (multi-item rows), activity timeline.

4. **"We have intelligent segmentation built in."** → Show segment list with default segments. Click into Champions — show member list. Show lifecycle chart with segment distribution. Hover over "At Risk" → show retention tactics popup.

5. **"Let me create a custom segment."** → Open segment builder. Add filter: total_spent > 5000 AND last_order within 30 days. Show matching customers.

6. **"Now let me show you automation flows."** → Open flow builder. Show the abandoned cart flow. Walk through: trigger (cart created) → delay (30 min) → check (no order?) → send email. Show the email template with dynamic cart items.

7. **"Let me trigger this live."** → Open Shopify dev store in another tab. Add a product to cart. Switch to event debugger → show the cart_created event arriving in real-time. "In 2 minutes, the customer will receive this email." → Show email arriving.

8. **"This is the foundation. For Pinnacle, we'll extend this with the full product vision — analytics, AI, multi-channel, personalization."**

> **IMPORTANT:** Use a 2-minute delay (not 30 min) for the demo. Set this as an env variable `DEMO_DELAY_MINUTES=2`. Also have a pre-triggered email already in your inbox as a backup in case the live trigger has timing issues.

---

## 15. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Shopify webhook delivery issues | Test on Day 1. Use ngrok for local dev. Verify HMAC. Have webhook logs. |
| Agent code doesn't integrate | Contract-first approach (shared types). Integration checkpoints every day. |
| Email doesn't send in demo | Pre-trigger an email before the meeting as backup. Have Resend dashboard open to show sent emails. |
| Historical sync too slow | Limit to last 100 customers for demo. Full sync runs in background. |
| Flow timing issues | Use 2-minute delay for demo. Add manual "trigger now" button as escape hatch. |
| Segment counts wrong | Pre-calculate and cache on startup. Verify against manual Shopify count. |
| Deploy fails on Day 7 | Deploy on Day 6 evening. Day 7 morning is only for testing on prod. |

---

## 16. Post-Demo Roadmap (After Pinnacle Signs)

Once the demo secures the Pinnacle contract, Storees becomes the foundation for the full platform build. The following features from the Pinnacle proposal get layered on top:

- Phase 1 gaps: advanced identity resolution, data import/export, additional connectors (WooCommerce, custom webhook)
- Phase 2: full visual flow builder with conditional splits and A/B testing, push/SMS/WhatsApp channels, notification content builders
- Phase 3: analytics dashboards (funnels, cohorts, retention), AI copywriter, send-time optimization
- Phase 4: web/app personalization, recommendation engine, advanced AI, enterprise features

The 7-day sprint is the seed. The 8-month project is the tree.
