-- GowelMart: derive products table rows from existing events.line_items.
-- Populates product_name and product_id so the segment builder's Product
-- dropdown has real options. Categories (product_type) are NOT derivable
-- from line_items — fetch from the Medusa API separately if you need them.
--
-- Idempotent: ON CONFLICT DO NOTHING on (project_id, shopify_product_id).
-- Run AFTER the GowelMart customer/event import.

BEGIN;

-- Pull every distinct (product_id, product_name) pair that shows up in any
-- order_completed / add_to_cart / cart_abandoned / checkout_completed event.
INSERT INTO products (project_id, shopify_product_id, title, product_type, vendor, status)
SELECT DISTINCT
  e.project_id,
  (item->>'product_id')::varchar AS shopify_product_id,
  COALESCE(NULLIF(item->>'product_name', ''), 'Unknown product') AS title,
  '' AS product_type,      -- not available in line_items
  'GowelMart' AS vendor,
  'active' AS status
FROM events e,
  jsonb_array_elements(e.properties->'line_items') AS item
WHERE e.event_name IN ('order_completed', 'add_to_cart', 'cart_abandoned', 'checkout_completed')
  AND item->>'product_id' IS NOT NULL
  AND item->>'product_id' <> ''
ON CONFLICT (project_id, shopify_product_id) DO NOTHING;

COMMIT;

-- Verification:
--   SELECT COUNT(*) FROM products WHERE vendor = 'GowelMart';
--   SELECT title FROM products WHERE vendor = 'GowelMart' LIMIT 20;
