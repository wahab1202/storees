import { Router, Request, Response } from 'express'
import { sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { events } from '../db/schema.js'
import { requirePublicKeyAuth } from '../middleware/apiKeyAuth.js'
import { rateLimiter } from '../middleware/rateLimiter.js'
import { resolveCustomer as resolveCustomerService } from '../services/customerService.js'
import { bulkUpsertProducts, type ProductImport } from '../services/productCatalogService.js'
import { customerAggregateQueue } from '../services/queue.js'

/**
 * Bulk import endpoints — one-time historical data loaders.
 *
 * Use case: a new client signs up with N years of order history sitting in
 * their DB. Without these endpoints, their Storees dashboard starts empty —
 * total_spent = 0 for everyone, no segments work, no LTV signal.
 *
 * Pattern: client POSTs arrays of records, we generate synthetic events with
 * the ORIGINAL timestamp and `historical: true` flag. The customer-aggregate
 * worker folds them into the running totals (same pipeline as live events).
 * The trigger worker skips them so a "welcome email" flow doesn't fire for
 * 16,000 customers from last year.
 *
 * Auth: same API key as /v1/events. Rate limited but generously — bulk
 * imports are heavy by nature.
 *
 * Same shape as Klaviyo / Customer.io / Iterable historical-import APIs.
 */

const router = Router()

router.use(requirePublicKeyAuth())
router.use(rateLimiter(2000))  // higher than events — bulk import is the point

const MAX_BATCH = 1000

// ── /api/v1/import/customers ─────────────────────────────────────────────────
// Upsert customer profiles. No event emitted — customers table itself is
// updated. Use this BEFORE /import/orders so the order JOIN finds them.

type CustomerImport = {
  customer_id?: string          // becomes external_id in Storees
  email?: string
  phone?: string
  name?: string
  region?: string
  city?: string
  email_subscribed?: boolean
  sms_subscribed?: boolean
  /** External dealer ID (GWM B2B). Stored on customers.custom_attributes.dealer_id
   *  for deferred linkage. If the agent row already exists, customers.agent_id
   *  is stamped immediately. */
  dealer_id?: string
}

router.post('/import/customers', async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId!
    const body = req.body as { customers?: CustomerImport[] }
    const inputs = body.customers ?? []

    if (!Array.isArray(inputs) || inputs.length === 0) {
      return res.status(400).json({ success: false, error: 'customers array required' })
    }
    if (inputs.length > MAX_BATCH) {
      return res.status(400).json({ success: false, error: `Batch size limited to ${MAX_BATCH}` })
    }

    let resolved = 0
    let failed = 0
    const errors: Array<{ index: number; error: string }> = []

    // Bounded concurrency. resolveCustomer has its own ON CONFLICT path so
    // races between two imports of the same external_id are safe.
    const CONCURRENCY = 20
    for (let i = 0; i < inputs.length; i += CONCURRENCY) {
      const batch = inputs.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(async (input, batchIdx) => {
          try {
            await resolveCustomerService({
              projectId,
              externalId: input.customer_id,
              email: input.email ?? null,
              phone: input.phone ?? null,
              name: input.name ?? null,
              region: input.region ?? null,
              city: input.city ?? null,
              emailSubscribed: input.email_subscribed,
              smsSubscribed: input.sms_subscribed,
              agentExternalDealerId: input.dealer_id?.trim() || null,
            })
            resolved++
          } catch (err) {
            failed++
            errors.push({
              index: i + batchIdx,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }),
      )
      // results array exists for completeness — Promise.allSettled never throws
      void results
    }

    res.json({
      success: true,
      data: { resolved, failed, errors: errors.slice(0, 20) },
    })
  } catch (err) {
    console.error('Bulk customer import error:', err)
    res.status(500).json({ success: false, error: 'Failed to import customers' })
  }
})

// ── /api/v1/import/orders ────────────────────────────────────────────────────
// Insert historical orders as `order_placed` events. Flagged historical:true
// so flows + campaign triggers skip them; aggregator still folds them into
// customer totals.

type OrderImport = {
  customer_id: string                  // external_id of the customer
  order_id: string                     // unique per merchant — becomes idempotency_key
  timestamp: string                    // ISO 8601 — when the order originally happened
  total: number                        // numeric, in the same currency as `currency`
  currency?: string                    // ISO 4217 — default 'INR'
  line_items?: Array<{
    product_id?: string
    product_name?: string
    product_type?: string
    product_collection?: string
    quantity?: number
    price?: number
  }>
}

router.post('/import/orders', async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId!
    const body = req.body as { orders?: OrderImport[] }
    const inputs = body.orders ?? []

    if (!Array.isArray(inputs) || inputs.length === 0) {
      return res.status(400).json({ success: false, error: 'orders array required' })
    }
    if (inputs.length > MAX_BATCH) {
      return res.status(400).json({ success: false, error: `Batch size limited to ${MAX_BATCH}` })
    }

    let imported = 0
    let deduped = 0
    let unresolved = 0
    const errors: Array<{ index: number; error: string }> = []

    // Phase 1 — resolve every customer_id (external_id) → Storees customer.id.
    // Skip records whose customer isn't found; client should have called
    // /import/customers first.
    type ResolvedOrder = { idx: number; input: OrderImport; customerId: string }
    const resolvedOrders: ResolvedOrder[] = []

    const CONCURRENCY = 20
    for (let i = 0; i < inputs.length; i += CONCURRENCY) {
      const batch = inputs.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(async (input, batchIdx) => {
          if (!input.customer_id || !input.order_id || !input.timestamp) {
            errors.push({ index: i + batchIdx, error: 'customer_id, order_id, timestamp required' })
            return null
          }
          try {
            const customerId = await resolveCustomerService({
              projectId,
              externalId: input.customer_id,
            })
            return { idx: i + batchIdx, input, customerId }
          } catch {
            unresolved++
            return null
          }
        }),
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) resolvedOrders.push(r.value)
      }
    }

    // Phase 2 — bulk insert events with `historical: true` flag. Idempotency
    // key = "order_placed_historical:<order_id>" so re-imports dedup.
    const INSERT_BATCH = 500
    type InsertedEvent = { id: string; customerId: string; eventName: string; properties: Record<string, unknown>; timestamp: Date }
    const inserted: InsertedEvent[] = []

    for (let i = 0; i < resolvedOrders.length; i += INSERT_BATCH) {
      const chunk = resolvedOrders.slice(i, i + INSERT_BATCH)
      const rows = chunk.map(r => ({
        projectId,
        customerId: r.customerId,
        eventName: 'order_placed',
        properties: {
          order_id: r.input.order_id,
          total: r.input.total,
          currency: r.input.currency ?? 'INR',
          line_items: r.input.line_items ?? [],
          historical: true,
        },
        platform: 'api',
        source: 'import',
        idempotencyKey: `order_placed_historical:${r.input.order_id}`,
        timestamp: new Date(r.input.timestamp),
      }))

      // ON CONFLICT DO NOTHING for idempotency_key — re-running an import
      // for the same order doesn't double-count.
      const insertedRows = await db
        .insert(events)
        .values(rows)
        .onConflictDoNothing({ target: [events.projectId, events.idempotencyKey] })
        .returning({
          id: events.id,
          customerId: events.customerId,
          eventName: events.eventName,
          properties: events.properties,
          timestamp: events.timestamp,
        })

      imported += insertedRows.length
      deduped += chunk.length - insertedRows.length
      for (const row of insertedRows) {
        if (!row.customerId) continue
        inserted.push({
          id: row.id,
          customerId: row.customerId,
          eventName: row.eventName,
          properties: (row.properties as Record<string, unknown>) ?? {},
          timestamp: row.timestamp,
        })
      }
    }

    // Phase 3 — enqueue aggregate jobs so customer totals reflect the import.
    // Same pipeline as live events; the historical:true flag will tell the
    // trigger worker to skip flow firing.
    if (inserted.length > 0) {
      await customerAggregateQueue.addBulk(
        inserted.map(ev => ({
          name: ev.eventName,
          data: {
            eventId: ev.id,
            projectId,
            customerId: ev.customerId,
            eventName: ev.eventName,
            properties: ev.properties,
            timestamp: ev.timestamp.toISOString(),
          },
        })),
      )
    }

    res.json({
      success: true,
      data: { imported, deduped, unresolved, errors: errors.slice(0, 20) },
    })
  } catch (err) {
    console.error('Bulk order import error:', err)
    res.status(500).json({ success: false, error: 'Failed to import orders' })
  }
})

