import { db } from '../db/connection.js'
import { events, customers } from '../db/schema.js'
import { eq, and, gte, lte, sql, count, inArray } from 'drizzle-orm'

// ============ FUNNEL ANALYTICS ============

export type FunnelStep = {
  eventName: string
  label?: string
}

export type FunnelResult = {
  steps: {
    eventName: string
    label: string
    count: number
    percentage: number
    dropoff: number
    dropoffPercentage: number
  }[]
  totalEntered: number
  totalCompleted: number
  overallConversion: number
}

/**
 * Compute a multi-step funnel.
 * For each step, count distinct customers who performed that event
 * AND all previous events in order (within the time window).
 */
export async function computeFunnel(
  projectId: string,
  steps: FunnelStep[],
  opts: {
    startDate?: Date
    endDate?: Date
    segmentId?: string
  } = {},
): Promise<FunnelResult> {
  if (steps.length === 0) {
    return { steps: [], totalEntered: 0, totalCompleted: 0, overallConversion: 0 }
  }

  const startDate = opts.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const endDate = opts.endDate ?? new Date()

  // For each step, count distinct customers who performed all events up to that step.
  // Use a simpler, safer approach: for step N, find customers who did events 0..N in the window.
  const stepCounts: number[] = []

  for (let i = 0; i < steps.length; i++) {
    if (i === 0) {
      // First step: count distinct customers with this event
      const [result] = await db
        .select({ count: sql<number>`count(distinct ${events.customerId})` })
        .from(events)
        .where(and(
          eq(events.projectId, projectId),
          eq(events.eventName, steps[0].eventName),
          gte(events.timestamp, startDate),
          lte(events.timestamp, endDate),
        ))

      stepCounts.push(Number(result?.count ?? 0))
    } else {
      // For step i, find customers who performed ALL events 0..i in the time window.
      // Build array of event names for the HAVING COUNT(DISTINCT ...) check.
      const requiredEvents = steps.slice(0, i + 1).map(s => s.eventName)
      const requiredCount = requiredEvents.length

      const result = await db.execute(sql`
        SELECT COUNT(*) AS count FROM (
          SELECT customer_id
          FROM events
          WHERE project_id = ${projectId}
            AND event_name IN (${sql.join(requiredEvents.map(e => sql`${e}`), sql`, `)})
            AND timestamp >= ${startDate}
            AND timestamp <= ${endDate}
            AND customer_id IS NOT NULL
          GROUP BY customer_id
          HAVING COUNT(DISTINCT event_name) >= ${requiredCount}
        ) sub
      `)

      const rows = result.rows as { count: string }[]
      stepCounts.push(Number(rows[0]?.count ?? 0))
    }
  }

  const totalEntered = stepCounts[0] || 0
  const totalCompleted = stepCounts[stepCounts.length - 1] || 0

  return {
    steps: steps.map((step, i) => {
      const count = stepCounts[i]
      const prevCount = i === 0 ? count : stepCounts[i - 1]
      const dropoff = prevCount - count
      return {
        eventName: step.eventName,
        label: step.label ?? step.eventName,
        count,
        percentage: totalEntered > 0 ? Math.round((count / totalEntered) * 100) : 0,
        dropoff: i === 0 ? 0 : dropoff,
        dropoffPercentage: prevCount > 0 ? Math.round((dropoff / prevCount) * 100) : 0,
      }
    }),
    totalEntered,
    totalCompleted,
    overallConversion: totalEntered > 0 ? Math.round((totalCompleted / totalEntered) * 100) : 0,
  }
}

// ============ COHORT ANALYTICS ============

export type CohortResult = {
  cohorts: {
    cohortDate: string // YYYY-MM or YYYY-WW
    cohortSize: number
    retention: number[] // retention[0] = period 0 (100%), retention[1] = period 1, etc.
  }[]
  periods: number
  granularity: 'week' | 'month'
}

/**
 * Compute retention cohorts.
 * Groups customers by first_seen date, then measures how many returned in subsequent periods.
 */
