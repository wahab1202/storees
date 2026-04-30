# Skill: Data Pipeline

## When to Use
Invoke this skill when working on data extraction, preparation, or loading for any ML model.

## Storees Database Schema (Relevant Tables)

### customers
```sql
id UUID PRIMARY KEY,
project_id UUID NOT NULL,
external_id TEXT,
email TEXT,
phone TEXT,
first_name TEXT,
last_name TEXT,
properties JSONB DEFAULT '{}',  -- custom user properties including propensity scores
created_at TIMESTAMP,
updated_at TIMESTAMP,
first_seen_at TIMESTAMP,
last_seen_at TIMESTAMP
```

### events
```sql
id UUID PRIMARY KEY,
project_id UUID NOT NULL,
customer_id UUID REFERENCES customers(id),
name TEXT NOT NULL,              -- event name (e.g., "product_viewed", "loan_page_viewed")
properties JSONB DEFAULT '{}',  -- event properties (e.g., {item_id: "X", amount: 5000})
item_id UUID,                   -- optional reference to items table
platform TEXT,                  -- "web", "mobile", "server", "shopify"
created_at TIMESTAMP NOT NULL
```

### items (may need to be created or upgraded)
```sql
id UUID PRIMARY KEY,
project_id UUID NOT NULL,
catalogue_id UUID,
type TEXT NOT NULL,              -- "product", "loan_product", "plan", "course"
name TEXT NOT NULL,
attributes JSONB DEFAULT '{}',  -- flexible typed attributes
status TEXT DEFAULT 'active',
created_at TIMESTAMP,
updated_at TIMESTAMP
```

### interactions (NEW — built in Phase 0)
```sql
id UUID PRIMARY KEY,
project_id UUID NOT NULL,
customer_id UUID REFERENCES customers(id),
item_id UUID REFERENCES items(id),
interaction_type TEXT NOT NULL,  -- "view", "engage", "intent", "conversion"
weight FLOAT NOT NULL,
source_event_id UUID REFERENCES events(id),
created_at TIMESTAMP NOT NULL
```

### segments, flows, flow_trips, campaigns — existing tables, consult backend schema for details.

## Temporal Split Rules
- ALWAYS split by time, NEVER randomly
- Default: train = events before 80th percentile timestamp, val = events after
- The split date must be a FIXED date computed once and used consistently across all models
- Store split_date in `data/split_metadata.json` so all models use the same cutoff
- Features for validation users must be computed using ONLY data before split_date (cutoff_date parameter)

## Data Loading Patterns
```python
# Standard loading pattern for any model
from shared.prepare import load_data
from shared.config import load_tenant_config

config = load_tenant_config(tenant_id)
data = load_data(tenant_id, days_back=90)

# data.events_train, data.events_val — DataFrames
# data.interactions_train, data.interactions_val — DataFrames
# data.user_features — DataFrame (features computed with cutoff_date)
# data.item_catalogue — DataFrame
# data.split_date — datetime
```

## Parquet File Convention
- All data cached to `packages/ml/data/<tenant_id>/`
- Re-extracted when older than 24 hours OR when `--force` flag passed
- Parquet chosen for: fast read, columnar compression, type preservation

## Connection Handling
- Read from DATABASE_URL environment variable (should point to read replica in production)
- Connection pool: max 5 connections
- Retry on connection failure: 3 attempts with 2s backoff
- Timeout: 30s per query
