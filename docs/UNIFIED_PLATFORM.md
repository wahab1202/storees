# Storees — Unified Platform Architecture

## Vision

Storees is a **vertical-agnostic customer engagement platform**. One codebase supports ecommerce (Shopify), fintech (banking/broking), SaaS, and custom applications. The domain-specific logic lives in configuration (registries, templates), not code.

## Core Principle

```
Generic Core Engine  +  Pluggable Integration Adapters  +  Domain Field Registries
```

- The **core engine** (CDP, segments, flows, campaigns) is identical across all verticals
- **Integration adapters** handle how data gets in (Shopify OAuth, bank API keys, Stripe webhooks)
- **Domain registries** define what fields, templates, and flows are available per vertical

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  INTEGRATION ADAPTERS                        │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Shopify  │  │ Fintech  │  │ Stripe/  │  │ Custom     │  │
│  │ Adapter  │  │ Adapter  │  │ SaaS     │  │ Adapter    │  │
│  │ (OAuth)  │  │ (API Key)│  │ (OAuth)  │  │ (API Key)  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       └──────────────┴──────┬───────┴──────────────┘          │
│                             ▼                                 │
│              ┌──────────────────────────┐                     │
│              │  Normalized Event        │                     │
│              │  { event_name, customer, │                     │
│              │    properties, source }  │                     │
│              └────────────┬─────────────┘                     │
└───────────────────────────┼───────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                    CORE ENGINE (Vertical-Agnostic)             │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │ Event Store  │  │ Customer CDP │  │ Identity Resolution  ││
│  │ (JSONB)      │  │ (Profiles +  │  │ (email/phone/ext_id) ││
│  │              │  │  Metrics)    │  │                      ││
│  └──────────────┘  └──────────────┘  └──────────────────────┘│
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │ Segment      │  │ Flow Engine  │  │ Campaign Engine      ││
│  │ Engine       │  │ (Triggers,   │  │ (Broadcast to        ││
│  │ (Dynamic     │  │  Delays,     │  │  segments)           ││
│  │  Fields)     │  │  Actions)    │  │                      ││
│  └──────────────┘  └──────────────┘  └──────────────────────┘│
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Domain Registry (loaded per project)                   │  │
│  │ • Field definitions   • Segment templates              │  │
│  │ • Flow templates      • Computed metrics               │  │
│  │ • Notification channels • Compliance rules             │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## Database Design

### Generic Schema (replaces domain-specific tables)

