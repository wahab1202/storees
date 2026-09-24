import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, orders, events } from '../db/schema.js'
import { LIVE_ORDERS } from '../db/orderStatus.js'
import { projectVocabulary, eventIn } from './projectVocabulary.js'

// ============ CLV CALCULATION ============

type ClvInput = {
  totalSpent: number
  totalOrders: number
  firstOrderDate: Date | null
  lastOrderDate: Date | null
  // Last engagement of any kind (page view, product view, login). Lets us
  // distinguish "lapsed but engaging" (re-engagement opportunity) from
  // "truly gone" (write-off). Falls back to lastOrderDate when null.
  lastSeenDate: Date | null
  /** THIS PROJECT'S OWN typical orders-per-month, measured from its customers who
   *  have enough history to measure. Omitted only when the project is too new to
   *  have any — see CLV_FALLBACK_ORDERS_PER_MONTH. */
  populationOrdersPerMonth?: number
  /** 0-100 from a MODEL, if one has scored this customer.
   *
   *  MUST NOT be this function's own previous answer. It was, from all four call
   *  sites: they read `metrics.churn_risk`, which is written from
   *  `clv_churn_probability × 100` — the output of the branch this value overrides.
   *  So the score fed itself and froze at whatever it produced first.
   *
   *  Every customer exists before their first order, and the no-orders branch below
   *  returns a churn probability of 1. So the first value stored was 100, and 100 is
   *  what it stayed — through their first purchase and every one after. Measured:
   *  every customer in all six projects sat at exactly 100, including six who had
   *  bought that same week.
   *
   *  100 is also the tell. The ladder below caps at 0.95, so it can never produce 100
   *  — only the no-orders branch can. GoWelmart's customers were bulk-imported WITH
   *  order history, so their first value came from the ladder and looks plausible
   *  (95%, 60%…) — the same freeze, wearing a believable number.
   *
   *  Read from a key only a model writes. `metrics.churn_risk` is ours. */
  churnRiskScore?: number
}

/** The churn score a MODEL produced for this customer, if any.
 *
 *  Deliberately not `metrics.churn_risk` — that is what the CLV calculation writes,
 *  and reading it back is the loop described above. Nothing writes this key yet; the
 *  override stays wired so a real churn model can take over without touching the
 *  callers, and until then the heuristic ladder runs, which is what it was for. */
