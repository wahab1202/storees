import { sql } from 'drizzle-orm'
import { db } from '../db/connection.js'

type SendTimeResult = {
  best_send_hour: number | null
  best_send_dow: number | null
  send_time_confidence: number
  send_time_sample_size: number
}

/**
 * Compute optimal send time for a customer based on historical email open patterns.
 * Falls back to project-level defaults if customer has insufficient data.
 */
export async function computeOptimalSendTime(
  customerId: string,
  projectId: string,
): Promise<SendTimeResult> {
  // Customer-level: find the hour with the most opens
  const customerResult = await db.execute(sql`
    SELECT
      EXTRACT(HOUR FROM cs.opened_at)::integer AS open_hour,
      EXTRACT(DOW FROM cs.opened_at)::integer AS open_dow,
      COUNT(*) AS opens
    FROM campaign_sends cs
    JOIN campaigns c ON c.id = cs.campaign_id
    WHERE cs.customer_id = ${customerId}
      AND c.project_id = ${projectId}
      AND cs.opened_at IS NOT NULL
    GROUP BY 1, 2
    ORDER BY opens DESC
    LIMIT 1
  `)

  const cRow = customerResult.rows[0] as Record<string, unknown> | undefined
  const sampleResult = await db.execute(sql`
    SELECT COUNT(*) AS total_opens
    FROM campaign_sends cs
    JOIN campaigns c ON c.id = cs.campaign_id
    WHERE cs.customer_id = ${customerId}
      AND c.project_id = ${projectId}
      AND cs.opened_at IS NOT NULL
  `)
  const sampleSize = Number((sampleResult.rows[0] as Record<string, unknown>)?.total_opens ?? 0)

  // If customer has ≥3 opens, use their personal preference
  if (cRow && sampleSize >= 3) {
    return {
      best_send_hour: Number(cRow.open_hour),
      best_send_dow: Number(cRow.open_dow),
      send_time_confidence: Math.min(1, sampleSize / 20), // 20 opens = full confidence
      send_time_sample_size: sampleSize,
    }
  }

  // Fall back to project-level defaults
  return computeProjectDefaults(projectId)
}

/**
 * Compute project-wide best send time from all campaign opens.
 */
export async function computeProjectDefaults(projectId: string): Promise<SendTimeResult> {
  const result = await db.execute(sql`
    SELECT
      EXTRACT(HOUR FROM cs.opened_at)::integer AS open_hour,
      EXTRACT(DOW FROM cs.opened_at)::integer AS open_dow,
      COUNT(*) AS opens
    FROM campaign_sends cs
    JOIN campaigns c ON c.id = cs.campaign_id
    WHERE c.project_id = ${projectId}
      AND cs.opened_at IS NOT NULL
    GROUP BY 1, 2
    ORDER BY opens DESC
    LIMIT 1
  `)

  const row = result.rows[0] as Record<string, unknown> | undefined
  if (!row) {
    // No data at all — return sensible default (10am, Tuesday)
    return { best_send_hour: 10, best_send_dow: 2, send_time_confidence: 0, send_time_sample_size: 0 }
  }

  const totalResult = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM campaign_sends cs
    JOIN campaigns c ON c.id = cs.campaign_id
    WHERE c.project_id = ${projectId} AND cs.opened_at IS NOT NULL
  `)

  return {
    best_send_hour: Number(row.open_hour),
    best_send_dow: Number(row.open_dow),
    send_time_confidence: 0.3, // project-level is lower confidence
    send_time_sample_size: Number((totalResult.rows[0] as Record<string, unknown>)?.total ?? 0),
  }
}
