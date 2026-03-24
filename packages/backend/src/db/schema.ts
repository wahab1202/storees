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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============ CUSTOMERS ============

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  externalId: varchar('external_id', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  name: varchar('name', { length: 255 }),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  totalOrders: integer('total_orders').notNull().default(0),
  totalSpent: decimal('total_spent', { precision: 12, scale: 2 }).notNull().default('0'),
  avgOrderValue: decimal('avg_order_value', { precision: 12, scale: 2 }).notNull().default('0'),
  clv: decimal('clv', { precision: 12, scale: 2 }).notNull().default('0'),
  emailSubscribed: boolean('email_subscribed').notNull().default(false),
  smsSubscribed: boolean('sms_subscribed').notNull().default(false),
  pushSubscribed: boolean('push_subscribed').notNull().default(false),
  whatsappSubscribed: boolean('whatsapp_subscribed').notNull().default(false),
  customAttributes: jsonb('custom_attributes').default('{}'),
  metrics: jsonb('metrics').default('{}'), // Precomputed domain-specific metrics
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_customers_project').on(table.projectId),
  uniqueIndex('idx_customers_external').on(table.projectId, table.externalId),
  index('idx_customers_email').on(table.projectId, table.email),
  index('idx_customers_last_seen').on(table.projectId, table.lastSeen),
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
  shopifyProductId: varchar('shopify_product_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  productType: varchar('product_type', { length: 255 }).default(''),
  vendor: varchar('vendor', { length: 255 }).default(''),
  imageUrl: varchar('image_url', { length: 2048 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_products_shopify').on(table.projectId, table.shopifyProductId),
  index('idx_products_project').on(table.projectId),
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
  enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  exitedAt: timestamp('exited_at', { withTimezone: true }),
}, (table) => [
  index('idx_trips_active').on(table.flowId, table.status),
  index('idx_trips_customer').on(table.customerId, table.flowId),
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
  bodyText: text('body_text'),
  fromName: varchar('from_name', { length: 255 }),
  periodicSchedule: jsonb('periodic_schedule'),
  templateId: uuid('template_id'),
  conversionGoals: jsonb('conversion_goals').notNull().default([]),
  goalTrackingHours: integer('goal_tracking_hours').notNull().default(36),
  deliveryLimit: integer('delivery_limit'),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_campaign_sends_campaign').on(table.campaignId, table.status),
  index('idx_campaign_sends_customer').on(table.customerId),
  index('idx_campaign_sends_resend_id').on(table.resendMessageId),
])

// ============ EMAIL TEMPLATES ============

export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  channel: varchar('channel', { length: 20 }).notNull().default('email'),
  subject: varchar('subject', { length: 500 }),
  htmlBody: text('html_body'),
  bodyText: text('body_text'),
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
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_consents_customer').on(table.projectId, table.customerId, table.channel),
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
