# UI System — Component Inventory

> All components live in `packages/frontend/src/components/`. Use shadcn/ui as the base layer. Custom components extend shadcn primitives.

## Layout Components

| Component | File | Description |
|-----------|------|-------------|
| `AppShell` | `layout/AppShell.tsx` | Root layout: sidebar + content area wrapper |
| `Sidebar` | `layout/Sidebar.tsx` | Fixed 240px sidebar with nav items, logo, dividers |
| `SidebarItem` | `layout/SidebarItem.tsx` | Single nav item: icon + text, active/hover states |
| `PageHeader` | `layout/PageHeader.tsx` | Page title + optional action buttons (right-aligned) |
| `ContentArea` | `layout/ContentArea.tsx` | Max-width container with page padding |

## Data Display Components

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| `MetricCard` | `dashboard/MetricCard.tsx` | `label, value, trend?, trendDirection?` | Single KPI card |
| `DataTable` | `shared/DataTable.tsx` | `columns, data, pagination, onSort, onPageChange` | Generic sortable paginated table |
| `ExpandableRow` | `shared/ExpandableRow.tsx` | `children, expandContent` | Table row with expand/collapse |
| `EventTimeline` | `customers/EventTimeline.tsx` | `events: EventStreamItem[]` | Chronological event list with icons |
| `OrderTable` | `customers/OrderTable.tsx` | `orders: Order[]` | Orders with expandable line items |
| `SegmentBadge` | `shared/SegmentBadge.tsx` | `name, color?` | Colored tag for segment membership |
| `SubscriptionBadge` | `shared/SubscriptionBadge.tsx` | `channel, subscribed` | Green check / red X per channel |
| `StatusBadge` | `shared/StatusBadge.tsx` | `status, variant` | Generic colored status badge |
| `EmptyState` | `shared/EmptyState.tsx` | `icon, title, description, action?` | Empty state with CTA |

## Segment Components

| Component | File | Description |
|-----------|------|-------------|
| `SegmentTemplateCard` | `segments/SegmentTemplateCard.tsx` | Template card with name, description, Create button |
| `SegmentTemplateGrid` | `segments/SegmentTemplateGrid.tsx` | Grid of template cards |
| `FilterBuilder` | `segments/FilterBuilder.tsx` | Visual AND/OR filter builder with add/remove rules |
| `FilterRule` | `segments/FilterRule.tsx` | Single rule: field dropdown + operator dropdown + value input |
| `LogicToggle` | `segments/LogicToggle.tsx` | AND/OR toggle between rules |
| `LifecycleChart` | `segments/LifecycleChart.tsx` | RFM grid visualization with hover actions |
| `LifecycleCell` | `segments/LifecycleCell.tsx` | Single cell in lifecycle grid: %, count, label, color |
| `RetentionTacticsPopover` | `segments/RetentionTacticsPopover.tsx` | Popover with retention suggestions + View Contacts button |

## Flow Components

| Component | File | Description |
|-----------|------|-------------|
| `FlowCanvas` | `flows/FlowCanvas.tsx` | Visual flow builder canvas rendering nodes and connections |
| `FlowNode` | `flows/FlowNode.tsx` | Single node: trigger, delay, condition, action, or end |
| `FlowConnection` | `flows/FlowConnection.tsx` | SVG line/arrow connecting two nodes |
| `NodeConfigPanel` | `flows/NodeConfigPanel.tsx` | Right-side panel: config form for selected node |
| `TriggerConfig` | `flows/TriggerConfig.tsx` | Trigger event selector + filter builder |
| `DelayConfig` | `flows/DelayConfig.tsx` | Duration input + unit selector |
| `ConditionConfig` | `flows/ConditionConfig.tsx` | Condition type + event/attribute selector + branches |
| `ActionConfig` | `flows/ActionConfig.tsx` | Action type + template selector |
| `ComponentPalette` | `flows/ComponentPalette.tsx` | Left panel: available node types to add |
| `FlowStatusToggle` | `flows/FlowStatusToggle.tsx` | Start/Stop/Pause controls |

## AI Components

| Component | File | Description |
|-----------|------|-------------|
| `AiChatPanel` | `segments/AiChatPanel.tsx` | Right-side AI chat panel with message history, input, mic button |
| `AiMessage` | `segments/AiMessage.tsx` | Single chat bubble (user or AI) with filter preview for AI messages |
| `AiFilterPreview` | `segments/AiFilterPreview.tsx` | Human-readable preview of generated FilterConfig with "Apply" button |
| `VoiceInputButton` | `segments/VoiceInputButton.tsx` | Microphone toggle using Web Speech API with recording state indicator |
| `LanguageSelector` | `segments/LanguageSelector.tsx` | Horizontal chip row for speech recognition language selection |

## Integration Components

| Component | File | Description |
|-----------|------|-------------|
| `ShopifyConnectButton` | `integrations/ShopifyConnectButton.tsx` | "Connect Shopify" button that initiates OAuth |
| `ShopifyStoreCard` | `integrations/ShopifyStoreCard.tsx` | Connected store display: domain, sync status, last sync |
| `SyncProgress` | `integrations/SyncProgress.tsx` | Progress bar for historical data sync |

## Debugger Components

| Component | File | Description |
|-----------|------|-------------|
| `EventStream` | `debugger/EventStream.tsx` | Auto-refreshing event table with live/pause toggle |
| `EventRow` | `debugger/EventRow.tsx` | Single event row with expandable JSON properties |
| `EventIcon` | `debugger/EventIcon.tsx` | Colored icon per event type |
| `LiveIndicator` | `debugger/LiveIndicator.tsx` | Pulsing green dot when live streaming |

## Shared Hooks

| Hook | File | Description |
|------|------|-------------|
| `useCustomers` | `hooks/useCustomers.ts` | TanStack Query wrapper for customer list API |
| `useCustomerDetail` | `hooks/useCustomerDetail.ts` | Fetch single customer + orders + events |
| `useSegments` | `hooks/useSegments.ts` | Segment list + CRUD operations |
| `useSegmentMembers` | `hooks/useSegmentMembers.ts` | Paginated segment member list |
| `useLifecycleChart` | `hooks/useLifecycleChart.ts` | Lifecycle chart data |
| `useFlows` | `hooks/useFlows.ts` | Flow list + CRUD + start/stop |
| `useEventStream` | `hooks/useEventStream.ts` | Polling-based event stream with live/pause |
| `useDashboardMetrics` | `hooks/useDashboardMetrics.ts` | Dashboard KPI data |
| `useFilterPreview` | `hooks/useFilterPreview.ts` | Debounced segment preview count |
| `useAiSegment` | `hooks/useAiSegment.ts` | Mutation hook for POST /api/ai/segment |
| `useSpeechRecognition` | `hooks/useSpeechRecognition.ts` | Web Speech API wrapper with language support |
