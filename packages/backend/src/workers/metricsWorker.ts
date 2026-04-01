import { Worker } from 'bullmq'
import { eq, and, sql, count, max, min } from 'drizzle-orm'
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

// In-memory cache: projectId → domainType (TTL: 5 minutes)
const domainTypeCache = new Map<string, { domainType: DomainType; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

async function getDomainType(projectId: string): Promise<DomainType | null> {
  const cached = domainTypeCache.get(projectId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.domainType
  }

  const [project] = await db
    .select({ domainType: sql<string>`domain_type` })
    .from(sql`projects`)
    .where(sql`id = ${projectId}`)
    .limit(1)

  if (!project) return null

  const domainType = project.domainType as DomainType
  domainTypeCache.set(projectId, { domainType, expiresAt: Date.now() + CACHE_TTL_MS })
  return domainType
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
// SDK auto-track events that only affect engagement metrics — skip full domain recompute
const ENGAGEMENT_ONLY_EVENTS = new Set([
  'page_viewed', 'session_started', 'session_ended', 'element_clicked',
])

export function startMetricsWorker(): Worker {
  const worker = new Worker(
    'metrics',
    async (job) => {
      const event = job.data as EventJob

      if (ENGAGEMENT_ONLY_EVENTS.has(event.eventName)) {
        // Only recompute engagement metrics, skip domain-specific queries
        await computeEngagementOnly(event.projectId, event.customerId)
      } else {
        await computeAndUpdateMetrics(event.projectId, event.customerId)
      }
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
  // Get project domain type (cached)
  const domainType = await getDomainType(projectId)
  if (!domainType) return

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
  // Query 1: Event aggregates
  const eventAgg = await db.execute(sql`
    SELECT
      COUNT(*) AS total_events,
      MAX(timestamp) AS last_event_at,
      MIN(timestamp) AS first_event_at,
      COUNT(*) FILTER (WHERE event_name IN ('order_placed', 'order_completed')) AS order_event_count,
      COUNT(*) FILTER (WHERE event_name = 'cart_created') AS cart_count
    FROM events
    WHERE project_id = ${projectId} AND customer_id = ${customerId}
  `)

  // Query 2: Real order-based metrics (source of truth for order dates)
  const orderAgg = await db.execute(sql`
    SELECT
      COUNT(*) AS order_count,
      MIN(created_at) AS first_order_at,
      MAX(created_at) AS last_order_at,
      COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE discount::numeric > 0) / NULLIF(COUNT(*), 0)), 0) AS discount_pct,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS orders_last_30d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days') AS orders_last_90d
    FROM orders
    WHERE project_id = ${projectId} AND customer_id = ${customerId} AND status != 'cancelled'
  `)

  const eRow = eventAgg.rows[0] as Record<string, unknown> | undefined
  const oRow = orderAgg.rows[0] as Record<string, unknown> | undefined

  const lastOrderAt = oRow?.last_order_at ? new Date(oRow.last_order_at as string) : null
  const firstOrderAt = oRow?.first_order_at ? new Date(oRow.first_order_at as string) : null
  const daysSinceLastOrder = lastOrderAt
    ? Math.floor((Date.now() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Update first_order_date and last_order_date columns
  if (firstOrderAt || lastOrderAt) {
    await db.update(customers)
      .set({
        firstOrderDate: firstOrderAt,
        lastOrderDate: lastOrderAt,
      })
      .where(eq(customers.id, customerId))
  }

  return {
    total_events: Number(eRow?.total_events ?? 0),
    order_count: Number(oRow?.order_count ?? 0),
    cart_count: Number(eRow?.cart_count ?? 0),
    days_since_last_order: daysSinceLastOrder,
    first_order_date: firstOrderAt?.toISOString() ?? null,
    last_order_date: lastOrderAt?.toISOString() ?? null,
    last_event_at: eRow?.last_event_at ?? null,
    first_event_at: eRow?.first_event_at ?? null,
    discount_order_percentage: Number(oRow?.discount_pct ?? 0),
    orders_in_last_30_days: Number(oRow?.orders_last_30d ?? 0),
    orders_in_last_90_days: Number(oRow?.orders_last_90d ?? 0),
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

  // Fetch customAttributes to use as fallback for fields set via identify()
  const [custRow] = await db
    .select({ customAttributes: customers.customAttributes })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId)))
    .limit(1)
  const attrs = (custRow?.customAttributes ?? {}) as Record<string, unknown>

  // KYC status: prefer event-based, fallback to customAttributes
  let kycStatus = 'pending'
  if (e.latest_kyc_event === 'kyc_verified') {
    kycStatus = 'verified'
  } else if (e.latest_kyc_event === 'kyc_expired') {
    kycStatus = 'expired'
  } else if (attrs.kyc_status === 'verified' || attrs.kyc_status === 'expired') {
    kycStatus = attrs.kyc_status as string
  }

  // emi_overdue: prefer event-based, fallback to customAttributes
  const emiOverdueFromEvents = Number(e.emi_overdue_count ?? 0) > 0
  const emiOverdue = emiOverdueFromEvents || attrs.emi_overdue === true || attrs.emi_overdue === 'true'

  // active_loans/active_sips: prefer entity-based, fallback to customAttributes
  const activeLoans = Number(ent.active_loans ?? 0) || Number(attrs.active_loans ?? 0)
  const activeSips = Number(ent.active_sips ?? 0) || Number(attrs.active_sips ?? 0)

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
    emi_overdue: emiOverdue,
    active_loans: activeLoans,
    active_sips: activeSips,
    kyc_status: kycStatus,
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

// ============ ENGAGEMENT-ONLY UPDATE ============
// Fast path for SDK auto-track events — merges engagement into existing metrics

async function computeEngagementOnly(
  projectId: string,
  customerId: string,
): Promise<void> {
  const engagement = await computeEngagementMetrics(projectId, customerId)
  if (Object.keys(engagement).length === 0) return

  // Merge engagement into existing metrics without recomputing domain metrics
  const [customer] = await db
    .select({ metrics: customers.metrics })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  const existingMetrics = (customer?.metrics ?? {}) as Record<string, unknown>
  await db.update(customers)
    .set({ metrics: { ...existingMetrics, ...engagement }, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
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
