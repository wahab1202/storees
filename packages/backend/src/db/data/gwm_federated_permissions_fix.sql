-- gwm_federated_permissions_fix.sql
--
-- Fix for: "must be owner of materialized view mv_gwm_customer_attrs"
--
-- The federation worker connects as the application's DB role (whatever's
-- in DATABASE_URL — typically `storees` or similar). When the setup files
-- (gwm_federated_views.sql + gwm_federated_products_orders.sql) were
-- applied via `sudo -u postgres psql`, postgres became the owner of:
--   - the materialised view mv_gwm_customer_attrs
--   - the foreign tables under the gwm schema
--   - the sync_gwm_* functions
--
-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires the caller to be the
-- owner of the view or a superuser. The app role is neither → every
-- worker tick fails at step 1 and never gets to the products/orders sync.
--
-- Solution: redefine all sync functions with SECURITY DEFINER. They then
-- execute with the privileges of the function owner (postgres), so the
-- internal REFRESH + cross-schema reads + writes succeed even when the
-- caller is the unprivileged app role. Plus a small wrapper for the bare
-- REFRESH call that lives in the worker (workers/federationRefreshWorker.ts).
--
-- Idempotent: ALTER FUNCTION ... SECURITY DEFINER and CREATE OR REPLACE
-- both safe to re-run.

-- ── 1. Flip every existing sync function to SECURITY DEFINER ───────────────
ALTER FUNCTION sync_gwm_customer_attrs() SECURITY DEFINER;
ALTER FUNCTION sync_gwm_agents(UUID) SECURITY DEFINER;
ALTER FUNCTION sync_gwm_products(UUID) SECURITY DEFINER;
ALTER FUNCTION sync_gwm_collections(UUID) SECURITY DEFINER;
ALTER FUNCTION sync_gwm_orders(UUID, TIMESTAMPTZ) SECURITY DEFINER;

-- ── 2. SECURITY DEFINER wrapper for the standalone MV refresh ──────────────
-- The worker today calls REFRESH MATERIALIZED VIEW CONCURRENTLY directly.
-- Wrap it so the app role can invoke it via SELECT without owning the view.
-- search_path is pinned so the function can't be hijacked into refreshing
-- some shadow view if the caller's path is weird.
CREATE OR REPLACE FUNCTION refresh_gwm_customer_attrs_mv()
RETURNS void
SECURITY DEFINER
SET search_path = public, gwm
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_gwm_customer_attrs;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Grant EXECUTE to whichever role the app uses ────────────────────────
-- SECURITY DEFINER functions still require EXECUTE for non-owners to call
-- them. PUBLIC covers every role including the app's. Functions are
-- read-only against gwm and write only to tables the app already writes to
-- elsewhere — no privilege escalation risk.
GRANT EXECUTE ON FUNCTION sync_gwm_customer_attrs()                    TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_gwm_agents(UUID)                        TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_gwm_products(UUID)                      TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_gwm_collections(UUID)                   TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_gwm_orders(UUID, TIMESTAMPTZ)           TO PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_gwm_customer_attrs_mv()              TO PUBLIC;
