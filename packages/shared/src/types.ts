// ============ DATABASE MODELS ============

export type Project = {
  id: string
  name: string
  shopifyDomain: string
  shopifyAccessToken: string
  businessType: 'ecommerce' | 'booking' | 'saas' | 'general'
  webhookSecret: string
  createdAt: Date
  updatedAt: Date
}

export type Customer = {
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
  customAttributes: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type Order = {
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

export type LineItem = {
  productId: string
  productName: string
  quantity: number
  price: number
  imageUrl?: string
}

export type Product = {
  id: string
  projectId: string
  shopifyProductId: string
  title: string
  productType: string
  vendor: string
  imageUrl: string | null
  status: 'active' | 'draft' | 'archived'
  createdAt: Date
  updatedAt: Date
}

export type Collection = {
  id: string
  projectId: string
  shopifyCollectionId: string
  title: string
  collectionType: 'custom' | 'smart'
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export type Campaign = {
  id: string
  projectId: string
  name: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused'
  segmentId: string | null
  segmentName?: string
  subject: string
  htmlBody: string
  fromName: string | null
  scheduledAt: Date | null
  sentAt: Date | null
  totalRecipients: number
  sentCount: number
  failedCount: number
  createdAt: Date
  updatedAt: Date
}

export type CampaignSend = {
  id: string
  campaignId: string
  customerId: string
  email: string
  status: 'pending' | 'sent' | 'failed'
  sentAt: Date | null
  resendMessageId: string | null
  createdAt: Date
}

export type TrackedEvent = {
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

export type Segment = {
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

export type Flow = {
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

export type FlowTrip = {
  id: string
  flowId: string
  customerId: string
  status: 'active' | 'waiting' | 'completed' | 'exited'
  currentNodeId: string
  context: Record<string, unknown>
  enteredAt: Date
  exitedAt: Date | null
}

export type ScheduledJob = {
  id: string
  flowTripId: string
  executeAt: Date
  action: Record<string, unknown>
  status: 'pending' | 'executed' | 'cancelled'
  createdAt: Date
}

export type EmailTemplate = {
  id: string
  projectId: string
  name: string
  subject: string
  htmlBody: string
  createdAt: Date
  updatedAt: Date
}

// ============ JUNCTION TABLE ============

export type CustomerSegment = {
  customerId: string
  segmentId: string
  joinedAt: Date
}

// ============ FILTER & FLOW SCHEMAS ============

export type FilterConfig = {
  logic: 'AND' | 'OR'
  rules: (FilterRule | FilterGroup)[]
}

/** Nested group — allows AND within OR and vice versa */
export type FilterGroup = {
  type: 'group'
  logic: 'AND' | 'OR'
  rules: FilterRule[]
}

export type FilterRule = {
  field: string
  operator: FilterOperator
  value: unknown
}

export type FilterOperator =
  | 'is' | 'is_not'
  | 'greater_than' | 'less_than' | 'between'
  | 'contains' | 'begins_with' | 'ends_with'
  | 'is_true' | 'is_false'
  | 'in_month' | 'in_year' | 'before_date' | 'after_date'
  | 'has_purchased' | 'has_not_purchased'

export type TriggerConfig = {
  event: string
  filters?: FilterConfig
  audienceFilter?: FilterConfig
  inactivityTime?: { value: number; unit: 'minutes' | 'hours' | 'days' }
}

export type ExitConfig = {
  event: string
  scope: 'any' | 'matching'
}

export type FlowNode =
  | TriggerNode
  | DelayNode
  | ConditionNode
  | ActionNode
  | EndNode

export type TriggerNode = {
  id: string
  type: 'trigger'
  config?: TriggerConfig
}

export type DelayNode = {
  id: string
  type: 'delay'
  config: { value: number; unit: 'minutes' | 'hours' | 'days' }
}

export type ConditionNode = {
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

export type ActionNode = {
  id: string
  type: 'action'
  config: {
    actionType: 'send_email' | 'send_push' | 'send_sms' | 'send_whatsapp'
    templateId: string
    subjectOverride?: string
    dynamicData?: string[]
  }
}

export type EndNode = {
  id: string
  type: 'end'
  label?: string
}

// ============ API RESPONSE TYPES ============

export type ApiResponse<T> = {
  success: boolean
  data: T
  error?: string
}

export type PaginatedResponse<T> = {
  success: boolean
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export type CustomerListParams = {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: 'lastSeen' | 'totalSpent' | 'clv' | 'name'
  sortOrder?: 'asc' | 'desc'
  segmentId?: string
}

export type LifecycleChartData = {
  segments: LifecycleSegment[]
  metrics: {
    returningCustomerPercentage: number
    avgPurchaseFrequency: number
    avgPurchaseValue: number
    avgClv: number
  }
}

export type LifecycleSegment = {
  name: string
  label: string
  percentage: number
  contactCount: number
  position: { row: number; col: number }
  color: string
  retentionTactics: string[]
}

export type EventStreamItem = {
  id: string
  eventName: string
  customerName: string | null
  customerEmail: string | null
  properties: Record<string, unknown>
  platform: string
  timestamp: Date
}