```sql
-- Projects with integration config
ALTER TABLE projects ADD COLUMN domain_type TEXT NOT NULL DEFAULT 'ecommerce';
  -- 'ecommerce' | 'fintech' | 'saas' | 'custom'
ALTER TABLE projects ADD COLUMN integration_type TEXT NOT NULL DEFAULT 'shopify';
  -- 'shopify' | 'api_key' | 'stripe' | 'custom'
ALTER TABLE projects ADD COLUMN api_key_public TEXT;
ALTER TABLE projects ADD COLUMN api_key_secret_hash TEXT;
ALTER TABLE projects ADD COLUMN ip_whitelist TEXT[];
ALTER TABLE projects ADD COLUMN settings JSONB DEFAULT '{}';

-- API Keys (supports multiple keys per project, rotation)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL DEFAULT 'Default',
  key_public TEXT NOT NULL UNIQUE,      -- sk_live_xxxxx (shown once)
  key_secret_hash TEXT NOT NULL,         -- bcrypt hash of secret
  permissions TEXT[] DEFAULT '{write}',  -- 'read', 'write', 'admin'
  ip_whitelist TEXT[],
  rate_limit INTEGER DEFAULT 1000,       -- requests per minute
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_api_keys_public ON api_keys(key_public) WHERE is_active = true;

-- Generic events table (ALL verticals)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  customer_id UUID REFERENCES customers(id),
  event_name TEXT NOT NULL,              -- 'order_placed', 'transaction_completed', etc.
  properties JSONB DEFAULT '{}',         -- Flexible event properties
  source TEXT NOT NULL DEFAULT 'api',    -- 'shopify_webhook', 'api', 'sdk', 'sync', 'system'
  idempotency_key TEXT,                  -- Prevent duplicate events
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_project_customer ON events(project_id, customer_id, timestamp DESC);
CREATE INDEX idx_events_project_name ON events(project_id, event_name, timestamp DESC);
CREATE INDEX idx_events_idempotency ON events(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_events_properties ON events USING GIN (properties jsonb_path_ops);

-- Generic entities table (orders, transactions, accounts, subscriptions — all in one)
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  customer_id UUID REFERENCES customers(id),
  entity_type TEXT NOT NULL,             -- 'order', 'transaction', 'account', 'subscription', 'loan'
  external_id TEXT,                      -- External system's ID
  status TEXT,                           -- Domain-specific status
  attributes JSONB DEFAULT '{}',         -- All properties as JSONB
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_entities_project_type ON entities(project_id, entity_type, created_at DESC);
CREATE INDEX idx_entities_customer ON entities(project_id, customer_id, entity_type);
CREATE INDEX idx_entities_external ON entities(project_id, entity_type, external_id);
CREATE INDEX idx_entities_attributes ON entities USING GIN (attributes jsonb_path_ops);

-- Precomputed customer metrics (fast segment queries)
-- These are updated by a worker on each event, not queried from raw events
ALTER TABLE customers ADD COLUMN metrics JSONB DEFAULT '{}';
  -- Ecommerce: { total_orders, total_spent, avg_order_value, clv, days_since_last_order }
  -- Fintech: { total_transactions, total_debit, total_credit, last_txn_date, primary_channel }
  -- SaaS: { mrr, plan, days_since_signup, feature_usage_count }
  -- All computed per-domain by the metrics worker

-- Identity graph (multi-identifier resolution)
CREATE TABLE identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  identifier_type TEXT NOT NULL,         -- 'email', 'phone', 'external_id', 'device_id'
  identifier_value TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, identifier_type, identifier_value)
);
CREATE INDEX idx_identities_lookup ON identities(project_id, identifier_type, identifier_value);

-- Consent management (fintech/compliance)
CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL,                 -- 'email', 'sms', 'push', 'whatsapp'
  purpose TEXT NOT NULL DEFAULT 'promotional', -- 'transactional', 'promotional'
  status TEXT NOT NULL DEFAULT 'opted_in',     -- 'opted_in', 'opted_out'
  source TEXT,                           -- 'app', 'web', 'api', 'sms'
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_consents_customer ON consents(project_id, customer_id, channel, purpose);

-- Communication audit log
CREATE TABLE communication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  channel TEXT NOT NULL,                 -- 'email', 'sms', 'push', 'whatsapp'
  message_type TEXT NOT NULL,            -- 'campaign', 'flow', 'transactional'
  template_id TEXT,
  content_hash TEXT,                     -- SHA256 of rendered content
  status TEXT NOT NULL,                  -- 'sent', 'delivered', 'failed', 'read'
  provider_message_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comlog_customer ON communication_log(project_id, customer_id, created_at DESC);
```

### What Happens to Existing Tables

| Existing Table | Action | Rationale |
|---|---|---|
| `customers` | **Keep + extend** with `metrics` JSONB | Core to all verticals |
| `events` (tracked_events) | **Replace** with new generic `events` table | Current one is fine, just standardize |
| `orders` | **Migrate** to `entities` (type='order') | Generic entity with JSONB attributes |
| `products` | **Keep for ecommerce**, optional for others | Referenced by Shopify sync |
| `collections` | **Keep for ecommerce**, optional for others | Referenced by Shopify sync |
| `segments` | **Keep as-is** | Already generic |
| `customer_segments` | **Keep as-is** | Already generic |
| `flows` / `flow_trips` | **Keep as-is** | Already generic |
| `campaigns` / `campaign_sends` | **Keep as-is** | Already generic |
| `projects` | **Extend** with domain_type, integration_type, api_key fields | Multi-vertical support |

