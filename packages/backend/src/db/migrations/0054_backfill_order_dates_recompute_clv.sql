-- 0054: backfill first_order_date / last_order_date from events, then
-- recompute CLV for any customer who was skipped by 0053 because their date
-- columns were null at the time.
--
-- Why this exists: when historical orders are imported via dataSyncService,
-- the row's total_spent / total_orders get populated by the aggregate worker
-- on each event. The worker also sets first_order_date and last_order_date
-- in the same UPDATE. But for some customers (likely those where the worker
-- raced with the bulk-recompute SQL, or where the bulk recompute fired
-- before the worker had a chance to run) the spend totals landed on the
-- row WITHOUT the date columns. Migration 0053's WHERE clause then skipped
-- them, leaving clv = 0 even though they have orders worth crores.
--
-- This migration:
--   1. Reads events grouped by customer to derive first/last order timestamps.
--   2. Patches customers.first_order_date / last_order_date when null.
--   3. Bumps total_orders if events count > recorded total_orders (defensive).
--   4. Re-runs the same engagement-aware CLV math as 0053 for now-eligible
--      customers, so clv and metrics.clv_* finally populate.

-- ── 1. Backfill date columns from events ──────────────────────────────────
WITH order_dates AS (
  SELECT
    e.customer_id,
    e.project_id,
    MIN(e.timestamp)::timestamptz AS first_order_at,
    MAX(e.timestamp)::timestamptz AS last_order_at,
    COUNT(*)                      AS event_order_count
  FROM events e
  WHERE e.event_name IN ('order_placed', 'order_completed')
    AND e.customer_id IS NOT NULL
  GROUP BY e.customer_id, e.project_id
)
UPDATE customers c
SET
  first_order_date = COALESCE(c.first_order_date, od.first_order_at),
  last_order_date  = COALESCE(c.last_order_date,  od.last_order_at),
  -- Conservative: only raise total_orders, never lower it. Some imports
  -- count via the orders table separately so events alone may undercount.
  total_orders     = GREATEST(c.total_orders, od.event_order_count),
  last_seen        = GREATEST(COALESCE(c.last_seen, od.last_order_at), od.last_order_at),
  updated_at       = NOW()
FROM order_dates od
WHERE c.id = od.customer_id
  AND (
    c.first_order_date IS NULL
    OR c.last_order_date IS NULL
    OR c.total_orders < od.event_order_count
  );

-- ── 2. Recompute CLV for everyone with orders + dates (same model as 0053) ──
WITH base AS (
  SELECT
    c.id,
    c.total_spent::numeric                                                                   AS total_spent,
    c.total_orders                                                                           AS total_orders,
    c.first_order_date,
    c.last_order_date,
    c.last_seen,
    c.metrics,
    GREATEST(1, EXTRACT(EPOCH FROM (NOW() - c.first_order_date)) / 86400.0)                  AS tenure_days,
    CASE WHEN c.last_seen IS NOT NULL
         THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - c.last_seen)) / 86400.0)
         ELSE NULL END                                                                       AS days_since_last_seen
  FROM customers c
  WHERE c.total_orders > 0 AND c.first_order_date IS NOT NULL
),
buyers AS (
  SELECT
    *,
    COALESCE(
      CASE WHEN last_order_date IS NOT NULL
           THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - last_order_date)) / 86400.0)
           ELSE NULL END,
      days_since_last_seen,
      tenure_days
    )                                                                                         AS days_since_last_order,
    CASE WHEN total_orders > 0 THEN total_spent / total_orders ELSE 0 END                     AS aov,
    total_orders / GREATEST(1.0, tenure_days / 30.44)                                         AS monthly_freq,
    GREATEST(
      1.0,
      CASE
        WHEN total_orders > 1
        THEN (EXTRACT(EPOCH FROM (COALESCE(last_order_date, NOW()) - first_order_date)) / 86400.0) / (total_orders - 1)
        ELSE tenure_days
      END
    )                                                                                         AS avg_gap_days
  FROM base
),
buyers_with_churn AS (
  SELECT
    *,
    days_since_last_order / avg_gap_days                                                      AS overdue_ratio,
    CASE
      WHEN total_orders = 1                              THEN 0.6
      WHEN days_since_last_order / avg_gap_days <= 1     THEN 0.05
      WHEN days_since_last_order / avg_gap_days <= 2     THEN 0.15 + (days_since_last_order / avg_gap_days - 1) * 0.2
      WHEN days_since_last_order / avg_gap_days <= 3     THEN 0.35 + (days_since_last_order / avg_gap_days - 2) * 0.3
      ELSE LEAST(0.95, 0.65 + (days_since_last_order / avg_gap_days - 3) * 0.1)
    END                                                                                       AS churn_prob,
    CASE
      WHEN days_since_last_seen IS NULL                  THEN 1.0
      WHEN days_since_last_seen <= 7                     THEN 1.15
      WHEN days_since_last_seen <= 30                    THEN 1.0
      WHEN days_since_last_seen <= 90                    THEN 0.75
      ELSE                                                    0.5
    END                                                                                       AS engagement_mult
  FROM buyers
),
buyers_final AS (
  SELECT
    *,
    GREATEST(0.01, 1 - POWER(GREATEST(0, 1 - churn_prob), 1.0 / 12))                          AS monthly_churn,
    LEAST(36, 1.0 / GREATEST(0.01, 1 - POWER(GREATEST(0, 1 - churn_prob), 1.0 / 12)))         AS retention_months
  FROM buyers_with_churn
)
UPDATE customers c
SET
  clv = ROUND((bf.total_spent + GREATEST(0, bf.aov * bf.monthly_freq * bf.retention_months * bf.engagement_mult))::numeric, 2),
  metrics = COALESCE(c.metrics, '{}'::jsonb) || jsonb_build_object(
    'clv_historical',        ROUND(bf.total_spent::numeric, 2),
    'clv_predicted',         ROUND(GREATEST(0, bf.aov * bf.monthly_freq * bf.retention_months * bf.engagement_mult)::numeric, 2),
    'clv_total',             ROUND((bf.total_spent + GREATEST(0, bf.aov * bf.monthly_freq * bf.retention_months * bf.engagement_mult))::numeric, 2),
    'clv_monthly_frequency', ROUND(bf.monthly_freq::numeric, 2),
    'clv_retention_months',  ROUND(bf.retention_months::numeric, 1),
    'clv_churn_probability', ROUND(bf.churn_prob::numeric, 3),
    'days_since_last_order', ROUND(bf.days_since_last_order::numeric),
    'days_since_last_seen',  CASE WHEN bf.days_since_last_seen IS NOT NULL
                                  THEN to_jsonb(ROUND(bf.days_since_last_seen::numeric))
                                  ELSE 'null'::jsonb END,
    'clv_health',
      CASE
        WHEN bf.days_since_last_order > 180
          THEN CASE WHEN bf.days_since_last_seen IS NOT NULL AND bf.days_since_last_seen <= 60
                    THEN 'lapsed_engaged' ELSE 'churned' END
        WHEN bf.overdue_ratio > 3
          THEN CASE WHEN bf.days_since_last_seen IS NOT NULL AND bf.days_since_last_seen <= 60
                    THEN 'at_risk' ELSE 'churned' END
        WHEN bf.overdue_ratio > 1.5 THEN 'declining'
        WHEN bf.overdue_ratio > 0.8 THEN 'stable'
        ELSE                              'growing'
      END
  ),
  updated_at = NOW()
FROM buyers_final bf
WHERE c.id = bf.id;
