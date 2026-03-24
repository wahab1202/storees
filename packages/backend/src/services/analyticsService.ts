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

  // For each step, get the set of customers who did step 1..N in order
  const stepCounts: number[] = []

  for (let i = 0; i < steps.length; i++) {
    // Build a CTE that finds customers who completed steps 0..i in sequence
    const eventNames = steps.slice(0, i + 1).map(s => s.eventName)

    // Simple approach: count customers who have done ALL events up to step i
    // within the window. For strict ordering, we use a subquery chain.
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
      // Subsequent steps: customers who did this event AND were in the previous step
      // Use sequential timestamp ordering
      const result = await db.execute(sql`
        WITH step_customers AS (
          SELECT DISTINCT customer_id
          FROM events
          WHERE project_id = ${projectId}
            AND event_name = ${steps[0].eventName}
            AND timestamp >= ${startDate.toISOString()}
            AND timestamp <= ${endDate.toISOString()}
            AND customer_id IS NOT NULL
        )
        ${sql.raw(
          eventNames.slice(1).map((eventName, idx) => `
            , step${idx + 1} AS (
              SELECT DISTINCT e.customer_id
              FROM events e
              INNER JOIN ${idx === 0 ? 'step_customers' : `step${idx}`} prev ON e.customer_id = prev.customer_id
              WHERE e.project_id = '${projectId}'
                AND e.event_name = '${eventName}'
                AND e.timestamp >= '${startDate.toISOString()}'
                AND e.timestamp <= '${endDate.toISOString()}'
            )
          `).join('')
        )}
        SELECT count(*) as count FROM step${i}
      `)

      const rows = result as unknown as { count: string }[]
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
