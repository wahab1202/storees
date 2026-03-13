-- Migration 0005: Race condition fixes + performance indexes
-- Fixes: duplicate customers, duplicate flow trips, missing indexes

-- ============ UNIQUE PARTIAL INDEXES ON CUSTOMERS ============
-- Prevents duplicate customers from concurrent identity resolution
-- Partial indexes (WHERE NOT NULL) allow multiple NULLs

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique
  ON customers(project_id, email) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique
  ON customers(project_id, phone) WHERE phone IS NOT NULL;

-- Note: idx_customers_external already exists as uniqueIndex in schema.ts

-- ============ FLOW TRIP DEDUPLICATION ============
-- Prevents duplicate active/waiting trips per customer per flow
-- Uses partial index to only cover active states

CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_trips_one_active
  ON flow_trips(flow_id, customer_id)
  WHERE status IN ('active', 'waiting');

-- ============ PERFORMANCE INDEXES ============
-- Flow trip lookups by (flow_id, customer_id, status) — hot path in triggerWorker
CREATE INDEX IF NOT EXISTS idx_flow_trips_lookup
  ON flow_trips(flow_id, customer_id, status);

-- Events by customer + event name — hot path in metrics, funnels, conditions
CREATE INDEX IF NOT EXISTS idx_events_customer_event
  ON events(project_id, customer_id, event_name, timestamp);

-- ============ DEAD LETTER EVENTS ============
-- Stores failed events for retry/debugging

CREATE TABLE IF NOT EXISTS dead_letter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  source VARCHAR(30) NOT NULL, -- 'webhook' | 'api' | 'batch'
  event_name VARCHAR(100),
  raw_payload JSONB NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'retried' | 'discarded'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retried_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_pending
  ON dead_letter_events(status, created_at) WHERE status = 'pending';
