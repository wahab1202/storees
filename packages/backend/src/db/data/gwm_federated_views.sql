-- gwm_federated_views.sql
-- Foreign tables + adapter views + materialised view for the GWM merchant.
--
-- Run AFTER setup_fdw_gwm.sql. Idempotent — re-runs cleanly when the GWM
-- schema changes upstream.
--
-- Architecture:
--
--   gwm.* (foreign tables)
--      ↓ JOIN + transform
--   v_gwm_customer_attrs (regular view, on-demand live read)
--      ↓ refresh on schedule
--   mv_gwm_customer_attrs (materialised view, indexed, fast for segments)
--      ↓ apply
--   customers (Storees-native columns updated from MV by the refresh worker)
--
-- The Storees segment evaluator queries `customers.region`, `customers.city`,
-- `customers.total_orders` etc. directly — no evaluator code change needed.
-- The refresh worker syncs MV → customers columns every N minutes.

-- ── 1. Foreign tables (project the gwm DB into a `gwm` schema) ─────────────

CREATE SCHEMA IF NOT EXISTS gwm;

-- Drop + reimport so schema drift in gwm gets picked up. Foreign tables are
-- cheap to recreate; no data is touched.
DROP FOREIGN TABLE IF EXISTS gwm.customer CASCADE;
DROP FOREIGN TABLE IF EXISTS gwm.customer_address CASCADE;
DROP FOREIGN TABLE IF EXISTS gwm."order" CASCADE;
DROP FOREIGN TABLE IF EXISTS gwm.order_summary CASCADE;
DROP FOREIGN TABLE IF EXISTS gwm.order_line_item CASCADE;
DROP FOREIGN TABLE IF EXISTS gwm.order_item CASCADE;
DROP FOREIGN TABLE IF EXISTS gwm.dealer CASCADE;
DROP FOREIGN TABLE IF EXISTS gwm.dealer_order CASCADE;
DROP FOREIGN TABLE IF EXISTS gwm.cat_product CASCADE;

-- Import every table EXCEPT `order` — it has a custom enum
-- (`public.order_status_enum`) that doesn't exist on the Storees side, and
-- IMPORT FOREIGN SCHEMA can't auto-translate. We create that one by hand
-- below with `text` for the status column, which is what we'd cast to anyway.
IMPORT FOREIGN SCHEMA public
  LIMIT TO (
    customer,
    customer_address,
    order_summary,
    order_line_item,
    order_item,
    dealer,
    dealer_order,
    cat_product
  )
  FROM SERVER gwm_source INTO gwm;

-- Manually create gwm."order" with status as text (avoids the enum dependency).
-- Column list mirrors the source schema we surveyed; only `status` is degraded
-- from the enum to text — the segment evaluator only ever reads it as a string.
CREATE FOREIGN TABLE gwm."order" (
  id                  text NOT NULL,
  region_id           text,
  display_id          integer,
  customer_id         text,
  version             integer NOT NULL,
  sales_channel_id    text,
  status              text NOT NULL,
  is_draft_order      boolean NOT NULL,
  email               text,
  currency_code       text NOT NULL,
  shipping_address_id text,
  billing_address_id  text,
  no_notification     boolean,
  metadata            jsonb,
  created_at          timestamp with time zone NOT NULL,
  updated_at          timestamp with time zone NOT NULL,
  deleted_at          timestamp with time zone,
  canceled_at         timestamp with time zone
) SERVER gwm_source
OPTIONS (schema_name 'public', table_name 'order');

-- ── 2. Live view: gwm-shaped → Storees-shaped ──────────────────────────────

-- One row per (Storees customer that exists in gwm).
-- Computed: region, city, total_orders, total_spent, first/last order date,
-- most-recent dealer.
--
-- IMPORTANT: this is a regular VIEW (live read). The materialised version
-- below is what Storees actually uses on the hot path.
CREATE OR REPLACE VIEW v_gwm_customer_attrs AS
SELECT
  sc.id           AS customer_id,
  sc.project_id,
  sc.external_id  AS gwm_customer_id,

  -- Address: prefer billing address, fall back to shipping
  ga.province     AS region,
  ga.city,

  -- Order aggregates (computed live from gwm)
  COALESCE(o_stats.total_orders, 0)   AS total_orders,
  COALESCE(o_stats.total_spent, 0)    AS total_spent,
  o_stats.first_order_date,
  o_stats.last_order_date,
  CASE WHEN COALESCE(o_stats.total_orders, 0) > 0
       THEN o_stats.total_spent / o_stats.total_orders
       ELSE 0 END                     AS avg_order_value,

  -- Most-recent dealer (from gwm.dealer_order JOIN gwm.order)
  most_recent_dealer.dealer_id        AS gwm_dealer_id,
  most_recent_dealer.dealer_name      AS gwm_dealer_name
