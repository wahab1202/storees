import { Router } from 'express'
import { sql, eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projectDataSources } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'

/**
 * GET /api/federation-status?projectId=...
 *
 * One-stop health check for the GWM federation pipeline. Surfaces:
 *   1. Worker last-run state — when did it last try? Success or fail? Why?
 *   2. Coverage — how many customers / products / orders / collections etc.
 *      actually landed in Storees from gwm
 *   3. Quality — % of products with a category set, % of orders with line items
 *
 * Used by:
 *   - Storees admin "Data Sources" page (frontend will surface this in a card)
 *   - GWM team's monitoring (they can poll this URL to detect breakage)
 *   - Direct ops debugging — easier than running SQL by hand
 *
 * Per-project. The federation table currently only has one row (GWM) but the
 * shape supports many tenants/sources without endpoint changes.
 */

const router = Router()

router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    // 1. Worker state from project_data_sources — the authoritative row.
    const [source] = await db
      .select()
      .from(projectDataSources)
      .where(eq(projectDataSources.projectId, projectId))
      .limit(1)

    if (!source) {
      return res.json({
        success: true,
        data: {
          configured: false,
          message: 'No federation source configured for this project',
        },
      })
    }

    // 2. Counts from the project's storees-native tables — cheap aggregate queries.
    const countsRow = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM customers WHERE project_id = ${projectId})         AS customers,
        (SELECT COUNT(*)::int FROM customers WHERE project_id = ${projectId} AND region IS NOT NULL) AS customers_with_region,
        (SELECT COUNT(*)::int FROM customers WHERE project_id = ${projectId} AND city IS NOT NULL)   AS customers_with_city,
        (SELECT COUNT(*)::int FROM customers WHERE project_id = ${projectId} AND agent_id IS NOT NULL) AS customers_with_agent,
        (SELECT MAX(last_seen)              FROM customers WHERE project_id = ${projectId})         AS customers_latest,
        (SELECT COUNT(*)::int FROM agents    WHERE project_id = ${projectId})                       AS agents,
        (SELECT COUNT(*)::int FROM products  WHERE project_id = ${projectId})                       AS products,
        (SELECT COUNT(*)::int FROM products  WHERE project_id = ${projectId} AND product_type <> '') AS products_with_category,
        (SELECT COUNT(*)::int FROM products  WHERE project_id = ${projectId} AND image_url IS NOT NULL) AS products_with_image,
        (SELECT COUNT(*)::int FROM collections WHERE project_id = ${projectId})                     AS collections,
        (SELECT COUNT(*)::int FROM product_collections pc
            JOIN products p ON p.id = pc.product_id
            WHERE p.project_id = ${projectId})                                                       AS product_collection_links,
        (SELECT COUNT(*)::int FROM orders    WHERE project_id = ${projectId})                       AS orders,
        (SELECT MAX(created_at)            FROM orders WHERE project_id = ${projectId})             AS orders_latest
    `)
    const counts = countsRow.rows[0] as Record<string, number | string | null>

    // 3. Derive quality % for the UI to display ("X% of products are categorised").
    const products = Number(counts.products ?? 0)
    const productsWithCategory = Number(counts.products_with_category ?? 0)
    const productsWithImage = Number(counts.products_with_image ?? 0)
    const customers = Number(counts.customers ?? 0)
    const customersWithRegion = Number(counts.customers_with_region ?? 0)
    const customersWithCity = Number(counts.customers_with_city ?? 0)
    const customersWithAgent = Number(counts.customers_with_agent ?? 0)

    const pct = (num: number, denom: number) =>
      denom > 0 ? Math.round((num / denom) * 100) : 0

    const now = Date.now()
    const lastRefreshMs = source.lastRefreshAt ? source.lastRefreshAt.getTime() : null
    const minutesSinceLastRefresh = lastRefreshMs != null
      ? Math.round((now - lastRefreshMs) / 60_000)
      : null

    // Healthy = ran < 10 min ago AND last status was success.
    // (Schedule is 5 min, so 10 min is one missed tick — anything more is concerning.)
    const healthy = source.lastRefreshStatus === 'success'
      && minutesSinceLastRefresh != null
      && minutesSinceLastRefresh < 10

    const ordersCursor = (source.config as Record<string, unknown>)?.orders as
      | { lastSyncedAt?: string | null }
      | undefined

    res.json({
      success: true,
      data: {
        configured: true,
        sourceType: source.sourceType,
        healthy,

        worker: {
          lastRefreshAt: source.lastRefreshAt,
          minutesSinceLastRefresh,
          lastRefreshStatus: source.lastRefreshStatus,
          lastRefreshDurationMs: source.lastRefreshDurationMs,
          lastRefreshError: source.lastRefreshError,
          ordersCursor: ordersCursor?.lastSyncedAt ?? null,
          isActive: source.isActive,
        },

        coverage: {
          customers,
          customers_latest: counts.customers_latest,
          agents: Number(counts.agents ?? 0),
          products,
          collections: Number(counts.collections ?? 0),
          product_collection_links: Number(counts.product_collection_links ?? 0),
          orders: Number(counts.orders ?? 0),
          orders_latest: counts.orders_latest,
        },

        quality: {
          // Each pct = how complete a derived field is across the population.
          // A low % means the source either doesn't have that data or our
          // sync function isn't picking it up (e.g. products with category
          // % is low because gwm.cat_product doesn't carry category — only
          // order_line_item does, so unsold SKUs stay uncategorised).
          customers_with_region_pct: pct(customersWithRegion, customers),
          customers_with_city_pct:   pct(customersWithCity, customers),
          customers_with_agent_pct:  pct(customersWithAgent, customers),
          products_with_category_pct: pct(productsWithCategory, products),
          products_with_image_pct:   pct(productsWithImage, products),
        },
      },
    })
  } catch (err) {
    console.error('Federation status error:', err)
    res.status(500).json({ success: false, error: 'Failed to load federation status' })
  }
})

export default router
