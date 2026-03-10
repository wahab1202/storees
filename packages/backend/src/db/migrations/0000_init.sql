-- 0000_init.sql
-- Storees database schema — all tables + indexes

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ PROJECTS ============

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  shopify_domain VARCHAR(255) UNIQUE,
  shopify_access_token VARCHAR(512),
  business_type VARCHAR(20) NOT NULL DEFAULT 'ecommerce',
  webhook_secret VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ CUSTOMERS ============

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  external_id VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  name VARCHAR(255),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent DECIMAL(12,2) NOT NULL DEFAULT 0,
  avg_order_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  clv DECIMAL(12,2) NOT NULL DEFAULT 0,
  email_subscribed BOOLEAN NOT NULL DEFAULT false,
  sms_subscribed BOOLEAN NOT NULL DEFAULT false,
  push_subscribed BOOLEAN NOT NULL DEFAULT false,
  whatsapp_subscribed BOOLEAN NOT NULL DEFAULT false,
  custom_attributes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_project ON customers(project_id);
CREATE UNIQUE INDEX idx_customers_external ON customers(project_id, external_id);
CREATE INDEX idx_customers_email ON customers(project_id, email);
CREATE INDEX idx_customers_last_seen ON customers(project_id, last_seen DESC);

-- ============ SEGMENTS ============

CREATE TABLE IF NOT EXISTS segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'custom',
  description TEXT,
  filters JSONB NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ CUSTOMER SEGMENTS (junction) ============

CREATE TABLE IF NOT EXISTS customer_segments (
  customer_id UUID NOT NULL REFERENCES customers(id),
  segment_id UUID NOT NULL REFERENCES segments(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_customer_segments_unique ON customer_segments(customer_id, segment_id);
CREATE INDEX idx_customer_segments_segment ON customer_segments(segment_id);

-- ============ ORDERS ============

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  external_order_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  total DECIMAL(12,2) NOT NULL,
  discount DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  line_items JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  fulfilled_at TIMESTAMPTZ
);

CREATE INDEX idx_orders_customer ON orders(project_id, customer_id, created_at DESC);
CREATE UNIQUE INDEX idx_orders_external ON orders(project_id, external_order_id);
CREATE INDEX idx_orders_status ON orders(project_id, status);

-- ============ EVENTS ============

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID REFERENCES customers(id),
  event_name VARCHAR(100) NOT NULL,
  properties JSONB DEFAULT '{}',
  platform VARCHAR(30) NOT NULL,
  session_id VARCHAR(255),
  timestamp TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_trigger ON events(project_id, event_name, timestamp DESC);
CREATE INDEX idx_events_customer ON events(project_id, customer_id, timestamp DESC);
CREATE INDEX idx_events_recent ON events(project_id, received_at DESC);

-- ============ FLOWS ============

CREATE TABLE IF NOT EXISTS flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_config JSONB NOT NULL,
  exit_config JSONB,
  nodes JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ FLOW TRIPS ============

CREATE TABLE IF NOT EXISTS flow_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_node_id VARCHAR(100) NOT NULL,
  context JSONB DEFAULT '{}',
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at TIMESTAMPTZ
);

CREATE INDEX idx_trips_active ON flow_trips(flow_id, status);
CREATE INDEX idx_trips_customer ON flow_trips(customer_id, flow_id);

-- ============ SCHEDULED JOBS ============

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_trip_id UUID NOT NULL REFERENCES flow_trips(id),
  execute_at TIMESTAMPTZ NOT NULL,
  action JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_pending ON scheduled_jobs(status, execute_at);

-- ============ EMAIL TEMPLATES ============

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  html_body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