export async function computeCohorts(
  projectId: string,
  opts: {
    granularity?: 'week' | 'month'
    periods?: number
    startDate?: Date
    endDate?: Date
    returnEvent?: string // event that counts as "returned" (default: any event)
  } = {},
): Promise<CohortResult> {
  const granularity = opts.granularity ?? 'week'
  const periods = opts.periods ?? 8
  const endDate = opts.endDate ?? new Date()
  const defaultStart = granularity === 'week'
    ? new Date(Date.now() - periods * 7 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - periods * 30 * 24 * 60 * 60 * 1000)
  const startDate = opts.startDate ?? defaultStart

  const truncFn = granularity === 'week' ? 'week' : 'month'

  const returnEventFilter = opts.returnEvent
    ? sql`AND e.event_name = ${opts.returnEvent}`
    : sql``

  const result = await db.execute(sql`
    WITH cohort_customers AS (
      SELECT
        id AS customer_id,
        date_trunc(${truncFn}, first_seen) AS cohort_period
      FROM customers
      WHERE project_id = ${projectId}
        AND first_seen >= ${startDate.toISOString()}
        AND first_seen <= ${endDate.toISOString()}
    ),
    cohort_activity AS (
      SELECT
        cc.cohort_period,
        cc.customer_id,
        date_trunc(${truncFn}, e.timestamp) AS activity_period
      FROM cohort_customers cc
      INNER JOIN events e ON e.customer_id = cc.customer_id AND e.project_id = ${projectId}
      WHERE e.timestamp >= ${startDate.toISOString()}
        AND e.timestamp <= ${endDate.toISOString()}
        ${returnEventFilter}
    ),
    cohort_sizes AS (
      SELECT cohort_period, count(DISTINCT customer_id) AS cohort_size
      FROM cohort_customers
      GROUP BY cohort_period
    ),
    retention AS (
      SELECT
        ca.cohort_period,
        EXTRACT(${sql.raw(granularity === 'week' ? 'DAYS' : 'MONTH')} FROM (ca.activity_period - ca.cohort_period))${sql.raw(granularity === 'week' ? ' / 7' : '')} AS period_number,
        count(DISTINCT ca.customer_id) AS active_customers
      FROM cohort_activity ca
      GROUP BY ca.cohort_period, period_number
    )
    SELECT
      cs.cohort_period,
      cs.cohort_size,
      r.period_number,
      r.active_customers
    FROM cohort_sizes cs
    LEFT JOIN retention r ON r.cohort_period = cs.cohort_period
    ORDER BY cs.cohort_period, r.period_number
  `)

  // Process results into cohort structure
  const rows = result as unknown as {
    cohort_period: string
    cohort_size: string
    period_number: string | null
    active_customers: string | null
  }[]

  const cohortMap = new Map<string, { size: number; retention: Map<number, number> }>()

  for (const row of rows) {
    const key = row.cohort_period
    if (!cohortMap.has(key)) {
      cohortMap.set(key, { size: Number(row.cohort_size), retention: new Map() })
    }
    if (row.period_number !== null) {
      const periodNum = Math.floor(Number(row.period_number))
      if (periodNum >= 0 && periodNum < periods) {
        cohortMap.get(key)!.retention.set(periodNum, Number(row.active_customers))
      }
    }
  }

  const cohorts = Array.from(cohortMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => {
      const retentionArr: number[] = []
      for (let p = 0; p < periods; p++) {
        const active = data.retention.get(p) ?? 0
        retentionArr.push(data.size > 0 ? Math.round((active / data.size) * 100) : 0)
      }
      return {
        cohortDate: new Date(date).toISOString().slice(0, granularity === 'week' ? 10 : 7),
        cohortSize: data.size,
        retention: retentionArr,
      }
    })

  return { cohorts, periods, granularity }
}

// ============ TIME SERIES ANALYTICS ============

export type TimeSeriesOpts = {
  metric: 'events' | 'customers' | 'new_customers' | 'revenue' | 'orders' | 'sessions'
  startDate: Date
  endDate: Date
  compareStartDate?: Date
  compareEndDate?: Date
  granularity: 'day' | 'week' | 'month'
  segmentIds?: string[]
}