---

## Domain Registry

The domain registry defines per-vertical configuration. It's loaded based on `project.domain_type`.

```typescript
type DomainFieldDef = {
  field: string              // Internal field name
  label: string              // Display label
  type: 'number' | 'string' | 'date' | 'boolean' | 'select' | 'product' | 'collection'
  category: string           // UI grouping ("Customer Info", "Transaction Filters", etc.)
  operators: string[]        // Available operators for this field
  options?: string[]         // For 'select' type
  metricKey?: string         // Key in customers.metrics JSONB
  sqlExpression?: string     // Custom SQL for segment evaluation
}

type DomainConfig = {
  fields: DomainFieldDef[]
  segmentTemplates: SegmentTemplateDef[]
  flowTemplates: FlowTemplateDef[]
  computedMetrics: MetricDef[]         // How to compute customer.metrics from events
  channels: ('email' | 'sms' | 'push' | 'whatsapp')[]
  complianceRules?: ComplianceConfig
}
```

### Ecommerce Domain (existing behavior)
```typescript
const ecommerceDomain: DomainConfig = {
  fields: [
    { field: 'total_orders', label: 'Total Orders', type: 'number', category: 'Purchase History', metricKey: 'total_orders', operators: ['eq','gt','lt','gte','lte'] },
    { field: 'total_spent', label: 'Total Spent', type: 'number', category: 'Purchase History', metricKey: 'total_spent', operators: ['eq','gt','lt','gte','lte'] },
    { field: 'avg_order_value', label: 'Avg Order Value', type: 'number', category: 'Purchase History', metricKey: 'avg_order_value', operators: ['gt','lt','gte','lte'] },
    { field: 'product_name', label: 'Product', type: 'product', category: 'Product Filters', operators: ['has_purchased','has_not_purchased'] },
    { field: 'collection_name', label: 'Collection', type: 'collection', category: 'Product Filters', operators: ['has_purchased','has_not_purchased'] },
    // ... more ecommerce fields
  ],
  segmentTemplates: [
    { name: 'Champion Customers', filters: { logic: 'AND', rules: [{ field: 'total_orders', operator: 'gt', value: 5 }, { field: 'total_spent', operator: 'gt', value: 1000000 }] } },
    { name: 'At-Risk Customers', filters: { logic: 'AND', rules: [{ field: 'days_since_last_order', operator: 'gt', value: 60 }, { field: 'total_orders', operator: 'gte', value: 2 }] } },
    // ...
  ],
  flowTemplates: [
    { name: 'Abandoned Cart Recovery', triggerEvent: 'cart_created', /* ... */ },
    { name: 'Post-Purchase Follow-up', triggerEvent: 'order_placed', /* ... */ },
  ],
  channels: ['email'],
  computedMetrics: [
    { key: 'total_orders', aggregation: 'count', eventFilter: { event_name: 'order_placed' } },
    { key: 'total_spent', aggregation: 'sum', eventFilter: { event_name: 'order_placed' }, property: 'total' },
  ]
}
```

