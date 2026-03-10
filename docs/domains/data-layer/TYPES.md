# Data Layer — TypeScript Types

> **Location**: `packages/shared/types.ts`
> **Rule**: This file is the single source of truth. ALL agents import from here. Agent 1 (Backend) is the primary author. No agent creates duplicate type definitions.

## Database Model Types

```typescript
type Project = {
  id: string
  name: string
  shopifyDomain: string
  shopifyAccessToken: string
  businessType: 'ecommerce' | 'booking' | 'saas' | 'general'
  webhookSecret: string
  createdAt: Date
  updatedAt: Date
}

type Customer = {
  id: string
  projectId: string
  externalId: string
  email: string | null
  phone: string | null
  name: string | null
  firstSeen: Date
  lastSeen: Date
  totalOrders: number
  totalSpent: number
  avgOrderValue: number
  clv: number
  emailSubscribed: boolean
  smsSubscribed: boolean
  pushSubscribed: boolean
  whatsappSubscribed: boolean
  segmentIds: string[]
  customAttributes: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

type Order = {
  id: string
  projectId: string
  customerId: string
  externalOrderId: string
  status: 'pending' | 'fulfilled' | 'cancelled' | 'refunded'
  total: number
  discount: number
  currency: string
  lineItems: LineItem[]
  createdAt: Date
  fulfilledAt: Date | null
}

type LineItem = {
  productId: string
  productName: string
  quantity: number
  price: number
  imageUrl?: string
}

type TrackedEvent = {
  id: string
  projectId: string
  customerId: string | null
  eventName: string
  properties: Record<string, unknown>
  platform: 'web' | 'mobile' | 'server' | 'shopify_webhook' | 'historical_sync'
  sessionId: string | null
  timestamp: Date
  receivedAt: Date
}

type Segment = {
  id: string
  projectId: string
  name: string
  type: 'default' | 'custom'
  description: string
  filters: FilterConfig
  memberCount: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

type Flow = {
  id: string
  projectId: string
  name: string
  description: string
  triggerConfig: TriggerConfig
  exitConfig: ExitConfig | null
  nodes: FlowNode[]
  status: 'draft' | 'active' | 'paused'
  createdAt: Date
  updatedAt: Date
}

type FlowTrip = {
  id: string
  flowId: string
  customerId: string
  status: 'active' | 'waiting' | 'completed' | 'exited'
  currentNodeId: string
  context: Record<string, unknown>
  enteredAt: Date
  exitedAt: Date | null
}

type ScheduledJob = {
  id: string
  flowTripId: string
  executeAt: Date
  action: Record<string, unknown>
  status: 'pending' | 'executed' | 'cancelled'
  createdAt: Date
}

type EmailTemplate = {
  id: string
  projectId: string
  name: string
  subject: string
  htmlBody: string
  createdAt: Date
  updatedAt: Date
}
```

## Filter & Flow Schema Types

```typescript
type FilterConfig = {
  logic: 'AND' | 'OR'
  rules: FilterRule[]
}

type FilterRule = {
  field: string
  operator: FilterOperator
  value: unknown
}

type FilterOperator =
  | 'is' | 'is_not'
  | 'greater_than' | 'less_than' | 'between'
  | 'contains' | 'begins_with' | 'ends_with'
  | 'is_true' | 'is_false'

type TriggerConfig = {
  event: string
  filters?: FilterConfig
  audienceFilter?: FilterConfig
  inactivityTime?: { value: number; unit: 'minutes' | 'hours' | 'days' }
}

type ExitConfig = {
  event: string
  scope: 'any' | 'matching'
}

type FlowNode =
  | TriggerNode
  | DelayNode
  | ConditionNode
  | ActionNode
  | EndNode

type TriggerNode = {
  id: string
  type: 'trigger'
  config?: TriggerConfig
}

type DelayNode = {
  id: string
  type: 'delay'
  config: { value: number; unit: 'minutes' | 'hours' | 'days' }
}

type ConditionNode = {
  id: string
  type: 'condition'
  config: {
    check: 'event_occurred' | 'attribute_check'
    event?: string
    field?: string
    operator?: FilterOperator
    value?: unknown
    since: 'trip_start' | 'flow_start'
    branches: { yes: string; no: string }
  }
}

type ActionNode = {
  id: string
  type: 'action'
  config: {
    actionType: 'send_email' | 'send_push' | 'send_sms' | 'send_whatsapp'
    templateId: string
    subjectOverride?: string
    dynamicData?: string[]
  }
}

type EndNode = {
  id: string
  type: 'end'
  label?: string
}
```

## API Response Types

```typescript
type ApiResponse<T> = {
  success: boolean
  data: T
  error?: string
}

type PaginatedResponse<T> = {
  success: boolean
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

type CustomerListParams = {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: 'lastSeen' | 'totalSpent' | 'clv' | 'name'
  sortOrder?: 'asc' | 'desc'
  segmentId?: string
}

type LifecycleChartData = {
  segments: LifecycleSegment[]
  metrics: {
    returningCustomerPercentage: number
    avgPurchaseFrequency: number
    avgPurchaseValue: number
    avgClv: number
  }
}

type LifecycleSegment = {
  name: string
  label: string
  percentage: number
  contactCount: number
  position: { row: number; col: number }
  color: string
  retentionTactics: string[]
}

type EventStreamItem = {
  id: string
  eventName: string
  customerName: string | null
  customerEmail: string | null
  properties: Record<string, unknown>
  platform: string
  timestamp: Date
}
```

## Constants

```typescript
const STANDARD_EVENTS = {
  PRODUCT_VIEWED: 'product_viewed',
  PRODUCT_ADDED_TO_CART: 'product_added_to_cart',
  CART_CREATED: 'cart_created',
  CART_UPDATED: 'cart_updated',
  CHECKOUT_STARTED: 'checkout_started',
  ORDER_PLACED: 'order_placed',
  ORDER_FULFILLED: 'order_fulfilled',
  ORDER_CANCELLED: 'order_cancelled',
  CUSTOMER_CREATED: 'customer_created',
  CUSTOMER_UPDATED: 'customer_updated',
  REVIEW_SUBMITTED: 'review_submitted',
  ENTERS_SEGMENT: 'enters_segment',
  EXITS_SEGMENT: 'exits_segment',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  PAGE_VIEWED: 'page_viewed',
} as const

const SEGMENT_TEMPLATES = [
  'champion_customers',
  'loyal_customers',
  'discount_shoppers',
  'window_shoppers',
  'researchers',
] as const
```
