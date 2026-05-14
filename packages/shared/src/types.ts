// ============ DATABASE MODELS ============

export type DomainType = 'ecommerce' | 'fintech' | 'saas' | 'custom'
export type IntegrationType = 'shopify' | 'api_key' | 'stripe' | 'custom'

export type Project = {
  id: string
  name: string
  shopifyDomain: string | null
  shopifyAccessToken: string | null
  businessType: 'ecommerce' | 'booking' | 'saas' | 'general'
  domainType: DomainType
  integrationType: IntegrationType
  webhookSecret: string | null
  settings: Record<string, unknown>
  features: ProjectFeatures
  createdAt: Date
  updatedAt: Date
}

export type ProjectFeatures = {
  agentScopedAccess?: boolean
  [key: string]: unknown
}

export type AdminRole = 'admin' | 'manager' | 'agent'

export type Agent = {
  id: string
  projectId: string
  externalDealerId: string | null
  name: string
  email: string | null
  phone: string | null
  region: string | null
  city: string | null
  managerId: string | null
  isActive: boolean
  metadata: Record<string, unknown>
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
  firstOrderDate: Date | null
  lastOrderDate: Date | null
  agentId: string | null
  region: string | null
  city: string | null
  customAttributes: Record<string, unknown>
  metrics: Record<string, unknown> // Precomputed domain-specific metrics
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
  /** External id from the source system (Shopify SKU, banking loan id,
   *  LMS course id, venue arena id, etc.). Column is named
   *  `shopify_product_id` for historical reasons but is source-agnostic. */
  shopifyProductId: string
  title: string
  /** Vertical-specific category: "Audio", "personal_loan", "course", "arena" */
  productType: string
  vendor: string
  imageUrl: string | null
  status: 'active' | 'draft' | 'archived'
  /** Vertical-specific JSONB metadata. Examples:
   *  - banking:  { apr_min, apr_max, max_amount, tenure_months_max }
   *  - edtech:   { instructor, duration_weeks, level, certification }
   *  - sporttech:{ capacity, sport, city, covered } */
  attributes: Record<string, unknown>
  basePrice: string | null   // numeric column comes back as string
  currency: string | null
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

export type CampaignContentType = 'promotional' | 'transactional'
export type CampaignChannel = 'email' | 'sms' | 'push' | 'whatsapp'
export type CampaignDeliveryType = 'one-time' | 'periodic'
export type CampaignSendTimeMode = 'asap' | 'fixed' | 'user_timezone' | 'best_time'

export type CampaignUtmParameter = {
  key: string
  value: string
}

export type CampaignUtmParameters = {
  enabled: boolean
  params: CampaignUtmParameter[]
}

export type ConversionGoal = {
  name: string
  eventName: string
  attributes?: Record<string, string>
  // Revenue attribution — Gap 10 (Storees → MoEngage roadmap)
  // When revenueEnabled=true, the campaign analytics engine reads
  // `properties[revenueAttribute]` off matching events and sums it as
  // the campaign's attributed revenue. When false, only completions count.
  revenueEnabled?: boolean
  revenueAttribute?: string  // e.g. 'total', 'order_total', 'amount'
  // One goal per campaign should be marked primary — used as the headline
  // "conversion rate" number on the campaign analytics card. Others are
  // surfaced as secondary metrics.
  isPrimary?: boolean
}

export type PeriodicSchedule = {
  frequency: 'daily' | 'weekly' | 'monthly'
  dayOfWeek?: number  // 0=Sun..6=Sat (for weekly)
  dayOfMonth?: number // 1-28 (for monthly)
  time: string        // HH:mm
  endsAt?: string     // ISO date or empty for indefinite
}

export type GmailAnnotation = {
  enabled: boolean
  imageUrl?: string
  dealText?: string
  description?: string
  offerCode?: string
  startsAt?: string
  expiresAt?: string
}

export type ProjectEmailSender = {
  id: string
  projectId: string
  address: string
  displayName: string | null
  verifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type Campaign = {
  id: string
  projectId: string
  name: string
  channel: CampaignChannel
  deliveryType: CampaignDeliveryType
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused'
  contentType: CampaignContentType
  segmentId: string | null
  segmentName?: string
  subject: string | null
  previewText: string | null
  htmlBody: string | null
  emailBuilderTemplate: Record<string, unknown> | null
  bodyText: string | null
  fromName: string | null
  fromEmail: string | null
  replyToEmail: string | null
  ccEmails: string[]
  bccEmails: string[]
  gmailAnnotation: GmailAnnotation | null
  utmParameters: CampaignUtmParameters | null
  attachments?: CampaignAttachment[]
  templateId: string | null
  conversionGoals: ConversionGoal[]
  goalTrackingHours: number
  currency: string | null   // ISO-4217 (e.g. 'INR', 'USD', 'AED'). NULL = project default

  deliveryLimit: number | null
  ignoreFrequencyCap: boolean
  countForFrequencyCap: boolean
  sendTimeMode: CampaignSendTimeMode
  scheduleTimezone: string | null
  periodicSchedule: PeriodicSchedule | null
  scheduledAt: Date | null
  sentAt: Date | null
  totalRecipients: number
  sentCount: number
  failedCount: number
  deliveredCount: number
  openedCount: number
  clickedCount: number
  bouncedCount: number
  complainedCount: number
  convertedCount: number
  // A/B testing
  abTestEnabled: boolean
  abSplitPct: number
  abVariantBSubject: string | null
  abVariantBHtmlBody: string | null
  abVariantBBodyText: string | null
  abWinner: 'A' | 'B' | null
  abWinnerMetric: 'open_rate' | 'click_rate' | 'conversion_rate'
  abAutoSendWinner: boolean
  abTestDurationHours: number
  // Phase 1 — audience model v2.
  // tags: free-text labels for filtering campaign list views.
  // audienceFilter: inline FilterConfig — overrides segmentId at staging
  //   when set. Same shape segments use, evaluated by the same engine.
  // audienceCap: optional max recipient count, applied as a LIMIT at staging.
  // controlGroupPct: 0..50 % of audience held back for lift measurement.
  // controlGroupSeed: random salt set when controlGroupPct > 0; lets the
  //   deterministic hash split be audited later.
  tags: string[]
  audienceFilter: FilterConfig | null
  excludeAudienceFilter: FilterConfig | null
  audienceCap: number | null
  controlGroupPct: number
  controlGroupSeed: string | null
  subscriptionCategoryIds: string[]
  // Per-campaign variable mappings — overrides template defaults at send-time.
  variables: TemplateVariable[]
  // Soft-archive timestamp; null = active
  archivedAt: string | null
  createdAt: Date
  updatedAt: Date
}

export type CampaignAttachment = {
  id: string
  campaignId: string
  filename: string
  mime: string
  sizeBytes: number
  s3Key: string
  createdAt: Date
}

export type CampaignHoldout = {
  id: string
  campaignId: string
  customerId: string
  reason: 'control_group' | 'cap_exceeded' | 'frequency_cap'
  recordedAt: Date
}

export type CampaignSend = {
  id: string
  campaignId: string
  customerId: string
  email: string
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced'
  sentAt: Date | null
  deliveredAt: Date | null
  openedAt: Date | null
  clickedAt: Date | null
  bouncedAt: Date | null
  complainedAt: Date | null
  resendMessageId: string | null
  variant: 'A' | 'B' | null
  scheduledAt: Date | null
  createdAt: Date
}

export type SubscriptionCategory = {
  id: string
  projectId: string
  name: string
  description: string | null
  channel: CampaignChannel | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
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

export type TemplateChannel = 'email' | 'sms' | 'push' | 'whatsapp'

export type EmailTemplate = {
  id: string
  projectId: string
  name: string
  channel: TemplateChannel
  subject: string | null    // email only
  htmlBody: string | null   // email only
  emailBuilderTemplate: Record<string, unknown> | null
  bodyText: string | null   // sms / push / whatsapp
  variables: TemplateVariable[]
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

/** Nested group — allows AND within OR and vice versa.
 *  Groups can contain rules or further groups (recursive). The segment
 *  evaluator handles arbitrary depth via `ruleOrGroupToSql`. The UI caps
 *  practical depth at 3 levels for usability. */
export type FilterGroup = {
  type: 'group'
  logic: 'AND' | 'OR'
  rules: (FilterRule | FilterGroup)[]
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
  | 'has_viewed' | 'has_not_viewed'
  | 'has_wishlisted' | 'has_not_wishlisted'

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
  | AbSplitNode
  | GotoNode
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

// Gap 6: random split with deterministic per-customer assignment. Each
// branch has a target node id and a weight (1-99); weights sum to 100.
// The executor hashes (customerId, nodeId) so the same customer
// always lands on the same branch — important for repeatable
// experiments and for the per-user flow debugger to show a coherent
// path. Two branches (A/B) is the common case; the type supports more.
export type AbSplitNode = {
  id: string
  type: 'ab_split'
  config: {
    branches: Array<{
      label: string             // 'A' / 'B' / 'Control'
      target: string            // node id to jump to
      weight: number            // 1-99, all branches must sum to 100
    }>
  }
}

// Gap 6: jump to an arbitrary node. Used for loops (retry-on-fail),
// re-routing into a different sub-flow, or "if did_not_open after 3
// days, goto pre-purchase nurture node".
export type GotoNode = {
  id: string
  type: 'goto'
  config: {
    target: string              // node id to jump to
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
  rfm?: string
}

export type LifecycleDistributionBucket = {
  label: string
  count: number
  percentage: number
}

export type LifecycleChartData = {
  segments: LifecycleSegment[]
  metrics: {
    returningCustomerPercentage: number
    avgPurchaseFrequency: number
    avgPurchaseValue: number
    avgClv: number
    noPurchaseCount: number
    buyerCount: number
  }
  frequencyDistribution: LifecycleDistributionBucket[]
  monetaryDistribution: LifecycleDistributionBucket[]
  recencyDistribution: LifecycleDistributionBucket[]
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

// ============ UNIFIED PLATFORM TYPES ============

export type ApiKey = {
  id: string
  projectId: string
  name: string
  keyPublic: string
  permissions: string[]
  ipWhitelist: string[] | null
  rateLimit: number
  isActive: boolean
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

export type Entity = {
  id: string
  projectId: string
  customerId: string | null
  entityType: string
  externalId: string | null
  status: string | null
  attributes: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type Identity = {
  id: string
  projectId: string
  customerId: string
  identifierType: 'email' | 'phone' | 'external_id' | 'device_id'
  identifierValue: string
  isPrimary: boolean
  createdAt: Date
}

export type Consent = {
  id: string
  projectId: string
  customerId: string
  channel: 'email' | 'sms' | 'push' | 'whatsapp'
  purpose: 'transactional' | 'promotional'
  status: 'opted_in' | 'opted_out'
  source: string | null
  consentedAt: Date
  revokedAt: Date | null
  createdAt: Date
}

export type CommunicationLogEntry = {
  id: string
  projectId: string
  customerId: string
  channel: 'email' | 'sms' | 'push' | 'whatsapp'
  messageType: 'campaign' | 'flow' | 'transactional'
  templateId: string | null
  contentHash: string | null
  status: 'sent' | 'delivered' | 'failed' | 'read'
  providerMessageId: string | null
  sentAt: Date | null
  deliveredAt: Date | null
  metadata: Record<string, unknown>
  createdAt: Date
}

// ============ GENERIC ITEM CATALOGUE ============

export type Catalogue = {
  id: string
  projectId: string
  name: string
  itemTypeLabel: string // "Product", "Loan", "Course", "Plan"
  attributeSchema: CatalogueAttribute[]
  createdAt: Date
  updatedAt: Date
}

export type CatalogueAttribute = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select'
  values?: string[] // for select type
  weight?: number // for recommendation attribute similarity
}

export type Item = {
  id: string
  projectId: string
  catalogueId: string
  externalId: string | null
  type: string // "product", "gold_loan", "personal_loan", "course"
  name: string
  attributes: Record<string, unknown>
  status: 'active' | 'inactive' | 'archived'
  createdAt: Date
  updatedAt: Date
}

export type InteractionType = 'view' | 'engage' | 'intent' | 'strong_intent' | 'conversion'

export type Interaction = {
  id: string
  projectId: string
  customerId: string
  itemId: string
  interactionType: InteractionType
  weight: number
  sourceEventId: string | null
  createdAt: Date
}

export type InteractionConfig = {
  id: string
  projectId: string
  catalogueId: string
  eventName: string
  interactionType: InteractionType
  weight: number
  decayHalfLifeDays: number
  createdAt: Date
}

// ============ DELIVERY & MESSAGING ============

export type MessageChannel = 'email' | 'sms' | 'push' | 'whatsapp' | 'inapp'

export type SendCommand = {
  userId: string
  channel: MessageChannel
  templateId: string
  variables: Record<string, string>
  scheduledAt?: Date
  messageType: 'promotional' | 'transactional'
  flowTripId?: string
  campaignId?: string
  projectId: string
  ignoreFrequencyCap?: boolean
  countForFrequencyCap?: boolean
}

export type Message = {
  id: string
  projectId: string
  customerId: string
  channel: MessageChannel
  messageType: 'promotional' | 'transactional'
  templateId: string | null
  variables: Record<string, string>
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'clicked' | 'failed' | 'blocked'
  blockReason: string | null
  countsTowardFrequencyCap: boolean
  provider: 'pinnacle' | 'resend' | null
  providerMessageId: string | null
  flowTripId: string | null
  campaignId: string | null
  scheduledAt: Date | null
  sentAt: Date | null
  deliveredAt: Date | null
  readAt: Date | null
  clickedAt: Date | null
  failedAt: Date | null
  createdAt: Date
}

export type ConsentAuditEntry = {
  id: string
  projectId: string
  customerId: string
  channel: string
  messageType: string
  action: 'opt_in' | 'opt_out'
  source: 'sdk' | 'api' | 'admin' | 'webhook'
  consentText: string | null
  ipAddress: string | null
  createdAt: Date
}

// ============ PREDICTION GOALS ============

export type PredictionGoal = {
  id: string
  projectId: string
  name: string
  targetEvent: string
  observationWindowDays: number
  predictionWindowDays: number
  minPositiveLabels: number
  status: 'active' | 'paused' | 'insufficient_data'
  lastTrainedAt: Date | null
  currentMetric: number | null
  origin: 'pack' | 'user'
  createdAt: Date
  updatedAt: Date
}

// ============ DOMAIN REGISTRY TYPES ============

export type DomainFieldDef = {
  field: string
  label: string
  type: 'number' | 'string' | 'date' | 'boolean' | 'select' | 'product' | 'collection' | 'product_category'
  category: string
  operators: FilterOperator[]
  options?: string[]
  /**
   * Value/label pairs for selects whose values differ from their labels
   * (e.g. agent UUIDs with human-readable dealer names). Takes precedence
   * over `options` when both are present.
   */
  optionPairs?: Array<{ value: string; label: string }>
  metricKey?: string
}

export type DomainConfig = {
  domainType: DomainType
  fields: DomainFieldDef[]
  channels: ('email' | 'sms' | 'push' | 'whatsapp')[]
}

// ============ TEMPLATE VARIABLES ============

/**
 * A single variable mapping declared on a template or campaign. Resolved at
 * send-time by services/templateContext.ts to produce the substitution map
 * that replaces {{key}} occurrences in subject/body/header/buttons.
 *
 * Same shape used across all 4 channels (email, SMS, WhatsApp, push) so the
 * picker UI is identical regardless of which channel the user is editing.
 */
export type TemplateVariableSource =
  | { kind: 'customer'; field: string }       // any customers.<field> column
  | { kind: 'attribute'; key: string }        // customers.custom_attributes->>key
  | { kind: 'product'; field: string }        // products/items field for catalogue-backed variables
  | { kind: 'event'; key: string }            // event.properties[key] (flows only)
  | { kind: 'project'; field: string }        // projects.<field>
  | { kind: 'literal'; value: string }        // hardcoded string

export type TemplateVariableFormat =
  | 'money'                                   // 500000 → ₹5,000.00
  | 'date'                                    // 2026-05-07T... → 2026-05-07
  | 'date:long'                               // → May 7, 2026
  | 'date:short'                              // → 7 May
  | 'upper'
  | 'lower'
  | 'title'                                   // Title Case

export type TemplateVariable = {
  key: string                                  // the {{key}} in the body
  source: TemplateVariableSource
  defaultValue?: string                       // fallback when source resolves null/empty
  format?: TemplateVariableFormat             // optional transform
}

/**
 * Catalogue of available variable sources for a project — what the picker
 * dropdown shows. Returned by GET /api/templates/variable-sources.
 */
export type VariableSourceCatalog = {
  customer: Array<{ field: string; label: string; type: 'string' | 'number' | 'date' | 'boolean' }>
  attributes: Array<{ key: string; sample?: string }>  // top N keys observed in customer.custom_attributes
  product?: Array<{ field: string; label: string; type?: 'string' | 'number' | 'url' }>
  project: Array<{ field: string; label: string }>
  events: Array<{ name: string; properties: string[] }>  // top events + their property keys
}

// ============ GENERIC EVENT API TYPES ============

export type EventIngestionPayload = {
  event_name: string
  customer_id?: string
  customer_email?: string
  customer_phone?: string
  timestamp?: string
  idempotency_key?: string
  session_id?: string
  source?: 'sdk' | 'api' | 'server' | string
  platform?: 'web' | 'mobile' | 'server' | string
  properties?: Record<string, unknown>
  entities?: {
    type: string
    external_id: string
    status?: string
    attributes?: Record<string, unknown>
  }[]
}

export type BatchEventPayload = {
  events: EventIngestionPayload[]
}

export type CustomerUpsertPayload = {
  customer_id: string
  attributes: {
    email?: string
    phone?: string
    name?: string
    [key: string]: unknown
  }
}

// ============ ANALYTICS TYPES ============

export type SavedAnalysis = {
  id: string
  projectId: string
  name: string
  type: 'funnel' | 'timeseries' | 'time_to_event' | 'product' | 'cohort'
  config: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type TimeSeriesPoint = {
  date: string
  value: number
  compareValue?: number
}

export type TimeSeriesResult = {
  metric: string
  granularity: 'day' | 'week' | 'month'
  points: TimeSeriesPoint[]
  total: number
  compareTotal?: number
  changePercent?: number
}

export type TimeToEventResult = {
  startEvent: string
  endEvent: string
  medianSeconds: number
  p75Seconds: number
  p90Seconds: number
  totalCompletions: number
  distribution: { bucket: string; count: number }[]
  breakdowns?: { key: string; medianSeconds: number; count: number }[]
}

export type ProductAnalyticsItem = {
  itemId: string
  name: string
  category: string | null
  views: number
  conversions: number
  conversionRate: number
  revenue: number
  abandonment: number
}

// ============ SEGMENT INTELLIGENCE TYPES ============

export type SegmentTransition = {
  fromSegmentId: string
  fromSegmentName: string
  toSegmentId: string
  toSegmentName: string
  count: number
  percentage: number
}

export type TransitionResult = {
  period1: string
  period2: string
  transitions: SegmentTransition[]
  totalCustomers: number
}

export type SegmentTrendPoint = {
  date: string
  segmentId: string
  segmentName: string
  memberCount: number
}

// ============ PREDICTION SCORE TYPES ============

export type PredictionFactor = {
  feature: string
  value: number
  impact: number
  direction: 'positive' | 'negative'
  label: string
}

export type PredictionScore = {
  id: string
  customerId: string
  goalId: string
  goalName: string
  score: number
  confidence: number
  bucket: 'High' | 'Medium' | 'Low'
  factors: PredictionFactor[]
  computedAt: Date
}

export type ReorderTiming = {
  timingBucket: '0-3d' | '3-7d' | '7-14d' | '14d+' | null
  expectedReorderDays: number
  daysOverdue: number
  avgCycleDays: number
  isRepeatBuyer: boolean
  regularity: number
}

export type CustomerPredictions = {
  scores: PredictionScore[]
  recommendations: PredictionRecommendation[]
}

export type PredictionRecommendation = {
  type: 'action' | 'segment' | 'flow'
  title: string
  reason: string
  confidence: number
  metadata: Record<string, unknown>
}

export type PredictionQuality = {
  auc: number
  precision: number
  recall: number
  liftOverBaseline: number
  calibrationQuality: 'excellent' | 'good' | 'needs_improvement'
  label: 'Excellent' | 'Good' | 'Needs Improvement'
}

export type PredictionGoalDetail = PredictionGoal & {
  quality: PredictionQuality | null
  distribution: { bucket: string; count: number }[]
  topFeatures: { name: string; importance: number }[]
}
