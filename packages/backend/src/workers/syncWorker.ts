import { Worker } from 'bullmq'
import { eq, and } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { projects, orders, products, collections, productCollections, dataSourceConnectors, dataSourceSyncs } from '../db/schema.js'
import { fetchShopifyApi, fetchShopifyPage, getValidShopifyToken } from '../services/shopifyService.js'
import { resolveCustomer, updateCustomerAggregates } from '../services/customerService.js'
import { processHistoricalEvent } from '../services/eventProcessor.js'
import { SHOPIFY_API_DELAY_MS } from '@storees/shared'
import { evaluateAllSegments } from '../services/segmentService.js'

type ShopifyAddress = {
  province?: string | null
  province_code?: string | null
  city?: string | null
}

type ShopifyCustomer = {
  id: number
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
  created_at: string
  email_marketing_consent: { state: string } | null
  sms_marketing_consent: { state: string } | null
  default_address?: ShopifyAddress | null
}

type ShopifyProduct = {
  id: number
  title: string
  product_type: string
  vendor: string
  status: string
  image?: { src: string }
}

type ShopifyCollection = {
  id: number
  title: string
  image?: { src: string }
}

type ShopifyCollect = {
  product_id: number
  collection_id: number
}

type ShopifyOrder = {
  id: number
  total_price: string
  total_discounts: string
  currency: string
  created_at: string
  fulfillment_status: string | null
  line_items: Array<{
    product_id: number
    title: string
    quantity: number
    price: string
    image?: { src: string }
  }>
}

