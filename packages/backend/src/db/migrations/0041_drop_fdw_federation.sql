-- 0041_drop_fdw_federation.sql
--
-- Standardise on event-driven ingestion (SDK + /api/v1/events + bulk import).
-- Removes the postgres_fdw federation infrastructure that was used for the
-- GoWelmart pilot.
--
-- ORDER OF OPERATIONS — IMPORTANT:
-- Before running this, you MUST have:
--   1. Deployed the customerAggregateWorker (commit hash to come) — events
--      now drive customer aggregates instead of the FDW MV.
--   2. Run gwm_one_time_event_backfill.sql to convert historical gwm.order
--      rows into `order_placed` events (idempotency_key prefix
--      'order_placed_historical:'). Aggregator's startup catch-up rolls
--      them into customers.total_spent / total_orders / etc.
--   3. Verified aggregates match — pick a few customers and confirm
--      total_spent didn't change after the cutover.
--
-- This migration then tears down:
--   - The Storees-side project_data_sources table
--   - The materialised view + foreign tables + FDW server on the source side
--
-- After this:
--   - GWM behaves like every other client (SDK + API + bulk import)
--   - No cron job hits gwm's DB
--   - Onboarding a new client is "give them an API key" — no schema mapping

-- ── 1. Drop Storees-side table ───────────────────────────────────────────
DROP TABLE IF EXISTS project_data_sources CASCADE;

-- ── 2. Drop FDW-side artefacts (materialised view, sync functions,
--      foreign tables, server). All idempotent.

DROP FUNCTION IF EXISTS sync_gwm_customer_attrs() CASCADE;
DROP FUNCTION IF EXISTS sync_gwm_agents(UUID) CASCADE;
DROP FUNCTION IF EXISTS sync_gwm_products(UUID) CASCADE;
DROP FUNCTION IF EXISTS sync_gwm_collections(UUID) CASCADE;
DROP FUNCTION IF EXISTS sync_gwm_orders(UUID, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS refresh_gwm_customer_attrs_mv() CASCADE;
DROP FUNCTION IF EXISTS normalize_indian_region(text) CASCADE;
DROP FUNCTION IF EXISTS normalize_city(text) CASCADE;

DROP MATERIALIZED VIEW IF EXISTS mv_gwm_customer_attrs CASCADE;
DROP VIEW IF EXISTS v_gwm_customer_attrs CASCADE;

-- gwm.* foreign tables — CASCADE drops both these and any dependent objects.
DROP SCHEMA IF EXISTS gwm CASCADE;

-- FDW server + user mapping
DROP SERVER IF EXISTS gwm_source CASCADE;

-- Extension itself can stay (harmless idle) or be dropped. Keeping in case
-- a future client opts back into FDW federation as an accelerator.
-- DROP EXTENSION IF EXISTS postgres_fdw;
