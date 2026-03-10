import type { FlowTrip, FlowNode } from '@storees/shared'

export function executeNode(_trip: FlowTrip, _node: FlowNode): void {
  // TODO: implement node execution
  // Switch on node.type:
  //   trigger → advance to next node
  //   delay → schedule BullMQ job, set trip to 'waiting'
  //   condition → evaluate, branch to yes/no
  //   action → send email via Resend
  //   end → mark trip 'completed'
  throw new Error('Not implemented')
}
