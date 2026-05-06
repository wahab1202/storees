-- 0023_data_source_federation.sql
-- Phase F-fed — federated data sources via postgres_fdw.
--
-- Storees stops syncing customer/order/product data from a merchant's
-- source-of-truth and instead reads it live (or via materialised views)
-- through Postgres foreign data wrapper. The Storees customers/orders/
-- products tables are still authoritative for Storees-native rows
-- (e.g. CTWA/widget leads), but federated projects' data lives in their
-- own DB and is projected in.
--
-- This migration creates the application-level metadata only. The actual
-- FDW server + user mapping + foreign tables + adapter views are in
-- packages/backend/src/db/data/ and run manually in prod with real
-- credentials (kept out of the migration to avoid leaking creds in git).

-- 1. postgres_fdw extension. Required for foreign servers / tables.
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- 2. Per-project data-source mapping. Tells the refresh worker which
--    projects need a federated view refresh + which fdw server to use.
CREATE TABLE IF NOT EXISTS project_data_sources (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL,        -- 'medusa_gwm' | 'shopify' | 'magento' | 'custom_pg'
  fdw_server_name VARCHAR(64),              -- references the postgres_fdw server name
  config JSONB NOT NULL DEFAULT '{}'::jsonb,-- non-secret routing params (host, port — for ops audit only)
  -- Refresh state
  last_refresh_at TIMESTAMPTZ,
  last_refresh_status VARCHAR(20),          -- 'success' | 'failed' | 'running'
  last_refresh_error TEXT,
  last_refresh_duration_ms INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_data_sources_active
  ON project_data_sources (source_type, is_active)
  WHERE is_active = TRUE;
