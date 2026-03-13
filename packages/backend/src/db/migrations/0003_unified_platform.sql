-- Migration: Unified Platform — generic events, entities, API keys, identities, consents
-- Adds support for multi-vertical (ecommerce, fintech, SaaS, custom)

-- 1. Extend projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS domain_type VARCHAR(20) NOT NULL DEFAULT 'ecommerce';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS integration_type VARCHAR(20) NOT NULL DEFAULT 'shopify';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- 2. Add metrics JSONB to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}';

-- 3. Add source + idempotency_key to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'api';
ALTER TABLE events ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency ON events(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 4. API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(255) NOT NULL DEFAULT 'Default',
  key_public VARCHAR(255) NOT NULL UNIQUE,
  key_secret_hash VARCHAR(255) NOT NULL,
  permissions JSONB DEFAULT '["write"]',
  ip_whitelist JSONB,
  rate_limit INTEGER NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(key_public) WHERE is_active = true;

-- 5. Entities (generic: orders, transactions, accounts, subscriptions)
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID REFERENCES customers(id),
  entity_type VARCHAR(50) NOT NULL,
  external_id VARCHAR(255),
  status VARCHAR(50),
  attributes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entities_project_type ON entities(project_id, entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entities_customer ON entities(project_id, customer_id, entity_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_external ON entities(project_id, entity_type, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_attributes ON entities USING GIN (attributes jsonb_path_ops);

-- 6. Identities (multi-identifier resolution)
CREATE TABLE IF NOT EXISTS identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  identifier_type VARCHAR(30) NOT NULL,
  identifier_value VARCHAR(255) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, identifier_type, identifier_value)
);
CREATE INDEX IF NOT EXISTS idx_identities_customer ON identities(customer_id);

-- 7. Consents
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  channel VARCHAR(20) NOT NULL,
  purpose VARCHAR(20) NOT NULL DEFAULT 'promotional',
  status VARCHAR(20) NOT NULL DEFAULT 'opted_in',
  source VARCHAR(20),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consents_customer ON consents(project_id, customer_id, channel);

-- 8. Communication Log (audit trail)
CREATE TABLE IF NOT EXISTS communication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  channel VARCHAR(20) NOT NULL,
  message_type VARCHAR(20) NOT NULL,
  template_id VARCHAR(255),
  content_hash VARCHAR(64),
  status VARCHAR(20) NOT NULL,
  provider_message_id VARCHAR(255),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comlog_customer ON communication_log(project_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comlog_channel ON communication_log(project_id, channel, created_at DESC);
