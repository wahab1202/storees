-- gwm_federated_products_orders.sql
--
-- Phase F-fed extension — sync products, collections, and orders (with line items)
-- from gwm into Storees-native tables. Pairs with gwm_federated_views.sql which
-- already imported the gwm foreign tables. This file adds three sync functions
-- called every 5min by federationRefreshWorker.
--
-- Schema reality (discovered via \d on the foreign tables):
--   gwm.cat_product:    id (text), name (text — always 'Product' literal),
--                        data (jsonb — { title, handle, status, collection_id,
--                        type_id, ... }), timestamps
--   gwm.order:          id, customer_id, status, currency_code, is_draft_order,
--                        canceled_at, deleted_at, ...
--   gwm.order_item:     id, order_id, item_id, quantity, unit_price, ...
--                        (Medusa v2 junction — NOT order_line_item directly)
--   gwm.order_line_item: id, product_id, product_title, product_type,
--                        product_collection, unit_price, ...
--                        (denormalised line snapshot — does NOT have order_id
--                         or quantity; those live on order_item)
--
-- The product 'title' is in data->>'title', NOT a column. There's no
-- product_type / vendor / image_url column or JSONB key — leave those
-- empty for now. Collections come from the denormalised
-- order_line_item.product_collection (per-line text names) — gives us real
-- collection names but only for products that have been ordered at least once.
--
-- Idempotent: re-running this file replaces the functions in place.

SET search_path = public;

-- ── 1. Products ────────────────────────────────────────────────────────────
-- Pull from gwm.cat_product. Title comes from the data JSONB. status maps:
--   gwm.deleted_at IS NOT NULL → 'archived'
--   data->>'status' = 'rejected' → 'archived'
--   else 'active'
--
-- product_type + vendor: cat_product itself doesn't carry these as columns
-- or JSONB keys, BUT order_line_item denormalises them — each line item
-- captures the product's type at time of purchase. Use the most recent
-- non-empty value seen for each product. Means product_type populates only
-- for SKUs that have been ordered at least once; that's acceptable because
-- "has_purchased <category>" segments only match buyers anyway.

CREATE OR REPLACE FUNCTION sync_gwm_products(p_project_id UUID)
RETURNS TABLE(upserted_count INT)
SECURITY DEFINER
SET search_path = public, gwm
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- For each product_id, pick the most recent line item's product_type
  -- and product_collection (denormalised text labels — the real names).
  -- DISTINCT ON is the standard Postgres pattern for "latest per group".
  line_meta AS (
    SELECT DISTINCT ON (oli.product_id)
      oli.product_id,
      NULLIF(TRIM(oli.product_type), '')      AS product_type,
      NULLIF(TRIM(oli.product_collection), '') AS product_collection
    FROM gwm.order_line_item oli
    WHERE oli.product_id IS NOT NULL
    ORDER BY oli.product_id, oli.created_at DESC NULLS LAST
  ),
  applied AS (
    INSERT INTO products (project_id, shopify_product_id, title, product_type, vendor, image_url, status)
    SELECT
      p_project_id,
      LEFT(cp.id, 255),
      LEFT(COALESCE(NULLIF(TRIM(cp.data->>'title'), ''), NULLIF(TRIM(cp.data->>'handle'), ''), 'Untitled'), 500),
      -- product_type from the latest order_line_item, falls back to ''.
      LEFT(COALESCE(lm.product_type, ''), 255),
      ''::varchar,    -- vendor: no source available anywhere yet
      NULL,           -- image_url: no source available yet
      CASE
        WHEN cp.deleted_at IS NOT NULL THEN 'archived'
        WHEN cp.data->>'status' = 'rejected' THEN 'archived'
        ELSE 'active'
      END
    FROM gwm.cat_product cp
    LEFT JOIN line_meta lm ON lm.product_id = cp.id
    ON CONFLICT (project_id, shopify_product_id) DO UPDATE SET
      title = EXCLUDED.title,
      -- Only overwrite product_type when the new value is non-empty. Keeps
      -- an already-classified product from being blanked out if it stops
      -- appearing in recent line items.
      product_type = CASE
        WHEN EXCLUDED.product_type <> '' THEN EXCLUDED.product_type
        ELSE products.product_type
      END,
      status = EXCLUDED.status,
      updated_at = NOW()
    WHERE
      products.title        IS DISTINCT FROM EXCLUDED.title
      OR products.status    IS DISTINCT FROM EXCLUDED.status
      OR (EXCLUDED.product_type <> '' AND products.product_type IS DISTINCT FROM EXCLUDED.product_type)
    RETURNING 1
  )
  SELECT COUNT(*)::int FROM applied;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Collections ─────────────────────────────────────────────────────────
-- Source: distinct order_line_item.product_collection values (denormalised
-- text names of collections each line was bought from). Means a product needs
-- to have been ordered at least once to appear in a collection — acceptable
-- limitation for now; segment filters that match by collection only need to
-- find customers who actually bought from that collection anyway.
--
-- Junction (product_collections): for every (product, collection) pair seen
-- in order_line_item, link them. Multiple line items for the same product can
-- claim different collections in the same JOIN — DISTINCT collapses dupes.

CREATE OR REPLACE FUNCTION sync_gwm_collections(p_project_id UUID)
RETURNS TABLE(upserted_collections INT, linked_products INT)
SECURITY DEFINER
SET search_path = public, gwm
AS $$
DECLARE
  v_collections INT;
  v_links INT;
