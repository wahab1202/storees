import type { TrackedEvent, FlowTrip } from '@storees/shared'

export function evaluateTrigger(_event: TrackedEvent, _projectId: string): FlowTrip[] {
  // TODO: implement trigger evaluation
  // 1. Get all ACTIVE flows for project
  // 2. Match event_name against flow.trigger_config.event
  // 3. Check trigger filters against event properties
  // 4. Check audience filters against customer
  // 5. Check for duplicate trips
  // 6. Create FlowTrip, store event context
  throw new Error('Not implemented')
}