export type TimeSeriesResult = {
  metric: string
  granularity: string
  points: { date: string; value: number; compareValue?: number }[]
  total: number
  compareTotal?: number
  changePercent?: number
}

export async function computeTimeSeries(
  projectId: string,
  opts: TimeSeriesOpts,
): Promise<TimeSeriesResult> {
  const { metric, startDate, endDate, granularity } = opts
  const truncFn = granularity

  // Build the metric query based on type
  let metricQuery: string
  let table = 'events'

  switch (metric) {
    case 'events':
      metricQuery = 'COUNT(*)'
      break
    case 'customers':
      metricQuery = 'COUNT(DISTINCT customer_id)'
      break
    case 'new_customers':
      table = 'customers'
      metricQuery = 'COUNT(*)'
      break
    case 'revenue':
      table = 'orders'
      metricQuery = 'COALESCE(SUM(total), 0)'
      break
    case 'orders':
      table = 'orders'
      metricQuery = 'COUNT(*)'
      break
    case 'sessions':
      metricQuery = `COUNT(*) FILTER (WHERE event_name = 'session_started')`
      break
    default:
      metricQuery = 'COUNT(*)'
  }

  const dateCol = table === 'customers' ? 'first_seen'
    : table === 'orders' ? 'created_at'
    : 'timestamp'

  // Current period
  const currentResult = await db.execute(sql`
    SELECT
      date_trunc(${truncFn}, ${sql.raw(dateCol)})::date AS date,
      ${sql.raw(metricQuery)} AS value
    FROM ${sql.raw(table)}
    WHERE project_id = ${projectId}
      AND ${sql.raw(dateCol)} >= ${startDate}
      AND ${sql.raw(dateCol)} <= ${endDate}
    GROUP BY date
    ORDER BY date
  `)

  const points: { date: string; value: number; compareValue?: number }[] =
    (currentResult.rows as { date: string; value: string }[]).map(r => ({
      date: String(r.date).slice(0, 10),
      value: Number(r.value),
    }))

  const total = points.reduce((sum, p) => sum + p.value, 0)

  // Compare period (optional)
  let compareTotal: number | undefined
  let changePercent: number | undefined

  if (opts.compareStartDate && opts.compareEndDate) {
    const compareResult = await db.execute(sql`
      SELECT
        date_trunc(${truncFn}, ${sql.raw(dateCol)})::date AS date,
        ${sql.raw(metricQuery)} AS value
      FROM ${sql.raw(table)}
      WHERE project_id = ${projectId}
        AND ${sql.raw(dateCol)} >= ${opts.compareStartDate}
        AND ${sql.raw(dateCol)} <= ${opts.compareEndDate}
      GROUP BY date
      ORDER BY date
    `)

    const comparePoints = (compareResult.rows as { date: string; value: string }[])
    compareTotal = comparePoints.reduce((sum, p) => sum + Number(p.value), 0)

    // Map compare values onto current points by relative position
    for (let i = 0; i < points.length && i < comparePoints.length; i++) {
      points[i].compareValue = Number(comparePoints[i].value)
    }

    if (compareTotal > 0) {
      changePercent = Math.round(((total - compareTotal) / compareTotal) * 100)
    } else if (total > 0) {
      changePercent = 100
    }
  }

  return { metric, granularity, points, total, compareTotal, changePercent }
}

// ============ TIME-TO-EVENT ANALYTICS ============

export type TimeToEventOpts = {
  startEvent: string
  endEvent: string
  startDate?: Date
  endDate?: Date
  breakdownBy?: 'platform' | 'segment'
}

export type TimeToEventResult = {
  startEvent: string
  endEvent: string
  medianSeconds: number
  p75Seconds: number
  p90Seconds: number
  totalCompletions: number
  distribution: { bucket: string; count: number }[]
  breakdowns?: { key: string; medianSeconds: number; count: number }[]
}

