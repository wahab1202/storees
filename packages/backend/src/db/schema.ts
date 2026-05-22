import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ============ PROJECTS ============

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  shopifyDomain: varchar('shopify_domain', { length: 255 }).unique(),
  shopifyAccessToken: varchar('shopify_access_token', { length: 512 }),
  businessType: varchar('business_type', { length: 20 }).notNull().default('ecommerce'),
  domainType: varchar('domain_type', { length: 20 }).notNull().default('ecommerce'),
  // 'ecommerce' | 'fintech' | 'saas' | 'custom'
  integrationType: varchar('integration_type', { length: 20 }).notNull().default('shopify'),
  // 'shopify' | 'api_key' | 'stripe' | 'custom'
  webhookSecret: varchar('webhook_secret', { length: 255 }),
  settings: jsonb('settings').default('{}'),
  features: jsonb('features').notNull().default('{}'),
  // Per-tenant Resend sending domain (Phase E2.1). NULL = falls back to shared
  // FROM_EMAIL env var with rate cap. Set when client verifies their domain.
  emailFromAddress: varchar('email_from_address', { length: 255 }),
  emailFromName: varchar('email_from_name', { length: 255 }),
  resendDomainId: varchar('resend_domain_id', { length: 255 }),
  emailMarketingProvider: varchar('email_marketing_provider', { length: 20 }).notNull().default('resend'),
  emailTransactionalProvider: varchar('email_transactional_provider', { length: 20 }).notNull().default('resend'),
  emailDomainProvider: varchar('email_domain_provider', { length: 20 }).notNull().default('resend'),
  emailDomainProviderId: varchar('email_domain_provider_id', { length: 255 }),
  emailDomainVerifiedAt: timestamp('email_domain_verified_at', { withTimezone: true }),
  // Phase E3.1 — per-tenant rate budget for email sends (per-minute).
  emailRatePerMinute: integer('email_rate_per_minute').notNull().default(60),
  // Phase F1a — per-channel marketing frequency caps.
  // Shape: { "<channel>_marketing": { perDays: number, max: number } }.
  // Transactional sends bypass caps; only promotional consumes quota.
  frequencyCaps: jsonb('frequency_caps').notNull().default(sql`'{
    "whatsapp_marketing": { "perDays": 7, "max": 1 },
    "sms_marketing":      { "perDays": 7, "max": 3 },
    "email_marketing":    { "perDays": 1, "max": 3 },
    "push_marketing":     { "perDays": 1, "max": 5 }
  }'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projectEmailSenders = pgTable('project_email_senders', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  address: varchar('address', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uniq_project_email_sender_address').on(table.projectId, table.address),
  index('idx_project_email_senders_project').on(table.projectId),
])

export const projectEmailConnectors = pgTable('project_email_connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  credentialsEncrypted: text('credentials_encrypted'),
  settings: jsonb('settings').notNull().default('{}'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uniq_project_email_connector_provider').on(table.projectId, table.provider),
  index('idx_project_email_connectors_project').on(table.projectId),
])

// ============ AGENTS (B2B distributors / regional reps) ============

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  externalDealerId: varchar('external_dealer_id', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  region: varchar('region', { length: 64 }),
  city: varchar('city', { length: 128 }),
  managerId: uuid('manager_id').references((): any => agents.id),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_agents_project').on(table.projectId),
  uniqueIndex('idx_agents_dealer').on(table.projectId, table.externalDealerId),
  index('idx_agents_manager').on(table.managerId),
  index('idx_agents_region').on(table.projectId, table.region),
])

// ============ CUSTOMERS ============

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  externalId: varchar('external_id', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  name: varchar('name', { length: 255 }),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  // last_seen is nullable (migration 0060) — represents "no observable
  // activity signal" for profile-only customers ingested from upstream
  // sources who haven't placed orders or generated events. Was previously
  // NOT NULL with default NOW(); that caused the dashboard's Active (7d)
  // metric to inflate after every sync.
  lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
  totalOrders: integer('total_orders').notNull().default(0),
  totalSpent: decimal('total_spent', { precision: 12, scale: 2 }).notNull().default('0'),
  avgOrderValue: decimal('avg_order_value', { precision: 12, scale: 2 }).notNull().default('0'),
  clv: decimal('clv', { precision: 12, scale: 2 }).notNull().default('0'),
  emailSubscribed: boolean('email_subscribed').notNull().default(false),
  smsSubscribed: boolean('sms_subscribed').notNull().default(false),
  pushSubscribed: boolean('push_subscribed').notNull().default(false),
  whatsappSubscribed: boolean('whatsapp_subscribed').notNull().default(false),
  firstOrderDate: timestamp('first_order_date', { withTimezone: true }),
  lastOrderDate: timestamp('last_order_date', { withTimezone: true }),
  agentId: uuid('agent_id').references(() => agents.id),
  region: varchar('region', { length: 64 }),
  city: varchar('city', { length: 128 }),
  customAttributes: jsonb('custom_attributes').default('{}'),
  metrics: jsonb('metrics').default('{}'), // Precomputed domain-specific metrics
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_customers_project').on(table.projectId),
  uniqueIndex('idx_customers_external').on(table.projectId, table.externalId),
  index('idx_customers_email').on(table.projectId, table.email),
  index('idx_customers_last_seen').on(table.projectId, table.lastSeen),
  index('idx_customers_agent').on(table.projectId, table.agentId),
  index('idx_customers_region').on(table.projectId, table.region),
])

// ============ CUSTOMER SEGMENTS (junction table) ============

export const customerSegments = pgTable('customer_segments', {
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  segmentId: uuid('segment_id').notNull().references(() => segments.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_customer_segments_unique').on(table.customerId, table.segmentId),
  index('idx_customer_segments_segment').on(table.segmentId),
])

// ============ ORDERS ============

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  externalOrderId: varchar('external_order_id', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  discount: decimal('discount', { precision: 12, scale: 2 }).default('0'),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  lineItems: jsonb('line_items').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
}, (table) => [
  index('idx_orders_customer').on(table.projectId, table.customerId, table.createdAt),
  uniqueIndex('idx_orders_external').on(table.projectId, table.externalOrderId),
  index('idx_orders_status').on(table.projectId, table.status),
])

// ============ EVENTS ============

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').references(() => customers.id),
  eventName: varchar('event_name', { length: 100 }).notNull(),
  properties: jsonb('properties').default('{}'),
  platform: varchar('platform', { length: 30 }).notNull(), // kept for backwards compat
  source: varchar('source', { length: 30 }).notNull().default('api'),
  // 'shopify_webhook' | 'api' | 'sdk' | 'sync' | 'system'
  sessionId: varchar('session_id', { length: 255 }),
  idempotencyKey: varchar('idempotency_key', { length: 255 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  // Set by customerAggregateWorker once the event has been folded into the
  // customer's running aggregates (total_spent / total_orders / etc.). NULL
  // = pending aggregation; partial index in migration 0040 keeps lookups fast.
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  index('idx_events_trigger').on(table.projectId, table.eventName, table.timestamp),
  index('idx_events_customer').on(table.projectId, table.customerId, table.timestamp),
  index('idx_events_recent').on(table.projectId, table.receivedAt),
  uniqueIndex('idx_events_idempotency').on(table.projectId, table.idempotencyKey),
])

// ============ PRODUCTS ============

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  // shopify_product_id is a historical name; semantically it's the external
  // id from ANY source system (Shopify SKU, Medusa product id, loan id from
  // a banking core, course id from an LMS, arena id from a venue system).
  shopifyProductId: varchar('shopify_product_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  // product_type is the vertical-specific category label:
  //   ecommerce: "Audio" / "Apparel"
  //   banking:   "personal_loan" / "home_loan" / "credit_card"
  //   edtech:    "course" / "certification" / "subscription"
  //   sporttech: "arena" / "membership" / "booking"
  productType: varchar('product_type', { length: 255 }).default(''),
  vendor: varchar('vendor', { length: 255 }).default(''),
  imageUrl: varchar('image_url', { length: 2048 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  // Vertical-specific metadata. Domain registry declares which keys are
  // filterable in segments. Banking: { apr_min, max_amount, tenure_months }.
  // EdTech: { instructor, duration_weeks, level }. SportTech: { capacity,
  // sport, city }. GIN-indexed for fast containment queries.
  attributes: jsonb('attributes').notNull().default('{}'),
  // List price + currency. Every vertical has these even if implicit today:
  // loan principal, course tuition, arena hourly rate. Optional because
  // some products are quote-based (custom loans, enterprise courses).
  basePrice: decimal('base_price', { precision: 12, scale: 2 }),
  currency: varchar('currency', { length: 3 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_products_shopify').on(table.projectId, table.shopifyProductId),
  index('idx_products_project').on(table.projectId),
  index('idx_products_project_type').on(table.projectId, table.productType),
])

// ============ COLLECTIONS ============

export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  shopifyCollectionId: varchar('shopify_collection_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  collectionType: varchar('collection_type', { length: 20 }).notNull().default('custom'),
  imageUrl: varchar('image_url', { length: 2048 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_collections_shopify').on(table.projectId, table.shopifyCollectionId),
  index('idx_collections_project').on(table.projectId),
])

// ============ PRODUCT COLLECTIONS (junction) ============

export const productCollections = pgTable('product_collections', {
  productId: uuid('product_id').notNull().references(() => products.id),
  collectionId: uuid('collection_id').notNull().references(() => collections.id),
}, (table) => [
  uniqueIndex('idx_product_collections_unique').on(table.productId, table.collectionId),
  index('idx_product_collections_collection').on(table.collectionId),
])

// ============ SEGMENTS ============

export const segments = pgTable('segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('custom'),
  description: text('description'),
  filters: jsonb('filters').notNull(),
  memberCount: integer('member_count').notNull().default(0),
  // Gap 13: reachable count = members AND reachable on at least one channel
  // (email_subscribed + email, sms_subscribed + phone, or any phone for
  // WhatsApp). Recomputed by evaluateSegment alongside memberCount.
  reachableCount: integer('reachable_count').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_segments_project').on(table.projectId),
  index('idx_segments_project_active').on(table.projectId, table.isActive),
])

// ============ FLOWS ============

export const flows = pgTable('flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  triggerConfig: jsonb('trigger_config').notNull(),
  exitConfig: jsonb('exit_config'),
  nodes: jsonb('nodes').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  // Phase F3 — replay lookback window in days. Events older than this are not
  // back-attributed when an anonymous session is linked to a customer.
  lookbackDays: integer('lookback_days').notNull().default(30),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_flows_project').on(table.projectId),
  index('idx_flows_project_status').on(table.projectId, table.status),
])

// ============ FLOW TRIPS ============

export const flowTrips = pgTable('flow_trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  flowId: uuid('flow_id').notNull().references(() => flows.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  currentNodeId: varchar('current_node_id', { length: 100 }).notNull(),
  context: jsonb('context').default('{}'),
  // Phase F3 — replay-idempotency key. The triggering event row's id; if a
  // session-resolution back-attribution re-publishes the same event later,
  // the unique index on (flow_id, customer_id, trigger_event_id) prevents
  // double-enrolment.
  triggerEventId: uuid('trigger_event_id'),
  enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  exitedAt: timestamp('exited_at', { withTimezone: true }),
}, (table) => [
  index('idx_trips_active').on(table.flowId, table.status),
  index('idx_trips_customer').on(table.customerId, table.flowId),
])

// ============ ANONYMOUS SESSIONS (Phase F3) ============
// Links a browser session_id to a customer once we know who they are.
// Source of truth for the back-attribution worker that re-attributes prior
// anonymous events when a session resolves.

export const anonymousSessions = pgTable('anonymous_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  // Worker outcome — NULL until the merge job runs
  eventsBackAttributed: integer('events_back_attributed'),
  flowsTriggered: integer('flows_triggered'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('idx_anon_sessions_unique').on(table.projectId, table.sessionId),
  index('idx_anon_sessions_customer').on(table.projectId, table.customerId),
])

// ============ SCHEDULED JOBS ============

export const scheduledJobs = pgTable('scheduled_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  flowTripId: uuid('flow_trip_id').notNull().references(() => flowTrips.id),
  executeAt: timestamp('execute_at', { withTimezone: true }).notNull(),
  action: jsonb('action').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_jobs_pending').on(table.status, table.executeAt),
])

// ============ CAMPAIGNS ============

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  channel: varchar('channel', { length: 20 }).notNull().default('email'), // email | sms | push
  deliveryType: varchar('delivery_type', { length: 20 }).notNull().default('one-time'), // one-time | periodic
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | scheduled | sending | sent | paused
  contentType: varchar('content_type', { length: 20 }).notNull().default('promotional'), // promotional | transactional
  segmentId: uuid('segment_id').references(() => segments.id),
  subject: varchar('subject', { length: 500 }),
  previewText: varchar('preview_text', { length: 500 }),
  htmlBody: text('html_body'),
  emailBuilderTemplate: jsonb('email_builder_template'),
  bodyText: text('body_text'),
  fromName: varchar('from_name', { length: 255 }),
  fromEmail: varchar('from_email', { length: 255 }),
  replyToEmail: varchar('reply_to_email', { length: 255 }),
  ccEmails: jsonb('cc_emails').notNull().default('[]'),
  bccEmails: jsonb('bcc_emails').notNull().default('[]'),
  gmailAnnotation: jsonb('gmail_annotation'),
  utmParameters: jsonb('utm_parameters'),
  periodicSchedule: jsonb('periodic_schedule'),
  templateId: uuid('template_id'),
  conversionGoals: jsonb('conversion_goals').notNull().default([]),
  goalTrackingHours: integer('goal_tracking_hours').notNull().default(36),
  currency: varchar('currency', { length: 3 }),
  // Gap 2: multi-platform push. Array of enabled platforms + per-platform
  // content map. See migration 0045 for the shape.
  pushPlatforms: jsonb('push_platforms').notNull().default([]),
  pushContent: jsonb('push_content').notNull().default({}),
  deliveryLimit: integer('delivery_limit'),
  ignoreFrequencyCap: boolean('ignore_frequency_cap').notNull().default(false),
  countForFrequencyCap: boolean('count_for_frequency_cap').notNull().default(true),
  sendTimeMode: varchar('send_time_mode', { length: 32 }).notNull().default('asap'),
  scheduleTimezone: varchar('schedule_timezone', { length: 64 }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  totalRecipients: integer('total_recipients').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  deliveredCount: integer('delivered_count').notNull().default(0),
  openedCount: integer('opened_count').notNull().default(0),
  clickedCount: integer('clicked_count').notNull().default(0),
  bouncedCount: integer('bounced_count').notNull().default(0),
  complainedCount: integer('complained_count').notNull().default(0),
  convertedCount: integer('converted_count').notNull().default(0),
  // A/B testing
  abTestEnabled: boolean('ab_test_enabled').notNull().default(false),
  abSplitPct: integer('ab_split_pct').notNull().default(50),
  abVariantBSubject: varchar('ab_variant_b_subject', { length: 500 }),
  abVariantBHtmlBody: text('ab_variant_b_html_body'),
  abVariantBBodyText: text('ab_variant_b_body_text'),
  abWinner: varchar('ab_winner', { length: 1 }),
  abWinnerMetric: varchar('ab_winner_metric', { length: 20 }).default('open_rate'),
  abAutoSendWinner: boolean('ab_auto_send_winner').notNull().default(false),
  abTestDurationHours: integer('ab_test_duration_hours').notNull().default(4),
  // Per-campaign variable mappings — overrides template defaults at send-time.
  variables: jsonb('variables').notNull().default('[]'),
  // Phase 1 — audience model v2. Inline filter (mutually exclusive with
  // segment_id), tags for list filtering, audience cap, control-group split.
  tags: jsonb('tags').notNull().default('[]'),
  audienceFilter: jsonb('audience_filter'),
  excludeAudienceFilter: jsonb('exclude_audience_filter'),
  audienceCap: integer('audience_cap'),
  controlGroupPct: integer('control_group_pct').notNull().default(0),
  controlGroupSeed: varchar('control_group_seed', { length: 64 }),
  // Soft-archive — hides the campaign from default list views without losing
  // its lifecycle state. NULL = active; non-NULL = archived at this time.
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_campaigns_project').on(table.projectId),
  index('idx_campaigns_status').on(table.projectId, table.status),
])

// ============ CAMPAIGN SENDS ============

export const campaignSends = pgTable('campaign_sends', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  email: varchar('email', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | sent | delivered | failed | bounced
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  clickedAt: timestamp('clicked_at', { withTimezone: true }),
  bouncedAt: timestamp('bounced_at', { withTimezone: true }),
  complainedAt: timestamp('complained_at', { withTimezone: true }),
  resendMessageId: varchar('resend_message_id', { length: 255 }),
  variant: varchar('variant', { length: 1 }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uniq_campaign_sends_campaign_customer').on(table.campaignId, table.customerId),
  index('idx_campaign_sends_campaign').on(table.campaignId, table.status),
  index('idx_campaign_sends_customer').on(table.customerId),
  index('idx_campaign_sends_resend_id').on(table.resendMessageId),
  index('idx_campaign_sends_variant').on(table.campaignId, table.variant),
])

export const campaignAttachments = pgTable('campaign_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  mime: varchar('mime', { length: 255 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  s3Key: text('s3_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_campaign_attachments_campaign').on(table.campaignId),
])

// ============ CAMPAIGN HOLDOUTS (control group) ============
// One row per (campaign, customer) where the customer was held back from the
// send for lift measurement. Send pipeline writes here at staging time;
// analytics joins on (campaign_id, customer_id) to compare conversion of
// recipients vs holdouts.

export const campaignHoldouts = pgTable('campaign_holdouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 20 }).notNull().default('control_group'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uniq_campaign_customer_holdout').on(table.campaignId, table.customerId),
  index('idx_campaign_holdouts_campaign').on(table.campaignId),
  index('idx_campaign_holdouts_customer').on(table.customerId),
])

// ============ EMAIL TEMPLATES ============

export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  // channel = 'email' | 'sms' | 'push' | 'whatsapp' | 'in_app'
  channel: varchar('channel', { length: 20 }).notNull().default('email'),
  subject: varchar('subject', { length: 500 }),
  htmlBody: text('html_body'),
  emailBuilderTemplate: jsonb('email_builder_template'),
  bodyText: text('body_text'),
  // Per-template variable mappings. See services/templateContext.ts for shape.
  variables: jsonb('variables').notNull().default('[]'),
  // In-app-specific fields (channel = 'in_app'). NULL for other channels.
  // Title is reused from `subject`; body from `bodyText` (kept for variable
  // resolution parity with email templates).
  imageUrl: text('image_url'),
  ctaLabel: text('cta_label'),
  ctaUrl: text('cta_url'),
  inAppPosition: text('in_app_position'),       // modal | banner | toast | inbox
  inAppFrequency: text('in_app_frequency'),     // always | once | daily
  inAppTargetPages: jsonb('in_app_target_pages'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_email_templates_project').on(table.projectId),
])

// ============ API KEYS ============

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull().default('Default'),
  keyPublic: varchar('key_public', { length: 255 }).notNull().unique(),
  keySecretHash: varchar('key_secret_hash', { length: 255 }).notNull(),
  permissions: jsonb('permissions').default('["write"]'), // ['read', 'write', 'admin']
  ipWhitelist: jsonb('ip_whitelist'), // string[] or null
  rateLimit: integer('rate_limit').notNull().default(1000), // requests per minute
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_api_keys_project').on(table.projectId),
  index('idx_api_keys_active').on(table.keyPublic),
])

// ============ ENTITIES (generic: orders, transactions, accounts, subscriptions) ============

export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').references(() => customers.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  // 'order' | 'transaction' | 'account' | 'subscription' | 'loan' | 'investment'
  externalId: varchar('external_id', { length: 255 }),
  status: varchar('status', { length: 50 }),
  attributes: jsonb('attributes').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_entities_project_type').on(table.projectId, table.entityType, table.createdAt),
  index('idx_entities_customer').on(table.projectId, table.customerId, table.entityType),
  uniqueIndex('idx_entities_external').on(table.projectId, table.entityType, table.externalId),
])

// ============ IDENTITIES (multi-identifier resolution) ============

export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  identifierType: varchar('identifier_type', { length: 30 }).notNull(),
  // 'email' | 'phone' | 'external_id' | 'device_id'
  identifierValue: varchar('identifier_value', { length: 255 }).notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_identities_unique').on(table.projectId, table.identifierType, table.identifierValue),
  index('idx_identities_customer').on(table.customerId),
])

// ============ CONSENTS ============

export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  channel: varchar('channel', { length: 20 }).notNull(), // 'email' | 'sms' | 'push' | 'whatsapp'
  purpose: varchar('purpose', { length: 20 }).notNull().default('promotional'),
  // 'transactional' | 'promotional'
  status: varchar('status', { length: 20 }).notNull().default('opted_in'),
  // 'opted_in' | 'opted_out'
  source: varchar('source', { length: 20 }), // 'app' | 'web' | 'api' | 'sms'
  provider: varchar('provider', { length: 30 }), // which channel provider observed the consent change
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_consents_customer').on(table.projectId, table.customerId, table.channel),
])

// ============ SUBSCRIPTION CATEGORIES ============

export const subscriptionCategories = pgTable('subscription_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  channel: varchar('channel', { length: 20 }), // null = all channels
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uniq_subscription_category_name').on(table.projectId, table.name),
  index('idx_subscription_categories_project').on(table.projectId, table.isActive),
])

export const customerSubscriptions = pgTable('customer_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => subscriptionCategories.id, { onDelete: 'cascade' }),
  optedInAt: timestamp('opted_in_at', { withTimezone: true }).notNull().defaultNow(),
  optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
  source: varchar('source', { length: 30 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uniq_customer_subscription_category').on(table.customerId, table.categoryId),
  index('idx_customer_subscriptions_category').on(table.projectId, table.categoryId, table.optedOutAt),
  index('idx_customer_subscriptions_customer').on(table.customerId),
])

export const campaignSubscriptionCategories = pgTable('campaign_subscription_categories', {
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => subscriptionCategories.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uniq_campaign_subscription_category').on(table.campaignId, table.categoryId),
  index('idx_campaign_subscription_categories_category').on(table.categoryId),
])

// ============ EMAIL SUPPRESSIONS (per-tenant block list) ============
// Phase E2.2 — every hard bounce, spam complaint, or unsubscribe lands here
// and the campaign dispatcher excludes any (project_id, email) match before
// sending. Without this we re-hit known-bad addresses on every campaign,
// which is exactly what mailbox providers treat as spammer behaviour.

export const emailSuppressions = pgTable('email_suppressions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  reason: varchar('reason', { length: 20 }).notNull(),
  // 'hard_bounce' | 'complained' | 'unsubscribed' | 'manual'
  suppressedAt: timestamp('suppressed_at', { withTimezone: true }).notNull().defaultNow(),
  source: varchar('source', { length: 50 }),
  metadata: jsonb('metadata').default('{}'),
}, (table) => [
  uniqueIndex('idx_email_suppressions_lookup').on(table.projectId, sql`lower(${table.email})`),
  index('idx_email_suppressions_reason').on(table.projectId, table.reason),
])

// ============ UNSUBSCRIBE TOKENS (List-Unsubscribe header) ============
// Each (project, customer, channel) gets one token; included in the
// List-Unsubscribe header on every send so Gmail/Yahoo can offer a
// one-click unsubscribe button (required Feb 2024+ for senders >5K/day).

export const unsubscribeTokens = pgTable('unsubscribe_tokens', {
  token: varchar('token', { length: 64 }).primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 20 }).notNull().default('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp('used_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('idx_unsub_tokens_customer').on(table.projectId, table.customerId, table.channel),
])

// ============ CATALOGUES (generic item type definitions per project) ============

export const catalogues = pgTable('catalogues', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  itemTypeLabel: varchar('item_type_label', { length: 100 }).notNull(), // "Product", "Loan", "Course", "Plan"
  attributeSchema: jsonb('attribute_schema').default('[]'), // [{name, type, values?, weight?}]
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_catalogues_project').on(table.projectId),
  uniqueIndex('idx_catalogues_name').on(table.projectId, table.name),
])

// ============ ITEMS (generic: products, loans, courses, plans) ============

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  catalogueId: uuid('catalogue_id').notNull().references(() => catalogues.id),
  externalId: varchar('external_id', { length: 255 }),
  type: varchar('type', { length: 100 }).notNull(), // "product", "gold_loan", "personal_loan", "course"
  name: varchar('name', { length: 500 }).notNull(),
  attributes: jsonb('attributes').default('{}'), // JSONB for flexible schema
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_items_external').on(table.projectId, table.catalogueId, table.externalId),
  index('idx_items_project').on(table.projectId, table.type),
  index('idx_items_catalogue').on(table.catalogueId),
])

// ============ INTERACTIONS (computed user-item relationships) ============

export const interactions = pgTable('interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  itemId: uuid('item_id').notNull().references(() => items.id),
  interactionType: varchar('interaction_type', { length: 30 }).notNull(),
  // 'view' | 'engage' | 'intent' | 'strong_intent' | 'conversion'
  weight: decimal('weight', { precision: 6, scale: 3 }).notNull(),
  sourceEventId: uuid('source_event_id').references(() => events.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_interactions_customer').on(table.projectId, table.customerId, table.createdAt),
  index('idx_interactions_item').on(table.projectId, table.itemId, table.createdAt),
  index('idx_interactions_type').on(table.projectId, table.interactionType, table.createdAt),
])

// ============ INTERACTION CONFIGS (event → interaction weight mapping) ============

export const interactionConfigs = pgTable('interaction_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  catalogueId: uuid('catalogue_id').notNull().references(() => catalogues.id),
  eventName: varchar('event_name', { length: 100 }).notNull(),
  interactionType: varchar('interaction_type', { length: 30 }).notNull(),
  weight: decimal('weight', { precision: 6, scale: 3 }).notNull(),
  decayHalfLifeDays: integer('decay_half_life_days').notNull().default(30),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_interaction_configs_unique').on(table.projectId, table.catalogueId, table.eventName),
  index('idx_interaction_configs_project').on(table.projectId),
])

// ============ MESSAGES (unified delivery tracking) ============

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  channel: varchar('channel', { length: 20 }).notNull(), // 'email' | 'sms' | 'push' | 'whatsapp' | 'inapp'
  messageType: varchar('message_type', { length: 20 }).notNull(), // 'promotional' | 'transactional'
  templateId: varchar('template_id', { length: 255 }),
  variables: jsonb('variables').default('{}'),
  status: varchar('status', { length: 20 }).notNull().default('queued'),
  // 'queued' | 'sent' | 'delivered' | 'read' | 'clicked' | 'failed' | 'blocked'
  blockReason: varchar('block_reason', { length: 50 }),
  // 'consent_blocked' | 'frequency_capped' | 'user_inactive' | 'no_channel_reachability'
  countsTowardFrequencyCap: boolean('counts_toward_frequency_cap').notNull().default(true),
  provider: varchar('provider', { length: 20 }), // 'pinnacle' | 'resend'
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  flowTripId: uuid('flow_trip_id').references(() => flowTrips.id),
  campaignId: uuid('campaign_id').references(() => campaigns.id),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  clickedAt: timestamp('clicked_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_messages_customer').on(table.projectId, table.customerId, table.createdAt),
  index('idx_messages_status').on(table.projectId, table.status, table.createdAt),
  index('idx_messages_provider').on(table.providerMessageId),
  index('idx_messages_campaign').on(table.campaignId),
  index('idx_messages_flow').on(table.flowTripId),
])

// ============ CONSENT AUDIT LOG (append-only, immutable) ============

export const consentAuditLog = pgTable('consent_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  channel: varchar('channel', { length: 20 }).notNull(),
  messageType: varchar('message_type', { length: 20 }).notNull(),
  action: varchar('action', { length: 20 }).notNull(), // 'opt_in' | 'opt_out'
  source: varchar('source', { length: 20 }).notNull(), // 'sdk' | 'api' | 'admin' | 'webhook'
  consentText: text('consent_text'), // exact text shown (for regulated industries)
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_consent_audit_customer').on(table.projectId, table.customerId, table.createdAt),
])

// ============ PREDICTION GOALS ============

export const predictionGoals = pgTable('prediction_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  targetEvent: varchar('target_event', { length: 100 }).notNull(),
  observationWindowDays: integer('observation_window_days').notNull().default(90),
  predictionWindowDays: integer('prediction_window_days').notNull().default(14),
  minPositiveLabels: integer('min_positive_labels').notNull().default(200),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  // 'active' | 'paused' | 'insufficient_data'
  lastTrainedAt: timestamp('last_trained_at', { withTimezone: true }),
  currentMetric: decimal('current_metric', { precision: 6, scale: 4 }),
  origin: varchar('origin', { length: 20 }).notNull().default('user'), // 'pack' | 'user'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_prediction_goals_project').on(table.projectId),
  uniqueIndex('idx_prediction_goals_name').on(table.projectId, table.name),
])

// ============ COMMUNICATION LOG ============

export const communicationLog = pgTable('communication_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  channel: varchar('channel', { length: 20 }).notNull(), // 'email' | 'sms' | 'push' | 'whatsapp'
  messageType: varchar('message_type', { length: 20 }).notNull(), // 'campaign' | 'flow' | 'transactional'
  templateId: varchar('template_id', { length: 255 }),
  contentHash: varchar('content_hash', { length: 64 }), // SHA-256
  status: varchar('status', { length: 20 }).notNull(), // 'sent' | 'delivered' | 'failed' | 'read'
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_comlog_customer').on(table.projectId, table.customerId, table.createdAt),
  index('idx_comlog_channel').on(table.projectId, table.channel, table.createdAt),
])

// ============ SAVED ANALYSES ============

export const savedAnalyses = pgTable('saved_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  // 'funnel' | 'timeseries' | 'time_to_event' | 'product' | 'cohort'
  config: jsonb('config').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_saved_analyses_project').on(table.projectId, table.type),
])

// ============ SEGMENT SNAPSHOTS ============

export const segmentSnapshots = pgTable('segment_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  segmentId: uuid('segment_id').notNull().references(() => segments.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  snapshotDate: timestamp('snapshot_date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_segment_snapshots_lookup').on(table.projectId, table.snapshotDate),
  index('idx_segment_snapshots_segment').on(table.segmentId, table.snapshotDate),
])

// ============ PREDICTION TRAINING RUNS ============
// One row per training attempt per goal. Powers drift detection + retrain
// transparency in the Predictions UI.

export const predictionTrainingRuns = pgTable('prediction_training_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id').notNull().references(() => predictionGoals.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  trainedAt: timestamp('trained_at', { withTimezone: true }).notNull().defaultNow(),
  status: varchar('status', { length: 30 }).notNull(), // success | insufficient_data | failed | error
  auc: decimal('auc', { precision: 6, scale: 4 }),
  baselineAuc: decimal('baseline_auc', { precision: 6, scale: 4 }),
  lift: decimal('lift', { precision: 6, scale: 4 }),
  nPositive: integer('n_positive'),
  reason: text('reason'),
  durationMs: integer('duration_ms'),
  // JSONB array of segment performance breakdowns — see migration 0056.
  segmentMetrics: jsonb('segment_metrics'),
}, (table) => [
  index('idx_training_runs_goal').on(table.goalId, table.trainedAt),
  index('idx_training_runs_project').on(table.projectId, table.trainedAt),
])

// ============ PREDICTION MODEL VERSIONS ============
// One row per successful model trained for a goal. is_active flags the
// version that the Python ML service is currently serving — promote/
// rollback flips this. Backbone for champion/challenger.

export const predictionModelVersions = pgTable('prediction_model_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id').notNull().references(() => predictionGoals.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  modelVersion: varchar('model_version', { length: 64 }).notNull(),
  trainAuc: decimal('train_auc', { precision: 6, scale: 4 }),
  baselineAuc: decimal('baseline_auc', { precision: 6, scale: 4 }),
  trainedAt: timestamp('trained_at', { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(false),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  notes: text('notes'),
})

// ============ PREDICTION SCORES ============

export const predictionScores = pgTable('prediction_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  goalId: uuid('goal_id').notNull().references(() => predictionGoals.id),
  score: decimal('score', { precision: 5, scale: 2 }).notNull(), // 0-100
  confidence: decimal('confidence', { precision: 4, scale: 3 }).notNull(), // 0-1
  bucket: varchar('bucket', { length: 10 }).notNull(), // 'High' | 'Medium' | 'Low'
  factors: jsonb('factors').notNull().default('[]'),
  modelVersion: varchar('model_version', { length: 50 }),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_prediction_scores_customer').on(table.projectId, table.customerId),
  index('idx_prediction_scores_goal').on(table.goalId, table.computedAt),
])

// ============ ADMIN USERS (admin panel authentication) ============

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }), // nullable for OAuth-only users
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull().default('admin'),
  // 'admin' | 'manager' | 'agent' — only admin sees everything; manager/agent are scoped via agentId
  agentId: uuid('agent_id').references(() => agents.id),
  projectId: uuid('project_id').references(() => projects.id),
  emailVerified: boolean('email_verified').notNull().default(false),
  totpSecret: varchar('totp_secret', { length: 255 }),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_admin_users_email').on(table.email),
  index('idx_admin_users_project').on(table.projectId),
  index('idx_admin_users_agent').on(table.agentId),
])

// ============ PASSWORD RESET TOKENS ============

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => adminUsers.id),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_password_reset_token_hash').on(table.tokenHash),
  index('idx_password_reset_user').on(table.userId),
])

// ============ OAUTH ACCOUNTS (link external providers to admin users) ============

export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => adminUsers.id),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_oauth_provider_account').on(table.provider, table.providerAccountId),
  index('idx_oauth_user').on(table.userId),
])

// ============ OPT-IN WIDGETS (Phase F2b) ============
// Configurable storefront opt-in forms; merchant CRUDs in the admin panel,
// SDK reads via /v1/widgets and renders. consent_text mandatory — DPDP
// requires the exact wording shown to the user be auditable.

export const optinWidgets = pgTable('optin_widgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  headline: varchar('headline', { length: 255 }).notNull(),
  body: text('body'),
  buttonLabel: varchar('button_label', { length: 80 }).notNull().default('Get the discount'),
  consentText: text('consent_text').notNull(),
  triggerType: varchar('trigger_type', { length: 30 }).notNull(),
  triggerConfig: jsonb('trigger_config').notNull().default('{}'),
  targetPages: jsonb('target_pages').notNull().default('[]'),
  showOnce: boolean('show_once').notNull().default(true),
  collectEmail: boolean('collect_email').notNull().default(false),
  collectName: boolean('collect_name').notNull().default(false),
  phoneRequired: boolean('phone_required').notNull().default(true),
  preCheckConsent: boolean('pre_check_consent').notNull().default(false),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_optin_widgets_project').on(table.projectId),
])

// ============ CTWA ATTRIBUTIONS (Phase F2a) ============
// One row per (project, customer, ad). The merchant's primary growth signal —
// every CTWA click that turns into a conversation is a list-add with full
// attribution. Updated on each subsequent inbound (last_inbound_at, inbound_count)
// and on the first attributed order (first_purchase_at, attributed_revenue).

export const ctwaAttributions = pgTable('ctwa_attributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  adId: varchar('ad_id', { length: 255 }).notNull(),
  sourceType: varchar('source_type', { length: 40 }),
  sourceUrl: varchar('source_url', { length: 2048 }),
  sourceId: varchar('source_id', { length: 255 }),
  headline: varchar('headline', { length: 512 }),
  body: text('body'),
  mediaType: varchar('media_type', { length: 40 }),
  imageUrl: varchar('image_url', { length: 2048 }),
  ctwaClid: varchar('ctwa_clid', { length: 255 }),
  firstInboundAt: timestamp('first_inbound_at', { withTimezone: true }).notNull().defaultNow(),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }).notNull().defaultNow(),
  inboundCount: integer('inbound_count').notNull().default(1),
  firstPurchaseAt: timestamp('first_purchase_at', { withTimezone: true }),
  attributedRevenue: decimal('attributed_revenue', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_ctwa_attributions_unique').on(table.projectId, table.customerId, table.adId),
  index('idx_ctwa_attributions_project_ad').on(table.projectId, table.adId, table.firstInboundAt),
])

export const whatsappTemplates = pgTable('whatsapp_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 30 }).notNull(),
  providerTemplateId: varchar('provider_template_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  language: varchar('language', { length: 20 }).notNull(),
  category: varchar('category', { length: 50 }),
  status: varchar('status', { length: 30 }).notNull().default('PENDING'),
  bodyText: text('body_text').notNull(),
  header: jsonb('header'),
  footer: text('footer'),
  buttons: jsonb('buttons'),
  parameterCount: integer('parameter_count').notNull().default(0),
  rawPayload: jsonb('raw_payload'),
  // Phase F1b — submission lifecycle + re-categorisation detection.
  // submittedAt set when the merchant submits *through* Storees;
  // NULL = the row was synced FROM the provider, not submitted by us.
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  lastStatusCheckAt: timestamp('last_status_check_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  previousCategory: varchar('previous_category', { length: 50 }),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_wa_templates_unique').on(table.projectId, table.provider, table.name, table.language),
  index('idx_wa_templates_status').on(table.projectId, table.status),
])

export const whatsappInboundMessages = pgTable('whatsapp_inbound_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  fromPhone: varchar('from_phone', { length: 50 }).notNull(),
  provider: varchar('provider', { length: 30 }).notNull(),
  providerMessageId: varchar('provider_message_id', { length: 255 }).notNull(),
  content: text('content'),
  mediaUrl: text('media_url'),
  mediaType: varchar('media_type', { length: 50 }),
  replyTo: varchar('reply_to', { length: 255 }),
  rawPayload: jsonb('raw_payload'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_wa_inbound_idem').on(table.provider, table.providerMessageId),
  index('idx_wa_inbound_customer').on(table.projectId, table.customerId, table.receivedAt),
  index('idx_wa_inbound_phone').on(table.projectId, table.fromPhone, table.receivedAt),
])

// ============ DATA SOURCE CONNECTORS ============
// See migration 0043_data_source_connectors.sql for column-level docs.

export const dataSourceConnectors = pgTable('data_source_connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  template: varchar('template', { length: 50 }).notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  authConfig: text('auth_config').notNull(),
  config: jsonb('config').notNull().default({}),
  lastSyncedAt: jsonb('last_synced_at').notNull().default({}),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_data_source_connectors_project').on(table.projectId, table.status),
])

export const dataSourceSyncs = pgTable('data_source_syncs', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectorId: uuid('connector_id').notNull().references(() => dataSourceConnectors.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('queued'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  stats: jsonb('stats').notNull().default({}),
  errorSummary: text('error_summary'),
  triggeredBy: uuid('triggered_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_data_source_syncs_connector').on(table.connectorId, table.createdAt),
])

export const dataSourceSyncLogs = pgTable('data_source_sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  syncId: uuid('sync_id').notNull().references(() => dataSourceSyncs.id, { onDelete: 'cascade' }),
  level: varchar('level', { length: 10 }).notNull(),
  entityType: varchar('entity_type', { length: 20 }),
  entityId: text('entity_id'),
  message: text('message').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_data_source_sync_logs_sync').on(table.syncId, table.createdAt),
])

// IN-APP MESSAGES: see migration 0048 (initial standalone tables) +
// 0049 (unification — moved to email_templates + campaigns alongside the
// other channels). The dedicated in_app_messages + in_app_message_views
// tables were dropped; in-app content is now an email_templates row with
// channel='in_app' + the in_app_* fields, wired to a campaign of the
// same channel for audience targeting.

// ============ AD CONVERSION DESTINATIONS (Gap 9) ============
// See migration 0046 for the column-level docs.

export const adConversionDestinations = pgTable('ad_conversion_destinations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 20 }).notNull(),
  name: text('name').notNull(),
  pixelId: text('pixel_id').notNull(),
  accessToken: text('access_token').notNull(),  // encrypted at rest
  testEventCode: text('test_event_code'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  eventsSent: integer('events_sent').notNull().default(0),
  eventsFailed: integer('events_failed').notNull().default(0),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_ad_conv_dest_unique').on(table.projectId, table.platform, table.pixelId),
  index('idx_ad_conv_dest_project_active').on(table.projectId, table.status),
])
