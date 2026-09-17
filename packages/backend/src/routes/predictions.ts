import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import { db } from '../db/connection.js'
import { predictionScores, predictionGoals, customers } from '../db/schema.js'
import { isEventDriven } from '../services/predictionCadence.js'
import { eq, and, desc, asc, count, avg, sql } from 'drizzle-orm'
import { checkMlHealth, explainCustomer } from '../services/mlProxyService.js'
import { clampPageSize, calcTotalPages } from '@storees/shared'

const router = Router()

// GET /api/predictions/health
// Check if ML service is available
router.get('/health', async (_req, res) => {
  const available = await checkMlHealth()
  res.json({ success: true, data: { mlAvailable: available } })
})

// GET /api/predictions/goals/:goalId/customers?projectId=...&bucket=high|medium|low&page=1&pageSize=25&sort=score_desc|score_asc
// Returns paginated customers with their prediction scores for a specific goal, plus aggregate stats
router.get('/goals/:goalId/customers', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const goalId = req.params.goalId as string
    const bucket = req.query.bucket as string | undefined
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = clampPageSize(Number(req.query.pageSize) || undefined)
    const sort = (req.query.sort as string) || 'score_desc'
    // WHICH POPULATION THIS IS ASKING ABOUT.
    //   live  the carts open right now — a worklist, and empty when nothing is open
    //   all   every row the last scoring run wrote — history, with outcomes known
    // Two different questions that were being answered by one list, which is how a
    // fourteen-day evaluation set came to be presented as work to do.
    const scope = (req.query.scope as string) === 'all' ? 'all' : 'live'
    const offset = (page - 1) * pageSize

    // A SCORE THAT HAS OUTLIVED ITS OWN WINDOW IS NOT A WEAK ONE, IT IS AN ANSWER
    // ABOUT SOMETHING THAT NO LONGER EXISTS.
    //
    // Applied here rather than in the page, and that is the whole point. The page shows
    // 25 rows at a time while the cards beside it are counted by the aggregate below,
    // over every row this goal has ever written. Hiding expired carts in the browser
    // therefore fixed the list and left the cards describing a different world — the
    // screen read "Live Now 0" beside "Likely to Abandon 812". One condition, shared by
    // the rows and the counts, is the only arrangement in which those two can agree.
    // It also survives paging, which a client-side filter cannot: it would clean the
    // current 25 rows and leave page 2 full of dead carts.
    //
    // ONLY FOR GOALS WHOSE WINDOW IS SHORTER THAN A DAY. A purchase model's answer is
    // good for the fortnight it forecasts; expiring those would quietly empty four
    // working screens. Same rule the scoring scheduler and the trigger worker use —
    // decided by the window, never by the goal's name.
    const [goalRow] = await db
      .select({ predictionWindowDays: predictionGoals.predictionWindowDays })
      .from(predictionGoals)
      .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))
      .limit(1)
    const windowDays = goalRow?.predictionWindowDays ?? null

    // WHEN THE OCCASION STARTED, dug out of `factors` — see the ordering note below.
    const occasionAt = sql`(
      SELECT (x->>'at')::timestamptz
      FROM jsonb_array_elements(${predictionScores.factors}::jsonb) x
      WHERE x->>'feature' = 'occasion_started_at' LIMIT 1
    )`

    // Build WHERE conditions
    const conditions = [
      eq(predictionScores.projectId, projectId),
      eq(predictionScores.goalId, goalId),
    ]

    // ANCHORED ON WHEN THE OCCASION BEGAN, falling back to the write time only for rows
    // scored before that was recorded.
    //
    // `created_at` alone was wrong in both directions: an upsert leaves it at whatever
    // wrote the row FIRST, so a cart scored seconds after it opened could read as long
    // expired, while a fortnight-old cart republished this afternoon read as fresh.
    // `computed_at` is no better — it is the model's DATA CUTOFF, always in the past,
    // and expiring against it would hide every score the instant it was written.
    const liveOnly = sql`COALESCE(${occasionAt}, ${predictionScores.createdAt})
                         > now() - make_interval(secs => ${(windowDays ?? 0) * 86400})`
    const applyLive = isEventDriven(windowDays) && scope === 'live'
    if (applyLive) {
      conditions.push(liveOnly)
    }

    if (bucket) {
      // Buckets are stored with the ML service's casing ("High"/"Medium"/
      // "Low") while the frontend sends lowercase. Compare case-insensitively
      // so the filtered list matches the bucket counts, which lowercase the
      // value before grouping (see bucketStats below).
      conditions.push(sql`lower(${predictionScores.bucket}) = ${bucket.toLowerCase()}`)
    }

    const whereClause = and(...conditions)

    // WHEN THE OCCASION STARTED, dug out of `factors`.
    //
    // ORDERING BY THE OCCASION HAS TO HAPPEN HERE. The page used to re-sort in the
    // browser, which can only ever reach the twenty-five rows already chosen BY SCORE:
    // each page came out internally date-ordered and the dates restarted on page two,
    // so the list read as random in both orderings at once. A sort that cannot see the
    // other pages is not a sort.
    // Order clause
    const orderFn =
      sort === 'score_asc'  ? asc(predictionScores.score)
    : sort === 'recent_asc' ? sql`${occasionAt} ASC NULLS LAST`
    : sort === 'recent_desc'? sql`${occasionAt} DESC NULLS LAST`
      : desc(predictionScores.score)

    // Fetch paginated results joining prediction_scores with customers
    const rows = await db
      .select({
        customerId: customers.id,
        customerName: customers.name,
        customerEmail: customers.email,
        score: predictionScores.score,
        bucket: predictionScores.bucket,
        confidence: predictionScores.confidence,
        factors: predictionScores.factors,
        computedAt: predictionScores.computedAt,
        // WHEN THE ROW WAS WRITTEN, which `computedAt` is not.
        //
        // `computed_at` is the model's DATA CUTOFF and is always in the past —
        // scoringWorker carries a note about a bug that emptied this table by assuming
        // otherwise. Anything working out how long a score is still good for needs the
        // write time, and a goal with an hours-long window has no other way to know.
        createdAt: predictionScores.createdAt,
      })
      .from(predictionScores)
      .innerJoin(customers, eq(predictionScores.customerId, customers.id))
      .where(whereClause)
      // A tie-break, so LIMIT/OFFSET has a total order to page through.
      // Without it, rows sharing the sort value come back in whatever order the
      // planner chooses per query, and paging then repeats some rows while hiding
      // others — measured at 132 duplicates in 1,250 customer rows before the
      // same fix was applied there. Scores tie far harder than that: calibration
      // lands 3,406 customers on 266 distinct values.
      .orderBy(orderFn, asc(predictionScores.id))
      .limit(pageSize)
      .offset(offset)

    // Count total matching rows
    const [{ total }] = await db
      .select({ total: count() })
      .from(predictionScores)
      .where(whereClause)

    // Aggregate stats: count by bucket + average score (unfiltered by bucket)
    const baseConditions = [
      eq(predictionScores.projectId, projectId),
      eq(predictionScores.goalId, goalId),
    ]
    // The SAME freshness condition the rows use. Counting over a wider set than the
    // list displays is exactly how the two came to disagree.
    if (applyLive) {
      baseConditions.push(liveOnly)
    }
    const baseWhere = and(...baseConditions)

    const bucketStats = await db
      .select({
        bucket: predictionScores.bucket,
        count: count(),
        avgScore: avg(predictionScores.score),
      })
      .from(predictionScores)
      .where(baseWhere)
      .groupBy(predictionScores.bucket)

    // WHAT ACTUALLY HAPPENED, per bucket — measured, not defined.
    //
    // The cards read "Likely to Abandon · 130 · 10.0%", and that 10% is the share of
    // the population in the band. It is true by construction: the bands ARE the top
    // decile, the next fifth and the rest, so the figure is the same on every goal,
    // every day, however well or badly the model did. Beside a prediction it reads as
    // accuracy and is not.
    //
    // An evaluation row carries the real answer in `outcome`. Where it is present this
    // reports the share that actually happened — of the 6 flagged, 4 really abandoned —
    // and where it is absent (a live score, whose answer has not happened yet) it
    // reports nothing rather than inventing a number.
    const outcomeVal = sql`(
      SELECT (x->>'value')::float
      FROM jsonb_array_elements(${predictionScores.factors}::jsonb) x
      WHERE x->>'feature' = 'outcome' LIMIT 1
    )`
    const outcomeStats = await db
      .select({
        bucket: predictionScores.bucket,
        known: sql<number>`count(*) FILTER (WHERE ${outcomeVal} IS NOT NULL)`,
        happened: sql<number>`count(*) FILTER (WHERE ${outcomeVal} = 1)`,
      })
      .from(predictionScores)
      .where(baseWhere)
      .groupBy(predictionScores.bucket)

    // HOW MANY ARE ACTUALLY LIVE, counted regardless of what this request asked for, so
    // a page showing history can say plainly that nothing is open rather than leaving
    // the reader to assume the list is the worklist.
    const [{ liveTotal }] = isEventDriven(windowDays)
      ? await db
          .select({ liveTotal: count() })
          .from(predictionScores)
          .where(and(
            eq(predictionScores.projectId, projectId),
            eq(predictionScores.goalId, goalId),
            liveOnly,
          ))
      : [{ liveTotal: 0 }]

    const stats = {
      total: bucketStats.reduce((sum, b) => sum + Number(b.count), 0),
      avgScore: 0,
      buckets: { high: 0, medium: 0, low: 0 } as Record<string, number>,
      /** Measured share that actually happened, per bucket. Null where unknown. */
      outcomes: {} as Record<string, { known: number; happened: number; rate: number | null }>,
      /** Carts open right now, whatever this request is showing. */
      liveTotal: Number(liveTotal),
      /** Which population these rows are: a worklist, or history. */
      scope: applyLive ? 'live' : 'all',
    }

    for (const row of outcomeStats) {
      const known = Number(row.known)
      const happened = Number(row.happened)
      stats.outcomes[row.bucket.toLowerCase()] = {
        known, happened,
        rate: known > 0 ? Math.round((happened / known) * 1000) / 10 : null,
      }
    }

    let weightedSum = 0
    for (const row of bucketStats) {
      const bucketKey = row.bucket.toLowerCase()
      stats.buckets[bucketKey] = Number(row.count)
      weightedSum += Number(row.avgScore || 0) * Number(row.count)
    }
    stats.avgScore = stats.total > 0
      ? Math.round((weightedSum / stats.total) * 100) / 100
      : 0

    res.json({
      success: true,
      data: rows,
      stats,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calcTotalPages(total, pageSize),
      },
    })
  } catch (err) {
    console.error('Goal customers error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch goal customers' })
  }
})

