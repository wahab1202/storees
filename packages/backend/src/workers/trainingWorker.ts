/**
 * Training Worker — Train + score pipeline for prediction goals.
 *
 * Triggered when a new goal is created or manually retrained.
 * Flow:
 * 1. Call ML service /propensity/train
 * 2. Update goal status + metric in DB
 * 3. If training succeeded, enqueue scoring job
 */

import { Queue, Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { predictionGoals, predictionTrainingRuns, predictionModelVersions, projects } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { trainModel, checkMlHealth } from '../services/mlProxyService.js'

async function recordTrainingRun(opts: {
  projectId: string
  goalId: string
  status: string
  auc?: number | null
  baselineAuc?: number | null
  lift?: number | null
  nPositive?: number | null
  reason?: string | null
  durationMs?: number | null
  segmentMetrics?: unknown
}): Promise<void> {
  try {
    await db.insert(predictionTrainingRuns).values({
      projectId: opts.projectId,
      goalId: opts.goalId,
      status: opts.status,
      auc: opts.auc != null ? String(opts.auc) : null,
      baselineAuc: opts.baselineAuc != null ? String(opts.baselineAuc) : null,
      lift: opts.lift != null ? String(opts.lift) : null,
      nPositive: opts.nPositive ?? null,
      reason: opts.reason ?? null,
      durationMs: opts.durationMs ?? null,
      segmentMetrics: (opts.segmentMetrics ?? null) as object | null,
    })
  } catch (err) {
    // Logging shouldn't break the training flow — drift history is a nice-to-have
    console.error('[training] Failed to record training run:', err)
  }
}

type TrainingJob = {
  projectId: string
  goalId: string
}

const SCORE_QUEUE = 'score-customers'

async function processTraining(job: { data: TrainingJob }) {
  const { projectId, goalId } = job.data

  // Check ML service
  const mlAvailable = await checkMlHealth()
  if (!mlAvailable) {
    // THROW, DO NOT RETURN — same reason as the scoring worker, worse consequence.
    //
    // Returning a result marks the job COMPLETED, so a training request that never
    // happened was recorded as a success with no retry. This one sits behind a BUTTON:
    // somebody presses Re-train, the status flips to 'training', this clears it back to
    // 'active' a second later, and the card returns to showing the OLD model as though
    // the click had worked. An explicit request silently doing nothing is the worst
    // version of this bug, because the person is standing there waiting for it.
    //
    // The status is still released first — a throw must not leave the goal stuck on
    // 'training' — and then the failure is raised so the queue can retry it.
    await clearTraining(goalId)
    throw new Error(`ML service unavailable for goal ${goalId} — will retry`)
  }

  // Get goal details
  const [goal] = await db
    .select()
    .from(predictionGoals)
    .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))

  if (!goal) {
    await clearTraining(goalId)
    return { status: 'skipped', reason: 'goal_not_found' }
  }

  // Get project domain
  const [project] = await db
    .select({ domainType: projects.domainType })
    .from(projects)
    .where(eq(projects.id, projectId))

  let domain = (project?.domainType ?? 'ecommerce').toLowerCase()
  if (['nbfc', 'lending', 'banking'].includes(domain)) domain = 'fintech'
  if (['education', 'edtech', 'e-learning'].includes(domain)) domain = 'edtech'
  if (!['ecommerce', 'fintech', 'saas', 'edtech'].includes(domain)) domain = 'ecommerce'

  console.log(`[training] Training model for goal "${goal.name}" (${goalId}), domain=${domain}`)

  const trainStart = Date.now()
  try {
    // THE GOAL'S OWN FLAG DECIDES, not this worker.
    //
    // The two window columns are sent ONLY when `windowsPinned` says somebody chose
    // them. Otherwise they are left off and the pipeline derives both from the project's
    // measured rhythm — which is the whole point of deriving them.
    //
    // This passed `observationWindowDays ?? 90` unconditionally, so every retrain from
    // the button pinned the stored numbers and skipped the window search, while the same
    // goal run from the command line derived its own. Two paths, one flag, one reader.
    // Measured here: Dormancy carries 90/30 and was pinned to it against 117 days of
    // history, needing 120 — it could not have trained at any point through this route.
    const pinned = goal.windowsPinned === true
    const result = await trainModel(
      projectId,
      goalId,
      goal.targetEvent,
      pinned ? goal.observationWindowDays ?? undefined : undefined,
      pinned ? goal.predictionWindowDays ?? undefined : undefined,
      domain,
    )
    const durationMs = Date.now() - trainStart

    console.log(`[training] Result: status=${result.status}, auc=${result.auc}, baseline=${result.baselineAuc}`)

    if (result.status === 'success') {
      // Update goal with metric.
      //
      // `currentMetric` is only written when there IS one. A success always carries an
      // AUC, but `String(null)` is the string "null", and this column is numeric — so
      // the one combination that should never happen would fail the whole update rather
      // than simply leaving the previous model's score in place.
      // THE WINDOWS THE MODEL WAS ACTUALLY FITTED ON, WRITTEN BACK.
      //
      // Not cosmetic. `observationWindowDays` is what the SCORING worker builds each
      // customer's features over. The pipeline derives its own look-back — measured 14d
      // for GoWelmart's purchase goal — while this column still held the 30d somebody
      // typed into the form. Every customer was therefore scored on 30 days of history
      // by a model fitted on 14: train/serve skew, silent, on every scored row.
      //
      // Only written when the pipeline DERIVED them. If the goal is pinned, the stored
      // numbers are somebody's deliberate choice and this must not quietly edit it.
      const derivedWindows = result.windowsPinned === true ? {} : {
        ...(result.observationWindowDays != null
          ? { observationWindowDays: result.observationWindowDays } : {}),
        ...(result.predictionWindowDays != null
          ? { predictionWindowDays: result.predictionWindowDays } : {}),
      }
      if (Object.keys(derivedWindows).length) {
        console.log(`[training] windows derived for "${goal.name}": `
          + `${result.observationWindowDays}d observation / `
          + `${result.predictionWindowDays}d prediction (was `
          + `${goal.observationWindowDays}d / ${goal.predictionWindowDays}d)`)
      }

      await db
        .update(predictionGoals)
        .set({
          ...(result.auc != null ? { currentMetric: String(result.auc) } : {}),
          ...derivedWindows,
          lastTrainedAt: new Date(),
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(predictionGoals.id, goalId))

      // WHAT THIS RUN ACTUALLY PRODUCED.
      //
      // `nPositive` and `lift` were never sent, so every successful run recorded 0.00
      // lift and a null sample size — the drift history could show a score moving and
      // nothing about whether the model was any use or how much data stood behind it.
      //
      // The extra measurements have no columns of their own and go into `segmentMetrics`
      // alongside the per-population AUCs, which is where the screen already looks. The
      // active-segment AUC leads, because it is the number a person acts on.
      const detail = [
        ...(result.aucActive != null
          ? [{ segmentType: 'population', segmentValue: 'active',
               segmentLabel: 'Active buyers', auc: result.aucActive }] : []),
        ...(result.aucInactive != null
          ? [{ segmentType: 'population', segmentValue: 'inactive',
               segmentLabel: 'Dormant customers', auc: result.aucInactive }] : []),
        ...(result.segmentMetrics ?? []),
      ]
      await recordTrainingRun({
        projectId, goalId, status: 'success',
        auc: result.auc, baselineAuc: result.baselineAuc,
        lift: result.topDecileLift ?? result.modelLiftOverBaseline,
        nPositive: result.nPositiveTest ?? null,
        reason: result.warning ?? null,
        durationMs,
        segmentMetrics: detail.length ? detail : null,
      })

      // Version registry: deactivate any prior active version then record
      // the new one as active. The Python ML service treats the latest train
      // as the live model, so DB and disk agree.
      if (result.modelVersion) {
        try {
          await db.transaction(async (tx) => {
            await tx
              .update(predictionModelVersions)
              .set({ isActive: false })
              .where(eq(predictionModelVersions.goalId, goalId))
            await tx.insert(predictionModelVersions).values({
              goalId,
              projectId,
              modelVersion: result.modelVersion,
              trainAuc: result.auc != null ? String(result.auc) : null,
              baselineAuc: result.baselineAuc != null ? String(result.baselineAuc) : null,
              isActive: true,
              activatedAt: new Date(),
              notes: result.warning ?? null,
            })
          })
        } catch (err) {
          console.error('[training] Failed to record model version:', err)
        }
      }

      // Enqueue scoring job
      const scoreQueue = new Queue(SCORE_QUEUE, { connection: redisConnection })
      await scoreQueue.add('score-customers', {
        projectId,
        goalId,
      }, {
        jobId: `score-after-train-${goalId}-${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      })
      await scoreQueue.close()

      console.log(`[training] Model trained (AUC=${result.auc}), scoring job enqueued`)
      return { status: 'trained', auc: result.auc, baselineAuc: result.baselineAuc }

    } else if (result.status === 'insufficient_data') {
      await db
        .update(predictionGoals)
        .set({ status: 'insufficient_data', updatedAt: new Date() })
        .where(eq(predictionGoals.id, goalId))

      await recordTrainingRun({
        projectId, goalId, status: 'insufficient_data',
        reason: result.reason ?? null,
        durationMs,
      })

      console.log(`[training] Insufficient data for goal "${goal.name}"`)
      return { status: 'insufficient_data', reason: result.reason }

    } else {
      // Training failed (leakage, no lift, etc.)
      await recordTrainingRun({
        projectId, goalId, status: 'failed',
        auc: result.auc, baselineAuc: result.baselineAuc,
        lift: result.modelLiftOverBaseline,
        reason: result.reason ?? null,
        durationMs,
      })
      console.warn(`[training] Training failed for "${goal.name}": ${result.reason}`)
      await clearTraining(goalId)
      return { status: 'failed', reason: result.reason }
    }
  } catch (err) {
    const durationMs = Date.now() - trainStart
    await recordTrainingRun({
      projectId, goalId, status: 'error',
      reason: err instanceof Error ? err.message : String(err),
      durationMs,
    })
    console.error(`[training] Error training goal ${goalId}:`, err)
    await clearTraining(goalId)
    return { status: 'error', reason: String(err) }
  }
}

export function startTrainingWorker() {
  const worker = new Worker('train-model', processTraining, {
    connection: redisConnection,
    concurrency: 1,
    limiter: { max: 1, duration: 5000 }, // Max 1 train every 5s
    // A training measured at 50 minutes holds this job the whole time. The default lock
    // is 30 seconds, renewed in the background — fine while nothing goes wrong, and one
    // missed renewal on an hour-long job hands it to another worker as "stalled". That
    // would start a SECOND training of the same goal beside the first, both writing the
    // same model directory. A long lock gives renewal room to miss and recover.
    lockDuration: 10 * 60_000,
  })

  worker.on('completed', (job, result) => {
    console.log(`[training] Job ${job?.id} completed:`, result)
  })

  worker.on('failed', (job, err) => {
    console.error(`[training] Job ${job?.id} failed:`, err.message)
  })

  console.log('[training] Training worker started')
  return worker
}

/** How long a goal may sit in `training` before we stop believing it.
 *
 *  The status is cleared by whichever branch of the worker finishes the job, so a
 *  worker killed mid-run (a deploy, a crash, someone closing a terminal) would leave
 *  it stuck for ever — and a stuck spinner is worse than none, because it says work
 *  is happening when nothing is. Anything older than this is reported as not running.
 *
 *  Must stay ABOVE the training timeout in `mlProxyService`, or the banner goes dark on
 *  a run that is still going: measured at 50 minutes against a one-hour window, this was
 *  ten minutes from telling someone nothing was happening while a model was being fitted.
 */
export const TRAINING_STALE_MS =
  Number(process.env.ML_TRAIN_TIMEOUT_MS ?? 2 * 60 * 60_000) + 10 * 60_000

/** Put a goal back to a settled state.
 *
 *  Every exit from the worker must call this or write its own status. Three did not —
 *  ML unreachable, goal missing, and the catch-all error — so a click while the ML
 *  service was down left the card spinning for ever with no work behind it.
 *
 *  A FAILED TRAINING GOES BACK TO `active`, NOT TO `failed`. Scoring, live evaluation
 *  and the prediction fields offered to segments all select goals by `status = 'active'`,
 *  so parking a goal anywhere else takes its EXISTING, working model out of service —
 *  a failed attempt at a new model would silently stop the old one from scoring anyone.
 *  The attempt is recorded in `prediction_training_runs` and surfaced from there. */
async function clearTraining(goalId: string, to = 'active'): Promise<void> {
  await db.update(predictionGoals)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.status, 'training')))
}

export async function enqueueTrainingJob(projectId: string, goalId: string) {
  const queue = new Queue('train-model', { connection: redisConnection })
  await queue.add('train-model', { projectId, goalId }, {
    jobId: `train-${goalId}-${Date.now()}`,
    removeOnComplete: 50,
    removeOnFail: 20,
    // Fewer, longer-spaced retries than scoring: training is minutes of work, so a
    // tight retry would stack duplicate runs rather than wait out a restarting service.
    // Three attempts from two minutes covers a cold boot without ever overlapping.
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 120_000 },
  })
  await queue.close()

  // Say so on the goal itself, so the screen can show that something is happening.
  //
  // Training is minutes of work behind a button that returns instantly — the request
  // only queues a job. Without this the page looks identical before and after a click:
  // no spinner, no error, nothing changing until the numbers silently move some time
  // later. The natural response is to click again, which queues a second training.
  //
  // Written AFTER the job is queued: a status saying "training" when nothing was
  // enqueued would be a lie in the more misleading direction.
  await db.update(predictionGoals)
    .set({ status: 'training', updatedAt: new Date() })
    .where(eq(predictionGoals.id, goalId))
}