export function mlChurnScore(metrics: Record<string, unknown> | null | undefined): number | undefined {
  const v = (metrics ?? {}).ml_churn_risk
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export type ClvHealth =
  | 'new'              // signed up recently, no orders yet but engaging
  | 'growing'          // active, ordering at or ahead of schedule
  | 'stable'           // active, ordering on schedule
  | 'declining'        // overdue 1.5–3× their normal gap
  | 'at_risk'          // overdue 3+× their normal gap AND still engaging
  | 'lapsed_engaged'   // no order in 180+ days BUT engaging recently — re-engagement target
  | 'churned'          // gone — no orders 180+ days AND no engagement 60+ days

type ClvResult = {
  clv_historical: number
  clv_predicted: number
  clv_total: number
  clv_monthly_frequency: number
  clv_retention_months: number
  clv_churn_probability: number
  clv_health: ClvHealth
  // Diagnostic fields the Lifecycle card on the customer detail reads
  days_since_last_order: number | null
  days_since_last_seen: number | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Compute CLV using a retention-adjusted DCF model with engagement signal.
 *
 *   CLV = historical (actual spend)
 *       + predicted (AOV × monthly_freq × retention_months × engagement_mult)
 *
 * The engagement multiplier rewards customers who are still active on the
 * site even if they haven't purchased recently, and dampens predicted value
 * for customers who've gone quiet across all channels.
 *
 * Health is bucketed by combining ORDER recency and SITE recency. The model
 * deliberately separates "purchase lapsed" (still browsing, worth a nudge)
 * from "truly churned" (nothing happening on either axis) — these warrant
 * very different marketing actions.
 */
/** How far ahead a lifetime value looks. Twelve months: comparable to a year's
 *  revenue, the horizon shops budget against, and short enough that the prediction
 *  can be marked against what actually happens. */
const CLV_HORIZON_MONTHS = 12

/** LAST RESORT ONLY — used when a project cannot yet measure its own rate.
 *
 *  This started life as a flat 0.55 applied to every project, taken from one shop's
 *  data. That is the wrong shape for a platform: a grocer whose customers buy weekly
 *  and a furniture shop whose customers buy twice a year do not share a rate, and
 *  hard-coding one silently under-predicts the first and over-predicts the second for
 *  every customer's first three months.
 *
 *  A project now measures its own (`projectOrderRate`). This value is reached only by
 *  a project with no customer old enough to measure — day one, before any history
 *  exists — and is deliberately conservative, because over-predicting a brand-new
 *  shop's customers is the more expensive mistake. */
const CLV_FALLBACK_ORDERS_PER_MONTH = 0.5

/** How much that population rate is worth, in months of the customer's own history.
 *  At three, a customer is trusted over the population once they pass three months. */
const CLV_PRIOR_WEIGHT_MONTHS = 3

/**
 * What a typical customer of THIS project buys in a month.
 *
 * Measured, not assumed. Only customers with at least `MEASURE_MIN_MONTHS` of history
 * count — a rate taken over days is the very error this whole correction exists to
 * undo, so letting those customers define the population average would feed the bug
 * back into its own fix.
 *
 * The median is used rather than the mean. One customer with nine orders in three
 * weeks drags a mean upwards hard; on Bazario the mean across all buyers came out at
 * 18.7 orders a month against a true rate of 0.55, purely from short-tenure outliers.
 *
 * Cached briefly: this is a whole-table aggregate and the answer moves slowly — it is
 * a property of the shop, not of the customer being scored.
 */
const RATE_CACHE = new Map<string, { rate: number; at: number }>()
const RATE_TTL_MS = 10 * 60 * 1000
const MEASURE_MIN_MONTHS = 3

export async function projectOrderRate(projectId: string): Promise<number> {
  const hit = RATE_CACHE.get(projectId)
  if (hit && Date.now() - hit.at < RATE_TTL_MS) return hit.rate

  const res = await db.execute<{ rate: string | null }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (
             ORDER BY total_orders / (EXTRACT(EPOCH FROM (NOW() - first_order_date)) / 86400.0 / 30.44)
           ) AS rate
    FROM customers
    WHERE project_id = ${projectId}
      AND total_orders > 0
      AND first_order_date IS NOT NULL
      AND EXTRACT(EPOCH FROM (NOW() - first_order_date)) / 86400.0 / 30.44 >= ${MEASURE_MIN_MONTHS}
  `)
  const raw = Number(res.rows[0]?.rate)
  // Bounded either side: a project whose measurement collapses (one odd customer, a
  // bad import) must not swing every prediction on the platform.
  const rate = Number.isFinite(raw) && raw > 0
    ? Math.min(10, Math.max(0.05, raw))
    : CLV_FALLBACK_ORDERS_PER_MONTH

  RATE_CACHE.set(projectId, { rate, at: Date.now() })
  return rate
}

export function computeClv(input: ClvInput): ClvResult {
  const { totalSpent, totalOrders, firstOrderDate, lastOrderDate, lastSeenDate, churnRiskScore } = input
  const now = new Date()

  const daysSinceLastSeen = lastSeenDate
    ? Math.max(0, (now.getTime() - lastSeenDate.getTime()) / MS_PER_DAY)
    : null

  // No orders yet — they may still be brand-new and engaging.
  if (totalOrders === 0 || !firstOrderDate) {
    return {
      clv_historical: 0,
      clv_predicted: 0,
      clv_total: 0,
      clv_monthly_frequency: 0,
      clv_retention_months: 0,
      clv_churn_probability: 1,
      clv_health: daysSinceLastSeen != null && daysSinceLastSeen <= 30 ? 'new' : 'churned',
      days_since_last_order: null,
      days_since_last_seen: daysSinceLastSeen != null ? Math.round(daysSinceLastSeen) : null,
    }
  }

  const historical = totalSpent
  const aov = totalSpent / totalOrders

  const tenureDays = Math.max(1, (now.getTime() - firstOrderDate.getTime()) / MS_PER_DAY)

  // HOW OFTEN THEY BUY — WEIGHTED BY HOW MUCH WE ACTUALLY KNOW.
  //
  // This read `totalOrders / tenureMonths` with tenure floored at one month, so a
  // shopper two days old with five orders was recorded as buying five times a MONTH
  // and that rate was then projected forward. Measured on Bazario: customers with
  // three months of history buy 0.55 times a month; customers under a month were
  // credited with 10-30x that, and one who had spent Rs1.94 lakh over two days came
  // out valued at Rs82 lakh. Across the base, predicted value ran 28x actual revenue.
  //
  // The floor was the trap. It does stop a divide-by-zero, but it also silently turns
  // "we have two days of evidence" into "we have a month of evidence", and a burst of
  // first-week orders reads as a permanent habit.
  //
  // So the observed rate is blended with the population's, weighted by evidence: a
  // customer with days of history leans on the population, one with a year leans on
  // themselves, and the shift between the two is gradual rather than a cliff. This is
  // the standard correction for a rate measured over a short window — the same reason
  // a batsman is not given a career average after one innings.
  const priorMonths = CLV_PRIOR_WEIGHT_MONTHS
  const populationRate = input.populationOrdersPerMonth ?? CLV_FALLBACK_ORDERS_PER_MONTH
  const observedMonths = Math.max(tenureDays / 30.44, 0.03)
  const monthlyFrequency =
    (totalOrders + priorMonths * populationRate) / (observedMonths + priorMonths)

  // Days since last order. If lastOrderDate is missing (the worker hasn't
  // populated it yet), fall back to last_seen — that's a tighter bound than
  // using tenureDays, which would mark a fresh import "churned" by default.
  const daysSinceLastOrder = lastOrderDate
    ? Math.max(0, (now.getTime() - lastOrderDate.getTime()) / MS_PER_DAY)
    : daysSinceLastSeen ?? tenureDays

  // Average gap between orders. Floor-clamped to 1 so same-day-multi-order
  // customers don't blow up downstream divisions.
  const avgGapDays = Math.max(
    1,
    totalOrders > 1
      ? ((lastOrderDate ?? now).getTime() - firstOrderDate.getTime()) / MS_PER_DAY / (totalOrders - 1)
      : tenureDays,
  )

  const overdueRatio = daysSinceLastOrder / avgGapDays

  let churnProb: number
  if (churnRiskScore !== undefined && churnRiskScore > 0) {
    churnProb = Math.max(0.02, churnRiskScore / 100)
  } else {
    if (totalOrders === 1) {
      churnProb = 0.6
    } else if (overdueRatio <= 1) {
      churnProb = 0.05
    } else if (overdueRatio <= 2) {
      churnProb = 0.15 + (overdueRatio - 1) * 0.2
    } else if (overdueRatio <= 3) {
      churnProb = 0.35 + (overdueRatio - 2) * 0.3
    } else {
      churnProb = Math.min(0.95, 0.65 + (overdueRatio - 3) * 0.1)
    }
  }

  // Engagement multiplier — recently-active customers earn a CLV bump,
  // disengaged ones get dampened. Floor at 0.5 so we don't zero out value
  // entirely; that's what 'churned' classification is for.
  let engagementMultiplier = 1.0
  if (daysSinceLastSeen != null) {
    if (daysSinceLastSeen <= 7)        engagementMultiplier = 1.15
    else if (daysSinceLastSeen <= 30)  engagementMultiplier = 1.0
    else if (daysSinceLastSeen <= 90)  engagementMultiplier = 0.75
    else                                engagementMultiplier = 0.5
  }

  // HOW LONG THEY KEEP BUYING — AND THE FLOOR THAT USED TO DECIDE IT.
  //
  // `Math.max(0.01, ...)` was overriding the churn score rather than guarding it. A
  // healthy customer's monthly churn works out at 0.00427, the floor raised it to
  // 0.01, that gave 100 months, and the cap trimmed it to 36. Every customer who was
  // not visibly lapsing therefore received the SAME three years, and the careful churn
  // banding above this line changed nothing for them:
  //
  //     churnProb 0.05 -> 36 months      churnProb 0.35 -> 28.4 months
  //     churnProb 0.15 -> 36 months      churnProb 0.60 -> 13.6 months
  //
  // The horizon is now twelve months, and the floor sits below what any real churn
  // value produces so the score is what decides.
  //
  // Twelve because that is what the data can answer for. Predicting three years from
  // eight months of history extrapolates four times past the evidence, and a 36-month
  // figure cannot be checked until 2029. A year is comparable to annual revenue, is
  // how shops budget, and can be marked against reality when it arrives.
  const monthlyChurnRate = Math.max(0.001, 1 - Math.pow(1 - churnProb, 1 / 12))
  const retentionMonths = Math.min(CLV_HORIZON_MONTHS, 1 / monthlyChurnRate)

  const predicted = Math.round(aov * monthlyFrequency * retentionMonths * engagementMultiplier * 100) / 100

  // Health categorization — combines order recency with site engagement.
  // The key insight is that a customer who hasn't ordered in 6 months but
  // who's still viewing products this week is a re-engagement opportunity,
  // not a lost cause. The old model collapsed both into "churned".
  const hasRecentEngagement = daysSinceLastSeen != null && daysSinceLastSeen <= 60
  let health: ClvHealth
  if (daysSinceLastOrder > 180) {
    health = hasRecentEngagement ? 'lapsed_engaged' : 'churned'
  } else if (overdueRatio > 3) {
    health = hasRecentEngagement ? 'at_risk' : 'churned'
  } else if (overdueRatio > 1.5) {
    health = 'declining'
  } else if (overdueRatio > 0.8) {
    health = 'stable'
  } else {
    health = 'growing'
  }

  return {
    clv_historical: Math.round(historical * 100) / 100,
    clv_predicted: Math.max(0, predicted),
    clv_total: Math.round((historical + Math.max(0, predicted)) * 100) / 100,
    clv_monthly_frequency: Math.round(monthlyFrequency * 100) / 100,
    clv_retention_months: Math.round(retentionMonths * 10) / 10,
    clv_churn_probability: Math.round(churnProb * 1000) / 1000,
    clv_health: health,
    days_since_last_order: Math.round(daysSinceLastOrder),
    days_since_last_seen: daysSinceLastSeen != null ? Math.round(daysSinceLastSeen) : null,
  }
}

// ============ IDENTITY RESOLUTION ============

type ResolveParams = {
  projectId: string
  externalId?: string
  email?: string | null
  phone?: string | null
  name?: string | null
  emailSubscribed?: boolean
  smsSubscribed?: boolean
  pushSubscribed?: boolean
  whatsappSubscribed?: boolean
  region?: string | null
  city?: string | null
  /** External dealer ID (matches agents.external_dealer_id). Stamps
   *  customers.agent_id when the agent row already exists AND the customer
   *  has no agent assigned yet. Silently skipped if dealer not found. */
  agentExternalDealerId?: string | null
  /** Extra keys to merge into customers.custom_attributes (jsonb || merge,
   *  incoming keys win, untouched keys preserved). Used by connector sync to
   *  carry source-only fields like fcm_token through to push delivery. */
  customAttributes?: Record<string, unknown> | null
  /** When true, last_seen is NOT bumped on resolution. Set by batch sync /
   *  bulk-import paths so that pipeline activity doesn't masquerade as
   *  customer activity. Live event ingestion leaves this false — an event
   *  IS activity. */
  skipLastSeenBump?: boolean
  /** Source-system created_at (e.g. Medusa customer.created_at). Used to
   *  set first_seen accurately when ingesting an existing customer from a
   *  source whose history predates Storees. Falls back to NOW() on insert
   *  and is LEAST()-merged into an existing first_seen if older. */
  sourceCreatedAt?: Date | null
}

/**
 * Identity resolution: find existing customer or create new one.
 *
 * Resolution order:
 * 1. external_id (Shopify customer ID)
 * 2. email
 * 3. phone
 * 4. Create new if not found (atomic INSERT ... ON CONFLICT)
 *
 * Race-condition safe: uses unique partial indexes + ON CONFLICT.
 * Always updates last_seen.
 */
export async function resolveCustomer(params: ResolveParams): Promise<string> {
  const customerId = await resolveCustomerCore(params)

  // Dealer linking. Always store the dealer_id in custom_attributes so a
  // later dealer-sync can backlink if the agent row doesn't exist yet. Also
  // stamp customers.agent_id IF NULL when the agent already exists. Don't
  // clobber an existing assignment — reassignment is a separate concern.
  if (params.agentExternalDealerId) {
    await db.execute(sql`
      WITH agent_match AS (
        SELECT id FROM agents
        WHERE project_id = ${params.projectId}
          AND external_dealer_id = ${params.agentExternalDealerId}
        LIMIT 1
      )
      UPDATE customers c
      SET
        custom_attributes = COALESCE(c.custom_attributes, '{}'::jsonb)
                          || jsonb_build_object('dealer_id', ${params.agentExternalDealerId}::text),
        agent_id   = COALESCE(c.agent_id, (SELECT id FROM agent_match)),
        updated_at = NOW()
      WHERE c.id = ${customerId}
    `)
  }

  // Merge connector-supplied custom attributes (e.g. fcm_token) without
  // clobbering existing keys (dealer_id above, anything event-set). Incoming
  // keys win on collision. Runs after the dealer merge so both compose.
  if (params.customAttributes && Object.keys(params.customAttributes).length > 0) {
    await db.execute(sql`
      UPDATE customers
      SET custom_attributes = COALESCE(custom_attributes, '{}'::jsonb)
                            || ${JSON.stringify(params.customAttributes)}::jsonb,
          updated_at = NOW()
      WHERE id = ${customerId}
    `)
  }

  return customerId
}

async function resolveCustomerCore(params: ResolveParams): Promise<string> {
  const { projectId, externalId, email, phone, name, emailSubscribed, smsSubscribed, pushSubscribed, whatsappSubscribed, region, city, skipLastSeenBump, sourceCreatedAt } = params

  // 1. Try external_id (has unique index: idx_customers_external)
  if (externalId) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, externalId)))
      .limit(1)

    if (found) {
      await updateLastSeen(found.id, { name, email, phone, emailSubscribed, smsSubscribed, pushSubscribed, whatsappSubscribed, region, city, skipLastSeenBump, sourceCreatedAt })
      return found.id
    }
  }

  // 2. Try email (has unique partial index: idx_customers_email_unique)
  if (email) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.email, email)))
      .limit(1)

    if (found) {
      const updates: Record<string, unknown> = { updatedAt: new Date() }
      if (!skipLastSeenBump) updates.lastSeen = new Date()
      // Fill external_id only when currently empty — don't clobber a Shopify
      // customer id with a different source's id (e.g. a Shopflo uid).
      if (externalId) updates.externalId = sql`COALESCE(${customers.externalId}, ${externalId})`
      if (name) updates.name = name
      if (phone) updates.phone = phone
      if (emailSubscribed !== undefined) updates.emailSubscribed = emailSubscribed
      if (smsSubscribed !== undefined) updates.smsSubscribed = smsSubscribed
      if (pushSubscribed !== undefined) updates.pushSubscribed = pushSubscribed
      if (whatsappSubscribed !== undefined) updates.whatsappSubscribed = whatsappSubscribed
      // Region/city: only fill if currently NULL (don't clobber other-source data like B2B dealer assignment)
      if (region) updates.region = sql`COALESCE(${customers.region}, ${region})`
      if (city) updates.city = sql`COALESCE(${customers.city}, ${city})`
      // first_seen: only ever moves backward (toward earlier dates), never forward.
      // Lets a sync from a source whose history predates Storees correct an
      // existing row whose first_seen was set to ingest-time.
      if (sourceCreatedAt) updates.firstSeen = sql`LEAST(${customers.firstSeen}, ${sourceCreatedAt})`
      await db.update(customers).set(updates).where(eq(customers.id, found.id))
      return found.id
    }
  }

  // 3. Try phone (has unique partial index: idx_customers_phone_unique)
  if (phone) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.phone, phone)))
      .limit(1)

    if (found) {
      await updateLastSeen(found.id, { name, externalId, email, emailSubscribed, smsSubscribed, pushSubscribed, whatsappSubscribed, region, city, skipLastSeenBump, sourceCreatedAt })
      return found.id
    }
  }

  // 4. Atomic create — ON CONFLICT prevents duplicate creation race condition.
  // first_seen / last_seen handling:
  //   - INSERT: prefer sourceCreatedAt when provided (sync path) so an
  //     ingested historical customer doesn't get labelled "new today".
  //     last_seen on a brand-new INSERT defaults to first_seen so an
  //     unseen customer doesn't immediately count as "active 7d".
  //   - ON CONFLICT UPDATE: same LEAST() rule for first_seen; last_seen
  //     only bumped when skipLastSeenBump is false.
  const initialFirstSeen = sourceCreatedAt ?? new Date()
  const initialLastSeen = skipLastSeenBump ? initialFirstSeen : new Date()
  if (email) {
    const result = await db.execute(sql`
      INSERT INTO customers (project_id, external_id, email, phone, name, email_subscribed, sms_subscribed, push_subscribed, whatsapp_subscribed, region, city, metrics, first_seen, last_seen)
      VALUES (${projectId}, ${externalId ?? null}, ${email}, ${phone ?? null}, ${name ?? null}, ${emailSubscribed ?? false}, ${smsSubscribed ?? false}, ${pushSubscribed ?? false}, ${whatsappSubscribed ?? false}, ${region ?? null}, ${city ?? null}, '{}'::jsonb, ${initialFirstSeen}, ${initialLastSeen})
      ON CONFLICT (project_id, email) WHERE email IS NOT NULL
      DO UPDATE SET
        last_seen   = CASE WHEN ${skipLastSeenBump ?? false} THEN customers.last_seen ELSE NOW() END,
        first_seen  = LEAST(customers.first_seen, EXCLUDED.first_seen),
        updated_at  = NOW(),
        external_id = COALESCE(EXCLUDED.external_id, customers.external_id),
        phone       = COALESCE(EXCLUDED.phone, customers.phone),
        name        = COALESCE(EXCLUDED.name, customers.name),
        region      = COALESCE(customers.region, EXCLUDED.region),
        city        = COALESCE(customers.city, EXCLUDED.city)
      RETURNING id
    `)
    return (result.rows[0] as { id: string }).id
  }

  if (phone) {
    const result = await db.execute(sql`
      INSERT INTO customers (project_id, external_id, email, phone, name, email_subscribed, sms_subscribed, push_subscribed, whatsapp_subscribed, region, city, metrics, first_seen, last_seen)
      VALUES (${projectId}, ${externalId ?? null}, ${null}, ${phone}, ${name ?? null}, ${emailSubscribed ?? false}, ${smsSubscribed ?? false}, ${pushSubscribed ?? false}, ${whatsappSubscribed ?? false}, ${region ?? null}, ${city ?? null}, '{}'::jsonb, ${initialFirstSeen}, ${initialLastSeen})
      ON CONFLICT (project_id, phone) WHERE phone IS NOT NULL
      DO UPDATE SET
        last_seen   = CASE WHEN ${skipLastSeenBump ?? false} THEN customers.last_seen ELSE NOW() END,
        first_seen  = LEAST(customers.first_seen, EXCLUDED.first_seen),
        updated_at  = NOW(),
        external_id = COALESCE(EXCLUDED.external_id, customers.external_id),
        name        = COALESCE(EXCLUDED.name, customers.name),
        region      = COALESCE(customers.region, EXCLUDED.region),
        city        = COALESCE(customers.city, EXCLUDED.city)
      RETURNING id
    `)
    return (result.rows[0] as { id: string }).id
  }

  // Fallback: no email or phone, just insert (external_id unique constraint protects)
  const [created] = await db.insert(customers).values({
    projectId,
    externalId: externalId ?? null,
    email: null,
    phone: null,
    name: name ?? null,
    emailSubscribed: emailSubscribed ?? false,
    smsSubscribed: smsSubscribed ?? false,
    pushSubscribed: pushSubscribed ?? false,
    whatsappSubscribed: whatsappSubscribed ?? false,
    region: region ?? null,
    city: city ?? null,
    metrics: {},
    firstSeen: initialFirstSeen,
    lastSeen: initialLastSeen,
  }).returning({ id: customers.id })

  return created.id
}

async function updateLastSeen(
  customerId: string,
  extra?: {
    name?: string | null
    externalId?: string
    email?: string | null
    phone?: string | null
    emailSubscribed?: boolean
    smsSubscribed?: boolean
    pushSubscribed?: boolean
    whatsappSubscribed?: boolean
    region?: string | null
    city?: string | null
    skipLastSeenBump?: boolean
    sourceCreatedAt?: Date | null
  },
): Promise<void> {
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  }
  // last_seen only bumps when this resolution represents real customer
  // activity — set by callers that aren't batch-sync.
  if (!extra?.skipLastSeenBump) updates.lastSeen = new Date()
  // first_seen only moves backward toward earlier dates — never forward.
  if (extra?.sourceCreatedAt) updates.firstSeen = sql`LEAST(${customers.firstSeen}, ${extra.sourceCreatedAt})`
  if (extra?.name) updates.name = extra.name
  // external_id fills only when empty — never overwrite one source's id
  // (e.g. Shopify customer id) with another's (e.g. Shopflo uid).
  if (extra?.externalId) updates.externalId = sql`COALESCE(${customers.externalId}, ${extra.externalId})`
  if (extra?.email) updates.email = extra.email
  if (extra?.phone) updates.phone = extra.phone
  if (extra?.emailSubscribed !== undefined) updates.emailSubscribed = extra.emailSubscribed
  if (extra?.smsSubscribed !== undefined) updates.smsSubscribed = extra.smsSubscribed
  if (extra?.pushSubscribed !== undefined) updates.pushSubscribed = extra.pushSubscribed
  if (extra?.whatsappSubscribed !== undefined) updates.whatsappSubscribed = extra.whatsappSubscribed
  // Region/city: only fill if currently NULL — see resolveCustomer for rationale
  if (extra?.region) updates.region = sql`COALESCE(${customers.region}, ${extra.region})`
  if (extra?.city) updates.city = sql`COALESCE(${customers.city}, ${extra.city})`

  await db.update(customers).set(updates).where(eq(customers.id, customerId))
}

/**
 * Recompute a customer's CLV from their current aggregates and merge the result
 * into metrics atomically — a concurrent metrics writer must not be clobbered by
 * a stale read-modify-write.
 */
async function refreshCustomerClv(customerId: string): Promise<void> {
  const [row] = await db.select({
    projectId: customers.projectId,
    totalSpent: customers.totalSpent,
    totalOrders: customers.totalOrders,
    firstOrderDate: customers.firstOrderDate,
    lastOrderDate: customers.lastOrderDate,
    lastSeen: customers.lastSeen,
    metrics: customers.metrics,
  }).from(customers).where(eq(customers.id, customerId)).limit(1)
  if (!row) return

  const metrics = (row.metrics ?? {}) as Record<string, unknown>
  const clvResult = computeClv({
    totalSpent: Number(row.totalSpent),
    totalOrders: row.totalOrders,
    firstOrderDate: row.firstOrderDate,
    lastOrderDate: row.lastOrderDate,
    lastSeenDate: row.lastSeen,
    // This shop's own rhythm, not a number borrowed from a different kind of shop.
    populationOrdersPerMonth: await projectOrderRate(row.projectId),
    churnRiskScore: mlChurnScore(metrics),
  })
  await db.execute(sql`
    UPDATE customers SET
      clv = ${String(clvResult.clv_total)},
      metrics = COALESCE(metrics, '{}'::jsonb) || ${JSON.stringify(clvResult)}::jsonb,
      updated_at = NOW()
    WHERE id = ${customerId}
  `)
}

/**
 * Update customer aggregates after an order event.
 * Uses atomic SQL increment to prevent lost-update race conditions.
 */
/**
 * Run one customer's aggregate recompute with every other recompute for that same
 * customer held back.
 *
 * WHY A LOCK, WHEN THE RECOMPUTE IS ALREADY ONE ATOMIC STATEMENT.
 *
 * Atomic is not the same as ordered. Under READ COMMITTED each statement takes its
 * snapshot when it starts, so two recomputes for one customer can both read, then
 * both write, and the one that read the OLDER world is free to commit last.
 *
 * That is not hypothetical. A purchase and its refund are routinely handed to
 * different workers in the same instant. The refund marks the order refunded and
 * recomputes to zero; the purchase's recompute, whose snapshot was taken a moment
 * earlier and still sees the order as a live sale, lands on top and restores the
 * revenue. The orders table then says refunded while the customer card says sold,
 * and nothing ever runs again to reconcile them. Two projects fed byte-identical
 * data came out at 473 and 474 orders against a true 470, each having lost a
 * different arbitrary handful.
 *
 * The lock is taken in its own statement before the recompute, so the recompute's
 * snapshot is taken after the previous holder has committed. Whichever recompute
 * runs last therefore reads the final state, which is the property that was missing.
 * It is transaction-scoped, so it is released on commit or rollback with nothing to
 * clean up, and it is keyed per customer, so it serialises one shopper's events
 * without holding up anybody else's.
 */
async function withCustomerAggregateLock(
  customerId: string,
  run: (tx: typeof db) => Promise<unknown>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${customerId}, 0))`)
    await run(tx as unknown as typeof db)
  })
}