export async function computeTimeToEvent(
  projectId: string,
  opts: TimeToEventOpts,
): Promise<TimeToEventResult> {
  const startDate = opts.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const endDate = opts.endDate ?? new Date()

  // Find pairs: first occurrence of startEvent → first subsequent endEvent per customer
  const result = await db.execute(sql`
    WITH start_events AS (
      SELECT customer_id, MIN(timestamp) AS start_time
      FROM events
      WHERE project_id = ${projectId}
        AND event_name = ${opts.startEvent}
        AND timestamp >= ${startDate}
        AND timestamp <= ${endDate}
        AND customer_id IS NOT NULL
      GROUP BY customer_id
    ),
    end_events AS (
      SELECT e.customer_id, MIN(e.timestamp) AS end_time, s.start_time
      FROM events e
      INNER JOIN start_events s ON e.customer_id = s.customer_id
      WHERE e.project_id = ${projectId}
        AND e.event_name = ${opts.endEvent}
        AND e.timestamp > s.start_time
        AND e.timestamp <= ${endDate}
      GROUP BY e.customer_id, s.start_time
    ),
    durations AS (
      SELECT
        customer_id,
        EXTRACT(EPOCH FROM (end_time - start_time)) AS duration_seconds
      FROM end_events
    )
    SELECT
      COUNT(*) AS total_completions,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds), 0) AS median_seconds,
      COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duration_seconds), 0) AS p75_seconds,
      COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY duration_seconds), 0) AS p90_seconds
    FROM durations
  `)

  const stats = result.rows[0] as Record<string, string>

  // Distribution buckets
  const distResult = await db.execute(sql`
    WITH start_events AS (
      SELECT customer_id, MIN(timestamp) AS start_time
      FROM events
      WHERE project_id = ${projectId}
        AND event_name = ${opts.startEvent}
        AND timestamp >= ${startDate}
        AND timestamp <= ${endDate}
        AND customer_id IS NOT NULL
      GROUP BY customer_id
    ),
    end_events AS (
      SELECT e.customer_id, MIN(e.timestamp) AS end_time, s.start_time
      FROM events e
      INNER JOIN start_events s ON e.customer_id = s.customer_id
      WHERE e.project_id = ${projectId}
        AND e.event_name = ${opts.endEvent}
        AND e.timestamp > s.start_time
        AND e.timestamp <= ${endDate}
      GROUP BY e.customer_id, s.start_time
    ),
    durations AS (
      SELECT EXTRACT(EPOCH FROM (end_time - start_time)) AS duration_seconds
      FROM end_events
    )
    SELECT
      CASE
        WHEN duration_seconds < 60 THEN '< 1 min'
        WHEN duration_seconds < 300 THEN '1-5 min'
        WHEN duration_seconds < 900 THEN '5-15 min'
        WHEN duration_seconds < 3600 THEN '15-60 min'
        WHEN duration_seconds < 86400 THEN '1-24 hr'
        WHEN duration_seconds < 604800 THEN '1-7 days'
        ELSE '7+ days'
      END AS bucket,
      COUNT(*) AS count
    FROM durations
    GROUP BY bucket
    ORDER BY MIN(duration_seconds)
  `)

  const distribution = (distResult.rows as { bucket: string; count: string }[]).map(r => ({
    bucket: r.bucket,
    count: Number(r.count),
  }))

  // Optional breakdown
  let breakdowns: { key: string; medianSeconds: number; count: number }[] | undefined

  if (opts.breakdownBy === 'platform') {
    const bdResult = await db.execute(sql`
      WITH start_events AS (
        SELECT customer_id, MIN(timestamp) AS start_time
        FROM events
        WHERE project_id = ${projectId}
          AND event_name = ${opts.startEvent}
          AND timestamp >= ${startDate}
          AND timestamp <= ${endDate}
          AND customer_id IS NOT NULL
        GROUP BY customer_id
      ),
      end_events AS (
        SELECT e.customer_id, MIN(e.timestamp) AS end_time, s.start_time, e.platform
        FROM events e
        INNER JOIN start_events s ON e.customer_id = s.customer_id
        WHERE e.project_id = ${projectId}
          AND e.event_name = ${opts.endEvent}
          AND e.timestamp > s.start_time
          AND e.timestamp <= ${endDate}
        GROUP BY e.customer_id, s.start_time, e.platform
      )
      SELECT
        platform AS key,
        COUNT(*) AS count,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (end_time - start_time))) AS median_seconds
      FROM end_events
      GROUP BY platform
      ORDER BY count DESC
    `)

    breakdowns = (bdResult.rows as { key: string; count: string; median_seconds: string }[]).map(r => ({
      key: r.key ?? 'unknown',
      medianSeconds: Math.round(Number(r.median_seconds)),
      count: Number(r.count),
    }))
  }

  return {
    startEvent: opts.startEvent,
    endEvent: opts.endEvent,
    medianSeconds: Math.round(Number(stats.median_seconds)),
    p75Seconds: Math.round(Number(stats.p75_seconds)),
    p90Seconds: Math.round(Number(stats.p90_seconds)),
    totalCompletions: Number(stats.total_completions),
    distribution,
    breakdowns,
  }
}