BEGIN
  -- Upsert distinct collection names from order line items.
  WITH src AS (
    SELECT DISTINCT TRIM(oli.product_collection) AS title
    FROM gwm.order_line_item oli
    WHERE oli.product_collection IS NOT NULL
      AND TRIM(oli.product_collection) <> ''
  ),
  applied AS (
    INSERT INTO collections (project_id, shopify_collection_id, title, collection_type)
    SELECT
      p_project_id,
      LEFT('gwm-coll:' || MD5(s.title), 255),
      LEFT(s.title, 500),
      'custom'
    FROM src s
    ON CONFLICT (project_id, shopify_collection_id) DO UPDATE SET
      title = EXCLUDED.title,
      updated_at = NOW()
    WHERE collections.title IS DISTINCT FROM EXCLUDED.title
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_collections FROM applied;

  -- Re-link product_collections: clear existing links for this project's
  -- products, then derive from line items. Cheap because the junction is a
  -- pure derived index — no per-row external state to preserve.
  DELETE FROM product_collections
  WHERE product_id IN (SELECT id FROM products WHERE project_id = p_project_id);

  WITH pairs AS (
    SELECT DISTINCT p.id AS product_id, col.id AS collection_id
    FROM gwm.order_line_item oli
    JOIN products p
      ON p.project_id = p_project_id
      AND p.shopify_product_id = oli.product_id
    JOIN collections col
      ON col.project_id = p_project_id
      AND col.shopify_collection_id = 'gwm-coll:' || MD5(TRIM(oli.product_collection))
    WHERE oli.product_collection IS NOT NULL
      AND TRIM(oli.product_collection) <> ''
  ),
  linked AS (
    INSERT INTO product_collections (product_id, collection_id)
    SELECT product_id, collection_id FROM pairs
    ON CONFLICT (product_id, collection_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_links FROM linked;

  RETURN QUERY SELECT v_collections, v_links;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Orders (incremental) ────────────────────────────────────────────────
-- Pulls gwm.order rows whose updated_at > since, joins to Storees customers
-- via external_id, aggregates line items via the order_item junction. The
-- aggregated JSONB matches the segment evaluator's expected shape:
--   [{ productId, productName, quantity, price }]
-- so `has_purchased <product_name>` works without further changes.
--
-- Total: SUM(order_item.unit_price * quantity) — Medusa's authoritative
-- billed amount (vs catalog price on order_line_item which can drift after
-- discounts).
--
-- Filter: skip drafts, deleted, and cancelled orders. Marketing analytics
-- almost always wants "real" completed-or-pending orders, not exploratory carts.

CREATE OR REPLACE FUNCTION sync_gwm_orders(
  p_project_id UUID,
  p_since TIMESTAMPTZ
)
RETURNS TABLE(upserted_count INT, max_updated_at TIMESTAMPTZ)
SECURITY DEFINER
SET search_path = public, gwm
AS $$
DECLARE
  v_count INT;
  v_max TIMESTAMPTZ;
BEGIN
  -- Pin the watermark up-front so concurrent gwm writes don't get missed
  -- by both this tick and the next.
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
      AND o.canceled_at IS NULL
      AND o.is_draft_order = FALSE
  ),
  -- Per-order aggregate: total + line_items JSONB. Done via a correlated
  -- subquery rather than GROUP BY so the line_items JSONB stays per-order
  -- and the total is the same SUM expression.
  resolved AS (
    SELECT
      ow.id AS gwm_order_id,
      c.id AS customer_id,
      ow.currency_code,
      ow.created_at,
      ow.updated_at,
      ow.status,
      (SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
       FROM gwm.order_item oi
       WHERE oi.order_id = ow.id
         AND oi.deleted_at IS NULL) AS total,
      (SELECT jsonb_agg(jsonb_build_object(
         'productId',   oli.product_id,
         'productName', COALESCE(NULLIF(TRIM(oli.product_title), ''), 'Item'),
         'quantity',    oi.quantity,
         'price',       oi.unit_price
       ) ORDER BY oli.id)
       FROM gwm.order_item oi
       JOIN gwm.order_line_item oli ON oli.id = oi.item_id
       WHERE oi.order_id = ow.id
         AND oi.deleted_at IS NULL) AS line_items
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
    WHERE r.line_items IS NOT NULL  -- drop orders with no resolvable line items
    ON CONFLICT (project_id, external_order_id) DO UPDATE SET
      status     = EXCLUDED.status,
      total      = EXCLUDED.total,
      currency   = EXCLUDED.currency,
      line_items = EXCLUDED.line_items
    WHERE
      orders.status     IS DISTINCT FROM EXCLUDED.status
      OR orders.total      IS DISTINCT FROM EXCLUDED.total
      OR orders.line_items IS DISTINCT FROM EXCLUDED.line_items
    RETURNING customer_id, created_at
  )
  -- Bump customers.last_seen to the order's created_at when a real order
  -- is attached. Two reasons:
  --   1. The customers list page sorts by last_seen — a customer who placed
  --      an order yesterday should appear "active" even if they haven't
  --      visited the website (no SDK events).
  --   2. Cart abandonment / "active in last 7 days" segments use last_seen.
  --      Without this bump, a federated-only customer never qualifies.
  -- Only advance forward — GREATEST() so a stale order doesn't roll back a
  -- newer SDK event timestamp.
  -- Aggregate per-customer first: one tick can apply multiple orders for the
  -- same customer; updating the target row multiple times is undefined in
  -- Postgres. Take MAX(created_at) per customer to update once.
  , bumped AS (
    UPDATE customers c
    SET last_seen = GREATEST(c.last_seen, latest.max_created_at),
        updated_at = NOW()
    FROM (
      SELECT customer_id, MAX(created_at) AS max_created_at
      FROM applied
      GROUP BY customer_id
    ) latest
    WHERE c.id = latest.customer_id
      AND c.last_seen < latest.max_created_at
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM applied;

  RETURN QUERY SELECT v_count, v_max;
END;
$$ LANGUAGE plpgsql;
