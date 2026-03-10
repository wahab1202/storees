# Flows — Engine Specification

> **Package**: `packages/flows/`
> **Owner**: Agent 4
> **Dependencies**: BullMQ (events queue + flow-actions queue), Resend (email sending), DB (flow_trips, scheduled_jobs)

## Core Interface

```typescript
evaluateTrigger(event: TrackedEvent, projectId: string): FlowTrip[]
executeNode(trip: FlowTrip, node: FlowNode): void
handleDelayComplete(jobId: string): void
handleExitEvent(event: TrackedEvent): void
getFlowTemplates(): FlowTemplate[]
```

## Event-to-Flow Pipeline

```
BullMQ 'events' queue
        │
        ▼
  evaluateTrigger()
  ┌─────────────────────────────────┐
  │ 1. Get all ACTIVE flows for     │
  │    this project                  │
  │ 2. For each flow, check:        │
  │    a. Does event_name match     │
  │       flow.trigger_config.event? │
  │    b. Do trigger filters match   │
  │       the event properties?      │
  │    c. Do audience filters match  │
  │       the customer?              │
  │ 3. If all match:                 │
  │    a. Check for duplicate trip   │
  │    b. Create FlowTrip            │
  │    c. Store event context in trip│
  │    d. Execute first node         │
  └─────────────────────────────────┘
```

## Trip State Machine

```
         ┌──────────┐
         │  ACTIVE   │  ← Trip created, executing nodes
         └────┬──────┘
              │
    ┌─────────▼──────────┐
    │     WAITING         │  ← Paused at a delay node
    │  (scheduled job     │
    │   pending in queue) │
    └─────────┬──────────┘
              │  (job fires)
    ┌─────────▼──────────┐
    │     ACTIVE          │  ← Resumed, executing next node
    └─────┬─────────┬────┘
          │         │
   ┌──────▼──┐  ┌──▼────────┐
   │COMPLETED│  │  EXITED    │
   │(reached │  │(exit event │
   │end node)│  │ triggered) │
   └─────────┘  └───────────┘
```

## Node Execution Logic

### Trigger Node
- No execution needed. This is the entry point marker.
- After creating the trip, immediately advance to the next node in the `nodes` array.

### Delay Node
1. Calculate `execute_at = now() + config.value (in config.unit)`
2. Create `scheduled_jobs` row: `{ flowTripId, execute_at, action: { nodeId: nextNode.id }, status: 'pending' }`
3. Add BullMQ delayed job to `flow-actions` queue with the same delay
4. Set trip `status = 'waiting'`, `current_node_id = delay_node.id`

**DEMO MODE**: If `DEMO_DELAY_MINUTES` env var is set, override ALL delay values with this value. This lets you demo a 30-minute flow in 2 minutes.

### Condition Node
1. Check `config.check`:
   - If `event_occurred`: Query events table for `event_name = config.event` WHERE `customer_id = trip.customer_id` AND `timestamp > trip.entered_at`
   - If `attribute_check`: Evaluate `config.field` + `config.operator` + `config.value` against the customer's current profile
2. If condition is TRUE → advance to `config.branches.yes` node
3. If condition is FALSE → advance to `config.branches.no` node

### Action Node
1. Check `config.actionType`:
   - `send_email`: Load template by `config.templateId`. Substitute variables from trip context + customer profile. Send via Resend.
2. Log action execution (for analytics)
3. Advance to next node

### End Node
1. Set trip `status = 'completed'`
2. Set trip `exited_at = now()`
3. Cancel any remaining scheduled jobs for this trip

## Exit Condition Handling

When an event arrives, the flow engine must ALSO check if it matches any active trip's exit condition:

```
handleExitEvent(event):
  1. Get all flows where exit_config.event = event.event_name
  2. For each flow, find active/waiting trips for this customer
  3. For each matching trip:
     a. Set trip status = 'exited'
     b. Set exited_at = now()
     c. Cancel all pending scheduled_jobs for this trip
     d. Remove BullMQ delayed jobs (by job ID stored in scheduled_jobs)
```

**Critical**: Exit event checking must happen BEFORE trigger evaluation. If a customer places an order, we want to exit the abandoned cart flow BEFORE potentially starting a post-purchase flow.

## Duplicate Trip Prevention

Before creating a new trip:
```sql
SELECT id FROM flow_trips
WHERE flow_id = $flowId
  AND customer_id = $customerId
  AND status IN ('active', 'waiting')
LIMIT 1
```

If a row exists, do NOT create a new trip. One customer = one active trip per flow.

## Frequency Capping (Phase 1 - Simple)

Skip creating a trip if the customer has completed or exited a trip in the same flow within the last 24 hours:
```sql
SELECT id FROM flow_trips
WHERE flow_id = $flowId
  AND customer_id = $customerId
  AND exited_at > now() - interval '24 hours'
LIMIT 1
```
