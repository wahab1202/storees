import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { LifecycleChartData, LifecycleSegment, LifecycleDistributionBucket } from '@storees/shared'

/**
 * RFM-based lifecycle chart.
 * Buckets customers into a 3x3 grid based on Recency and Value.
 * Returns segment distribution + aggregate metrics.
 */
export async function getLifecycleChart(
  db: { execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }> },
  projectId: string,
): Promise<LifecycleChartData> {
  // RFM analysis on BUYERS ONLY (customers with at least 1 order).
  // Contacts with zero purchases don't belong in Recency-Frequency-Monetary analysis.
  // Value tiers use NTILE(3) to split buyers into equal-sized low/medium/high groups.
  // A separate "no_purchase" count is returned for context.
  const result = await db.execute(sql`
    WITH buyers AS (
      SELECT
        id,
        total_orders,
        total_spent::numeric,
        avg_order_value::numeric,
        clv::numeric,
        EXTRACT(DAY FROM NOW() - last_seen)::integer AS days_since_last,
        CASE
          WHEN EXTRACT(DAY FROM NOW() - last_seen) <= 30 THEN 'recent'
          WHEN EXTRACT(DAY FROM NOW() - last_seen) <= 90 THEN 'medium'
          ELSE 'lapsed'
        END AS recency_bucket,
        NTILE(3) OVER (ORDER BY total_spent::numeric) AS spend_tile
      FROM customers
      WHERE project_id = ${projectId} AND total_orders > 0
    ),
    customer_rfm AS (
      SELECT *,
        CASE
          WHEN spend_tile = 3 THEN 'high'
          WHEN spend_tile = 2 THEN 'medium'
          ELSE 'low'
        END AS value_bucket
      FROM buyers
    ),
    bucketed AS (
      SELECT
        recency_bucket,
        value_bucket,
        COUNT(*) AS contact_count
      FROM customer_rfm
      GROUP BY recency_bucket, value_bucket
    ),
    total AS (
      SELECT
        (SELECT COUNT(*) FROM customer_rfm) AS buyer_count,
        (SELECT COUNT(*) FROM customers WHERE project_id = ${projectId} AND total_orders = 0) AS no_purchase_count
    ),
    metrics AS (
      SELECT
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE total_orders > 1) / NULLIF(COUNT(*), 0), 1), 0) AS returning_pct,
        COALESCE(ROUND(AVG(total_orders)::numeric, 1), 0) AS avg_frequency,
        COALESCE(ROUND(AVG(avg_order_value), 2), 0) AS avg_purchase_value,
        COALESCE(ROUND(AVG(clv), 2), 0) AS avg_clv
      FROM customer_rfm
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

  // Compute actual distributions from buyer data
  const distResult = await db.execute(sql`
    WITH buyers AS (
      SELECT
        total_orders,
        total_spent::numeric AS spent,
        EXTRACT(DAY FROM NOW() - last_seen)::integer AS days_since_last
      FROM customers
      WHERE project_id = ${projectId} AND total_orders > 0
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
          WHEN tile = 1 THEN 'Low Value'
          WHEN tile = 2 THEN 'Medium Value'
          ELSE 'High Value'
        END AS bucket,
        tile AS sort_order,
        COUNT(*) AS cnt
      FROM (
        SELECT NTILE(3) OVER (ORDER BY spent) AS tile FROM buyers
      ) t
      GROUP BY bucket, sort_order
    ),
    recency_buckets AS (
      SELECT
        CASE
          WHEN days_since_last <= 30 THEN 'Recent (0–30d)'
          WHEN days_since_last <= 90 THEN 'Medium (31–90d)'
          ELSE 'Lapsed (90d+)'
        END AS bucket,
        CASE
          WHEN days_since_last <= 30 THEN 0
          WHEN days_since_last <= 90 THEN 1
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
