# Data Layer — Database Schema

> **Database**: PostgreSQL (Supabase or Neon)
> **ORM**: Drizzle ORM (type-safe queries)
> **Convention**: `snake_case` columns in Postgres, `camelCase` in TypeScript — map at boundaries

## Entity Relationship Overview

```
projects ──┬── customers ──┬── orders
            │               ├── events
            │               └── flow_trips ── scheduled_jobs
            ├── segments
            ├── flows
            └── email_templates
```

All tables are **multi-tenant** via `project_id`. Every query must filter by `project_id`.

---

## Table: `projects`

Multi-tenant root. Each Shopify store is a project.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default `gen_random_uuid()` | |
| name | VARCHAR(255) | NOT NULL | Project/store display name |
| shopify_domain | VARCHAR(255) | UNIQUE | e.g., `mystore.myshopify.com` |
| shopify_access_token | VARCHAR(512) | | Encrypted at rest |
| business_type | VARCHAR(20) | NOT NULL, default `'ecommerce'` | `ecommerce` \| `booking` \| `saas` \| `general` |
| webhook_secret | VARCHAR(255) | | For HMAC verification of Shopify webhooks |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` | |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` | |

---

## Table: `customers`

Unified customer profile. One row per unique customer per project.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| project_id | UUID | FK → projects, NOT NULL | |
| external_id | VARCHAR(255) | | Shopify customer ID |
| email | VARCHAR(255) | | |
| phone | VARCHAR(50) | | |
| name | VARCHAR(255) | | |
| first_seen | TIMESTAMPTZ | NOT NULL, default `now()` | First interaction with platform |
| last_seen | TIMESTAMPTZ | NOT NULL, default `now()` | Most recent interaction |
| total_orders | INTEGER | NOT NULL, default `0` | Running count, updated on order events |
| total_spent | DECIMAL(12,2) | NOT NULL, default `0` | Running total in store currency |
| avg_order_value | DECIMAL(12,2) | NOT NULL, default `0` | `total_spent / total_orders` |
| clv | DECIMAL(12,2) | NOT NULL, default `0` | Customer lifetime value |
| email_subscribed | BOOLEAN | NOT NULL, default `false` | |
| sms_subscribed | BOOLEAN | NOT NULL, default `false` | |
| push_subscribed | BOOLEAN | NOT NULL, default `false` | |
| whatsapp_subscribed | BOOLEAN | NOT NULL, default `false` | |
| segment_ids | UUID[] | default `'{}'` | Array of segment memberships |
| custom_attributes | JSONB | default `'{}'` | Flexible key-value store |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` | |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` | |

**Indexes:**
- `idx_customers_project` — `(project_id)`
- `idx_customers_email` — `(project_id, email)`
- `idx_customers_external` — `(project_id, external_id)` UNIQUE
- `idx_customers_last_seen` — `(project_id, last_seen DESC)`

**CLV Calculation:**
```
clv = total_spent (simple sum for Phase 1)
```
Recalculated on every `order_placed` event. Phase 2+ will use predictive CLV.

---

## Table: `orders`

Order history. One row per order. Line items stored as JSONB array.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| project_id | UUID | FK → projects, NOT NULL | |
| customer_id | UUID | FK → customers, NOT NULL | |
| external_order_id | VARCHAR(255) | | Shopify order ID |
| status | VARCHAR(20) | NOT NULL, default `'pending'` | `pending` \| `fulfilled` \| `cancelled` \| `refunded` |
| total | DECIMAL(12,2) | NOT NULL | Order total in store currency |
| discount | DECIMAL(12,2) | default `0` | Total discount applied |
| currency | VARCHAR(3) | NOT NULL, default `'INR'` | ISO 4217 |
| line_items | JSONB | NOT NULL | See Line Item Schema below |
| created_at | TIMESTAMPTZ | NOT NULL | Order date (from Shopify) |
| fulfilled_at | TIMESTAMPTZ | | Fulfilment date |

**Indexes:**
- `idx_orders_customer` — `(project_id, customer_id, created_at DESC)`
- `idx_orders_external` — `(project_id, external_order_id)` UNIQUE
- `idx_orders_status` — `(project_id, status)`

**Line Item Schema (JSONB):**
```json
[
  {
    "product_id": "632910392",
    "product_name": "Blue Kurta",
    "quantity": 2,
    "price": 1499.00,
    "image_url": "https://cdn.shopify.com/..."
  }
]
```

---

## Table: `events`

