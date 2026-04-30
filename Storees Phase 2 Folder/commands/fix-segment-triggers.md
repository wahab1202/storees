# Command: /fix-segment-triggers

## Usage
```
/fix-segment-triggers
```

## What It Does
Fixes the one known bug: `enters_segment` and `exits_segment` events are never emitted by the segment evaluator.

## The Fix
In `packages/backend/src/services/segmentService.ts`, find the `evaluateSegment()` method. After the section that computes `toAdd` and `toRemove` arrays and updates the `customer_segments` junction table, add event emission:

```typescript
// After: await batch update customer_segments (existing code)

// NEW: Emit enters_segment events
if (toAdd.length > 0) {
  for (const customerId of toAdd) {
    await eventsQueue.add('internal_event', {
      projectId: segment.projectId,
      customerId,
      name: 'enters_segment',
      properties: {
        segment_id: segment.id,
        segment_name: segment.name
      },
      platform: 'system'
    });
  }
}

// NEW: Emit exits_segment events
if (toRemove.length > 0) {
  for (const customerId of toRemove) {
    await eventsQueue.add('internal_event', {
      projectId: segment.projectId,
      customerId,
      name: 'exits_segment',
      properties: {
        segment_id: segment.id,
        segment_name: segment.name
      },
      platform: 'system'
    });
  }
}
```

## Verify
After applying the fix:
1. Create a segment with a simple filter (e.g., "has event: page_viewed in last 7 days")
2. Create a flow with trigger: "enters_segment" → select the segment → add a Send Email action
3. Trigger the segment evaluation (add a customer who matches the filter)
4. Verify: the flow fires and the email is sent

## Impact
- Unblocks segment-triggered flows (the trigger type exists in the UI but never fires)
- All other flow trigger types already work
- This is Day 1, Task 1 — do it before anything else

## Estimated Effort
~10 lines of code. 15 minutes including testing.
