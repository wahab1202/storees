import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { predictionGoals } from '../db/schema.js'
import { enqueueTrainingJob } from '../workers/trainingWorker.js'

export async function createPredictionGoal(
  projectId: string,
  data: {
    name: string
    targetEvent: string
    observationWindowDays?: number
    predictionWindowDays?: number
    minPositiveLabels?: number
    origin?: 'pack' | 'user'
  },
) {
  const [goal] = await db.insert(predictionGoals).values({
    projectId,
    name: data.name,
    targetEvent: data.targetEvent,
    observationWindowDays: data.observationWindowDays ?? 90,
    predictionWindowDays: data.predictionWindowDays ?? 14,
    minPositiveLabels: data.minPositiveLabels ?? 200,
    origin: data.origin ?? 'user',
    status: 'active',
  }).returning()

  // Enqueue train + score pipeline (non-blocking)
  enqueueTrainingJob(projectId, goal.id).catch(err => {
    console.error(`[prediction-goal] Failed to enqueue training for ${goal.id}:`, err)
  })

  return goal
}

export async function listPredictionGoals(projectId: string) {
  return db
    .select()
    .from(predictionGoals)
    .where(eq(predictionGoals.projectId, projectId))
    .orderBy(predictionGoals.createdAt)
}

export async function getPredictionGoal(projectId: string, goalId: string) {
  const [goal] = await db
    .select()
    .from(predictionGoals)
    .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))
    .limit(1)

  return goal ?? null
}

export async function updatePredictionGoalStatus(
  goalId: string,
  status: 'active' | 'paused' | 'insufficient_data',
) {
  const [updated] = await db
    .update(predictionGoals)
    .set({ status, updatedAt: new Date() })
    .where(eq(predictionGoals.id, goalId))
    .returning()

  return updated ?? null
}

export async function deletePredictionGoal(projectId: string, goalId: string) {
  const [deleted] = await db
    .delete(predictionGoals)
    .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))
    .returning({ id: predictionGoals.id })

  return !!deleted
}
