# Skill: Flow Builder Architecture

## When to Use
Invoke this skill when building the Flow Builder V2 custom structured renderer.

## Core Data Structure
The flow is stored as a tree-like structure. Even though the backend stores `{ nodes, edges }`, the renderer converts it to a tree for rendering.

### Node Types
```typescript
type FlowNodeType = 'trigger' | 'send_message' | 'wait_delay' | 'condition' | 'webhook' | 'end';

interface FlowNode {
  id: string;
  type: FlowNodeType;
  config: Record<string, any>;  // Type-specific configuration
  position: { x: number; y: number }; // Auto-calculated, ignored by backend
}

interface FlowEdge {
  id: string;
  source: string;  // Node ID
  target: string;  // Node ID
  label?: string;  // "Yes" or "No" for condition branches
}
```

### Tree Conversion
```typescript
interface TreeNode {
  node: FlowNode;
  children: TreeNode[];        // For linear flow: single child
  branches?: {                  // For condition nodes
    yes: TreeNode[];
    no: TreeNode[];
  };
}

function buildTree(nodes: FlowNode[], edges: FlowEdge[]): TreeNode {
  // 1. Find root (node with no incoming edge, usually the trigger)
  // 2. Walk edges to build parent→child relationships
  // 3. For condition nodes, separate children by edge label ("Yes"/"No")
  // 4. Return root TreeNode
}
```

## Rendering Rules

### Layout Constants
```css
:root {
  --flow-node-width: 320px;
  --flow-node-gap: 24px;        /* Vertical gap between nodes */
  --flow-branch-gap: 48px;      /* Horizontal gap between Yes/No branches */
  --flow-connector-color: #d1d5db;
  --flow-add-button-size: 28px;
  --flow-padding: 40px;
}
```

### Node Card Design
```
┌──────────────────────────────────┐
│ ⚡ Trigger                    ⋯  │  ← Icon + type label + overflow menu
│                                  │
│ When: application_started        │  ← Summary of config
│ Filter: amount > 50,000         │
│                                  │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← Subtle bottom border (node color)
└──────────────────────────────────┘
```

### Node Colors (left accent border)
- Trigger: Blue (#3B82F6)
- Send Message: Green (#22C55E)
- Wait/Delay: Amber (#F59E0B)
- Condition: Purple (#8B5CF6)
- Webhook: Gray (#6B7280)
- End: Red (#EF4444)

### Add Step Button
```
      │
  ┌───┴───┐
  │   +   │  ← Circular button, dashed border, hover reveals "Add step"
  └───┬───┘
      │
```
On click: expand into inline step type menu below the button. NOT a modal. NOT a sidebar.

### Condition Branching Layout
```
              ┌──────────────────┐
              │ 🔀 Condition      │
              │ Did user pay?    │
              └────────┬─────────┘
                       │
            ┌──────────┴──────────┐
       ✅ Yes                  ❌ No
            │                      │
      ┌───────────┐         ┌───────────┐
      │  Node A   │         │  Node B   │
      └───────────┘         └───────────┘
            │                      │
         ( + )                  ( + )
            │                      │
```

Branch columns are rendered as `flex` containers side by side. Each branch scrolls independently if long.

### Merge After Branches
If both branches eventually lead to the same next node (merge point), render a merge connector:
```
      ┌──────────────┐    ┌──────────────┐
      │ End of Yes   │    │ End of No    │
      └──────┬───────┘    └──────┬───────┘
             │                   │
             └─────────┬─────────┘
                       │
                 ┌───────────┐
                 │ Next Node │
                 └───────────┘
```

## Interaction Patterns

### Adding a Node
1. User clicks "+" button between two nodes
2. Inline dropdown appears with step types
3. User clicks a step type
4. New node is created with empty config
5. Tree is rebuilt, positions recalculated
6. UI re-renders (entire tree, React reconciliation handles efficiency)
7. Right-side drawer auto-opens for the new node's configuration

### Deleting a Node
1. User clicks overflow menu (⋯) on a node → "Delete"
2. Confirmation dialog (inline, not modal): "Remove this step?"
3. Node removed, edges reconnected (previous → next, bypassing deleted)
4. Tree rebuilt, re-render

### Moving a Node (Not Supported)
Users CANNOT drag nodes to reorder. If they want to change order:
1. Delete the node
2. Re-add it at the desired position
This is intentional — it keeps the interaction simple.

### Right-Side Drawer
```
┌─────────────────────────┬──────────────────────────────────┐
│                         │                                  │
│  Flow Canvas            │  Node Configuration              │
│  (scrollable)           │                                  │
│                         │  📤 Send Message                 │
│  [Trigger]              │                                  │
│      │                  │  Channel:                        │
│  [Send Message] ← sel  │  ○ WhatsApp  ● SMS  ○ Email      │
│      │                  │                                  │
│  [Wait 24h]             │  Template:                       │
│      │                  │  ┌─────────────────────────────┐ │
│  [Condition]            │  │ [Template card preview]     │ │
│    /    \               │  └─────────────────────────────┘ │
│  [Yes] [No]             │                                  │
│                         │  Message:                        │
│                         │  [Content editor with {{vars}}]  │
│                         │                                  │
│                         │  🤖 Generate with AI              │
│                         │                                  │
│                         │  [Save]  [Cancel]                │
└─────────────────────────┴──────────────────────────────────┘
```

Width split: Canvas 50%, Drawer 50%. Drawer slides in with CSS transition (300ms ease-out).

## Validation System
```typescript
interface FlowValidationError {
  nodeId: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

function validateFlow(tree: TreeNode): FlowValidationError[] {
  const errors: FlowValidationError[] = [];
  
  walkTree(tree, (node) => {
    // Trigger: must have event selected
    if (node.type === 'trigger' && !node.config.eventName) {
      errors.push({ nodeId: node.id, field: 'eventName', message: 'No trigger event selected', severity: 'error' });
    }
    
    // Send Message: must have channel and template
    if (node.type === 'send_message') {
      if (!node.config.channel) errors.push({ nodeId: node.id, field: 'channel', message: 'No channel selected', severity: 'error' });
      if (!node.config.templateId && !node.config.content) errors.push({ nodeId: node.id, field: 'content', message: 'No message content', severity: 'error' });
    }
    
    // Condition: must have condition configured
    if (node.type === 'condition' && !node.config.condition) {
      errors.push({ nodeId: node.id, field: 'condition', message: 'No condition configured', severity: 'error' });
    }
    
    // Wait: must have duration or event
    if (node.type === 'wait_delay' && !node.config.duration && !node.config.waitForEvent && !node.config.bestTime) {
      errors.push({ nodeId: node.id, field: 'duration', message: 'No wait duration or condition set', severity: 'error' });
    }
  });
  
  return errors;
}
```

Validation runs on every node change. Error count displayed in top bar. Clicking an error scrolls to and highlights the node.
