# Hook: Flow Publish Validation

## Trigger
Before a flow's status is changed from "draft" to "published" (i.e., when the user clicks "Publish" in the flow builder).

## Checks (ALL must pass — publish is blocked if any fail)

### 1. Zero Validation Errors
```typescript
const errors = validateFlow(flow.tree);
if (errors.filter(e => e.severity === 'error').length > 0) {
  throw new FlowPublishError(
    `Cannot publish: ${errors.length} validation errors remain`,
    errors
  );
}
```

### 2. Trigger Must Be Configured
- The flow must have exactly one trigger node
- The trigger must have an event name selected (or segment + entry condition for segment triggers)

### 3. At Least One Action Node
- The flow must contain at least one "Send Message" or "Webhook" or "Show In-App" node
- A flow with only Trigger → End is pointless

### 4. All Send Nodes Have Content
- Every "Send Message" node must have: channel selected, template or content body, valid variables

### 5. All Condition Nodes Have Both Branches
- Every condition node must have at least one node on each branch (Yes and No)
- An empty branch means users who take that path get no action — usually a mistake

### 6. No Orphan Nodes
- Every node must be reachable from the trigger node
- Nodes that aren't connected to the tree are orphans and indicate a broken flow

### 7. Exit Conditions (warning, not blocking)
- If the flow has no exit condition or goal event defined, show warning:
  "This flow has no exit condition. Users may receive messages even after converting."

## Frontend Display
When publish is blocked, the top bar shows:
```
❌ Cannot publish — 3 errors remaining    [View Errors]
```
Clicking "View Errors" opens the validation panel listing each error. Clicking an error scrolls to the problematic node.

## Backend Enforcement
Even if the frontend doesn't enforce these checks (edge case), the backend `PUT /api/flows/:id/publish` endpoint MUST re-validate before changing status:
```typescript
router.put('/:id/publish', auth, async (req, res) => {
  const flow = await flowService.getById(req.params.id, req.auth.projectId);
  const errors = validateFlow(flow);
  
  if (errors.length > 0) {
    return res.status(422).json({
      success: false,
      error: 'Flow has validation errors',
      errors
    });
  }
  
  await flowService.publish(flow.id);
  res.json({ success: true });
});
```