export function startSyncWorker(): Worker {
  const worker = new Worker(
    'shopify-sync',
    async (job) => {
      const { projectId, syncId: providedSyncId } = job.data as { projectId: string; syncId?: string }

      console.log(`Starting historical sync for project ${projectId}`)

      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      if (!project?.shopifyAccessToken || !project.shopifyDomain) {
        throw new Error('Project not connected to Shopify')
      }

      const shop = project.shopifyDomain
      // Re-mints a fresh Admin API token for custom-app connections (the
      // client_credentials token is ~24h); returns the stored token for legacy OAuth.
      const { token } = await getValidShopifyToken(projectId)

      // Resolve the unified Data Sources sync-history row so this run shows in
      // the project's Data Sources panel (status, counts, duration) — same shell
      // connectors use. Use the caller-provided syncId (panel-triggered Sync Now)
      // or create one (connect-time auto-sync).
      const [shopConn] = await db.select({ id: dataSourceConnectors.id })
        .from(dataSourceConnectors)
        .where(and(eq(dataSourceConnectors.projectId, projectId), eq(dataSourceConnectors.template, 'shopify')))
        .limit(1)
      const connectorId = shopConn?.id ?? null
      let historySyncId = providedSyncId ?? null
      if (connectorId) {
        if (historySyncId) {
          await db.update(dataSourceSyncs).set({ status: 'running', startedAt: new Date(), updatedAt: new Date() }).where(eq(dataSourceSyncs.id, historySyncId))
        } else {
          const [row] = await db.insert(dataSourceSyncs).values({ connectorId, kind: 'full', status: 'running', startedAt: new Date() }).returning({ id: dataSourceSyncs.id })
          historySyncId = row.id
        }
      }

      try {
      // Fetch customers — paginate through all pages via Link header
      let customerUrl: string | null = '/customers.json?limit=250&order=created_at+desc'
      let customersProcessed = 0
      let ordersProcessed = 0

      while (customerUrl) {
        const { data, nextPath }: { data: { customers: ShopifyCustomer[] }; nextPath: string | null } =
          await fetchShopifyPage<{ customers: ShopifyCustomer[] }>(shop, token, customerUrl)

        for (const shopifyCustomer of data.customers) {
          const name = [shopifyCustomer.first_name, shopifyCustomer.last_name]
            .filter(Boolean)
            .join(' ') || null

          const addr = shopifyCustomer.default_address
          const region = addr?.province || addr?.province_code || null
          const city = addr?.city || null

          const customerId = await resolveCustomer({
            projectId,
            externalId: String(shopifyCustomer.id),
            email: shopifyCustomer.email,
            phone: shopifyCustomer.phone,
            name,
            emailSubscribed: shopifyCustomer.email_marketing_consent?.state === 'subscribed',
            smsSubscribed: shopifyCustomer.sms_marketing_consent?.state === 'subscribed',
            region,
            city,
          })

          // Fetch orders for this customer. A single customer's orders endpoint
          // can 404 / error (deleted or edge-case customer) — skip just this
          // customer's orders rather than aborting the entire sync.
          await delay(SHOPIFY_API_DELAY_MS)
          let orderData: { orders: ShopifyOrder[] }
          try {
            orderData = await fetchShopifyApi<{ orders: ShopifyOrder[] }>(
              shop,
              token,
              `/customers/${shopifyCustomer.id}/orders.json?status=any&limit=250`,
            )
          } catch (err) {
            console.warn(`[shopify-sync] skipping orders for customer ${shopifyCustomer.id}: ${(err as Error).message}`)
            customersProcessed++
            continue
          }

          for (const shopifyOrder of orderData.orders) {
            const total = Number(shopifyOrder.total_price)
            const discount = Number(shopifyOrder.total_discounts)

            const inserted = await db.insert(orders).values({
              projectId,
              customerId,
              externalOrderId: String(shopifyOrder.id),
              status: shopifyOrder.fulfillment_status === 'fulfilled' ? 'fulfilled' : 'pending',
              total: String(total),
              discount: String(discount),
              currency: shopifyOrder.currency,
              lineItems: shopifyOrder.line_items.map(item => ({
                productId: String(item.product_id),
                productName: item.title,
                quantity: item.quantity,
                price: Number(item.price),
                imageUrl: item.image?.src,
              })),
              createdAt: new Date(shopifyOrder.created_at),
              fulfilledAt: shopifyOrder.fulfillment_status === 'fulfilled' ? new Date() : null,
            }).onConflictDoNothing().returning({ id: orders.id })

            // Only update aggregates if the order was actually inserted (not a duplicate)
            if (inserted.length > 0) {
              await updateCustomerAggregates(customerId, total, new Date(shopifyOrder.created_at))
            }

            // Create historical event (does NOT trigger flows)
            await processHistoricalEvent(
              projectId,
              customerId,
              'order_placed',
              {
                order_id: String(shopifyOrder.id),
                total,
                discount,
                item_count: shopifyOrder.line_items.length,
              },
              new Date(shopifyOrder.created_at),
            )

            ordersProcessed++
          }

          customersProcessed++
          await delay(SHOPIFY_API_DELAY_MS)

          // Update progress
          await job.updateProgress({
            customersProcessed,
            ordersProcessed,
            status: 'syncing',
          })
        }

        customerUrl = nextPath
        if (customerUrl) await delay(SHOPIFY_API_DELAY_MS)
      }

      console.log(`Sync complete: ${customersProcessed} customers, ${ordersProcessed} orders`)

      // Sync product catalog (resilient — a 404/error here shouldn't abort the
      // whole run after customers + orders already synced).
      console.log('Syncing product catalog...')
      let productCount = 0
      try {
        productCount = await syncProducts(projectId, shop, token)
        console.log(`Synced ${productCount} products`)
      } catch (err) {
        console.warn(`[shopify-sync] product sync failed (continuing): ${(err as Error).message}`)
      }

      // Sync collections (resilient — some stores/API versions 404 the
      // custom_collections / smart_collections / collects REST endpoints).
      console.log('Syncing collections...')
      let collectionCount = 0
      try {
        collectionCount = await syncCollections(projectId, shop, token)
        console.log(`Synced ${collectionCount} collections`)
      } catch (err) {
        console.warn(`[shopify-sync] collection sync failed (continuing): ${(err as Error).message}`)
      }

      // Re-evaluate segments now that customer data is populated
      console.log('Evaluating segments after sync...')
      await evaluateAllSegments(projectId)

      // Record success in the unified Data Sources history.
      if (historySyncId && connectorId) {
        const stats = {
          customers: { fetched: customersProcessed, imported: customersProcessed, failed: 0 },
          products: { fetched: productCount, imported: productCount, failed: 0 },
          orders: { fetched: ordersProcessed, imported: ordersProcessed, failed: 0 },
        }
        const nowIso = new Date().toISOString()
        await db.update(dataSourceSyncs)
          .set({ status: 'success', finishedAt: new Date(), stats, updatedAt: new Date() })
          .where(eq(dataSourceSyncs.id, historySyncId))
        await db.update(dataSourceConnectors)
          .set({ lastSyncedAt: { customers: nowIso, products: nowIso, orders: nowIso }, updatedAt: new Date() })
          .where(eq(dataSourceConnectors.id, connectorId))
      }

      return { customersProcessed, ordersProcessed, productCount, collectionCount, status: 'complete' }
      } catch (err) {
        if (historySyncId) {
          await db.update(dataSourceSyncs)
            .set({ status: 'failed', finishedAt: new Date(), errorSummary: (err as Error).message.slice(0, 500), updatedAt: new Date() })
            .where(eq(dataSourceSyncs.id, historySyncId))
        }
        throw err
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  )

  worker.on('completed', (job) => {
    console.log(`Sync job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Sync job ${job?.id} failed:`, err.message)
  })

  return worker
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function syncProducts(projectId: string, shop: string, token: string): Promise<number> {
  let count = 0
  let url: string | null = '/products.json?limit=250&status=active'

  while (url) {
    const { data, nextPath }: { data: { products: ShopifyProduct[] }; nextPath: string | null } =
      await fetchShopifyPage<{ products: ShopifyProduct[] }>(shop, token, url)

    for (const p of data.products) {
      await db.insert(products).values({
        projectId,
        shopifyProductId: String(p.id),
        title: p.title,
        productType: p.product_type || '',
        vendor: p.vendor || '',
        imageUrl: p.image?.src ?? null,
        status: p.status || 'active',
      }).onConflictDoNothing()
      count++
    }

    url = nextPath
    if (url) await delay(SHOPIFY_API_DELAY_MS)
  }

  return count
}

async function syncCollections(projectId: string, shop: string, token: string): Promise<number> {
  let count = 0
  const allShopifyCollections: ShopifyCollection[] = []

  // Sync custom collections (paginated)
  let customUrl: string | null = '/custom_collections.json?limit=250'
  while (customUrl) {
    const { data, nextPath }: { data: { custom_collections: ShopifyCollection[] }; nextPath: string | null } =
      await fetchShopifyPage<{ custom_collections: ShopifyCollection[] }>(shop, token, customUrl)

    for (const c of data.custom_collections) {
      await db.insert(collections).values({
        projectId,
        shopifyCollectionId: String(c.id),
        title: c.title,
        collectionType: 'custom',
        imageUrl: c.image?.src ?? null,
      }).onConflictDoNothing()
      count++
      allShopifyCollections.push(c)
    }

    customUrl = nextPath
    await delay(SHOPIFY_API_DELAY_MS)
  }

  // Sync smart collections (paginated)
  let smartUrl: string | null = '/smart_collections.json?limit=250'
  while (smartUrl) {
    const { data, nextPath }: { data: { smart_collections: ShopifyCollection[] }; nextPath: string | null } =
      await fetchShopifyPage<{ smart_collections: ShopifyCollection[] }>(shop, token, smartUrl)

    for (const c of data.smart_collections) {
      await db.insert(collections).values({
        projectId,
        shopifyCollectionId: String(c.id),
        title: c.title,
        collectionType: 'smart',
        imageUrl: c.image?.src ?? null,
      }).onConflictDoNothing()
      count++
      allShopifyCollections.push(c)
    }

    smartUrl = nextPath
    await delay(SHOPIFY_API_DELAY_MS)
  }

  // Sync product-collection mappings via collects API
  // Batch-load lookup maps to avoid N+1 queries
  const allProducts = await db.select({ id: products.id, shopifyProductId: products.shopifyProductId })
    .from(products).where(eq(products.projectId, projectId))
  const productMap = new Map(allProducts.map(p => [p.shopifyProductId, p.id]))

  const allCols = await db.select({ id: collections.id, shopifyCollectionId: collections.shopifyCollectionId })
    .from(collections).where(eq(collections.projectId, projectId))
  const collectionMap = new Map(allCols.map(c => [c.shopifyCollectionId, c.id]))

  for (const col of allShopifyCollections) {
    try {
      let collectsUrl: string | null = `/collects.json?collection_id=${col.id}&limit=250`
      while (collectsUrl) {
        const { data, nextPath }: { data: { collects: ShopifyCollect[] }; nextPath: string | null } =
          await fetchShopifyPage<{ collects: ShopifyCollect[] }>(shop, token, collectsUrl)

        for (const collect of data.collects) {
          const productId = productMap.get(String(collect.product_id))
          const collectionId = collectionMap.get(String(collect.collection_id))

          if (productId && collectionId) {
            await db.insert(productCollections).values({
              productId,
              collectionId,
            }).onConflictDoNothing()
          }
        }

        collectsUrl = nextPath
        await delay(SHOPIFY_API_DELAY_MS)
      }
    } catch (err) {
      console.error(`Failed to sync collects for collection ${col.id}:`, err)
    }
  }

  return count
}
