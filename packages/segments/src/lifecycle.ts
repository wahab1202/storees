import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { LifecycleChartData, LifecycleSegment } from '@storees/shared'

/**
 * RFM-based lifecycle chart.
 * Buckets customers into a 3x3 grid based on Recency and Value.
 * Returns segment distribution + aggregate metrics.
 */
export async function getLifecycleChart(
  db: { execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }> },
  projectId: string,
): Promise<LifecycleChartData> {
  // Single query: bucket each customer by recency and value using NTILE
  const result = await db.execute(sql`
    WITH customer_rfm AS (
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
        CASE
          WHEN total_spent::numeric = 0 THEN 'low'
          WHEN PERCENT_RANK() OVER (
            PARTITION BY project_id ORDER BY total_spent::numeric
          ) >= 0.75 THEN 'high'
          WHEN PERCENT_RANK() OVER (
            PARTITION BY project_id ORDER BY total_spent::numeric
          ) >= 0.25 THEN 'medium'
          ELSE 'low'
        END AS value_bucket
      FROM customers
      WHERE project_id = ${projectId}
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
      SELECT COUNT(*) AS total_count FROM customer_rfm
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
      t.total_count,
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

  const metrics = {
    returningCustomerPercentage: Number(rows[0]?.returning_pct ?? 0),
    avgPurchaseFrequency: Number(rows[0]?.avg_frequency ?? 0),
    avgPurchaseValue: Number(rows[0]?.avg_purchase_value ?? 0),
    avgClv: Number(rows[0]?.avg_clv ?? 0),
  }

  return { segments, metrics }
}
