import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { LifecycleChartData, LifecycleSegment, LifecycleDistributionBucket } from '@storees/shared'

/**
 * RFM-based lifecycle chart.
 *
 * Proper RFM:
 *   - R (Recency) = days since last ORDER (not last engagement event).
 *     Falls back to last_seen only when last_order_date is null.
 *   - F (Frequency) = total order count, bucketed by absolute thresholds
 *     (1 order = low, 2–5 = medium, 6+ = high).
 *   - M (Monetary) = total_spent, bucketed by the project's own P50/P90
 *     percentiles so "high value" reflects this project's actual top decile
 *     rather than an enforced 33% split.
 *
 * The 3×3 display grid is Recency × FM-combined value: F and M scores are
 * averaged and bucketed so the cells the chart shows ("Champions",
 * "Loyal", etc.) reflect both how often AND how much, not just spend.
 *
 * Returns segment distribution + aggregate metrics + F / M / R distributions.
 */
export async function getLifecycleChart(
  db: { execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }> },
  projectId: string,
): Promise<LifecycleChartData> {
  const result = await db.execute(sql`
    WITH buyers AS (
      SELECT
        id,
        total_orders,
        total_spent::numeric        AS total_spent,
        avg_order_value::numeric    AS aov,
        clv::numeric                AS clv,
        last_order_date,
        last_seen,
        -- R uses last_order_date (RFM definition: last purchase). Falls back
        -- to last_seen ONLY when last_order_date is null (legacy rows the
        -- aggregate worker hasn't populated yet).
        EXTRACT(EPOCH FROM (NOW() - COALESCE(last_order_date, last_seen))) / 86400.0 AS days_since_last_order
      FROM customers
      WHERE project_id = ${projectId} AND total_orders > 0
    ),
    -- Per-project monetary thresholds. P50 and P90 of total_spent give a
    -- distribution-shaped split — top 10% is "high", bottom half is "low" —
    -- instead of NTILE(3)'s forced equal-size buckets.
    thresholds AS (
      SELECT
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_spent), 0) AS p50_spent,
        COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_spent), 0) AS p90_spent
      FROM buyers
    ),
    customer_rfm AS (
      SELECT
        b.*,
        t.p50_spent,
        t.p90_spent,
        CASE
          WHEN b.days_since_last_order <= 30 THEN 'recent'
          WHEN b.days_since_last_order <= 90 THEN 'medium'
          ELSE 'lapsed'
        END AS recency_bucket,
        CASE
          WHEN b.total_orders >= 6 THEN 'high'
          WHEN b.total_orders >= 2 THEN 'medium'
          ELSE 'low'
        END AS frequency_bucket,
        CASE
          WHEN t.p90_spent > 0 AND b.total_spent >= t.p90_spent THEN 'high'
          WHEN t.p50_spent > 0 AND b.total_spent >= t.p50_spent THEN 'medium'
          ELSE 'low'
        END AS monetary_bucket
      FROM buyers b CROSS JOIN thresholds t
    ),
    customer_rfm_scored AS (
      SELECT *,
        -- Combine F + M into the value axis for the 3×3 grid. Both signals
        -- get equal weight; an F=high M=low customer (frequent small orders)
        -- and an F=low M=high customer (rare large orders) both land in
        -- "medium value" — distinct from a true high-value champion.
        CASE
          WHEN ((CASE frequency_bucket WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)
              + (CASE monetary_bucket  WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)) / 2.0 >= 2.5 THEN 'high'
          WHEN ((CASE frequency_bucket WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)
              + (CASE monetary_bucket  WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)) / 2.0 >= 1.5 THEN 'medium'
          ELSE 'low'
        END AS value_bucket
      FROM customer_rfm
    ),
    bucketed AS (
      SELECT
        recency_bucket,
        value_bucket,
        COUNT(*) AS contact_count
      FROM customer_rfm_scored
      GROUP BY recency_bucket, value_bucket
    ),
    total AS (
      SELECT
        (SELECT COUNT(*) FROM customer_rfm_scored) AS buyer_count,
        (SELECT COUNT(*) FROM customers WHERE project_id = ${projectId} AND total_orders = 0) AS no_purchase_count
    ),
    metrics AS (
      SELECT
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE total_orders > 1) / NULLIF(COUNT(*), 0), 1), 0) AS returning_pct,
        COALESCE(ROUND(AVG(total_orders)::numeric, 1), 0) AS avg_frequency,
        COALESCE(ROUND(AVG(aov), 2), 0) AS avg_purchase_value,
        COALESCE(ROUND(AVG(clv), 2), 0) AS avg_clv
      FROM customer_rfm_scored
    )
    SELECT
      b.recency_bucket,
      b.value_bucket,
      b.contact_count,
      t.buyer_count AS total_count,
      t.no_purchase_count,
      m.returning_pct,
      m.avg_frequency,
      m.avg_purchase_value,
      m.avg_clv
    FROM bucketed b
    CROSS JOIN total t
    CROSS JOIN metrics m
    ORDER BY b.recency_bucket, b.value_bucket
  `)

  const rows = result.rows
  const totalCount = Number(rows[0]?.total_count ?? 0) || 1

  // Build 3x3 grid
  const gridDef: { name: string; label: string; recency: string; value: string; row: number; col: number; color: string; tactics: string[] }[] = [
    { name: 'champions', label: 'Champions', recency: 'recent', value: 'high', row: 0, col: 2, color: '#10B981', tactics: ['Loyalty rewards', 'Early access to new products', 'Referral program'] },
    { name: 'loyal', label: 'Loyal', recency: 'recent', value: 'medium', row: 0, col: 1, color: '#34D399', tactics: ['Upsell campaigns', 'Cross-sell recommendations', 'VIP tier upgrades'] },
    { name: 'new_customers', label: 'New Customers', recency: 'recent', value: 'low', row: 0, col: 0, color: '#6EE7B7', tactics: ['Welcome series', 'First purchase discount', 'Product education'] },
    { name: 'potential_loyalists', label: 'Potential Loyalists', recency: 'medium', value: 'high', row: 1, col: 2, color: '#F59E0B', tactics: ['Reactivation email', 'Personalized offers', 'Feedback surveys'] },
    { name: 'needs_attention', label: 'Needs Attention', recency: 'medium', value: 'medium', row: 1, col: 1, color: '#FBBF24', tactics: ['Win-back campaign', 'Product reminders', 'Limited-time offers'] },
    { name: 'about_to_sleep', label: 'About to Sleep', recency: 'medium', value: 'low', row: 1, col: 0, color: '#FCD34D', tactics: ['Re-engagement email', 'Survey for feedback', 'Special discount'] },
    { name: 'cant_lose', label: "Can't Lose", recency: 'lapsed', value: 'high', row: 2, col: 2, color: '#EF4444', tactics: ['Urgent win-back', 'Personal outreach', 'Exclusive comeback offer'] },
    { name: 'at_risk', label: 'At Risk', recency: 'lapsed', value: 'medium', row: 2, col: 1, color: '#F87171', tactics: ['Re-engagement series', 'Incentive to return', 'Updated product showcase'] },
    { name: 'lost', label: 'Lost', recency: 'lapsed', value: 'low', row: 2, col: 0, color: '#FCA5A5', tactics: ['Final win-back attempt', 'Sunset email', 'List cleanup'] },
  ]

  const bucketMap = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.recency_bucket}_${row.value_bucket}`
    bucketMap.set(key, Number(row.contact_count))
  }

  const segments: LifecycleSegment[] = gridDef.map(def => {
    const count = bucketMap.get(`${def.recency}_${def.value}`) ?? 0
    return {
      name: def.name,
      label: def.label,
      percentage: Math.round((count / totalCount) * 100),
      contactCount: count,
      position: { row: def.row, col: def.col },
      color: def.color,
      retentionTactics: def.tactics,
    }
  })

  const noPurchaseCount = Number(rows[0]?.no_purchase_count ?? 0)
  const buyerCount = Number(rows[0]?.total_count ?? 0)

  const metrics = {
    returningCustomerPercentage: Number(rows[0]?.returning_pct ?? 0),
    avgPurchaseFrequency: Number(rows[0]?.avg_frequency ?? 0),
    avgPurchaseValue: Number(rows[0]?.avg_purchase_value ?? 0),
    avgClv: Number(rows[0]?.avg_clv ?? 0),
    noPurchaseCount,
    buyerCount,
  }

  // Compute actual distributions from buyer data. R uses last_order_date
  // (not last_seen) and M uses P50/P90 thresholds (not NTILE) — same rules
  // as the grid above, kept in sync.
  const distResult = await db.execute(sql`
    WITH buyers AS (
      SELECT
        total_orders,
        total_spent::numeric AS spent,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(last_order_date, last_seen))) / 86400.0 AS days_since_last_order
      FROM customers
      WHERE project_id = ${projectId} AND total_orders > 0
    ),
    thresholds AS (
      SELECT
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY spent), 0) AS p50_spent,
        COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY spent), 0) AS p90_spent
      FROM buyers
    ),
    freq_buckets AS (
      SELECT
        CASE
          WHEN total_orders = 1 THEN '1 order'
          WHEN total_orders BETWEEN 2 AND 3 THEN '2–3 orders'
          WHEN total_orders BETWEEN 4 AND 6 THEN '4–6 orders'
          WHEN total_orders BETWEEN 7 AND 10 THEN '7–10 orders'
          ELSE '11+ orders'
        END AS bucket,
        CASE
          WHEN total_orders = 1 THEN 0
          WHEN total_orders BETWEEN 2 AND 3 THEN 1
          WHEN total_orders BETWEEN 4 AND 6 THEN 2
          WHEN total_orders BETWEEN 7 AND 10 THEN 3
          ELSE 4
        END AS sort_order,
        COUNT(*) AS cnt
      FROM buyers
      GROUP BY bucket, sort_order
    ),
    monetary_buckets AS (
      SELECT
        CASE
          WHEN t.p90_spent > 0 AND b.spent >= t.p90_spent THEN 'High Value (top 10%)'
          WHEN t.p50_spent > 0 AND b.spent >= t.p50_spent THEN 'Medium Value'
          ELSE 'Low Value'
        END AS bucket,
        CASE
          WHEN t.p90_spent > 0 AND b.spent >= t.p90_spent THEN 2
          WHEN t.p50_spent > 0 AND b.spent >= t.p50_spent THEN 1
          ELSE 0
        END AS sort_order,
        COUNT(*) AS cnt
      FROM buyers b CROSS JOIN thresholds t
      GROUP BY bucket, sort_order
    ),
    recency_buckets AS (
      SELECT
        CASE
          WHEN days_since_last_order <= 30 THEN 'Recent (0–30d)'
          WHEN days_since_last_order <= 90 THEN 'Medium (31–90d)'
          ELSE 'Lapsed (90d+)'
        END AS bucket,
        CASE
          WHEN days_since_last_order <= 30 THEN 0
          WHEN days_since_last_order <= 90 THEN 1
          ELSE 2
        END AS sort_order,
        COUNT(*) AS cnt
      FROM buyers
      GROUP BY bucket, sort_order
    ),
    buyer_total AS (
      SELECT COUNT(*) AS total FROM buyers
    )
    SELECT 'frequency' AS dist_type, f.bucket, f.sort_order, f.cnt, bt.total
    FROM freq_buckets f CROSS JOIN buyer_total bt
    UNION ALL
    SELECT 'monetary', m.bucket, m.sort_order, m.cnt, bt.total
    FROM monetary_buckets m CROSS JOIN buyer_total bt
    UNION ALL
    SELECT 'recency', r.bucket, r.sort_order, r.cnt, bt.total
    FROM recency_buckets r CROSS JOIN buyer_total bt
    ORDER BY dist_type, sort_order
  `)

  function buildDistribution(type: string): LifecycleDistributionBucket[] {
    return distResult.rows
      .filter(r => r.dist_type === type)
      .map(r => ({
        label: String(r.bucket),
        count: Number(r.cnt),
        percentage: Math.round((Number(r.cnt) / Math.max(Number(r.total), 1)) * 100),
      }))
  }

  const frequencyDistribution = buildDistribution('frequency')
  const monetaryDistribution = buildDistribution('monetary')
  const recencyDistribution = buildDistribution('recency')

  return { segments, metrics, frequencyDistribution, monetaryDistribution, recencyDistribution }
}
