/**
 * Scoring Worker — Batch score customers for prediction goals.
 *
 * Processes jobs from the 'score-customers' queue.
 * Job data: { projectId, goalId, targetEvent }
 *
 * Flow:
 * 1. Get all active customers for the project
 * 2. Batch them into chunks of 100
 * 3. Call ML service /propensity/score for each batch
 * 4. Upsert scores into prediction_scores table
 */

import { Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { customers, predictionScores, predictionGoals } from '../db/schema.js'
import { eq, and, sql, inArray, notInArray } from 'drizzle-orm'
import { scoreCustomers, checkMlHealth, eligibleCustomers } from '../services/mlProxyService.js'

type ScoringJob = {
  projectId: string
  goalId: string
  /** Score ONLY these customers, skipping the eligibility read.
   *
   *  Set by the event-driven path: when a goal's window is shorter than the nightly
   *  batch's own period, one customer's event has just arrived and only that customer's
   *  answer can have changed. Scoring the whole project on every add-to-cart would be
   *  thousands of feature builds an hour to refresh rows nothing touched.
   *
   *  Absent for the scheduled path, which scores the goal's whole eligible population
   *  exactly as before. */
  customerIds?: string[]
}

/** How many customers go to the ML service in one request.
 *
 *  Was 100, on the assumption that a batch costs roughly its own size. It does not: the
 *  scoring endpoint builds the WHOLE project's feature matrix and then selects the ids
 *  it was asked about, so the cost of a request is almost independent of how many
 *  customers it carries. At 100, scoring GoWelmart's 5,843 eligible customers meant 59
 *  full feature builds of the entire project to do one project's worth of work.
 *
 *  Each build also attaches Postgres through duckdb, so the batching multiplied
 *  connection pressure by the same factor — the run that exposed this died with
 *  `sorry, too many clients already` after 39 failures.
 *
 *  Large enough that a normal project is one or two requests; still bounded, so a
 *  million-customer project does not assemble one enormous JSON body.
 */
const BATCH_SIZE = Number(process.env.SCORING_BATCH_SIZE ?? 5000)

async function processScoring(job: { data: ScoringJob }) {
  const { projectId, goalId } = job.data

  // Check ML service availability
  const mlAvailable = await checkMlHealth()
  if (!mlAvailable) {
    // THROW, DO NOT RETURN. A skip is not a result.
    //
    // This returned `{status:'skipped'}`, which BullMQ records as a COMPLETED job: no
    // retry, nothing in the failed set, and a goal left holding whatever scores it had
    // before. On a normal restart the backend and the ML service come up together and
    // the backend wins the race, so the boot sweep asked a service that was still
    // importing its model and two goals were quietly left a day stale — Dormancy and
    // Repeat Purchase, measured here, with nothing on screen to say so.
    //
    // An unreachable dependency is a failure, so it is raised as one and the queue's
    // backoff retries it. A genuinely dead ML service still ends in the failed set,
    // which is where an operator can see it.
    throw new Error(`ML service unavailable for goal ${goalId} — will retry`)
  }

  // Get goal details
  const [goal] = await db
    .select()
    .from(predictionGoals)
    .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))

  if (!goal || goal.status !== 'active') {
    return { status: 'skipped', reason: 'goal_not_active' }
  }

  // WHO THIS GOAL APPLIES TO — asked of the pipeline, not assumed here.
  //
  // This was `SELECT id FROM customers WHERE project_id = ...`: every row, no condition.
  // The pipeline defines an eligible population per goal and grades the model on it —
  // measured on GoWelmart's dormancy goal, 5,843 people. Scoring handed the model 16,322,
  // about ten thousand of whom have no recorded activity at all.
  //
  // A customer with no activity produces an empty feature row, and an empty row scores as
  // whatever all-blank maps to — the flat wall of identical scores at the top of the list.
  // Those invented scores then produced every count on the screen: "Likely Dormant 11,103
  // (68%)" was largely empty rows being labelled, under an AUC measured on a population
  // three times smaller.
  //
  // Falling back to everyone when the service cannot answer would restore exactly that
  // behaviour silently, so a failure here stops the job instead.
  // The event-driven path already knows who to score — the customer whose event just
  // landed — so it skips the eligibility read entirely. That read is a whole-project
  // query, and running it per event would cost far more than the scoring it guards.
  const targeted = job.data.customerIds ?? null

  let allIds: string[]
  if (targeted?.length) {
    allIds = targeted
    console.log(`[scoring] ${goal.name}: event-driven, scoring ${allIds.length} customer(s)`)
  } else try {
    const eligible = await eligibleCustomers(projectId, goalId, goal.targetEvent)
    allIds = eligible.customerIds
    const [{ n: total } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(customers)
      .where(eq(customers.projectId, projectId))
    console.log(`[scoring] ${goal.name}: ${allIds.length} eligible of ${total} customers `
      + `(population for "${eligible.goal}")`)
  } catch (err) {
    // Re-raised, not swallowed. Reading the eligible population is an ML call, so it
    // fails for the same transient reasons the health check does — and returning a
    // result here marked the job COMPLETED, leaving the goal unscored until the next
    // daily sweep with nothing anywhere to say why.
    console.error(`[scoring] Could not read the eligible population for ${goalId}:`, err)
    throw err instanceof Error ? err : new Error(String(err))
  }

  if (allIds.length === 0) {
    console.warn(`[scoring] ${goal.name}: nobody is eligible yet — nothing scored`)
    return { status: 'completed', scored: 0, total: 0 }
  }

  let scored = 0
  // Batch failures are collected rather than swallowed — see the catch below.
  const failures: Error[] = []

  // Process in batches
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE)

    try {
      const result = await scoreCustomers(
        projectId,
        goalId,
        batch,
        goal.observationWindowDays ?? 90,
      )

      // Upsert scores — one row per (project, goal, customer). Migration 0058
      // adds the unique index this ON CONFLICT keys on; before that index
      // existed, every run inserted a duplicate row and "Total Scored" drifted
      // past the actual customer count.
      for (const s of result.scores) {
        await db
          .insert(predictionScores)
          .values({
            projectId,
            customerId: s.customerId,
            goalId,
            score: String(s.score),
            confidence: String(s.confidence),
            bucket: s.bucket,
            // WHAT THIS SCORE WAS ABOUT. Hardcoding `[]` meant a cart's value and its
            // open time never reached the row, so the Cart Value column came out blank
            // and the countdown had nothing to count from.
            factors: s.factors ?? [],
            modelVersion: result.modelVersion,
            computedAt: new Date(result.computedAt),
          })
          .onConflictDoUpdate({
            target: [predictionScores.projectId, predictionScores.goalId, predictionScores.customerId],
            set: {
              score: String(s.score),
              confidence: String(s.confidence),
              bucket: s.bucket,
              factors: s.factors ?? [],
              modelVersion: result.modelVersion,
              computedAt: new Date(result.computedAt),
              // AND THE ROW IS NEW AGAIN. `created_at` is what anything without an
              // explicit occasion time counts from, and an upsert left it at whatever
              // wrote the row first — so a cart scored seconds after it opened, onto a
              // row published a week earlier, rendered as already expired.
              createdAt: new Date(),
            },
          })
        scored++
      }

      // AND DROP ANYONE WE ASKED ABOUT WHO CAME BACK UNSCORED.
      //
      // Eligibility and scoreability are not the same test, and only the first was
      // being cleaned up below. A shopper who added to a cart an hour ago is still
      // eligible — the population is "added recently" — but if they have since emptied
      // the basket there is no occasion left to score, and the ML service correctly
      // returns nothing for them. Their previous score then sat there for ever: the
      // page showed a live cart worth Rs1,599 beside an empty basket.
      //
      // Scoped to the ids in THIS batch, so it is safe on both paths — the full sweep
      // and the single customer an event just arrived for — and it can never reach a
      // customer nobody asked about.
      const returned = new Set(result.scores.map(s => s.customerId))
      const vanished = batch.filter(id => !returned.has(id))
      if (vanished.length > 0) {
        const gone = await db
          .delete(predictionScores)
          .where(and(
            eq(predictionScores.projectId, projectId),
            eq(predictionScores.goalId, goalId),
            inArray(predictionScores.customerId, vanished),
          ))
          .returning({ id: predictionScores.id })
        if (gone.length) {
          console.log(`[scoring] ${goal.name}: cleared ${gone.length} score(s) whose `
            + `occasion has closed`)
        }
      }
    } catch (err) {
      // REMEMBER IT. A batch that threw is not a batch that scored nobody.
      //
      // This logged and carried on, so the job went on to report
      // `{status:'completed', scored:0}` — indistinguishable from "these customers
      // genuinely have no open occasion". Measured: of 185 scoring calls during a
      // 65-shopper run, ONE returned 500 from a DuckDB conversion error deep in the
      // feature build. That shopper was holding a basket, was never scored, and
      // nothing anywhere said so; the model scored them perfectly when asked again
      // by hand twenty minutes later.
      //
      // The loop still finishes: batches that DID succeed have already upserted and
      // that work is worth keeping. But the job must not end in success.
      failures.push(err instanceof Error ? err : new Error(String(err)))
      console.error(`[scoring] Batch error at offset ${i}:`, err)
    }
  }

  // Raised AFTER the loop so partial progress survives, and raised at all so the
  // queue's retry gets a second look at whatever failed. Upserts are idempotent, so
  // re-running the batches that already worked costs time and changes nothing.
  if (failures.length) {
    throw new Error(
      `${failures.length} of ${Math.ceil(allIds.length / BATCH_SIZE)} scoring batch(es) `
      + `failed for goal ${goalId} — first: ${failures[0].message}`)
  }

  // DROP SCORES FOR ANYONE NO LONGER IN THE POPULATION.
  //
  // The upsert only ever adds and updates, so narrowing who gets scored would otherwise
  // change nothing on screen: the ~10,400 rows written when everyone was scored would sit
  // there for ever, still counted, still driving "Likely Dormant 68%". A score is this
  // model's opinion about someone it can reason about; when that stops being true the row
  // has to go, not go stale.
  //
  // Keyed on MEMBERSHIP, not on a timestamp.
  //
  // The first version compared `computed_at` against the start of this run, on the
  // assumption that it is a write time. It is not — it is the model's data cutoff, which
  // is always in the past. So every row this run had just written looked stale by that
  // test and the delete emptied the table: 5,843 customers scored, then all 5,843
  // removed, ending with zero scores and no error anywhere.
  //
  // Membership is what the rule is actually about, so it is what the query asks.
  //
  // ONLY ON THE FULL-POPULATION PATH. `allIds` is the goal's whole eligible set there,
  // so "not in it" genuinely means "no longer belongs". On the event-driven path it is
  // the ONE customer whose event just arrived, and this same delete would read every
  // other customer as departed and wipe the goal's entire score table on every
  // add-to-cart — the identical failure the note above describes, reached by a
  // different route.
  const removed = (targeted || allIds.length === 0) ? [] : await db
    .delete(predictionScores)
    .where(and(
      eq(predictionScores.projectId, projectId),
      eq(predictionScores.goalId, goalId),
      notInArray(predictionScores.customerId, allIds),
    ))
    .returning({ id: predictionScores.id })
  if (removed.length) {
    console.log(`[scoring] ${goal.name}: removed ${removed.length} score(s) for customers `
      + `no longer in this goal's population`)
  }

  // SCORING DOES NOT TRAIN, SO IT RECORDS NOTHING ABOUT TRAINING.
  //
  // This used to stamp `lastTrainedAt: new Date()` and `currentMetric: goal.currentMetric
  // ?? '0'` on every scoring run. Both were wrong, and together they told a specific lie.
  //
  // `lastTrainedAt` is how the UI knows a goal has NEVER been trained
  // (`const neverTrained = !goal.lastTrainedAt` — analytics/predictions/page.tsx). Writing
  // it here gave an untrained goal a training date, so the one signal that it had never
  // been fitted was erased by the act of scoring it.
  //
  // `currentMetric ?? '0'` then turned "no AUC yet" (null) into a real, stored 0.0000 —
  // which reads as an AUC of zero, a model worse than a coin toss. The card showed
  // "Needs Data" beside a confident training date, describing a model that did not exist.
  //
  // `trainingWorker` already owns both fields and sets them correctly: the date when a
  // fit actually happens, and the metric only when there is one (`result.auc != null`).
  // Per-customer scoring times are already on the score rows' own `created_at`, so
  // nothing is lost by writing nothing here.

  console.log(`[scoring] Done: ${scored}/${allIds.length} customers scored for goal ${goalId}`)
  return { status: 'completed', scored, total: allIds.length }
}

export function startScoringWorker() {
  const worker = new Worker('score-customers', processScoring, {
    connection: redisConnection,
    concurrency: 1,
    limiter: { max: 1, duration: 1000 },
  })

  worker.on('completed', (job, result) => {
    console.log(`[scoring] Job ${job?.id} completed:`, result)
  })

  worker.on('failed', (job, err) => {
    console.error(`[scoring] Job ${job?.id} failed:`, err.message)
  })

  console.log('[scoring] Scoring worker started')
  return worker
}