export async function updateCustomerAggregates(
  customerId: string,
  _orderTotal?: number,   // vestigial — kept for call-site compatibility
  _orderDate?: Date,      // aggregates are recomputed from the orders table
  /** WHEN this event actually happened. Defaults to now, which is right for an event
   *  that just arrived and wrong for one being replayed — see the `last_seen` line. */
  seenAt?: Date,
): Promise<void> {

  // THIS CUSTOMER'S PROJECT DECIDES WHAT COUNTS AS REVENUE.
  //
  // The union below reads order EVENTS as well as order rows, and an event only
  // counts if it is one of the words this project actually uses for a sale. Reading
  // a fixed pair of names instead would make a lender's `emi_paid` invisible here —
  // and the zeroing guard further down treats "invisible" as "never bought", which
  // is how a borrower's recorded revenue was wiped to zero on Recalculate.
  //
  // `projectVocabulary` is cached for 60s, so this costs one lookup per project per
  // minute, not one per order.
  const [{ projectId: _pid } = { projectId: '' }] = await db
    .select({ projectId: customers.projectId })
    .from(customers).where(eq(customers.id, customerId)).limit(1)
  const vocab = await projectVocabulary(_pid)
  const revenueEvents = [...new Set([
    ...vocab.purchaseEvents, 'subscription_renewed', 'emi_paid', 'premium_paid',
  ])]
  const amountKey = vocab.amountKey
  const fallbackOrderId = (alias: string) => sql`COALESCE(
    NULLIF(${sql.raw(alias)}.properties->>${vocab.orderIdKey}, ''),
    ${sql.raw(alias)}.id::text)`
  const reversedOrderIds = sql`(
    SELECT COALESCE(NULLIF(r.properties->>${vocab.orderIdKey}, ''), r.id::text)
    FROM events r
    WHERE r.project_id = ${_pid}
      AND ${eventIn(sql`r.event_name`, vocab.cancellationEvents)})`

  // IDEMPOTENT: recompute order stats from the ORDERS TABLE (deduped on
  // (project, external_order_id)), NOT by +1. Incremental counting
  // double-counted whenever an order reached the counter through more than
  // one path (webhook + historical sync, or the aggregate worker) even
  // though the order row was inserted once — that's the "Orders tab shows 1
  // but the card shows 2" bug. Callers invoke this AFTER inserting the order
  // row, so the new order is included. Cancelled orders excluded.
  await withCustomerAggregateLock(customerId, tx =>
    tx.execute(sql`
    UPDATE customers c SET
      total_orders     = COALESCE(agg.cnt, 0),
      total_spent      = COALESCE(agg.spent, 0),
      avg_order_value  = CASE WHEN COALESCE(agg.cnt, 0) > 0 THEN agg.spent / agg.cnt ELSE 0 END,
      first_order_date = agg.first_at,
      last_order_date  = agg.last_at,
      -- THE EVENT'S OWN TIME, not the clock.
      --
      -- This said NOW(), which is the same thing while events arrive live and quietly
      -- false the moment history is re-read. Saving the Event Mapping screen replays
      -- stored events through this function, so re-reading a March order stamped that
      -- customer as active today. Measured on a GoWelmart copy whose data ends 18
      -- August: 3,809 customers came out marked "last seen" on the 25th.
      --
      -- It is not just a chart. last_seen decides who is dormant, who is at risk,
      -- the recency axis of the RFM grid and the recency half of the engagement score
      -- — so a replay quietly lifted lapsed customers out of the very segments meant
      -- to win them back.
      last_seen        = GREATEST(last_seen, ${seenAt ?? new Date()}),
      updated_at       = NOW()
    FROM (

      SELECT COUNT(*)::int AS cnt,
             COALESCE(SUM(revenue), 0)::numeric(12,2) AS spent,
             MIN(ts) AS first_at,
             MAX(ts) AS last_at
      FROM (
        SELECT DISTINCT ON (order_key) order_key, revenue, ts
        FROM (
          SELECT COALESCE(NULLIF(external_order_id, ''), id::text) AS order_key,
                 COALESCE(total::numeric, 0) AS revenue, created_at AS ts, 0 AS source_rank
          FROM orders
          WHERE customer_id = ${customerId} AND ${LIVE_ORDERS}
          UNION ALL
          SELECT COALESCE(
                   NULLIF(e.properties->>${vocab.orderIdKey}, ''),
                   CASE WHEN e.properties->>'display_id' IS NOT NULL THEN '#' || (e.properties->>'display_id') END,
                   e.id::text
                 ) AS order_key,
                 COALESCE(
                   NULLIF(e.properties->>${amountKey}, '')::numeric,
                   (SELECT COALESCE(SUM(
                      COALESCE(NULLIF(item->>'price', '')::numeric, NULLIF(item->>'unit_price', '')::numeric, 0)
                      * COALESCE(NULLIF(item->>'quantity', '')::numeric, 1)
                    ), 0)
                    FROM jsonb_array_elements(e.properties->'line_items') item),
                   0
                 ) AS revenue,
                 e.timestamp AS ts, 1 AS source_rank
          FROM events e
          WHERE e.customer_id = ${customerId}
            AND ${eventIn(sql`e.event_name`, revenueEvents)}
            AND ${fallbackOrderId('e')} NOT IN ${reversedOrderIds}
        ) u
        ORDER BY order_key, source_rank
      ) deduped

    ) agg
    WHERE c.id = ${customerId}
  `)
  )

  await refreshCustomerClv(customerId)
}

