import { Worker } from 'bullmq'
import { eq, and, sql, count, sum, max, min } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { customers, events, entities } from '../db/schema.js'
import type { DomainType } from '@storees/shared'

type EventJob = {
  projectId: string
  customerId: string
  eventName: string
  properties: Record<string, unknown>
  platform: string
  timestamp: string
}

/**
 * Metrics Worker — listens to the 'events' queue and updates customers.metrics JSONB.
 *
 * This is the bridge between raw events and the segment evaluator.
 * Each event triggers a re-computation of the affected customer's metrics
 * based on the project's domain type.
 *
 * Metrics are domain-aware:
 * - Ecommerce: total_orders, total_spent, days_since_last_order, etc.
 * - Fintech: total_transactions, total_debit, total_credit, days_since_last_txn, emi_overdue, etc.
 * - SaaS: feature_usage_count, days_since_signup, mrr, trial_status, etc.
 *
 * The worker reads from the same 'events' queue as triggerWorker — BullMQ
 * supports multiple workers on the same queue (each job goes to one worker).
 * We use a separate queue name 'metrics' to avoid conflicts.
 */
export function startMetricsWorker(): Worker {
  const worker = new Worker(
    'metrics',
    async (job) => {
      const event = job.data as EventJob
      await computeAndUpdateMetrics(event.projectId, event.customerId)
    },
    {
      connection: redisConnection,
      concurrency: 30, // Up from 10 — SDK sends 100+ events/sec
    },
  )

  worker.on('completed', (job) => {
    console.log(`Metrics updated for job ${job.id}`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Metrics worker failed for job ${job?.id}:`, err.message)
  })

  return worker
}

/**
 * Recompute all metrics for a customer based on their event history.
 * This is the core function — called by the worker on each event,
 * and can also be called manually for backfills.
 */
export async function computeAndUpdateMetrics(
  projectId: string,
  customerId: string,
): Promise<void> {
  // Get project domain type
  const [project] = await db
    .select({ domainType: sql<string>`domain_type` })
    .from(sql`projects`)
    .where(sql`id = ${projectId}`)
    .limit(1)

  if (!project) return

  const domainType = project.domainType as DomainType

  // Compute metrics based on domain
  let metrics: Record<string, unknown> = {}

  switch (domainType) {
    case 'ecommerce':
      metrics = await computeEcommerceMetrics(projectId, customerId)
      break
    case 'fintech':
      metrics = await computeFintechMetrics(projectId, customerId)
      break
    case 'saas':
      metrics = await computeSaasMetrics(projectId, customerId)
      break
    default:
      metrics = await computeGenericMetrics(projectId, customerId)
      break
  }

  // Compute cross-domain engagement metrics from SDK events
  const engagement = await computeEngagementMetrics(projectId, customerId)
  metrics = { ...metrics, ...engagement }

  // Write metrics to customer row
  await db.update(customers)
    .set({ metrics, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
}

// ============ ECOMMERCE METRICS ============
// Consolidated: 3 queries → 1 query using CASE/FILTER

async function computeEcommerceMetrics(
  projectId: string,
  customerId: string,
): Promise<Record<string, unknown>> {
  const agg = await db.execute(sql`
    SELECT
      COUNT(*) AS total_events,
      MAX(timestamp) AS last_event_at,
      MIN(timestamp) AS first_event_at,
      COUNT(*) FILTER (WHERE event_name = 'order_placed') AS order_count,
      COUNT(*) FILTER (WHERE event_name = 'cart_created') AS cart_count
    FROM events
    WHERE project_id = ${projectId} AND customer_id = ${customerId}
  `)

  const row = agg.rows[0] as Record<string, unknown> | undefined
  const lastEvent = row?.last_event_at ? new Date(row.last_event_at as string) : null
  const daysSinceLastOrder = lastEvent
    ? Math.floor((Date.now() - lastEvent.getTime()) / (1000 * 60 * 60 * 24))
    : null

  return {
    total_events: Number(row?.total_events ?? 0),
    order_count: Number(row?.order_count ?? 0),
    cart_count: Number(row?.cart_count ?? 0),
    days_since_last_order: daysSinceLastOrder,
    last_event_at: row?.last_event_at ?? null,
    first_event_at: row?.first_event_at ?? null,
  }
}

// ============ FINTECH METRICS ============
// Consolidated: 11 queries → 2 queries using CASE/FILTER

async function computeFintechMetrics(
  projectId: string,
  customerId: string,
): Promise<Record<string, unknown>> {
  // Query 1: All event-based metrics in a single scan
  const eventResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE event_name = 'transaction_completed') AS total_transactions,
      MAX(timestamp) FILTER (WHERE event_name = 'transaction_completed') AS last_txn_at,
      COUNT(*) FILTER (WHERE event_name = 'transaction_completed' AND properties->>'type' = 'debit') AS debit_count,
      COUNT(*) FILTER (WHERE event_name = 'transaction_completed' AND properties->>'type' = 'credit') AS credit_count,
      COALESCE(SUM((properties->>'amount')::numeric) FILTER (WHERE event_name = 'transaction_completed' AND properties->>'type' = 'debit'), 0) AS total_debit,
      COALESCE(SUM((properties->>'amount')::numeric) FILTER (WHERE event_name = 'transaction_completed' AND properties->>'type' = 'credit'), 0) AS total_credit,
      COUNT(*) FILTER (WHERE event_name = 'emi_overdue') AS emi_overdue_count,
      COUNT(*) FILTER (WHERE event_name = 'app_login' AND timestamp > NOW() - INTERVAL '7 days') AS logins_last_7d,
      COUNT(*) FILTER (WHERE event_name = 'bill_payment_completed') AS bill_payments,
      (SELECT event_name FROM events
       WHERE project_id = ${projectId} AND customer_id = ${customerId}
         AND event_name IN ('kyc_verified', 'kyc_expired')
       ORDER BY timestamp DESC LIMIT 1) AS latest_kyc_event
    FROM events
    WHERE project_id = ${projectId} AND customer_id = ${customerId}
  `)

  // Query 2: Entity-based metrics (loans + SIPs)
  const entityResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE entity_type = 'loan' AND status = 'active') AS active_loans,
      COUNT(*) FILTER (WHERE entity_type = 'sip' AND status = 'active') AS active_sips
    FROM entities
    WHERE project_id = ${projectId} AND customer_id = ${customerId}
  `)

  const e = eventResult.rows[0] as Record<string, unknown>
  const ent = entityResult.rows[0] as Record<string, unknown>

  const totalTransactions = Number(e.total_transactions ?? 0)
  const totalDebit = Number(e.total_debit ?? 0)
  const totalCredit = Number(e.total_credit ?? 0)
  const lastTxn = e.last_txn_at ? new Date(e.last_txn_at as string) : null
  const daysSinceLastTxn = lastTxn
    ? Math.floor((Date.now() - lastTxn.getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Lifecycle stage based on transaction recency
  let lifecycleStage = 'new'
  if (daysSinceLastTxn !== null) {
    if (daysSinceLastTxn <= 30) lifecycleStage = 'active'
    else if (daysSinceLastTxn <= 60) lifecycleStage = 'at_risk'
    else if (daysSinceLastTxn <= 90) lifecycleStage = 'dormant'
    else lifecycleStage = 'churned'
  }

  return {
    total_transactions: totalTransactions,
    total_debit: totalDebit,
    total_credit: totalCredit,
    avg_transaction_value: totalTransactions > 0
      ? Math.round((totalDebit + totalCredit) / totalTransactions)
      : 0,
    debit_count: Number(e.debit_count ?? 0),
    credit_count: Number(e.credit_count ?? 0),
    days_since_last_txn: daysSinceLastTxn,
    last_txn_at: e.last_txn_at ?? null,
    emi_overdue: Number(e.emi_overdue_count ?? 0) > 0,
    active_loans: Number(ent.active_loans ?? 0),
    active_sips: Number(ent.active_sips ?? 0),
    kyc_status: e.latest_kyc_event === 'kyc_verified' ? 'verified'
              : e.latest_kyc_event === 'kyc_expired' ? 'expired'
              : 'pending',
    lifecycle_stage: lifecycleStage,
    logins_last_7d: Number(e.logins_last_7d ?? 0),
    bill_payments: Number(e.bill_payments ?? 0),
  }
}

// ============ SAAS METRICS ============
// Consolidated: 4 queries → 2 queries

async function computeSaasMetrics(
  projectId: string,
  customerId: string,
): Promise<Record<string, unknown>> {
  // Query 1: All event aggregates in one scan
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE event_name = 'feature_used') AS feature_usage_count,
      COUNT(*) FILTER (WHERE event_name = 'app_login') AS login_count,
      MIN(timestamp) AS first_event_at
    FROM events
    WHERE project_id = ${projectId} AND customer_id = ${customerId}
  `)

  const row = result.rows[0] as Record<string, unknown>
  const firstTs = row.first_event_at ? new Date(row.first_event_at as string) : null
  const daysSinceSignup = firstTs
    ? Math.floor((Date.now() - firstTs.getTime()) / (1000 * 60 * 60 * 24))
    : 0

  // Query 2: Latest subscription event (needs ORDER BY, separate query)
  const [subEvent] = await db
    .select({ properties: events.properties })
    .from(events)
    .where(and(
      eq(events.projectId, projectId),
      eq(events.customerId, customerId),
      sql`event_name IN ('subscription_started', 'subscription_changed', 'trial_started', 'trial_expired')`,
    ))
    .orderBy(sql`timestamp DESC`)
    .limit(1)

  const subProps = (subEvent?.properties ?? {}) as Record<string, unknown>

  return {
    feature_usage_count: Number(row.feature_usage_count ?? 0),
    login_count: Number(row.login_count ?? 0),
    days_since_signup: daysSinceSignup,
    plan: subProps.plan ?? 'free',
    mrr: subProps.mrr ?? 0,
    trial_status: subProps.trial_status ?? 'no_trial',
  }
}