FROM customers sc
JOIN gwm.customer gc
  ON gc.id = sc.external_id
  AND gc.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT a.province, a.city
  FROM gwm.customer_address a
  WHERE a.customer_id = gc.id AND a.deleted_at IS NULL
  ORDER BY a.is_default_billing DESC, a.is_default_shipping DESC, a.updated_at DESC
  LIMIT 1
) ga ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS total_orders,
    COALESCE(SUM((osu.totals->>'total')::numeric), 0)::numeric(12,2) AS total_spent,
    MIN(o.created_at) AS first_order_date,
    MAX(o.created_at) AS last_order_date
  FROM gwm."order" o
  LEFT JOIN gwm.order_summary osu ON osu.order_id = o.id
  WHERE o.customer_id = gc.id
    AND o.deleted_at IS NULL
    AND o.canceled_at IS NULL
) o_stats ON TRUE
LEFT JOIN LATERAL (
  SELECT d.id AS dealer_id, d.name AS dealer_name
  FROM gwm.dealer_order do_
  JOIN gwm."order" o ON o.id = do_.order_id
  JOIN gwm.dealer d ON d.id = do_.dealer_id
  WHERE o.customer_id = gc.id
    AND do_.deleted_at IS NULL
    AND o.deleted_at IS NULL
  ORDER BY do_.created_at DESC
  LIMIT 1
) most_recent_dealer ON TRUE
WHERE sc.project_id IN (
  SELECT project_id FROM project_data_sources
  WHERE source_type = 'medusa_gwm' AND is_active = TRUE
);

-- ── 3. Materialised view (indexed, refreshed periodically) ─────────────────

DROP MATERIALIZED VIEW IF EXISTS mv_gwm_customer_attrs;

CREATE MATERIALIZED VIEW mv_gwm_customer_attrs AS
  SELECT * FROM v_gwm_customer_attrs;

-- Unique index = required for REFRESH MATERIALIZED VIEW CONCURRENTLY (no
-- read locks during refresh — Storees keeps serving while it rebuilds).
CREATE UNIQUE INDEX idx_mv_gwm_customer_attrs_pkey
  ON mv_gwm_customer_attrs (customer_id);
CREATE INDEX idx_mv_gwm_customer_attrs_project
  ON mv_gwm_customer_attrs (project_id);

-- ── 4. Sync materialised view → customers columns ──────────────────────────
-- This is what makes the existing segment evaluator "just work" — region,
-- city, total_orders etc. are live in the customers table within ~5min of
-- a change in gwm. Done as a function so the refresh worker can call it.

CREATE OR REPLACE FUNCTION sync_gwm_customer_attrs()
RETURNS TABLE(updated_count INT) AS $$
BEGIN
  RETURN QUERY
  WITH applied AS (
    UPDATE customers c
    SET
      region = mv.region,
      city = mv.city,
      total_orders = mv.total_orders,
      total_spent = mv.total_spent,
      first_order_date = mv.first_order_date,
      last_order_date = mv.last_order_date,
      avg_order_value = mv.avg_order_value,
      updated_at = NOW()
    FROM mv_gwm_customer_attrs mv
    WHERE c.id = mv.customer_id
      AND (
        c.region IS DISTINCT FROM mv.region
        OR c.city IS DISTINCT FROM mv.city
        OR c.total_orders IS DISTINCT FROM mv.total_orders
        OR c.total_spent IS DISTINCT FROM mv.total_spent
        OR c.first_order_date IS DISTINCT FROM mv.first_order_date
        OR c.last_order_date IS DISTINCT FROM mv.last_order_date
      )
    RETURNING 1
  )
  SELECT COUNT(*)::int FROM applied;
END;
$$ LANGUAGE plpgsql;

