import { sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import type { VariableSourceCatalog } from '@storees/shared'

/**
 * Build the catalogue of variable sources for a project. Powers the picker
 * dropdown in the template editor — "what fields can I use?". The customer
 * and project sections are static (the resolver only allows whitelisted
 * fields anyway). Attribute keys + event keys are pulled live from the
 * project's data so the picker shows real options instead of asking users
 * to type guess-keys into a textbox.
 */
export async function buildVariableCatalog(projectId: string): Promise<VariableSourceCatalog> {
  const [attrKeys, eventKeys] = await Promise.all([
    pullAttributeKeys(projectId),
    pullEventKeys(projectId),
  ])

  return {
    customer: [
      { field: 'name',              label: 'Name',                  type: 'string' },
      { field: 'email',             label: 'Email',                 type: 'string' },
      { field: 'phone',             label: 'Phone',                 type: 'string' },
      { field: 'region',            label: 'Region',                type: 'string' },
      { field: 'city',              label: 'City',                  type: 'string' },
      { field: 'total_orders',      label: 'Total Orders',          type: 'number' },
      { field: 'total_spent',       label: 'Total Spent',           type: 'number' },
      { field: 'avg_order_value',   label: 'Average Order Value',   type: 'number' },
      { field: 'clv',               label: 'Customer Lifetime Value', type: 'number' },
      { field: 'first_order_date',  label: 'First Order Date',      type: 'date' },
      { field: 'last_order_date',   label: 'Last Order Date',       type: 'date' },
      { field: 'last_seen',         label: 'Last Seen',             type: 'date' },
      { field: 'external_id',       label: 'External ID',           type: 'string' },
      { field: 'id',                label: 'Customer ID',           type: 'string' },
    ],
    attributes: attrKeys,
    product: [
      { field: 'name', label: 'Product Name', type: 'string' },
      { field: 'price', label: 'Product Price', type: 'number' },
      { field: 'url', label: 'Product URL', type: 'url' },
      { field: 'image_url', label: 'Product Image URL', type: 'url' },
      { field: 'type', label: 'Product Type', type: 'string' },
      { field: 'vendor', label: 'Vendor', type: 'string' },
      { field: 'id', label: 'Product ID', type: 'string' },
    ],
    project: [
      { field: 'name',                label: 'Project Name' },
      { field: 'email_from_address',  label: 'From Email Address' },
      { field: 'email_from_name',     label: 'From Email Name' },
    ],
    events: eventKeys,
  }
}

/**
 * Look at the top N keys observed in customers.custom_attributes for this
 * project. JSONB so we can't use a generated column — sample a bounded set
 * of recent rows + extract distinct top-level keys. Capped to keep this
 * fast on projects with millions of customers.
 */
async function pullAttributeKeys(projectId: string): Promise<Array<{ key: string; sample?: string }>> {
  const rows = await db.execute(sql`
    WITH sample AS (
      SELECT custom_attributes
      FROM customers
      WHERE project_id = ${projectId}
        AND custom_attributes IS NOT NULL
        AND custom_attributes <> '{}'::jsonb
      ORDER BY last_seen DESC NULLS LAST
      LIMIT 1000
    )
    SELECT key, MAX(value::text) AS sample, COUNT(*) AS observed
    FROM sample, jsonb_each(custom_attributes)
    GROUP BY key
    ORDER BY observed DESC
    LIMIT 50
  `)

  return (rows.rows as Array<{ key: string; sample: string | null }>).map(r => ({
    key: r.key,
    sample: r.sample ? truncateSample(r.sample) : undefined,
  }))
}

/**
 * Top events for the project + their distinct property keys. Lets flow-step
 * pickers offer "{{order_number}}" etc. when the trigger event has that
 * property. Bounded scan to stay cheap.
 */
async function pullEventKeys(projectId: string): Promise<Array<{ name: string; properties: string[] }>> {
  const rows = await db.execute(sql`
    WITH recent AS (
      SELECT event_name, properties
      FROM events
      WHERE project_id = ${projectId}
        AND received_at > NOW() - INTERVAL '30 days'
      ORDER BY received_at DESC
      LIMIT 5000
    ),
    by_event AS (
      SELECT event_name, jsonb_object_keys(properties) AS prop_key
      FROM recent
      WHERE properties IS NOT NULL
    )
    SELECT event_name, array_agg(DISTINCT prop_key) AS prop_keys
    FROM by_event
    GROUP BY event_name
    ORDER BY event_name
    LIMIT 30
  `)

  return (rows.rows as Array<{ event_name: string; prop_keys: string[] | null }>).map(r => ({
    name: r.event_name,
    properties: (r.prop_keys ?? []).filter(k => k != null && !k.startsWith('_')),
  }))
}

function truncateSample(raw: string): string {
  const cleaned = raw.replace(/^"|"$/g, '')
  if (cleaned.length <= 32) return cleaned
  return cleaned.slice(0, 29) + '...'
}
