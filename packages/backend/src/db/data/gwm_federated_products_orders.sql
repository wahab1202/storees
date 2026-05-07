-- gwm_federated_products_orders.sql
--
-- Phase F-fed extension — sync products, collections, and orders (with line items)
-- from gwm into Storees-native tables. Pairs with gwm_federated_views.sql which
-- already imported gwm.cat_product / gwm.order / gwm.order_line_item as foreign
-- tables. This file adds three sync functions called every 5min by
-- federationRefreshWorker:
--
--   sync_gwm_products(project_id)      → INSERT/UPSERT cat_product → products
--   sync_gwm_collections(project_id)   → derive distinct categories → collections
--                                        + populate product_collections junction
--   sync_gwm_orders(project_id, since) → incremental: orders.updated_at > since
--                                        with line_items aggregated as JSONB
--                                        in the shape the segment evaluator
--                                        already reads at evaluator.ts:120
--
-- The orders sync is incremental — `since` is read from
-- project_data_sources.config -> 'orders' -> 'lastSyncedAt' on the worker side
-- and bumped after each successful tick. Products + collections are full upserts
-- (catalog is small enough that a 5min full pass is cheap).
--
-- Idempotent: re-running this file replaces the functions in place.

SET search_path = public;

-- ── 1. Products ────────────────────────────────────────────────────────────
-- gwm.cat_product columns we use:
--   id (text)         → products.shopify_product_id (we reuse this column for
--                       any external-catalog-id, varchar(255))
--   title (text)      → products.title (varchar 500)
--   category (text)   → products.product_type (varchar 255)  [also drives collections]
--   brand (text)      → products.vendor (varchar 255)
--   image_url (text)  → products.image_url (varchar 2048)
--   deleted_at        → maps to products.status ('active' | 'archived')
--
-- Defensive truncation everywhere — gwm columns are unbounded text; Storees
-- has varchar limits. LEFT() prevents 22001 errors on overlong values.

CREATE OR REPLACE FUNCTION sync_gwm_products(p_project_id UUID)
RETURNS TABLE(upserted_count INT) AS $$
BEGIN
  RETURN QUERY
  WITH applied AS (
    INSERT INTO products (project_id, shopify_product_id, title, product_type, vendor, image_url, status)
    SELECT
      p_project_id,
      LEFT(cp.id, 255),
      LEFT(COALESCE(NULLIF(TRIM(cp.title), ''), 'Untitled'), 500),
      LEFT(COALESCE(NULLIF(TRIM(cp.category), ''), ''), 255),
      LEFT(COALESCE(NULLIF(TRIM(cp.brand), ''), ''), 255),
      LEFT(NULLIF(cp.image_url, ''), 2048),
      CASE WHEN cp.deleted_at IS NULL THEN 'active' ELSE 'archived' END
    FROM gwm.cat_product cp
    ON CONFLICT (project_id, shopify_product_id) DO UPDATE SET
      title = EXCLUDED.title,
      product_type = EXCLUDED.product_type,
      vendor = EXCLUDED.vendor,
      image_url = EXCLUDED.image_url,
      status = EXCLUDED.status,
      updated_at = NOW()
    WHERE
      products.title         IS DISTINCT FROM EXCLUDED.title
      OR products.product_type IS DISTINCT FROM EXCLUDED.product_type
      OR products.vendor       IS DISTINCT FROM EXCLUDED.vendor
      OR products.image_url    IS DISTINCT FROM EXCLUDED.image_url
      OR products.status       IS DISTINCT FROM EXCLUDED.status
    RETURNING 1
  )
  SELECT COUNT(*)::int FROM applied;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Collections ─────────────────────────────────────────────────────────
-- Medusa's `cat_product.category` is a free-text field — we treat each distinct
-- non-empty value as a Storees collection. The shopify_collection_id slot stores
-- a stable hash of the category name (md5) so re-runs find the same row.
--
-- Then re-populate the product_collections junction so segments like
-- "has_purchased X collection" can JOIN through it.

CREATE OR REPLACE FUNCTION sync_gwm_collections(p_project_id UUID)
RETURNS TABLE(upserted_collections INT, linked_products INT) AS $$
DECLARE
  v_collections INT;
  v_links INT;