-- ── 5. Sync agents (dealers) ───────────────────────────────────────────────
-- One agent row per dealer for federated projects. Customer.agent_id is
-- linked through customer's `gwm_dealer_id` from the MV.
-- Run after the MV refresh.

CREATE OR REPLACE FUNCTION sync_gwm_agents(p_project_id UUID)
RETURNS TABLE(upserted_count INT, linked_customers INT) AS $$
DECLARE
  v_upserted INT;
  v_linked INT;
BEGIN
  -- Upsert dealers as agents
  WITH ins AS (
    INSERT INTO agents (project_id, external_dealer_id, name, email, phone, region, is_active)
    SELECT
      p_project_id,
      d.id,
      COALESCE(NULLIF(TRIM(d.name), ''), 'Dealer ' || d.id),
      NULLIF(d.email, ''),
      NULLIF(d.phone, ''),
      NULLIF(d.state, ''),
      d.deleted_at IS NULL
    FROM gwm.dealer d
    WHERE d.deleted_at IS NULL OR d.deleted_at IS NOT NULL  -- include all; is_active reflects deletion
    ON CONFLICT (project_id, external_dealer_id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      region = EXCLUDED.region,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_upserted FROM ins;

  -- Link customers.agent_id via gwm_dealer_id from MV
  WITH applied AS (
    UPDATE customers c
    SET agent_id = a.id, updated_at = NOW()
    FROM mv_gwm_customer_attrs mv
    JOIN agents a
      ON a.project_id = c.project_id
      AND a.external_dealer_id = mv.gwm_dealer_id
    WHERE c.id = mv.customer_id
      AND c.project_id = p_project_id
      AND c.agent_id IS DISTINCT FROM a.id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_linked FROM applied;

  RETURN QUERY SELECT v_upserted, v_linked;
END;
$$ LANGUAGE plpgsql;

-- ── 6. One-shot register the GWM project for federation ────────────────────
-- Run this ONCE for the GoWelmart project after the FDW connection works.
-- Adjust the project_id to match your prod Storees project.

INSERT INTO project_data_sources (project_id, source_type, fdw_server_name, config)
VALUES (
  'a3fe60d4-aa5f-4db1-b775-ee926de78611',  -- GoWelmart prod project id
  'medusa_gwm',
  'gwm_source',
  '{"host": "187.127.162.252", "dbname": "gwm_dev_db", "note": "switch to gwm prod when available"}'::jsonb
)
ON CONFLICT (project_id) DO UPDATE SET
  source_type = EXCLUDED.source_type,
  fdw_server_name = EXCLUDED.fdw_server_name,
  config = EXCLUDED.config,
  is_active = TRUE,
  updated_at = NOW();

-- Also flip the agentScopedAccess flag so dealer/region/city segment fields
-- light up in the builder. The MV will populate them within minutes.
UPDATE projects
SET features = features || '{"agentScopedAccess": true}'::jsonb
WHERE id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611'
  AND NOT (features ? 'agentScopedAccess');

-- ── 7. Initial refresh + sync ──────────────────────────────────────────────
-- First run is non-concurrent (a unique index needs to exist before
-- CONCURRENTLY can be used, and the unique index is created above with
-- the MV. Subsequent refreshes by the worker use CONCURRENTLY).

REFRESH MATERIALIZED VIEW mv_gwm_customer_attrs;
SELECT * FROM sync_gwm_customer_attrs();
SELECT * FROM sync_gwm_agents('a3fe60d4-aa5f-4db1-b775-ee926de78611');

-- ── 8. Verification ────────────────────────────────────────────────────────

SELECT
  COUNT(*) AS total_in_mv,
  COUNT(region) AS with_region,
  COUNT(city) AS with_city,
  COUNT(*) FILTER (WHERE total_orders > 0) AS with_orders,
  ROUND(AVG(total_spent)::numeric, 2) AS avg_total_spent
FROM mv_gwm_customer_attrs;

SELECT
  (SELECT COUNT(*) FROM customers WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611' AND region IS NOT NULL) AS customers_with_region,
  (SELECT COUNT(*) FROM customers WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611' AND city IS NOT NULL) AS customers_with_city,
  (SELECT COUNT(*) FROM customers WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611' AND agent_id IS NOT NULL) AS customers_with_agent,
  (SELECT COUNT(*) FROM agents WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611') AS dealer_count;
