-- 0052: recompute customers.clv + metrics.clv_* using a SQL-emulated CLV
-- model for every customer with order history.
--
-- Replaces the placeholder backfill in 0051 (which only set clv_historical
-- = total_spent and left clv_predicted = 0). After this migration:
--
--   customers.clv (column)           = total CLV (historical + predicted)
--   customers.metrics.clv_historical = total_spent
--   customers.metrics.clv_predicted  = AOV × monthly_freq × retention_months
--   customers.metrics.clv_total      = same as customers.clv
--   customers.metrics.clv_health     = 'growing' | 'stable' | 'declining' | 'at_risk' | 'churned'
--
-- This mirrors the JS computeClv() in customerService.ts. The aggregate
-- worker now calls computeClv() on every revenue event, so new orders keep
-- everything in sync going forward.
--
-- Reasoning for moving the canonical CLV onto the same column readers already
-- look at: ~15 readers across backend + frontend already select customers.clv.
-- Dropping the column would break every one of them. Making the column
-- actually mean what its label claims (lifetime VALUE, not just lifetime
-- spend) keeps the API stable while fixing the semantic.

WITH clv_calc AS (
  SELECT
    c.id,
    c.total_spent::numeric                                                     AS total_spent,
    c.total_orders                                                             AS total_orders,
    c.first_order_date                                                         AS first_order_date,
    c.last_order_date                                                          AS last_order_date,
    -- tenure in days (min 1 to avoid div-by-zero)
    GREATEST(1, EXTRACT(EPOCH FROM (NOW() - c.first_order_date)) / 86400.0)    AS tenure_days,
    -- days since last order
    EXTRACT(EPOCH FROM (NOW() - c.last_order_date)) / 86400.0                  AS days_since_last,
    -- AOV
    CASE WHEN c.total_orders > 0 THEN c.total_spent::numeric / c.total_orders ELSE 0 END AS aov
  FROM customers c
  WHERE c.total_orders > 0
    AND c.first_order_date IS NOT NULL
),
clv_with_freq AS (
  SELECT
    *,
    total_orders / GREATEST(1.0, tenure_days / 30.44)                          AS monthly_freq,
    -- Avg gap between orders, defended against the same-day-multiple-orders
    -- case where (last - first) = 0 and we'd otherwise hit division by zero
    -- in the overdue ratio. Treat zero-gap as 1 day, which gives a sane
    -- "ordered today" overdue ratio rather than infinity.
    GREATEST(
      1.0,
      CASE
        WHEN total_orders > 1
        THEN (EXTRACT(EPOCH FROM (last_order_date - first_order_date)) / 86400.0) / (total_orders - 1)
        ELSE tenure_days
      END
    )                                                                          AS avg_gap_days
  FROM clv_calc
),
clv_with_churn AS (
  SELECT
    *,
    -- overdue ratio: days_since_last / avg_gap. avg_gap >= 1 above.
    days_since_last / avg_gap_days                                             AS overdue_ratio,
    -- churn probability (matches the JS heuristic in computeClv)
    CASE
      WHEN total_orders = 1                              THEN 0.6
      WHEN days_since_last / avg_gap_days <= 1           THEN 0.05
      WHEN days_since_last / avg_gap_days <= 2           THEN 0.15 + (days_since_last / avg_gap_days - 1) * 0.2
      WHEN days_since_last / avg_gap_days <= 3           THEN 0.35 + (days_since_last / avg_gap_days - 2) * 0.3
      ELSE LEAST(0.95, 0.65 + (days_since_last / avg_gap_days - 3) * 0.1)
    END                                                                        AS churn_prob
  FROM clv_with_freq
),
clv_final AS (
  SELECT
    id,
    total_spent,
    total_orders,
    aov,
    days_since_last,
    overdue_ratio,
    monthly_freq,
    churn_prob,
    -- monthly_churn = 1 - (1 - churn_prob)^(1/12), floor at 0.01
    GREATEST(0.01, 1 - POWER(GREATEST(0, 1 - churn_prob), 1.0 / 12))           AS monthly_churn,
    -- retention months = capped 1/monthly_churn
    LEAST(36, 1.0 / GREATEST(0.01, 1 - POWER(GREATEST(0, 1 - churn_prob), 1.0 / 12)))
                                                                                AS retention_months
  FROM clv_with_churn
)
UPDATE customers c
SET
  clv = ROUND((cf.total_spent + GREATEST(0, cf.aov * cf.monthly_freq * cf.retention_months))::numeric, 2),
  metrics = COALESCE(c.metrics, '{}'::jsonb) || jsonb_build_object(
    'clv_historical',        ROUND(cf.total_spent::numeric, 2),
    'clv_predicted',         ROUND(GREATEST(0, cf.aov * cf.monthly_freq * cf.retention_months)::numeric, 2),
    'clv_total',             ROUND((cf.total_spent + GREATEST(0, cf.aov * cf.monthly_freq * cf.retention_months))::numeric, 2),
    'clv_monthly_frequency', ROUND(cf.monthly_freq::numeric, 2),
    'clv_retention_months',  ROUND(cf.retention_months::numeric, 1),
    'clv_churn_probability', ROUND(cf.churn_prob::numeric, 3),
    'clv_health',
      CASE
        WHEN cf.days_since_last > 180 THEN 'churned'
        WHEN cf.overdue_ratio > 3     THEN 'at_risk'
        WHEN cf.overdue_ratio > 1.5   THEN 'declining'
        WHEN cf.overdue_ratio > 0.8   THEN 'stable'
        ELSE                               'growing'
      END
  ),
  updated_at = NOW()
FROM clv_final cf
WHERE c.id = cf.id;

-- Zero out customers with no orders (defensive — keeps clv consistent for
-- everyone, not just buyers)
UPDATE customers
SET
  clv = 0,
  metrics = COALESCE(metrics, '{}'::jsonb) || jsonb_build_object(
    'clv_historical',        0,
    'clv_predicted',         0,
    'clv_total',             0,
    'clv_monthly_frequency', 0,
    'clv_retention_months',  0,
    'clv_churn_probability', 1,
    'clv_health',            'churned'
  ),
  updated_at = NOW()
WHERE total_orders = 0;
