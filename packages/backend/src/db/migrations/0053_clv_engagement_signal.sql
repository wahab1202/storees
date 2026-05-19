-- 0053: recompute clv + metrics.clv_* using the engagement-aware CLV model
--
-- Supersedes 0052. The new model:
--   - Considers last_seen alongside last_order_date so a customer who's
--     browsing but not buying gets a re-engagement label, not "Churned".
--   - Adds a 'lapsed_engaged' health state for that case.
--   - Adds a 'new' health state for customers with no orders yet but
--     recent first_seen (signed up but haven't bought yet).
--   - Dampens predicted CLV by an engagement multiplier based on
--     days_since_last_seen (×1.15 / 1.0 / 0.75 / 0.5).
--   - Falls back to days_since_last_seen when last_order_date is NULL,
--     instead of tenureDays (which incorrectly marked imported customers
--     "churned" by default when the worker hadn't populated last_order_date).
--   - Exposes days_since_last_order and days_since_last_seen in metrics so
--     the Lifecycle card stops showing em dashes.
--
-- This SQL mirrors computeClv() in services/customerService.ts.

WITH base AS (
  SELECT
    c.id,
    c.total_spent::numeric                                                                    AS total_spent,
    c.total_orders                                                                            AS total_orders,
    c.first_order_date                                                                        AS first_order_date,
    c.last_order_date                                                                         AS last_order_date,
    c.last_seen                                                                               AS last_seen,
    c.metrics                                                                                 AS metrics,
    CASE WHEN c.first_order_date IS NOT NULL
         THEN GREATEST(1, EXTRACT(EPOCH FROM (NOW() - c.first_order_date)) / 86400.0)
         ELSE 1 END                                                                           AS tenure_days,
    CASE WHEN c.last_seen IS NOT NULL
         THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - c.last_seen)) / 86400.0)
         ELSE NULL END                                                                        AS days_since_last_seen
  FROM customers c
),
-- Buyer rows (have an order history)
buyers AS (
  SELECT
    *,
    -- Days since last order — falls back to days_since_last_seen when
    -- last_order_date is NULL (matches the JS fallback logic).
    COALESCE(
      CASE WHEN last_order_date IS NOT NULL
           THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - last_order_date)) / 86400.0)
           ELSE NULL END,
      days_since_last_seen,
      tenure_days
    )                                                                                          AS days_since_last_order,
    CASE WHEN total_orders > 0 THEN total_spent / total_orders ELSE 0 END                      AS aov,
    total_orders / GREATEST(1.0, tenure_days / 30.44)                                          AS monthly_freq,
    GREATEST(
      1.0,
      CASE
        WHEN total_orders > 1
        THEN (EXTRACT(EPOCH FROM (COALESCE(last_order_date, NOW()) - first_order_date)) / 86400.0) / (total_orders - 1)
        ELSE tenure_days
      END
    )                                                                                          AS avg_gap_days
  FROM base
  WHERE total_orders > 0 AND first_order_date IS NOT NULL
),
buyers_with_churn AS (
  SELECT
    *,
    days_since_last_order / avg_gap_days                                                       AS overdue_ratio,
    CASE
      WHEN total_orders = 1                              THEN 0.6
      WHEN days_since_last_order / avg_gap_days <= 1     THEN 0.05
      WHEN days_since_last_order / avg_gap_days <= 2     THEN 0.15 + (days_since_last_order / avg_gap_days - 1) * 0.2
      WHEN days_since_last_order / avg_gap_days <= 3     THEN 0.35 + (days_since_last_order / avg_gap_days - 2) * 0.3
      ELSE LEAST(0.95, 0.65 + (days_since_last_order / avg_gap_days - 3) * 0.1)
    END                                                                                        AS churn_prob,
    -- Engagement multiplier
    CASE
      WHEN days_since_last_seen IS NULL                  THEN 1.0
      WHEN days_since_last_seen <= 7                     THEN 1.15
      WHEN days_since_last_seen <= 30                    THEN 1.0
      WHEN days_since_last_seen <= 90                    THEN 0.75
      ELSE                                                    0.5
    END                                                                                        AS engagement_mult
  FROM buyers
),
buyers_final AS (
  SELECT
    *,
    GREATEST(0.01, 1 - POWER(GREATEST(0, 1 - churn_prob), 1.0 / 12))                           AS monthly_churn,
    LEAST(36, 1.0 / GREATEST(0.01, 1 - POWER(GREATEST(0, 1 - churn_prob), 1.0 / 12)))          AS retention_months
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

-- Non-buyers: zero predicted/historical but health depends on engagement.
-- 'new' when last_seen <= 30 days (signed up + active), else 'churned'.
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
    'days_since_last_order', 'null'::jsonb,
    'days_since_last_seen',  CASE WHEN last_seen IS NOT NULL
                                  THEN to_jsonb(ROUND(EXTRACT(EPOCH FROM (NOW() - last_seen)) / 86400.0))
                                  ELSE 'null'::jsonb END,
    'clv_health',
      CASE
        WHEN last_seen IS NOT NULL
             AND EXTRACT(EPOCH FROM (NOW() - last_seen)) / 86400.0 <= 30
        THEN 'new'
        ELSE 'churned'
      END
  ),
  updated_at = NOW()
WHERE total_orders = 0;