// ── /api/v1/import/products ──────────────────────────────────────────────────
// Upsert catalogue products. Optionally each row carries a `collections`
// array of names — those auto-upsert into the collections table and link
// via product_collections. Use when the client has a catalog to sync
// independent of orders (browse pages, recommendations, etc.).
//
// Live activity (order_placed events) already auto-populates products via
// customerAggregateWorker's line-item extraction, so this endpoint is for
// the cold-path case: initial catalogue load, or merchandising imports
// of products that haven't sold yet.

router.post('/import/products', async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId!
    const body = req.body as { products?: ProductImport[] }
    const inputs = body.products ?? []

    if (!Array.isArray(inputs) || inputs.length === 0) {
      return res.status(400).json({ success: false, error: 'products array required' })
    }
    if (inputs.length > MAX_BATCH) {
      return res.status(400).json({ success: false, error: `Batch size limited to ${MAX_BATCH}` })
    }

    const { imported, errors } = await bulkUpsertProducts(projectId, inputs)

    res.json({
      success: true,
      data: { imported, errors: errors.slice(0, 20) },
    })
  } catch (err) {
    console.error('Bulk product import error:', err)
    res.status(500).json({ success: false, error: 'Failed to import products' })
  }
})

// ── /api/v1/import/dealers ───────────────────────────────────────────────────
// Upsert B2B dealers into the agents table. Matches the GWM
// /admin/storees-cdp/export/dealers payload shape (see
// docs.gowelmart.com / STOREES_DEALERS_EXPORT.md). Keyed by
// (project_id, external_dealer_id) — re-running the same payload is a no-op.
//
// Side-effect: after each upsert we backlink any customers already in this
// project whose custom_attributes.dealer_id matches the synced dealer AND
// whose agent_id is still NULL. Lets clients send dealers and customers in
// either order — eventually-consistent.
//
// Only dealers with status='Approved' are flagged is_active=true; others are
// imported but inactive (segment builder dropdown filters by is_active).