### Fintech Domain (new)
```typescript
const fintechDomain: DomainConfig = {
  fields: [
    { field: 'total_transactions', label: 'Total Transactions', type: 'number', category: 'Transaction History', metricKey: 'total_transactions', operators: ['eq','gt','lt','gte','lte'] },
    { field: 'total_debit', label: 'Total Debit', type: 'number', category: 'Transaction History', metricKey: 'total_debit', operators: ['gt','lt','gte','lte'] },
    { field: 'total_credit', label: 'Total Credit', type: 'number', category: 'Transaction History', metricKey: 'total_credit', operators: ['gt','lt','gte','lte'] },
    { field: 'transaction_channel', label: 'Transaction Channel', type: 'select', category: 'Transaction Filters', options: ['upi','neft','imps','card','cash'], operators: ['is','is_not'] },
    { field: 'account_type', label: 'Account Type', type: 'select', category: 'Account Info', options: ['savings','current','fd','rd','loan','demat','credit_card'], operators: ['has','has_not'] },
    { field: 'kyc_status', label: 'KYC Status', type: 'select', category: 'Account Info', options: ['verified','pending','expired'], operators: ['is','is_not'] },
    { field: 'balance_bracket', label: 'Balance Bracket', type: 'select', category: 'Account Info', options: ['0-10K','10K-1L','1L-5L','5L-25L','25L+'], operators: ['is'] },
    { field: 'days_since_last_txn', label: 'Days Since Last Transaction', type: 'number', category: 'Engagement', metricKey: 'days_since_last_txn', operators: ['gt','lt','eq'] },
    { field: 'emi_overdue', label: 'EMI Overdue', type: 'boolean', category: 'Lending', metricKey: 'emi_overdue', operators: ['is_true','is_false'] },
    // ... more fintech fields
  ],
  segmentTemplates: [
    { name: 'High-Value Transactors', filters: { logic: 'AND', rules: [{ field: 'total_transactions', operator: 'gt', value: 20 }, { field: 'total_debit', operator: 'gt', value: 5000000 }] } },
    { name: 'Dormant Accounts', filters: { logic: 'AND', rules: [{ field: 'days_since_last_txn', operator: 'gt', value: 90 }] } },
    { name: 'UPI Power Users', filters: { logic: 'AND', rules: [{ field: 'transaction_channel', operator: 'is', value: 'upi' }, { field: 'total_transactions', operator: 'gt', value: 30 }] } },
  ],
  flowTemplates: [
    { name: 'EMI Reminder', triggerEvent: 'emi_due', /* ... */ },
    { name: 'Onboarding', triggerEvent: 'account_created', /* ... */ },
    { name: 'Dormant Re-engagement', triggerEvent: 'segment_entered:dormant', /* ... */ },
    { name: 'Abandoned Loan Application', triggerEvent: 'loan_application_abandoned', /* ... */ },
  ],
  channels: ['email', 'sms', 'push', 'whatsapp'],
  computedMetrics: [
    { key: 'total_transactions', aggregation: 'count', eventFilter: { event_name: 'transaction_completed' } },
    { key: 'total_debit', aggregation: 'sum', eventFilter: { event_name: 'transaction_completed', 'properties.type': 'debit' }, property: 'amount' },
    { key: 'total_credit', aggregation: 'sum', eventFilter: { event_name: 'transaction_completed', 'properties.type': 'credit' }, property: 'amount' },
  ],
  complianceRules: {
    dataMasking: true,
    consentRequired: ['sms', 'whatsapp', 'email'],
    auditLog: true,
    retentionYears: 5,
  }
}
```

---

## Integration Adapters

### Adapter Interface

```typescript
type IntegrationAdapter = {
  type: string                           // 'shopify', 'api_key', 'stripe'

  // Auth
  authMethod: 'oauth' | 'api_key'
  getAuthUrl?(shop: string): string
  exchangeToken?(code: string): Promise<string>

  // Event ingestion
  normalizeEvent(payload: unknown, topic?: string): NormalizedEvent
  validateWebhook?(req: Request): boolean  // HMAC verification

  // Historical sync (optional)
  syncHistoricalData?(projectId: string, credentials: unknown): AsyncGenerator<NormalizedEvent>
}

type NormalizedEvent = {
  eventName: string
  customerId?: string
  customerEmail?: string
  customerPhone?: string
  properties: Record<string, unknown>
  timestamp: Date
  source: string
  idempotencyKey?: string
  entities?: { type: string; externalId: string; attributes: Record<string, unknown> }[]
}
```

### Shopify Adapter (extract existing code)
- `normalizeEvent()` — current `normalizePayload()` from eventProcessor.ts
- `validateWebhook()` — current HMAC verification
- `syncHistoricalData()` — current syncWorker logic
- No changes to external behavior

