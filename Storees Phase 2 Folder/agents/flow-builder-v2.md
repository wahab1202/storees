# Agent: Flow Builder V2

## Identity
You rebuild the Storees flow builder from scratch. You are replacing the current React Flow-based freeform canvas with a custom structured vertical flow renderer. This is the single most impactful UX change in the entire project. The new builder must feel like MoEngage — guided, fast, operator-friendly — not like an engineering tool.

## Core Principle
**"Don't give users control over layout. Give them control over decisions."**

Users decide WHAT step to add. The system handles WHERE it goes, HOW it connects, and HOW it's laid out. Zero drag-drop. Zero manual connections. Zero canvas thinking.

## Ownership
```
packages/frontend/src/
├── components/flow-v2/
│   ├── FlowRenderer.tsx          ← You BUILD (the core structured renderer)
│   ├── FlowNode.tsx              ← You BUILD (individual node card)
│   ├── FlowBranch.tsx            ← You BUILD (condition Yes/No columns)
│   ├── FlowConnector.tsx         ← You BUILD (lines between nodes)
│   ├── AddStepButton.tsx         ← You BUILD (the "+" insertion point)
│   ├── AddStepMenu.tsx           ← You BUILD (step type dropdown)
│   ├── NodeDrawer.tsx            ← You BUILD (right-side config panel)
│   ├── FlowTopBar.tsx            ← You BUILD (name, status, error count, save, publish)
│   ├── FlowValidation.tsx        ← You BUILD (error list panel)
│   ├── nodes/
│   │   ├── TriggerNode.tsx        ← You BUILD
│   │   ├── SendMessageNode.tsx    ← You BUILD
│   │   ├── WaitDelayNode.tsx      ← You BUILD
│   │   ├── ConditionNode.tsx      ← You BUILD
│   │   ├── WebhookNode.tsx        ← You BUILD
│   │   └── EndNode.tsx            ← You BUILD
│   └── drawers/
│       ├── TriggerDrawer.tsx      ← You BUILD (trigger config in right panel)
│       ├── MessageDrawer.tsx      ← You BUILD (channel + template + AI)
│       ├── DelayDrawer.tsx        ← You BUILD (duration + BTS option)
│       ├── ConditionDrawer.tsx    ← You BUILD (property/event/segment check)
│       └── WebhookDrawer.tsx      ← You BUILD
├── app/flows/
│   ├── page.tsx                   ← You MODIFY (flow list)
│   ├── new/page.tsx               ← You BUILD (template gallery entry)
│   └── [id]/page.tsx              ← You REBUILD (the editor page)
```

## Remove Entirely
- All React Flow imports and usage (`@xyflow/react`, `reactflow`)
- Node palette sidebar (replaced by inline "+" buttons)
- Manual edge creation UI
- Drag-drop positioning logic
- Canvas zoom/pan controls (not needed for structured vertical layout)

## The Structured Renderer Architecture

### Data Model (unchanged — backend compatible)
The flow is still stored as `{ nodes: Node[], edges: Edge[] }`. The backend flow executor reads this exact structure. Your renderer produces the same JSON — just with auto-calculated positions.

### Rendering Algorithm
```typescript
function renderFlow(nodes: FlowNode[], edges: FlowEdge[]): ReactNode {
  // 1. Build a tree from the flat nodes + edges
  const tree = buildTree(nodes, edges);
  
  // 2. Render recursively, top to bottom
  return renderNode(tree.root);
}

function renderNode(node: TreeNode): ReactNode {
  return (
    <div className="flow-node-wrapper">
      {/* The node card itself */}
      <FlowNode node={node} onClick={() => openDrawer(node)} />
      
      {/* Connector line down */}
      <FlowConnector />
      
      {/* If this is a condition node, render branches */}
      {node.type === 'condition' ? (
        <FlowBranch
          yesBranch={node.children.yes}
          noBranch={node.children.no}
          renderNode={renderNode}
        />
      ) : (
        <>
          {/* "+" button to add next step */}
          <AddStepButton onSelect={(type) => insertNode(node.id, type)} />
          
          {/* Connector line to next node */}
          <FlowConnector />
          
          {/* Render next node recursively */}
          {node.children[0] && renderNode(node.children[0])}
        </>
      )}
    </div>
  );
}
```

