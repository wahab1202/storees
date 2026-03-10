# UI System — Page Specifications

> Each page spec defines the layout, data requirements, interactions, and API endpoints consumed.

---

## Page: `/dashboard`

**Priority**: P2 (polish)

### Layout
```
┌─────────────────────────────────────────────────┐
│  Dashboard                            [date range picker] │
├─────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
│  │ Total  │ │ Active │ │ Total  │ │  Avg   │   │
│  │ Custs  │ │  7 Day │ │ Orders │ │  CLV   │   │
│  │ 12,847 │ │  3,241 │ │ 28,492 │ │ ₹4,320 │   │
│  └────────┘ └────────┘ └────────┘ └────────┘   │
│                                                  │
│  ┌────────────────────┐ ┌────────────────────┐   │
│  │ Returning %: 34%   │ │ Avg Order: ₹1,847  │   │
│  └────────────────────┘ └────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Data
- **API**: `GET /api/dashboard/metrics?projectId={id}`
- **Response**: `{ totalCustomers, activeCustomers7d, totalOrders, avgClv, returningPercentage, avgOrderValue }`
- **Refresh**: On page load. No auto-refresh.

### Components
- 4-6 `MetricCard` components in a responsive grid (`grid-cols-2 md:grid-cols-4`)
- No charts in Phase 1. Numbers only.

---

## Page: `/customers`

**Priority**: P0

### Layout
```
┌─────────────────────────────────────────────────┐
│  Customers                    [Search] [Export]  │
├─────────────────────────────────────────────────┤
│  ☐  Name       Email        Phone   Segments    │
│     CLV    Subscriptions         Last Active     │
├─────────────────────────────────────────────────┤
│  ☐  Rahul S.   rahul@...   +91..   Champion ◆  │
│     ₹24,500    ✉ ✓  📱 ✗  💬 ✓   2 hours ago  │
│  ┌──────────────────────────────────────────┐   │
│  │ [Details] [Orders] [Activity]            │   │  ← Expanded row
│  │                                          │   │
│  │  Name: Rahul Sharma                      │   │
│  │  Email: rahul@example.com                │   │
│  │  Phone: +91-9876543210                   │   │
│  │  Account Created: Nov 4, 2024            │   │
│  │  Segment: Champion Customers             │   │
│  │                                          │   │
│  │  Subscriptions:                          │   │
│  │  Email: Subscribed ✓                     │   │
│  │  SMS: Not Subscribed ✗                   │   │
│  │  WhatsApp: Subscribed ✓                  │   │
│  │  Push: Not Subscribed ✗                  │   │
│  └──────────────────────────────────────────┘   │
│  ☐  Priya K.   priya@...   —       Loyal ◆     │
│     ₹12,800    ✉ ✓  📱 ✓  💬 ✗   1 day ago    │
├─────────────────────────────────────────────────┤
│              Page 1 of 52   [◀] [▶]             │
└─────────────────────────────────────────────────┘
```

### Data
- **List API**: `GET /api/customers?projectId={id}&page=1&pageSize=25&search=&sortBy=lastSeen&sortOrder=desc`
- **Detail API**: `GET /api/customers/{id}` (returns full profile)
- **Orders API**: `GET /api/customers/{id}/orders`
- **Activity API**: `GET /api/customers/{id}/events?limit=50`

### Interactions
- **Search**: Debounced (300ms), searches name + email + phone
- **Sort**: Click column header to toggle sort. Default: `lastSeen DESC`
- **Expand/Collapse**: Click row to expand. Only one row expanded at a time.
- **Tabs in expanded view**:
  - **Details**: Customer profile fields + subscription status badges
  - **Orders**: Table of orders, each row expandable to show line items
  - **Activity**: Chronological event timeline (event name, properties summary, timestamp)

### Components
- `CustomerTable` — main table with pagination
- `CustomerRow` — single row with expand toggle
- `CustomerDetail` — expanded view with tabs
- `OrderHistoryTab` — orders table with line item sub-rows
- `ActivityTab` — event timeline with icons per event type
- `SubscriptionBadge` — green for subscribed, red for not subscribed
- `SegmentBadge` — accent-colored tag per segment

---

## Page: `/segments`

**Priority**: P0

### Layout — List View
```
┌─────────────────────────────────────────────────┐
│  Segments                    [+ Create Segment]  │
├─────────────────────────────────────────────────┤
│  ☐  Name              Type     Members  Status  │
├─────────────────────────────────────────────────┤
│  ☐  Champion Custs     Default  359     Active  │
│  ☐  Loyal Customers    Default  566     Active  │
│  ☐  Discount Shoppers  Default  1,297   Active  │
│  ☐  Window Shoppers    Default  3,995   Active  │
│  ☐  Researchers        Default  521     Active  │
│  ☐  Big Spenders Q1    Custom   127     Active  │
└─────────────────────────────────────────────────┘
```

### Layout — Create from Template
```
┌─────────────────────────────────────────────────┐
│  ◀ Back to Segments    Create Segment            │
├─────────────────────────────────────────────────┤
│                                                  │
│  Choose a template:         [Create from Scratch]│
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Champion │  │  Loyal   │  │ Discount │      │
│  │ Customers│  │ Customers│  │ Shoppers │      │
│  │          │  │          │  │          │      │
│  │ Highest  │  │ Regular  │  │ Buy with │      │
│  │ value... │  │ buyers.. │  │ coupons..│      │
│  │          │  │          │  │          │      │
│  │ [Create] │  │ [Create] │  │ [Create] │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│                                                  │
│  ┌──────────┐  ┌──────────┐                     │
│  │ Window   │  │Researcher│                     │
│  │ Shoppers │  │    s     │                     │
│  │ [Create] │  │ [Create] │                     │
│  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────┘
```

### Layout — Create from Scratch (Segment Builder)
```
┌─────────────────────────────────────────────────┐
│  ◀ Back    Segment Name: [________________]     │
├─────────────────────────────────────────────────┤
│                                                  │
│  Build your segment by adding filters:           │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │ [total_spent ▼] [greater_than ▼] [5000] │ 🗑 │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  [AND ▼]                                        │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │ [days_since_last_order ▼] [less ▼] [30] │ 🗑 │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  [+ Add Filter]                                  │
│                                                  │
│  ──────────────────────────────────────────     │
│  Matching customers: 127                         │
│  [Preview Members]  [Save Segment]               │
└─────────────────────────────────────────────────┘
```

### Layout — Lifecycle Stage Chart
```
┌─────────────────────────────────────────────────┐
│  Customer Lifecycle                              │
├─────────────────────────────────────────────────┤
│  Returning: 34%  │ Avg Freq: 2.3  │ Avg CLV: ₹4,320 │
├─────────────────────────────────────────────────┤
│                                                  │
│  High │ About to Lose │ Can't Lose │ High Potential │ Champions │
│   Val │   41.87%      │   3.57%    │    5.46%       │   3.76%   │
│       │   3,995       │   341      │    521         │   359     │
│       │               │            │                │           │
│  Med  │               │            │                │ Loyalists │
│   Val │               │  At Risk   │ Needs Nurturing│   5.93%   │
│       │               │  13.59%    │   14.71%       │   566     │
│       │               │  1,297     │   1,404        │           │
│  Low  │               │            │                │ Recent    │
│   Val │               │            │                │  11.1%    │
│       │               │            │                │  1,059    │
│       └───────────────┴────────────┴────────────┴───────────┘
│         Old            ← Time since last order →         Recent
│                                                          │
│  Hover on cell → [View Contacts] [Retention Tactics]     │
└─────────────────────────────────────────────────┘
```

### Layout — AI Chat Panel (Create & Edit pages)

The create and edit segment pages use a split layout with an AI assistant panel on the right:

```
┌──────────────────────────────┬──────────────────────────┐
│  LEFT (existing builder)      │  RIGHT (AI panel, 380px) │
│                               │                          │
│  Segment Details card         │  🤖 Segment AI           │
│  ┌────────────────────┐      │                          │
│  │ Name / Description │      │  Chat history (scrollable)│
│  └────────────────────┘      │  ┌──────────────────┐   │
│                               │  │ User: "customers  │   │
│  Conditions card              │  │  who bought > 3x" │   │
│  ┌────────────────────┐      │  │                    │   │
│  │ AND/OR filter rules │      │  │ AI: Generated:     │   │
│  │ + Add condition     │      │  │ • totalOrders > 3  │   │
│  └────────────────────┘      │  │                    │   │
│                               │  │ [Apply to Builder] │   │
│                               │  └──────────────────┘   │
│                               │                          │
│                               │  ┌────────────────────┐ │
│                               │  │ 🎤  Type or speak.. │ │
│                               │  └────────────────────┘ │
│                               │                          │
│                               │  🌐 EN  TA  FR  ES  ZH  │
└──────────────────────────────┴──────────────────────────┘
```

**Layout CSS**: `grid grid-cols-[1fr_380px] gap-6` (full width, no max-w constraint)
**Mobile**: AI panel becomes floating button → opens bottom sheet
**Panel visibility**: Hidden if `GEMINI_API_KEY` is not configured (backend returns feature flag)

### Data
- **List API**: `GET /api/segments?projectId={id}`
- **Create from template**: `POST /api/segments/from-template` body: `{ templateName, projectId }`
- **Create from scratch**: `POST /api/segments` body: `{ name, filters, projectId }`
- **Get members**: `GET /api/segments/{id}/members?page=1&pageSize=25`
- **Lifecycle chart**: `GET /api/segments/lifecycle?projectId={id}`
- **Preview count**: `POST /api/segments/preview` body: `{ filters, projectId }` → returns `{ count }`
- **AI segment**: `POST /api/ai/segment` body: `{ input, history? }` → returns `{ filters, summary }`

### Interactions
- Click segment row → navigate to member list (same as customer list, filtered by segment)
- Click template card → POST create → redirect to segment member list
- Filter builder: add rule, remove rule, toggle AND/OR, live preview count (debounced 500ms)
- Lifecycle chart: hover cell → show floating action buttons
- AI panel: type or speak → POST to AI endpoint → preview filters → click "Apply to Builder"
- Voice: mic button toggles Web Speech API recording, language chips select recognition language

---

## Page: `/flows`

**Priority**: P0

### Layout — List View
```
┌─────────────────────────────────────────────────┐
│  Flows                       [+ Create Flow]     │
├─────────────────────────────────────────────────┤
│  Name                Trigger    Status   Trips   │
├─────────────────────────────────────────────────┤
│  Abandoned Cart      cart_created Active  1,247  │
│  Post-Purchase       order_placed Draft    —     │
└─────────────────────────────────────────────────┘
```

### Layout — Flow Canvas
```
┌─────────────────────────────────────────────────┐
│  ◀ Flows   Abandoned Cart Recovery   [Save] [Start/Stop] │
├──────────────┬──────────────────────────────────┤
│  COMPONENTS  │         CANVAS                    │
│              │                                    │
│  MESSAGES    │    ┌──────────────┐               │
│  ✉ Email     │    │   TRIGGER    │               │
│  📱 SMS      │    │ cart_created │               │
│  💬 WhatsApp │    └──────┬───────┘               │
│              │           │                        │
│  ACTIONS     │    ┌──────▼───────┐               │
│  ⏱ Delay     │    │    DELAY     │               │
│  🔀 Split    │    │  30 minutes  │               │
│              │    └──────┬───────┘               │
│              │           │                        │
│              │    ┌──────▼───────┐               │
│              │    │  CONDITION   │               │
│              │    │ Order placed?│               │
│              │    └──┬───────┬──┘               │
│              │       │YES    │NO                 │
│              │  ┌────▼──┐ ┌──▼─────┐            │
│              │  │  END  │ │ EMAIL  │            │
│              │  │Convert│ │Cart Rcv│            │
│              │  └───────┘ └──┬─────┘            │
│              │            ┌──▼─────┐            │
│              │            │  END   │            │
│              │            │ Sent   │            │
│              │            └────────┘            │
├──────────────┴──────────────────────────────────┤
│  Right panel: Click any node to edit its config  │
└─────────────────────────────────────────────────┘
```

### Data
- **List API**: `GET /api/flows?projectId={id}`
- **Get flow**: `GET /api/flows/{id}`
- **Create flow**: `POST /api/flows` body: full flow object
- **Update flow**: `PUT /api/flows/{id}` body: full flow object
- **Start flow**: `POST /api/flows/{id}/start`
- **Stop flow**: `POST /api/flows/{id}/stop`
- **Flow templates**: `GET /api/flows/templates`

### Interactions
- Left panel: component palette (drag or click to add)
- Canvas: nodes connected by lines. Click node to select. Right panel shows config.
- Node config: edit trigger event, delay duration, condition parameters, email template selection
- Start/Stop: toggle button. Confirmation dialog on stop ("This will not cancel in-progress trips")

### Phase 1 Scope
- Canvas is **read-only visual representation** of the flow's node graph. Not full drag-and-drop.
- Nodes are rendered from the `flows.nodes` JSON. Editing is done via the right panel forms.
- Creating a flow from template pre-fills the entire node structure. User configures trigger + email template.

---

## Page: `/debugger`

**Priority**: P1

### Layout
```
┌─────────────────────────────────────────────────┐
│  Event Debugger                 [▶ Live] [Pause] │
├─────────────────────────────────────────────────┤
│  Time       Event            Customer    Platform│
├─────────────────────────────────────────────────┤
│  14:22:45  order_placed      Rahul S.   webhook │
│  14:22:18  product_added..   Rahul S.   webhook │
│  14:22:15  identify          anon→Rahul  server │
│  14:22:03  product_viewed    Anonymous   web    │
│  14:22:01  page_viewed       Anonymous   web    │
├─────────────────────────────────────────────────┤
│  Click row to see full event properties (JSON)   │
└─────────────────────────────────────────────────┘
```

### Data
- **API**: `GET /api/events/stream?projectId={id}&limit=50`
- **Polling**: Every 2 seconds when "Live" is active
- Alternatively, use Server-Sent Events (SSE) for real-time push

### Interactions
- Click row → expand to show full `properties` JSON in a formatted code block
- Live/Pause toggle: controls polling
- Auto-scroll: new events appear at top, table auto-scrolls
- Color coding: different event types get subtle left-border colors (orders = green, carts = amber, views = blue)