// ============ PRODUCT ANALYTICS ============

export type ProductAnalyticsOpts = {
  sort?: 'views' | 'conversions' | 'revenue' | 'abandonment' | 'conversion_rate'
  limit?: number
  startDate?: Date
  endDate?: Date
}

export type ProductAnalyticsItem = {
  itemId: string
  name: string
  category: string | null
  views: number
  conversions: number
  conversionRate: number
  revenue: number
  abandonment: number
}

export async function computeProductAnalytics(
  projectId: string,
  opts: ProductAnalyticsOpts = {},
): Promise<ProductAnalyticsItem[]> {
  const limit = opts.limit ?? 50
  const startDate = opts.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const endDate = opts.endDate ?? new Date()
  const sortCol = opts.sort === 'conversions' ? 'conversions'
    : opts.sort === 'revenue' ? 'revenue'
    : opts.sort === 'abandonment' ? 'abandonment'
    : opts.sort === 'conversion_rate' ? 'conversion_rate'
    : 'views'

  const result = await db.execute(sql`
    WITH item_stats AS (
      SELECT
        i.item_id,
        COALESCE(it.name, i.item_id) AS name,
        it.attributes->>'category' AS category,
        COUNT(*) FILTER (WHERE i.type = 'view') AS views,
        COUNT(*) FILTER (WHERE i.type IN ('purchase', 'conversion')) AS conversions,
        COUNT(*) FILTER (WHERE i.type = 'add_to_cart') -
          COUNT(*) FILTER (WHERE i.type IN ('purchase', 'conversion')) AS abandonment,
        COALESCE(SUM(i.weight) FILTER (WHERE i.type IN ('purchase', 'conversion')), 0) AS revenue
      FROM interactions i
      LEFT JOIN items it ON it.id = i.item_id AND it.project_id = ${projectId}
      WHERE i.project_id = ${projectId}
        AND i.timestamp >= ${startDate}
        AND i.timestamp <= ${endDate}
      GROUP BY i.item_id, it.name, it.attributes->>'category'
    )
    SELECT
      item_id,
      name,
      category,
      views,
      conversions,
      CASE WHEN views > 0 THEN ROUND(conversions::numeric / views * 100, 1) ELSE 0 END AS conversion_rate,
      revenue,
      GREATEST(abandonment, 0) AS abandonment
    FROM item_stats
    ORDER BY ${sql.raw(sortCol)} DESC
    LIMIT ${limit}
  `)

  return (result.rows as Record<string, string>[]).map(r => ({
    itemId: r.item_id,
    name: r.name,
    category: r.category || null,
    views: Number(r.views),
    conversions: Number(r.conversions),
    conversionRate: Number(r.conversion_rate),
    revenue: Number(r.revenue),
    abandonment: Number(r.abandonment),
  }))
}

// ============ EVENT NAMES ============

/**
 * Get distinct event names for a project (used by funnel builder dropdown).
 */
export async function getDistinctEventNames(projectId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ eventName: events.eventName })
    .from(events)
    .where(eq(events.projectId, projectId))
    .orderBy(events.eventName)
    .limit(200)

  return rows.map(r => r.eventName)
}