BEGIN
  -- Upsert collections (one row per distinct cat_product.category value)
  WITH categories AS (
    SELECT DISTINCT TRIM(cp.category) AS title
    FROM gwm.cat_product cp
    WHERE cp.category IS NOT NULL AND TRIM(cp.category) <> ''
  ),
  applied AS (
    INSERT INTO collections (project_id, shopify_collection_id, title, collection_type)
    SELECT
      p_project_id,
      LEFT('gwm-cat:' || MD5(c.title), 255),
      LEFT(c.title, 500),
      'custom'
    FROM categories c
    ON CONFLICT (project_id, shopify_collection_id) DO UPDATE SET
      title = EXCLUDED.title,
      updated_at = NOW()
    WHERE collections.title IS DISTINCT FROM EXCLUDED.title
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_collections FROM applied;

  -- Re-link product_collections: clear existing links for this project and
  -- repopulate from cat_product.category. Cheap because product_collections
  -- has no per-row external state — it's purely derived.
  DELETE FROM product_collections
  WHERE product_id IN (SELECT id FROM products WHERE project_id = p_project_id);

  WITH linked AS (
    INSERT INTO product_collections (product_id, collection_id)
    SELECT p.id, col.id
    FROM products p
    JOIN gwm.cat_product cp ON cp.id = p.shopify_product_id
    JOIN collections col
      ON col.project_id = p_project_id
      AND col.shopify_collection_id = 'gwm-cat:' || MD5(TRIM(cp.category))
    WHERE p.project_id = p_project_id
      AND cp.category IS NOT NULL AND TRIM(cp.category) <> ''
    ON CONFLICT (product_id, collection_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_links FROM linked;

  RETURN QUERY SELECT v_collections, v_links;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Orders (incremental) ────────────────────────────────────────────────
-- Pulls gwm.order rows whose updated_at > since, joins customer_id through
-- the storees `customers.external_id` mapping (set by the customer-attrs sync),
-- aggregates line items into a JSONB array matching the existing evaluator
-- shape: [{ productId, productName, quantity, price }].
--
-- Why incremental: gwm has potentially 100K+ orders. Full re-insert every 5min
-- is wasteful. The worker passes `since` from
-- project_data_sources.config->'orders'->>'lastSyncedAt'. On first run,
-- pass NULL → backfills everything.
--
-- Total + currency: gwm.order doesn't carry a single 'total' column; we sum
-- order_line_item.unit_price * quantity. That matches what the customer-attrs
-- MV uses for total_spent.

CREATE OR REPLACE FUNCTION sync_gwm_orders(
  p_project_id UUID,
  p_since TIMESTAMPTZ
)
RETURNS TABLE(upserted_count INT, max_updated_at TIMESTAMPTZ) AS $$
DECLARE
  v_count INT;
  v_max TIMESTAMPTZ;
BEGIN
  -- First pass: pick the max updated_at we'll process. Returned to the caller
  -- so it can store as the next cursor. Pinning it here (vs computing after
  -- the INSERT) avoids a race where new gwm.order rows arrive mid-sync and
  -- end up missed by the next tick.
  SELECT MAX(o.updated_at) INTO v_max
  FROM gwm."order" o
  WHERE p_since IS NULL OR o.updated_at > p_since;

  IF v_max IS NULL THEN
    RETURN QUERY SELECT 0, p_since;
    RETURN;
  END IF;

  WITH order_window AS (
    SELECT o.*
    FROM gwm."order" o
    WHERE (p_since IS NULL OR o.updated_at > p_since)
      AND o.updated_at <= v_max
      AND o.deleted_at IS NULL
      AND o.is_draft_order = FALSE
  ),
  -- Map gwm customer_id (text Medusa id) → Storees customers.id (uuid)
  -- via customers.external_id.
  resolved AS (
    SELECT
      ow.id AS gwm_order_id,
      c.id AS customer_id,
      ow.currency_code,
      ow.created_at,
      ow.updated_at,
      ow.status,
      (SELECT jsonb_agg(jsonb_build_object(
         'productId',   oli.product_id,
         'productName', COALESCE(NULLIF(TRIM(cp.title), ''), 'Item'),
         'quantity',    oli.quantity,
         'price',       oli.unit_price
       ))
       FROM gwm.order_line_item oli
       LEFT JOIN gwm.cat_product cp ON cp.id = oli.product_id
       WHERE oli.order_id = ow.id) AS line_items,
      (SELECT COALESCE(SUM(oli.unit_price * oli.quantity), 0)
       FROM gwm.order_line_item oli
       WHERE oli.order_id = ow.id) AS total
    FROM order_window ow
    JOIN customers c
      ON c.project_id = p_project_id
      AND c.external_id = ow.customer_id
  ),
  applied AS (
    INSERT INTO orders (
      project_id, customer_id, external_order_id, status,
      total, discount, currency, line_items, created_at, fulfilled_at
    )
    SELECT
      p_project_id,
      r.customer_id,
      LEFT(r.gwm_order_id, 255),
      LEFT(COALESCE(r.status, 'pending'), 20),
      r.total,
      0,
      LEFT(COALESCE(r.currency_code, 'INR'), 3),
      COALESCE(r.line_items, '[]'::jsonb),
      r.created_at,
      NULL
    FROM resolved r
    ON CONFLICT (project_id, external_order_id) DO UPDATE SET
      status     = EXCLUDED.status,
      total      = EXCLUDED.total,
      currency   = EXCLUDED.currency,
      line_items = EXCLUDED.line_items
    WHERE
      orders.status     IS DISTINCT FROM EXCLUDED.status
      OR orders.total      IS DISTINCT FROM EXCLUDED.total
      OR orders.line_items IS DISTINCT FROM EXCLUDED.line_items
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM applied;

  RETURN QUERY SELECT v_count, v_max;
END;
$$ LANGUAGE plpgsql;
