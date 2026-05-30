-- 0061_backfill_order_line_item_names.sql
--
-- Repair orders.line_items[].productName for rows where eventProcessor
-- pulled item.title — undefined for connectors (e.g. VirpanAI) that already
-- renamed source title -> product_name on line items, so productName was
-- written as an empty string. Recovers the missing name by looking up any
-- order event in the same project that has a line item with the same
-- product_id and a non-empty product_name.
--
-- Idempotent: only touches items whose productName is empty AND whose
-- productId is set AND for which a recovery is available. Re-running is a
-- no-op for rows that are now correct or that have no recovery source.

UPDATE orders o
SET line_items = (
  SELECT jsonb_agg(
    CASE
      WHEN (item->>'productName' IS NULL OR item->>'productName' = '')
       AND item->>'productId' IS NOT NULL
       AND item->>'productId' <> ''
       AND recovered.name IS NOT NULL
      THEN item || jsonb_build_object('productName', recovered.name)
      ELSE item
    END
  )
  FROM jsonb_array_elements(o.line_items::jsonb) AS item
  LEFT JOIN LATERAL (
    SELECT src->>'product_name' AS name
    FROM events e,
         jsonb_array_elements(e.properties->'line_items') AS src
    WHERE e.project_id = o.project_id
      AND e.event_name IN ('order_placed', 'order_completed')
      AND src->>'product_id' = item->>'productId'
      AND src->>'product_name' IS NOT NULL
      AND src->>'product_name' <> ''
    LIMIT 1
  ) recovered ON true
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(o.line_items::jsonb) AS item
  WHERE (item->>'productName' IS NULL OR item->>'productName' = '')
);