/**
 * Recalculate one customer's aggregates from the deduped UNION of their order
 * rows + order events (matching the Orders tab + recalculateAllAggregates), so
 * a customer with a mix of table rows and connector-only events isn't
 * undercounted. Idempotent — recomputes from source, so a duplicate
 * order_cancelled webhook can't double-decrement.
 */
export async function recalculateAggregates(
  customerId: string,
): Promise<void> {

  // THIS CUSTOMER'S PROJECT DECIDES WHAT COUNTS AS REVENUE.
  //
  // The union below reads order EVENTS as well as order rows, and an event only
  // counts if it is one of the words this project actually uses for a sale. Reading
  // a fixed pair of names instead would make a lender's `emi_paid` invisible here —
  // and the zeroing guard further down treats "invisible" as "never bought", which
  // is how a borrower's recorded revenue was wiped to zero on Recalculate.
  //
  // `projectVocabulary` is cached for 60s, so this costs one lookup per project per
  // minute, not one per order.
  const [{ projectId: _pid } = { projectId: '' }] = await db
    .select({ projectId: customers.projectId })
    .from(customers).where(eq(customers.id, customerId)).limit(1)
  const vocab = await projectVocabulary(_pid)
  const revenueEvents = [...new Set([
    ...vocab.purchaseEvents, 'subscription_renewed', 'emi_paid', 'premium_paid',
  ])]
  const amountKey = vocab.amountKey
  const fallbackOrderId = (alias: string) => sql`COALESCE(
    NULLIF(${sql.raw(alias)}.properties->>${vocab.orderIdKey}, ''),
    ${sql.raw(alias)}.id::text)`
  const reversedOrderIds = sql`(
    SELECT COALESCE(NULLIF(r.properties->>${vocab.orderIdKey}, ''), r.id::text)
    FROM events r
    WHERE r.project_id = ${_pid}
      AND ${eventIn(sql`r.event_name`, vocab.cancellationEvents)})`

  await withCustomerAggregateLock(customerId, tx =>
    tx.execute(sql`
    UPDATE customers c SET
      total_orders = agg.cnt,
      total_spent = agg.sum_total,
      avg_order_value = CASE WHEN agg.cnt > 0 THEN agg.sum_total / agg.cnt ELSE 0 END,
      updated_at = NOW()
    FROM (

      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(revenue), 0) AS sum_total
      FROM (
        SELECT DISTINCT ON (order_key) order_key, revenue
        FROM (
          SELECT COALESCE(NULLIF(external_order_id, ''), id::text) AS order_key,
                 COALESCE(total::numeric, 0) AS revenue, 0 AS source_rank
          FROM orders
          WHERE customer_id = ${customerId} AND ${LIVE_ORDERS}
          UNION ALL
          SELECT COALESCE(
                   NULLIF(e.properties->>${vocab.orderIdKey}, ''),
                   CASE WHEN e.properties->>'display_id' IS NOT NULL THEN '#' || (e.properties->>'display_id') END,
                   e.id::text
                 ) AS order_key,
                 COALESCE(
                   NULLIF(e.properties->>${amountKey}, '')::numeric,
                   (SELECT COALESCE(SUM(
                      COALESCE(NULLIF(item->>'price', '')::numeric, NULLIF(item->>'unit_price', '')::numeric, 0)
                      * COALESCE(NULLIF(item->>'quantity', '')::numeric, 1)
                    ), 0)
                    FROM jsonb_array_elements(e.properties->'line_items') item),
                   0
                 ) AS revenue,
                 1 AS source_rank
          FROM events e
          WHERE e.customer_id = ${customerId}
            AND ${eventIn(sql`e.event_name`, revenueEvents)}
            AND ${fallbackOrderId('e')} NOT IN ${reversedOrderIds}
        ) u
        ORDER BY order_key, source_rank
      ) deduped

    ) agg
    WHERE c.id = ${customerId}
  `)
  )

  await refreshCustomerClv(customerId)
}