### API Key Adapter (new — for fintech + custom)
- `normalizeEvent()` — passthrough (event already in standard format)
- Auth via `X-API-Key` + `X-API-Secret` headers
- Optional IP whitelist check
- Rate limiting per key

---

## Event Processing Pipeline

```
Any Source (Shopify webhook, API call, SDK event)
     │
     ▼
┌─────────────────────────────┐
│ 1. Auth & Validation        │
│    - Shopify: HMAC check    │
│    - API Key: key + secret  │
│    - SDK: project token     │
├─────────────────────────────┤
│ 2. Data Masking (optional)  │
│    - Card number detection  │
│    - Aadhaar detection      │
│    - Auto-mask account nums │
├─────────────────────────────┤
│ 3. Normalize to Standard    │
│    Event Format             │
│    - Adapter.normalizeEvent │
├─────────────────────────────┤
│ 4. Identity Resolution      │
│    - Find/create customer   │
│    - Merge if match found   │
├─────────────────────────────┤
│ 5. Persist                  │
│    - Insert into events     │
│    - Upsert entities        │
├─────────────────────────────┤
│ 6. Publish to BullMQ        │
│    - metricsQueue (update   │
│      customer.metrics)      │
│    - segmentQueue (re-eval  │
│      affected segments)     │
│    - flowQueue (check flow  │
│      triggers)              │
└─────────────────────────────┘
```

---

## API Routes

### Existing (unchanged)
```
POST /api/webhooks/shopify/:topic      — Shopify webhooks
GET  /api/integrations/shopify/install — Shopify OAuth
GET  /api/integrations/shopify/callback
GET  /api/customers                    — List customers
GET  /api/segments                     — List segments
POST /api/segments                     — Create segment
GET  /api/flows                        — List flows
GET  /api/campaigns                    — List campaigns
POST /api/campaigns                    — Create campaign
```

### New Generic API (API key auth)
```
POST /api/v1/events                    — Ingest single event
POST /api/v1/events/batch              — Ingest batch (up to 1000)
POST /api/v1/customers                 — Upsert customer profile
POST /api/v1/customers/batch           — Batch upsert
GET  /api/v1/schema/fields             — Get domain field definitions
GET  /api/v1/schema/events             — Get supported event names

POST /api/v1/api-keys                  — Generate new API key (admin)
GET  /api/v1/api-keys                  — List API keys
DELETE /api/v1/api-keys/:id            — Revoke API key
```

### Project Onboarding
```
POST /api/projects                     — Create project with domain_type
GET  /api/projects/:id/setup           — Get setup instructions for domain
POST /api/projects/:id/connect/shopify — Start Shopify OAuth
POST /api/projects/:id/connect/api-key — Generate API keys
```

---

## Implementation Phases

### Phase 1: Foundation (Current Sprint)
1. Generic `events` + `entities` + `api_keys` + `identities` + `consents` tables
2. API key auth middleware
3. `POST /api/v1/events` endpoint
4. Data masking middleware
5. Domain registry module (ecommerce + fintech field definitions)
6. Precomputed metrics worker

### Phase 2: Segment Refactor
7. Refactor `fieldToSqlExpression` to use domain registry
8. Frontend filter builder loads fields from `/api/v1/schema/fields`
9. Fintech segment templates

### Phase 3: Flow + Campaign Adaptation
10. Fintech flow templates
11. Flow trigger evaluation (currently TODO)
12. Multi-channel action nodes (SMS placeholder)

### Phase 4: Onboarding + Polish
13. Project creation with domain type selection
14. Setup wizard (Shopify OAuth vs API key generation)
15. Dashboard adapts labels to domain

---

## Migration Strategy

The existing Shopify integration continues working unchanged. We:
1. Add new tables alongside existing ones
2. Shopify webhook handler continues writing to `orders`/`products` tables
3. New generic API writes to `events`/`entities` tables
4. Segment evaluator checks domain_type to pick field definitions
5. Existing ecommerce projects auto-tagged as `domain_type: 'ecommerce'`

No breaking changes. Additive only.
