import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { products, collections } from '../db/schema.js'

type ShopifyProductPayload = {
  id?: number | string
  title?: string
  product_type?: string
  vendor?: string
  status?: string
  image?: { src?: string } | null
  images?: Array<{ src?: string }>
}

type ShopifyCollectionPayload = {
  id?: number | string
  title?: string
  // image is exposed as `image.src` for custom collections, sometimes `featured_image` for smart
  image?: { src?: string } | null
}

/**
 * Handle a product/* Shopify webhook. Upserts on create/update, archives on delete.
 * Archive instead of hard-delete so existing segment definitions and order history
 * that reference this product remain interpretable.
 */
export async function handleProductWebhook(
  projectId: string,
  topic: string,
  payload: ShopifyProductPayload,
): Promise<void> {
  const shopifyProductId = String(payload.id ?? '')
  if (!shopifyProductId) {
    console.warn(`[catalog] product webhook missing id (topic=${topic})`)
    return
  }

  if (topic === 'products/delete') {
    await db
      .update(products)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(products.projectId, projectId), eq(products.shopifyProductId, shopifyProductId)))
    return
  }

  const imageUrl = payload.image?.src ?? payload.images?.[0]?.src ?? null

  // ON CONFLICT (project_id, shopify_product_id) updates the existing row's mutable fields
  await db.execute(sql`
    INSERT INTO products (project_id, shopify_product_id, title, product_type, vendor, image_url, status, updated_at)
    VALUES (
      ${projectId},
      ${shopifyProductId},
      ${payload.title ?? ''},
      ${payload.product_type ?? ''},
      ${payload.vendor ?? ''},
      ${imageUrl},
      ${payload.status ?? 'active'},
      NOW()
    )
    ON CONFLICT (project_id, shopify_product_id) DO UPDATE SET
      title = EXCLUDED.title,
      product_type = EXCLUDED.product_type,
      vendor = EXCLUDED.vendor,
      image_url = EXCLUDED.image_url,
      status = EXCLUDED.status,
      updated_at = NOW()
  `)
}

/**
 * Handle a collections/* Shopify webhook. Upserts on create/update, hard-deletes
 * the row on delete (we keep product_collections history through the products table,
 * not through stale collection rows).
 */
export async function handleCollectionWebhook(
  projectId: string,
  topic: string,
  payload: ShopifyCollectionPayload,
): Promise<void> {
  const shopifyCollectionId = String(payload.id ?? '')
  if (!shopifyCollectionId) {
    console.warn(`[catalog] collection webhook missing id (topic=${topic})`)
    return
  }

  if (topic === 'collections/delete') {
    await db
      .delete(collections)
      .where(and(eq(collections.projectId, projectId), eq(collections.shopifyCollectionId, shopifyCollectionId)))
    return
  }

  // Type isn't conveyed by the webhook topic; default to 'custom' on insert and keep on update.
  await db.execute(sql`
    INSERT INTO collections (project_id, shopify_collection_id, title, collection_type, image_url, updated_at)
    VALUES (
      ${projectId},
      ${shopifyCollectionId},
      ${payload.title ?? ''},
      'custom',
      ${payload.image?.src ?? null},
      NOW()
    )
    ON CONFLICT (project_id, shopify_collection_id) DO UPDATE SET
      title = EXCLUDED.title,
      image_url = EXCLUDED.image_url,
      updated_at = NOW()
  `)
}