/**
 * Recalculate all customer aggregates from real data.
 *
 * SOURCE OF TRUTH = the orders table, which is deduped on
 * (project, external_order_id). Events are NOT counted for order stats —
 * the same order arrives as multiple event rows (Shopify webhook +
 * historical sync + /v1/events push, each with its own idempotency key), so
 * counting events double-counted orders (Orders tab showed 1, the card
 * showed 2, single-order customers became "Repeat Buyers"). Events are used
 * only as a FALLBACK for customers who have order events but no order row
 * (e.g. a source that emits events without materialising orders).
 */
export async function recalculateAllAggregates(projectId: string): Promise<number> {

  // A customer's orders live in TWO places: the orders table (native Shopify
  // sync) and order_placed/order_completed EVENTS (the data-sync connector,
  // which never materialises a row). The customer Orders tab MERGES both,
  // deduped by order id — so the aggregate MUST too. The old two-pass version
  // (orders-table primary + event fallback ONLY for customers with no rows)
  // undercounted any customer with a MIX: 7 table rows hid ~33 connector-only
  // orders (card showed 7, Orders tab showed 40). Union both sources, dedup by
  // (customer, order_key) with the table row winning when an order is in both.

  // THIS PROJECT'S REVENUE VOCABULARY.
  //
  // Every pass below filtered on `order_placed` / `order_completed` and read
  // `properties.total`. Two consequences for a vertical that says it differently:
  // the fallback pass found nothing, and — far worse — the final pass ZEROED any
  // customer it could not see, because "not in the order events and not in the orders
  // table" was read as "has never bought".
  //
  // Measured on a lending project: a borrower with a ₹12,500 EMI recorded went
  // `orders=1, spent=12500` -> `orders=0, spent=0` the moment an admin pressed
  // Recalculate. Recurring revenue -- EMIs, subscription renewals, insurance premiums
  // -- has no order row by design (no transaction id of its own), so it was invisible
  // to both survival tests and got wiped.
  //
  // `revenueEvents` therefore covers the project's purchase events AND the recurring
  // ones, and is used for both the fallback and the zeroing guard.
  const vocab = await projectVocabulary(projectId)
  // Declared projects are judged by their own purchase events plus the recurring
  // payments that carry no transaction id. Undeclared ones keep the old fixed list,
  // which is what they have always behaved as.
  const revenueEvents = [...new Set([
    ...vocab.purchaseEvents, 'subscription_renewed', 'emi_paid', 'premium_paid',
  ])]
  const amountKey = vocab.amountKey

  const fallbackOrderId = (alias: string) => sql`COALESCE(
    NULLIF(${sql.raw(alias)}.properties->>${vocab.orderIdKey}, ''),
    NULLIF(${sql.raw(alias)}.properties->>'order_id', ''),
    NULLIF(${sql.raw(alias)}.properties->>'id', ''),
    ${sql.raw(alias)}.id::text)`

  // Reversal ids only — the recurring-payment events carry no order id and fall back
  // to their own event id above, so they can never collide with one of these.
  const reversedOrderIds = sql`(
    SELECT COALESCE(
             NULLIF(r.properties->>${vocab.orderIdKey}, ''),
             NULLIF(r.properties->>'order_id', ''),
             NULLIF(r.properties->>'id', ''))
    FROM events r
    WHERE r.project_id = ${projectId}
      AND ${eventIn(sql`r.event_name`, vocab.cancellationEvents)}
      AND COALESCE(
            NULLIF(r.properties->>${vocab.orderIdKey}, ''),
            NULLIF(r.properties->>'order_id', ''),
            NULLIF(r.properties->>'id', '')) IS NOT NULL
  )`


  // Primary: orders table — authoritative and deduped.

  const result = await db.execute(sql`
    UPDATE customers c SET
      total_orders     = agg.order_count,
      total_spent      = agg.total_spent,
      avg_order_value  = CASE WHEN agg.order_count > 0 THEN agg.total_spent / agg.order_count ELSE 0 END,
      clv              = agg.total_spent,
      first_order_date = agg.first_at,
      last_order_date  = agg.last_at,
      updated_at       = NOW()
    FROM (

      SELECT customer_id,
             COUNT(*)::integer AS order_count,
             COALESCE(SUM(revenue), 0)::numeric(12,2) AS total_spent,
             MIN(ts) AS first_at,
             MAX(ts) AS last_at
      FROM (
        -- DEDUPE ON THE ORDER, NOT ON CUSTOMER-AND-ORDER.
        --
        -- An order belongs to one customer, so the order key alone identifies it, which
        -- is exactly how the two per-customer queries above are keyed. Adding the
        -- customer id to the key makes the SAME order two rows whenever the order row
        -- and its event disagree about who placed it -- the normal residue of an
        -- identity merge, where one side is re-pointed and the other keeps the old id.
        --
        -- Measured on miranaCART: 8,758 orders exist and every one is present in both
        -- sources. Keyed on the pair this returned 8,788, and Rs121,483 of revenue that
        -- does not exist. Keyed on the order alone it returns 8,758.
        --
        -- It also defeated source_rank, whose whole purpose is to let the authoritative
        -- order row win over the event: the two were never competing for the same key.
        SELECT DISTINCT ON (order_key) order_key, customer_id, revenue, ts
        FROM (
          -- Materialised order rows (authoritative when shared with an event).
          SELECT customer_id,
                 COALESCE(NULLIF(external_order_id, ''), id::text) AS order_key,
                 COALESCE(total::numeric, 0) AS revenue,
                 created_at AS ts,
                 0 AS source_rank
          FROM orders
          WHERE project_id = ${projectId} AND ${LIVE_ORDERS}
          UNION ALL
          -- Connector orders that only ever exist as events.
          SELECT e.customer_id,
                 COALESCE(
                   NULLIF(e.properties->>${vocab.orderIdKey}, ''),
                   CASE WHEN e.properties->>'display_id' IS NOT NULL THEN '#' || (e.properties->>'display_id') END,
                   e.id::text
                 ) AS order_key,
                 COALESCE(
                   NULLIF(e.properties->>${amountKey}, '')::numeric,
                   (SELECT COALESCE(SUM(
                      COALESCE(NULLIF(item->>'price', '')::numeric, NULLIF(item->>'unit_price', '')::numeric, 0)
                      * COALESCE(NULLIF(item->>'quantity', '')::numeric, 1)
                    ), 0)
                    FROM jsonb_array_elements(e.properties->'line_items') item),
                   0
                 ) AS revenue,
                 e.timestamp AS ts,
                 1 AS source_rank
          FROM events e
          WHERE e.project_id = ${projectId}
            AND e.customer_id IS NOT NULL
            AND ${eventIn(sql`e.event_name`, revenueEvents)}
            AND ${fallbackOrderId('e')} NOT IN ${reversedOrderIds}
        ) u
        ORDER BY order_key, source_rank
      ) deduped

      GROUP BY customer_id
    ) agg
    WHERE c.id = agg.customer_id AND c.project_id = ${projectId}
  `)

  const ordersUpdated = Number((result as { rowCount?: number }).rowCount ?? 0)

  // THE HELPERS THE ZEROING GUARD BELOW STILL NEEDS.
  //
  // The two UPDATE passes that used to sit here — an event-only fallback and an
  // orders-table date backfill — are gone: the single UNION above now reads both
  // sources in one query, so the fallback would double-count every event order it
  // already saw, and the backfill would overwrite that query's dual-source dates
  // with orders-table-only ones. What survives is the pair of SQL fragments the
  // survival test still uses.

  // Zero out customers neither pass above could account for.
  //
  // The survival test has to match what the passes actually set, or a customer falls
  // between them and keeps a stale figure for ever. It did: someone whose only order
  // was later cancelled still HAS a purchase event, so this test spared them — while
  // the orders pass skipped them (no live order) and the fallback now skips them too
  // (the purchase is reversed). Nothing wrote their row, nothing cleared it, and the
  // number they were left with was from before the cancellation.
  //
  // So the event side of the test excludes reversed purchases, exactly as the fallback
  // does. Recurring payments have no order id and are never in that list, so an EMI
  // borrower still survives — which is the wipe this guard was written to prevent.
  // Zero out customers with no orders from either source
  await db.execute(sql`
    UPDATE customers SET
      total_orders = 0,
      total_spent = 0,
      avg_order_value = 0,
      clv = 0,
      first_order_date = NULL,
      last_order_date = NULL,
      updated_at = NOW()
    WHERE project_id = ${projectId}
      AND id NOT IN (
        SELECT DISTINCT e.customer_id FROM events e
        WHERE e.project_id = ${projectId}
          AND ${eventIn(sql`e.event_name`, revenueEvents)}
          AND e.customer_id IS NOT NULL
          AND ${fallbackOrderId('e')} NOT IN ${reversedOrderIds}
        UNION
        SELECT DISTINCT customer_id FROM orders

        WHERE project_id = ${projectId} AND ${LIVE_ORDERS}

      )
      AND (total_orders != 0 OR total_spent::numeric != 0)
  `)

  // Recompute CLV for all buyers using the JS model
  const buyers = await db.select({
    id: customers.id,
    totalSpent: customers.totalSpent,
    totalOrders: customers.totalOrders,
    firstOrderDate: customers.firstOrderDate,
    lastOrderDate: customers.lastOrderDate,
    lastSeen: customers.lastSeen,
    metrics: customers.metrics,
  }).from(customers).where(
    and(eq(customers.projectId, projectId), sql`total_orders > 0`),
  )

  // CLV is a JS-model computation, so compute per buyer then flush the row
  // updates in bounded-parallel chunks instead of one serial round-trip each.
  const CLV_WRITE_CONCURRENCY = 25
  const clvUpdates = buyers.map(row => {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>
    const clvResult = computeClv({
      totalSpent: Number(row.totalSpent),
      totalOrders: row.totalOrders,
      firstOrderDate: row.firstOrderDate,
      lastOrderDate: row.lastOrderDate,
      lastSeenDate: row.lastSeen,
      churnRiskScore: mlChurnScore(metrics),
    })
    return {
      id: row.id,
      clv: String(clvResult.clv_total),
      metrics: { ...metrics, ...clvResult, total_orders: row.totalOrders, total_spent: Number(row.totalSpent) },
    }
  })

  for (let i = 0; i < clvUpdates.length; i += CLV_WRITE_CONCURRENCY) {
    await Promise.all(clvUpdates.slice(i, i + CLV_WRITE_CONCURRENCY).map(u =>
      db.update(customers).set({
        clv: u.clv,
        metrics: u.metrics,
        updatedAt: new Date(),
      }).where(eq(customers.id, u.id)),
    ))
  }

  return ordersUpdated
}
