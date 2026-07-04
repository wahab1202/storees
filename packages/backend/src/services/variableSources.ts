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
 * Top events for the project + their observed property paths — including
 * NESTED dot-paths (line_items.0.image) flattened from recent real payloads,
 * so pickers can offer deep fields without hand-typing. Bounded sample per
 * event to stay cheap; the resolver reads any path via readPath either way.
 */
async function pullEventKeys(projectId: string): Promise<Array<{ name: string; properties: string[] }>> {
  const rows = await db.execute(sql`
    WITH ranked AS (
      SELECT event_name, properties,
             ROW_NUMBER() OVER (PARTITION BY event_name ORDER BY received_at DESC) AS rn
      FROM events
      WHERE project_id = ${projectId}
        AND received_at > NOW() - INTERVAL '30 days'
        AND properties IS NOT NULL AND properties <> '{}'::jsonb
    )
    SELECT event_name, properties FROM ranked WHERE rn <= 5
    ORDER BY event_name
    LIMIT 200
  `)

  const byEvent = new Map<string, Map<string, unknown>>()
  for (const r of rows.rows as Array<{ event_name: string; properties: Record<string, unknown> }>) {
    let paths = byEvent.get(r.event_name)
    if (!paths) { paths = new Map(); byEvent.set(r.event_name, paths) }
    if (paths.size >= 40) continue
    collectPaths(r.properties, '', 0, paths)
  }

  return [...byEvent.entries()].slice(0, 30).map(([name, paths]) => ({
    name,
    properties: [...paths.keys()].filter(k => !k.startsWith('_')).sort().slice(0, 40),
  }))
}

/** Flatten one properties object into dot-paths (arrays sampled at index 0). */
function collectPaths(value: unknown, prefix: string, depth: number, out: Map<string, unknown>): void {
  if (out.size >= 40 || depth > 3) return
  if (Array.isArray(value)) {
    if (value[0] !== undefined) collectPaths(value[0], `${prefix}.0`, depth + 1, out)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k
      if (v !== null && typeof v === 'object') collectPaths(v, path, depth + 1, out)
      else if (!out.has(path)) out.set(path, v)
      if (out.size >= 40) break
    }
    return
  }
  if (prefix && !out.has(prefix)) out.set(prefix, value)
}

function truncateSample(raw: string): string {
  const cleaned = raw.replace(/^"|"$/g, '')
  if (cleaned.length <= 32) return cleaned
  return cleaned.slice(0, 29) + '...'
}