type DealerImport = {
  dealer_id: string
  name: string
  email?: string | null
  phone?: string | null
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Blocked' | string
  region?: string | null
  state?: string | null      // alias of region
  city?: string | null
  address_1?: string | null
  address_2?: string | null
  postal_code?: string | null
  country?: string | null
  gst_number?: string | null
  pan_number?: string | null
  assigned_districts?: string[] | null
  created_at?: string | null
  updated_at?: string | null
  custom_attributes?: Record<string, unknown> | null
}

router.post('/import/dealers', async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId!
    const body = req.body as { dealers?: DealerImport[] }
    const inputs = body.dealers ?? []

    if (!Array.isArray(inputs) || inputs.length === 0) {
      return res.status(400).json({ success: false, error: 'dealers array required' })
    }
    if (inputs.length > MAX_BATCH) {
      return res.status(400).json({ success: false, error: `Batch size limited to ${MAX_BATCH}` })
    }

    let resolved = 0
    let failed = 0
    let customersLinked = 0
    const errors: Array<{ index: number; error: string }> = []

    const CONCURRENCY = 20
    for (let i = 0; i < inputs.length; i += CONCURRENCY) {
      const batch = inputs.slice(i, i + CONCURRENCY)
      await Promise.allSettled(
        batch.map(async (input, batchIdx) => {
          try {
            const dealerId = input.dealer_id?.trim()
            const name = input.name?.trim()
            if (!dealerId || !name) {
              throw new Error('dealer_id and name are required')
            }

            const isActive = input.status === undefined || input.status === 'Approved'
            const region = input.region?.trim() || input.state?.trim() || null
            const city = input.city?.trim() || null

            // Bucket everything that doesn't map to a dedicated column into
            // metadata so segment-builder enrichment can still reach it.
            const metadata: Record<string, unknown> = {}
            if (input.status)             metadata.status = input.status
            if (input.address_1)          metadata.address_1 = input.address_1
            if (input.address_2)          metadata.address_2 = input.address_2
            if (input.state)              metadata.state = input.state
            if (input.postal_code)        metadata.postal_code = input.postal_code
            if (input.country)            metadata.country = input.country
            if (input.gst_number)         metadata.gst_number = input.gst_number
            if (input.pan_number)         metadata.pan_number = input.pan_number
            if (input.assigned_districts) metadata.assigned_districts = input.assigned_districts
            if (input.custom_attributes)  metadata.custom_attributes = input.custom_attributes
            if (input.created_at)         metadata.external_created_at = input.created_at
            if (input.updated_at)         metadata.external_updated_at = input.updated_at

            const linked = await db.transaction(async (tx) => {
              await tx.execute(sql`
                INSERT INTO agents (project_id, external_dealer_id, name, email, phone, region, city, is_active, metadata)
                VALUES (
                  ${projectId},
                  ${dealerId},
                  ${name},
                  ${input.email?.trim() || null},
                  ${input.phone?.trim() || null},
                  ${region},
                  ${city},
                  ${isActive},
                  ${JSON.stringify(metadata)}::jsonb
                )
                ON CONFLICT (project_id, external_dealer_id) DO UPDATE SET
                  name       = EXCLUDED.name,
                  email      = EXCLUDED.email,
                  phone      = EXCLUDED.phone,
                  region     = EXCLUDED.region,
                  city       = EXCLUDED.city,
                  is_active  = EXCLUDED.is_active,
                  metadata   = EXCLUDED.metadata,
                  updated_at = NOW()
              `)

              // Backlink customers carrying this dealer_id but no agent yet.
              const link = await tx.execute(sql`
                UPDATE customers c
                SET agent_id = a.id, updated_at = NOW()
                FROM agents a
                WHERE a.project_id = ${projectId}
                  AND a.external_dealer_id = ${dealerId}
                  AND c.project_id = ${projectId}
                  AND c.agent_id IS NULL
                  AND c.custom_attributes->>'dealer_id' = ${dealerId}
              `)
              return link.rowCount ?? 0
            })

            resolved++
            customersLinked += linked
          } catch (err) {
            failed++
            errors.push({
              index: i + batchIdx,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }),
      )
    }

    res.json({
      success: true,
      data: { resolved, failed, customersLinked, errors: errors.slice(0, 20) },
    })
  } catch (err) {
    console.error('Bulk dealer import error:', err)
    res.status(500).json({ success: false, error: 'Failed to import dealers' })
  }
})

export default router