All tracked events. Time-series data. Powers analytics and flow triggers.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| project_id | UUID | FK → projects, NOT NULL | |
| customer_id | UUID | FK → customers | Nullable for anonymous events |
| event_name | VARCHAR(100) | NOT NULL | e.g., `product_viewed`, `order_placed` |
| properties | JSONB | default `'{}'` | Event-specific payload |
| platform | VARCHAR(30) | NOT NULL | `web` \| `mobile` \| `server` \| `shopify_webhook` \| `historical_sync` |
| session_id | VARCHAR(255) | | For session grouping |
| timestamp | TIMESTAMPTZ | NOT NULL | When the event occurred |
| received_at | TIMESTAMPTZ | NOT NULL, default `now()` | When the system ingested it |

**Indexes:**
- `idx_events_trigger` — `(project_id, event_name, timestamp DESC)` — Flow trigger lookups
- `idx_events_customer` — `(project_id, customer_id, timestamp DESC)` — Activity timeline
- `idx_events_recent` — `(project_id, received_at DESC)` — Event debugger stream

**Critical Rule:** Events with `platform = 'historical_sync'` must NEVER trigger flows. Check this in the event processor before publishing to BullMQ.

---

## Table: `segments`

Segment definitions. Filter rules stored as JSONB.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| project_id | UUID | FK → projects, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| type | VARCHAR(20) | NOT NULL, default `'custom'` | `default` \| `custom` |
| description | TEXT | | |
| filters | JSONB | NOT NULL | See `JSON_SCHEMAS.md` → Filter Schema |
| member_count | INTEGER | NOT NULL, default `0` | Cached, updated on evaluation |
| is_active | BOOLEAN | NOT NULL, default `true` | |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` | |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` | |

**Rules:**
- `type = 'default'` segments cannot be deleted, only deactivated
- Deleting/editing a segment with active flows must show a warning with flow count

---

## Table: `flows`

Flow/journey definitions. Trigger config and node graph stored as JSONB.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| project_id | UUID | FK → projects, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| description | TEXT | | |
| trigger_config | JSONB | NOT NULL | See `JSON_SCHEMAS.md` → Trigger Config |
| exit_config | JSONB | | See `JSON_SCHEMAS.md` → Exit Config |
| nodes | JSONB | NOT NULL | See `JSON_SCHEMAS.md` → Flow Nodes |
| status | VARCHAR(20) | NOT NULL, default `'draft'` | `draft` \| `active` \| `paused` |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` | |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` | |

**Rules:**
- Only `active` flows are evaluated against incoming events
- Changing status from `active` to `paused` does NOT cancel in-progress trips
- Changing status from `active` to `draft` DOES cancel all pending scheduled jobs

---

## Table: `flow_trips`

Tracks each customer's individual journey through a flow.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| flow_id | UUID | FK → flows, NOT NULL | |
| customer_id | UUID | FK → customers, NOT NULL | |
| status | VARCHAR(20) | NOT NULL, default `'active'` | `active` \| `waiting` \| `completed` \| `exited` |
| current_node_id | VARCHAR(100) | NOT NULL | Which node the customer is at |
| context | JSONB | default `'{}'` | Data from triggering event (cart items, product info) |
| entered_at | TIMESTAMPTZ | NOT NULL, default `now()` | |
| exited_at | TIMESTAMPTZ | | |

**Indexes:**
- `idx_trips_active` — `(flow_id, status)` WHERE `status IN ('active', 'waiting')`
- `idx_trips_customer` — `(customer_id, flow_id)` — Prevent duplicate trips

**Duplicate Trip Rule:** A customer can only have ONE active/waiting trip per flow. Check before creating a new trip.

---

## Table: `scheduled_jobs`

Delayed actions managed by BullMQ. Stored in DB for persistence and debugging.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| flow_trip_id | UUID | FK → flow_trips, NOT NULL | |
| execute_at | TIMESTAMPTZ | NOT NULL | When to fire |
| action | JSONB | NOT NULL | What to do — node execution payload |
| status | VARCHAR(20) | NOT NULL, default `'pending'` | `pending` \| `executed` \| `cancelled` |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` | |

**Indexes:**
- `idx_jobs_pending` — `(status, execute_at)` WHERE `status = 'pending'`

---

## Table: `email_templates`

Email templates for flow action nodes.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| project_id | UUID | FK → projects, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| subject | VARCHAR(500) | NOT NULL | Supports `{{variable}}` substitution |
| html_body | TEXT | NOT NULL | Full HTML, supports `{{variable}}` and `{{#each}}` |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` | |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` | |

---

## Migration Order

Run in sequence. Each migration is idempotent.

```
001_create_projects.sql
002_create_customers.sql
003_create_orders.sql
004_create_events.sql
005_create_segments.sql
006_create_flows.sql
007_create_flow_trips.sql
008_create_scheduled_jobs.sql
009_create_email_templates.sql
010_create_indexes.sql
```
