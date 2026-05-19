-- 0050: backfill customers.clv from total_spent
--
-- Reason: the event-driven aggregate worker (customerAggregateWorker.ts)
-- updated total_spent on order_placed events but never wrote to the clv
-- column, so for any project whose orders flowed through the event
-- pipeline (rather than a bulk Shopify sync), every customer's CLV stayed
-- at 0 even after orders landed. The customer list page surfaced this
-- as Total Spent = ₹X but CLV = ₹0 for the same row.
--
-- The aggregate worker now writes to both columns in the same UPDATE.
-- This migration repairs historical rows in one shot.

UPDATE customers
SET clv = total_spent,
    updated_at = NOW()
WHERE clv = 0
  AND total_spent > 0;