// ============ ENGAGEMENT METRICS (SDK — all domains) ============

async function computeEngagementMetrics(
  projectId: string,
  customerId: string,
): Promise<Record<string, unknown>> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE event_name = 'page_viewed') AS total_page_views,
      COUNT(*) FILTER (WHERE event_name = 'session_started') AS total_sessions,
      COUNT(*) FILTER (WHERE event_name = 'element_clicked') AS total_clicks,
      AVG((properties->>'duration_ms')::numeric) FILTER (WHERE event_name = 'session_ended' AND properties->>'duration_ms' IS NOT NULL) AS avg_session_duration_ms,
      (SELECT properties->>'url' FROM events
       WHERE project_id = ${projectId} AND customer_id = ${customerId} AND event_name = 'page_viewed'
       ORDER BY timestamp DESC LIMIT 1) AS last_page_viewed
    FROM events
    WHERE project_id = ${projectId} AND customer_id = ${customerId}
      AND event_name IN ('page_viewed', 'session_started', 'session_ended', 'element_clicked')
  `)

  const row = result.rows[0] as Record<string, unknown> | undefined
  const pageViews = Number(row?.total_page_views ?? 0)
  const sessions = Number(row?.total_sessions ?? 0)

  // Only return engagement metrics if there's SDK activity
  if (pageViews === 0 && sessions === 0) return {}

  return {
    total_page_views: pageViews,
    total_sessions: sessions,
    total_clicks: Number(row?.total_clicks ?? 0),
    avg_session_duration_ms: row?.avg_session_duration_ms ? Math.round(Number(row.avg_session_duration_ms)) : null,
    pages_per_session: sessions > 0 ? Math.round((pageViews / sessions) * 10) / 10 : null,
    last_page_viewed: row?.last_page_viewed ?? null,
  }
}

// ============ GENERIC/CUSTOM METRICS ============

async function computeGenericMetrics(
  projectId: string,
  customerId: string,
): Promise<Record<string, unknown>> {
  const [agg] = await db
    .select({
      totalEvents: count(),
      lastEventAt: max(events.timestamp),
      firstEventAt: min(events.timestamp),
    })
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.customerId, customerId)))

  return {
    total_events: agg?.totalEvents ?? 0,
    last_event_at: agg?.lastEventAt ?? null,
    first_event_at: agg?.firstEventAt ?? null,
  }
}