// GET /api/predictions/:customerId?projectId=...
// Returns all prediction scores for a customer with goal metadata
router.get('/:customerId', requireProjectId, async (req, res) => {
  try {
    const customerId = req.params.customerId as string

    // Get latest score per goal for this customer from DB
    const rows = await db
      .select({
        id: predictionScores.id,
        customerId: predictionScores.customerId,
        goalId: predictionScores.goalId,
        goalName: predictionGoals.name,
        score: predictionScores.score,
        confidence: predictionScores.confidence,
        bucket: predictionScores.bucket,
        factors: predictionScores.factors,
        modelVersion: predictionScores.modelVersion,
        computedAt: predictionScores.computedAt,
        createdAt: predictionScores.createdAt,
      })
      .from(predictionScores)
      .innerJoin(predictionGoals, eq(predictionScores.goalId, predictionGoals.id))
      .where(
        and(
          eq(predictionScores.projectId, req.projectId!),
          eq(predictionScores.customerId, customerId),
          eq(predictionGoals.status, 'active'),
        ),
      )
      .orderBy(desc(predictionScores.computedAt))

    // Deduplicate: keep latest score per goal
    const seen = new Set<string>()
    const scores = rows.filter(r => {
      if (seen.has(r.goalId)) return false
      seen.add(r.goalId)
      return true
    })

    res.json({ success: true, data: { scores } })
  } catch (err) {
    console.error('Customer predictions error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch customer predictions' })
  }
})

// POST /api/predictions/:customerId/explain?projectId=...
// Body: { goalId }
// Get SHAP explainability from ML service in real-time
router.post('/:customerId/explain', requireProjectId, async (req, res) => {
  try {
    const customerId = req.params.customerId as string
    const { goalId } = req.body

    if (!goalId) {
      return res.status(400).json({ success: false, error: 'goalId is required' })
    }

    const mlAvailable = await checkMlHealth()
    if (!mlAvailable) {
      return res.status(503).json({
        success: false,
        error: 'AI features temporarily unavailable',
      })
    }

    const result = await explainCustomer(req.projectId!, goalId, customerId)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Prediction explain error:', err)
    res.status(500).json({ success: false, error: 'Failed to get prediction explanation' })
  }
})

export default router
