import { db } from '../db/connection.js'
import { segmentSnapshots, segments, customerSegments } from '../db/schema.js'
import { eq, and, sql, gte, lte, desc, count } from 'drizzle-orm'

// ============ SNAPSHOT CREATION ============

/**
 * Take a snapshot of all segment memberships for a project.
 * Call this on a schedule (weekly/monthly) to enable transition analysis.
 */
export async function createSegmentSnapshot(projectId: string): Promise<number> {
  const snapshotDate = new Date()

  // Insert current segment memberships as snapshot rows
  const result = await db.execute(sql`
    INSERT INTO segment_snapshots (project_id, segment_id, customer_id, snapshot_date)
    SELECT
      ${projectId},
      cs.segment_id,
      cs.customer_id,
      ${snapshotDate}
    FROM customer_segments cs
    INNER JOIN segments s ON s.id = cs.segment_id
    WHERE s.project_id = ${projectId}
  `)

  return (result as { rowCount: number }).rowCount ?? 0
}

/**
 * Get available snapshot dates for a project.
 */
export async function getSnapshotDates(projectId: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT snapshot_date::date AS date
    FROM segment_snapshots
    WHERE project_id = ${projectId}
    ORDER BY date DESC
    LIMIT 24
  `)

  return (rows.rows as { date: string }[]).map(r => String(r.date).slice(0, 10))
}

// ============ TRANSITION ANALYSIS ============

export type SegmentTransition = {
  fromSegmentId: string
  fromSegmentName: string
  toSegmentId: string | null
  toSegmentName: string
  count: number
  percentage: number
}

export type TransitionResult = {
  period1: string
  period2: string
  transitions: SegmentTransition[]
  totalCustomers: number
}

/**
 * Compare segment memberships between two snapshot dates.
 * Returns transitions: which segments customers moved from → to.
 */
export async function computeTransitions(
  projectId: string,
  period1Date: string,
  period2Date: string,
  segmentIds?: string[],
): Promise<TransitionResult> {
  const segmentFilter = segmentIds && segmentIds.length > 0
    ? sql`AND (s1.segment_id IN (${sql.join(segmentIds.map(id => sql`${id}`), sql`,`)}) OR s2.segment_id IN (${sql.join(segmentIds.map(id => sql`${id}`), sql`,`)}))`
    : sql``

  const result = await db.execute(sql`
    WITH period1 AS (
      SELECT DISTINCT customer_id, segment_id
      FROM segment_snapshots
      WHERE project_id = ${projectId}
        AND snapshot_date::date = ${period1Date}::date
    ),
    period2 AS (
      SELECT DISTINCT customer_id, segment_id
      FROM segment_snapshots
      WHERE project_id = ${projectId}
        AND snapshot_date::date = ${period2Date}::date
    ),
    all_customers AS (
      SELECT customer_id FROM period1
      UNION
      SELECT customer_id FROM period2
    ),
    transitions AS (
      SELECT
        s1.segment_id AS from_segment_id,
        s2.segment_id AS to_segment_id,
        COUNT(DISTINCT ac.customer_id) AS transition_count
      FROM all_customers ac
      LEFT JOIN period1 s1 ON s1.customer_id = ac.customer_id
      LEFT JOIN period2 s2 ON s2.customer_id = ac.customer_id
      WHERE (s1.segment_id IS DISTINCT FROM s2.segment_id)
        ${segmentFilter}
      GROUP BY s1.segment_id, s2.segment_id
    )
    SELECT
      t.from_segment_id,
      COALESCE(seg1.name, 'Unclassified') AS from_segment_name,
      t.to_segment_id,
      COALESCE(seg2.name, 'Unclassified') AS to_segment_name,
      t.transition_count
    FROM transitions t
    LEFT JOIN segments seg1 ON seg1.id = t.from_segment_id
    LEFT JOIN segments seg2 ON seg2.id = t.to_segment_id
    WHERE t.from_segment_id IS NOT NULL OR t.to_segment_id IS NOT NULL
    ORDER BY t.transition_count DESC
    LIMIT 100
  `)

  const rows = result.rows as {
    from_segment_id: string | null
    from_segment_name: string
    to_segment_id: string | null
    to_segment_name: string
    transition_count: string
  }[]

  const totalCustomers = rows.reduce((sum, r) => sum + Number(r.transition_count), 0)

  const transitions: SegmentTransition[] = rows.map(r => ({
    fromSegmentId: r.from_segment_id ?? '',
    fromSegmentName: r.from_segment_name,
    toSegmentId: r.to_segment_id,
    toSegmentName: r.to_segment_name,
    count: Number(r.transition_count),
    percentage: totalCustomers > 0
      ? Math.round((Number(r.transition_count) / totalCustomers) * 100)
      : 0,
  }))

  return {
    period1: period1Date,
    period2: period2Date,
    transitions,
    totalCustomers,
  }
}

// ============ SEGMENT SIZE TREND ============

export type SegmentTrendPoint = {
  date: string
  segmentId: string
  segmentName: string
  memberCount: number
}

/**
 * Get segment member counts over time from snapshots.
 */
export async function computeSegmentTrend(
  projectId: string,
  segmentIds: string[],
): Promise<SegmentTrendPoint[]> {
  if (segmentIds.length === 0) return []

  const result = await db.execute(sql`
    SELECT
      ss.snapshot_date::date AS date,
      ss.segment_id,
      s.name AS segment_name,
      COUNT(DISTINCT ss.customer_id) AS member_count
    FROM segment_snapshots ss
    INNER JOIN segments s ON s.id = ss.segment_id
    WHERE ss.project_id = ${projectId}
      AND ss.segment_id IN (${sql.join(segmentIds.map(id => sql`${id}`), sql`,`)})
    GROUP BY ss.snapshot_date::date, ss.segment_id, s.name
    ORDER BY date, s.name
  `)

  return (result.rows as {
    date: string
    segment_id: string
    segment_name: string
    member_count: string
  }[]).map(r => ({
    date: String(r.date).slice(0, 10),
    segmentId: r.segment_id,
    segmentName: r.segment_name,
    memberCount: Number(r.member_count),
  }))
}
