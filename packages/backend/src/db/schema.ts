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
  webhookSecret: varchar('webhook_secret', { length: 255 }),
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
  platform: varchar('platform', { length: 30 }).notNull(),
  sessionId: varchar('session_id', { length: 255 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_events_trigger').on(table.projectId, table.eventName, table.timestamp),
  index('idx_events_customer').on(table.projectId, table.customerId, table.timestamp),
  index('idx_events_recent').on(table.projectId, table.receivedAt),
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
})

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
})

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
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | scheduled | sending | sent | paused
  segmentId: uuid('segment_id').references(() => segments.id),
  subject: varchar('subject', { length: 500 }).notNull(),
  htmlBody: text('html_body').notNull(),
  fromName: varchar('from_name', { length: 255 }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  totalRecipients: integer('total_recipients').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
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
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | sent | failed
  sentAt: timestamp('sent_at', { withTimezone: true }),
  resendMessageId: varchar('resend_message_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_campaign_sends_campaign').on(table.campaignId, table.status),
  index('idx_campaign_sends_customer').on(table.customerId),
])

// ============ EMAIL TEMPLATES ============

export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 500 }).notNull(),
  htmlBody: text('html_body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
