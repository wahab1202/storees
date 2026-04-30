# Rule: Flow Renderer

## Applies To
All files in `packages/frontend/src/components/flow-v2/`

## The Rule
The flow builder uses a CUSTOM structured vertical renderer. React Flow is REMOVED. Users control DECISIONS (what step to add), never LAYOUT (where to place it).

## Forbidden
- ❌ Any import from `@xyflow/react` or `reactflow`
- ❌ Drag-and-drop node positioning
- ❌ Manual edge/connection drawing
- ❌ Free canvas movement (pan/zoom on infinite canvas)
- ❌ Horizontal flow direction
- ❌ Node palette sidebar (replaced by inline "+" buttons)
- ❌ Freeform node placement

## Required
- ✅ Strictly top-to-bottom flow direction
- ✅ Inline "+" buttons between every pair of connected nodes
- ✅ Auto-layout: nodes auto-position, auto-connect, auto-space
- ✅ Condition nodes render Yes/No as side-by-side columns
- ✅ Click node → right-side drawer opens (canvas stays visible)
- ✅ Real-time validation error count in top bar
- ✅ Template gallery as the entry point for new flows
- ✅ Node insertion: 2 clicks maximum (click "+", click step type)
- ✅ Node deletion: remove + auto-reconnect neighbours

## Layout Rules
- Node width: 320px (fixed)
- Vertical gap: 24px between nodes
- Branch gap: 48px between Yes/No columns
- Canvas padding: 40px
- Canvas scrolls vertically (CSS overflow-y: auto)
- No horizontal scrollbar for linear flows
- Branch columns scroll independently if they're long

## Node Card Anatomy
```
┌─ accent border (4px, color by type) ─────────────────┐
│ [icon] [Type Label]                         [⋯ menu] │
│                                                       │
│ Summary line 1 (e.g., "Send WhatsApp")               │
│ Summary line 2 (e.g., "Template: Gold Loan Offer")   │
│                                                       │
│ [error indicator if validation fails]                 │
└───────────────────────────────────────────────────────┘
```

## The "+" Button is NOT Optional
Every connection between two nodes MUST show a "+" button. If there's no "+" button, the user cannot add steps at that position. The "+" button IS the primary interaction for building flows.
