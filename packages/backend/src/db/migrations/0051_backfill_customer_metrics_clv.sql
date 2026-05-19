-- 0051: backfill customers.metrics.clv_historical from total_spent
--
-- Reason: the customer detail page reads `metrics.clv_historical` (a JSONB
-- field) — not the `clv` column or `total_spent` column. Three separate
-- storage points for the same fact: (a) clv column, (b) total_spent column,
-- (c) metrics.clv_historical JSONB.
--
-- The event-driven aggregate worker writes (a) and (b) on each order event
-- but historically didn't touch (c). Only the bulk-sync path in
-- customerService.processOrder writes all three. So for any project whose
-- orders came through the event pipeline (e.g. Gowelmart via dataSyncService),
-- (c) stayed empty — and the customer detail Customer Lifetime Value card
-- showed ₹0 even though Total Spent was ₹23,95,140.
--
-- Going forward the worker now writes (c) too. This migration repairs the
-- historical rows in one shot. Idempotent — only fires when there's actual
-- spend AND clv_historical is missing or zero.

UPDATE customers
SET metrics = jsonb_set(
      COALESCE(metrics, '{}'::jsonb),
      '{clv_historical}',
      to_jsonb(total_spent::numeric)
    ),
    updated_at = NOW()
WHERE total_spent::numeric > 0
  AND (
    metrics IS NULL
    OR NOT (metrics ? 'clv_historical')
    OR COALESCE((metrics->>'clv_historical')::numeric, 0) = 0
  );
