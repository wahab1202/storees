import { sql } from 'drizzle-orm'
import { db } from '../db/connection.js'

/**
 * Shape accepted by upsertDealer — mirrors the GWM
 * /admin/storees-cdp/export/dealers payload (STOREES_DEALERS_EXPORT.md).
 * Lives here so both POST /v1/import/dealers (push path) and the data-sync
 * connector pull path share one implementation.
 */
export type DealerInput = {
  dealer_id: string
  name: string
  email?: string | null
  phone?: string | null
  status?: string | null
  region?: string | null
  state?: string | null         // alias of region
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

export type UpsertDealerResult = {
  customersLinked: number
}

/**
 * Upsert one dealer into `agents` (keyed on project_id, external_dealer_id).
 *   - status === 'Approved' → is_active=true; everything else stays inactive
 *     so segment-builder hides Pending/Rejected/Blocked dealers but analytics
 *     still has them.
 *   - dedicated columns: name, email, phone, region (falls back to state),
 *     city. Everything else lands in metadata jsonb.
 *   - side-effect: backlinks customers in this project whose
 *     custom_attributes.dealer_id matches AND agent_id is still NULL. Lets
 *     dealers + customers arrive in either order.
 */
export async function upsertDealer(projectId: string, input: DealerInput): Promise<UpsertDealerResult> {
  const dealerId = input.dealer_id?.trim()
  const name = input.name?.trim()
  if (!dealerId || !name) throw new Error('dealer_id and name are required')

  const isActive = input.status === undefined || input.status === null || input.status === 'Approved'
  const region = input.region?.trim() || input.state?.trim() || null
  const city = input.city?.trim() || null

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

  return db.transaction(async (tx) => {
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

    return { customersLinked: link.rowCount ?? 0 }
  })
}