### Condition Node Branching
```
         ┌───────────────────────────┐
         │  🔀 Did user complete      │
         │     application?           │
         └─────────┬─────────────────┘
                   │
         ┌─────────┴─────────┐
    ✅ Yes                 ❌ No
         │                     │
    ┌─────────┐          ┌─────────┐
    │  Node   │          │  Node   │
    └─────────┘          └─────────┘
         │                     │
    ( + Add )             ( + Add )
```

Each branch column is independent. Adding nodes to the Yes branch doesn't affect the No branch.

### Node Insertion
When `(+ Add Step)` is clicked:
1. Show inline dropdown with step types (not a modal, not a sidebar — inline below the button)
2. User selects type (e.g., "Send Message")
3. Create a new node in the flow data structure
4. Insert it between the current node and the next node
5. Auto-generate edges
6. Re-render (the tree recalculates)
7. Open the right-side drawer for the new node's configuration

### Right-Side Drawer
When any node is clicked, a drawer slides in from the right (50% width). The flow stays visible on the left. The drawer contains the node's configuration form specific to its type:

- **Trigger**: event name picker, filter conditions, audience selection
- **Send Message**: channel tabs (WhatsApp/SMS/Email/Push), template picker with visual cards, content editor, variable insertion, **"Generate with AI" button** (embedded AI)
- **Wait/Delay**: duration picker, OR "Until event occurs" with timeout, OR **"Send at Best Time"** toggle
- **Condition**: property/event/segment/propensity check builder
- **Webhook**: URL, method, headers, body template

## Template Gallery Entry Point
The flow list page has a "Create Journey" button. It opens a gallery page:

```
┌─────────────────────────────────────────────────────┐
│  Create Journey                                      │
│  ┌─────────────┐ ┌─────────────────────────────────┐│
│  │ FILTERS      │ │                                 ││
│  │              │ │  [Template Card]  [Template Card]││
│  │ By use case: │ │                                 ││
│  │ ☐ Acquisition│ │  [Template Card]  [Template Card]││
│  │ ☐ Engagement │ │                                 ││
│  │ ☐ Retention  │ │  [Template Card]  [Template Card]││
│  │ ☐ Monetize   │ │                                 ││
│  │              │ │  ┌─────────────────────────────┐││
│  │ By channel:  │ │  │  ➕ Start from scratch       │││
│  │ ☐ Multi      │ │  │  Build a flow from a blank  │││
│  │ ☐ WhatsApp   │ │  │  canvas.                    │││
│  │ ☐ SMS        │ │  └─────────────────────────────┘││
│  │ ☐ Email      │ │                                 ││
│  └─────────────┘ └─────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

Template cards show: name, description, channels used, estimated setup time. The "Start from scratch" option is visible but not the hero.

## Flow Validation Error Counter
The top bar shows: `Errors (3)` — clicking it opens a panel listing every error:
- "Node 4: Send Message — no template selected"
- "Node 7: Condition — no condition configured"
- "Node 2: Trigger — no event selected"

Clicking an error scrolls to that node and opens its drawer.

The **Publish** button is disabled when `errors > 0`. The **Save Draft** button always works.

## Backend Impact
**ZERO.** The flow builder produces the same `{ nodes: [], edges: [] }` JSON. The backend flow executor (`triggerWorker.ts`, `flowExecutor.ts`, `flowWorker.ts`) reads this structure regardless of how the frontend produced it. The custom renderer outputs auto-calculated `position` fields — the backend ignores these.

## You Do NOT Touch
- Any file in `packages/backend/` (the flow execution engine is unchanged)
- `packages/flows/` (templates and type contracts)
- The segment builder
- The ML engine
- The delivery service

## Quality Bar
- The flow builder must feel FAST. No jank when adding/removing nodes.
- Adding a node should take 2 clicks: click "+", click step type. Not 5 clicks.
- The right-side drawer must open/close smoothly (CSS transition, not re-render)
- Flows with 20+ nodes must render without scroll performance issues
- The template gallery must load in <1 second
- Flow validation must run on every node change (real-time, not on-save)
- Tab/keyboard navigation must work for accessibility
- Mobile responsive is NOT required for the flow builder (desktop-only is acceptable)
