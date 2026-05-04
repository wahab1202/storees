/**
 * Historical export — the real flow trigger evaluator lives in
 * `packages/backend/src/workers/triggerWorker.ts`. That worker is what
 * actually runs in production: it consumes events from the BullMQ events
 * queue, fetches active flows, matches by triggerConfig.event, evaluates
 * trigger filters + audience filters, dedupes against active/waiting trips,
 * and creates new FlowTrip rows.
 *
 * This module is kept as a no-op for backwards compatibility — some older
 * tests imported `evaluateTrigger` from `@storees/flows`. New code should
 * import from the worker directly or call the events queue.
 */
import type { TrackedEvent, FlowTrip } from '@storees/shared'

export function evaluateTrigger(_event: TrackedEvent, _projectId: string): FlowTrip[] {
  // The runtime evaluator is in triggerWorker.ts. This export survives only
  // for legacy imports; callers should publish to the events queue instead.
  return []
}
