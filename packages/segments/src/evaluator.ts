import { sql, and, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type {
  FilterConfig, FilterRule, FilterGroup, Customer,
  AggregateRule, AggregateField, AggregateTimeframe, AggregateCompareOp,
} from '@storees/shared'

// ============ AGENT SCOPE INJECTION ============

/**
 * Compose a user-authored FilterConfig with an implicit agent_id scope, at the
 * SQL level. Sub-admins cannot build a segment that reaches customers outside
 * their scope — the stored filter is left as-authored and the scope is composed
 * only at read time.
 *
 *   scopedAgentIds = []     → admin (no scoping)
 *   scopedAgentIds = [id]   → agent
 *   scopedAgentIds = [...]  → manager (own agent + managed agents)
 *   scopedAgentIds = null   → deny all (agent with no agentId)
 */
export function scopedFilterToSql(
  filters: FilterConfig,
  scopedAgentIds: string[] | null
): SQL {
  const userSql = filterToSql(filters)

  if (scopedAgentIds === null) return sql`FALSE`
  if (scopedAgentIds.length === 0) return userSql

  const scopeSql =
    scopedAgentIds.length === 1
      ? sql`agent_id = ${scopedAgentIds[0]}`
      : or(...scopedAgentIds.map(id => sql`agent_id = ${id}`))!

  return and(scopeSql, userSql)!
}

// ============ SQL-FIRST EVALUATION (batch) ============

/**
 * Translates a FilterConfig into a Drizzle SQL WHERE clause.
 * Supports nested groups, product-based filters, and date filters.
 */
export function filterToSql(filters: FilterConfig): SQL {
  const clauses = filters.rules.map(ruleOrGroupToSql)

  if (clauses.length === 0) return sql`TRUE`
  if (clauses.length === 1) return clauses[0]

  return filters.logic === 'AND' ? and(...clauses)! : or(...clauses)!
}

function ruleOrGroupToSql(item: FilterRule | FilterGroup | AggregateRule): SQL {
  if ('type' in item && item.type === 'group') {
    return groupToSql(item)
  }
  if ('type' in item && item.type === 'aggregate') {
    return compileAggregateRule(item)
  }
  return ruleToSql(item as FilterRule)
}

function groupToSql(group: FilterGroup): SQL {
  // 'same_order' groups correlate all their order predicates onto ONE order,
  // rather than each rule matching independently across the whole history.
  if (group.scope === 'same_order') return sameOrderGroupToSql(group)

  // Groups can contain rules OR nested groups. Recurse through
  // ruleOrGroupToSql so arbitrary depth works.
  const clauses = group.rules.map(ruleOrGroupToSql)
  if (clauses.length === 0) return sql`TRUE`
  if (clauses.length === 1) return clauses[0]
  return group.logic === 'AND' ? and(...clauses)! : or(...clauses)!
}

// ============ SAME-ORDER (CORRELATED) SCOPE ============

/**
 * Compile a single order predicate as it applies WITHIN one order row — either
 * the `orders` table (alias `o`, Shopify-direct) or an `order_placed`/
 * `order_completed` event (alias `e`, event-driven tenants like GWM/VirpanAI).
 * The two sources hold the same facts under different column/JSON shapes, so
 * each rule is rendered twice (once per source) by the caller.
 */
function orderScopedPredicate(rule: FilterRule, source: 'orders' | 'events'): SQL {
  const value = rule.value
  const lineItems = source === 'orders' ? sql`o.line_items::jsonb` : sql`e.properties->'line_items'`
  const total = source === 'orders' ? sql`o.total` : sql`(e.properties->>'total')::numeric`
  const dateCol = source === 'orders' ? sql`o.created_at` : sql`e.timestamp`

  switch (rule.field) {
    case 'product_category': {
      // Orders: category lives on products.product_type, joined via line-item
      // product id. Events: the connector keeps product_type/product_collection
      // flat on each line item, so match either (brand often = collection).
      const pred = source === 'orders'
        ? sql`EXISTS (
            SELECT 1 FROM products p
            WHERE p.project_id = o.project_id
            AND p.product_type = ${value}
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(o.line_items::jsonb) item
              WHERE COALESCE(item->>'product_id', item->>'productId') = p.shopify_product_id
            )
          )`
        : sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(e.properties->'line_items') item
            WHERE item->>'product_type' = ${value} OR item->>'product_collection' = ${value}
          )`
      return rule.operator === 'has_not_purchased' ? sql`NOT (${pred})` : pred
    }
    case 'product_name':
    case 'collection_name': {
      const isCollection = rule.field === 'collection_name'
      const snakeKey = isCollection ? 'product_collection' : 'product_name'
      const camelKey = isCollection ? 'productCollection' : 'productName'
      const pred = sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements(${lineItems}) item
        WHERE COALESCE(item->>${snakeKey}, item->>${camelKey}) = ${value}
      )`
      return rule.operator === 'has_not_purchased' ? sql`NOT (${pred})` : pred
    }
    case 'order_total': {
      switch (rule.operator) {
        case 'greater_than': return sql`${total} > ${value}`
        case 'less_than':    return sql`${total} < ${value}`
        case 'is':           return sql`${total} = ${value}`
        case 'between': {
          const [min, max] = value as [number, number]
          return sql`${total} BETWEEN ${min} AND ${max}`
        }
        default: return sql`TRUE`
      }
    }
    case 'order_date': {
      switch (rule.operator) {
        case 'between_dates': {
          const [from, to] = value as [string, string]
          return sql`${dateCol} BETWEEN ${new Date(from)}::timestamptz AND ${new Date(to)}::timestamptz`
        }
        case 'before_date': return sql`${dateCol} < ${new Date(String(value))}::timestamptz`
        case 'after_date':  return sql`${dateCol} > ${new Date(String(value))}::timestamptz`
        default: return sql`TRUE`
      }
    }
    default:
      // Field not order-scoped — neutral element (the builder restricts the
      // field list inside a same-order group, this is just defensive).
      return sql`TRUE`
  }
}

/**
 * Correlated "within the same order" group → a single EXISTS where ALL the
 * group's predicates must hold for ONE order (or one order event). Dual-source
 * (orders OR events) so it works on both Shopify-direct and event-driven stacks.
 */
function sameOrderGroupToSql(group: FilterGroup): SQL {
  const rules = group.rules.filter((r): r is FilterRule => !('type' in r))
  if (rules.length === 0) return sql`TRUE`

  const combine = (clauses: SQL[]): SQL =>
    clauses.length === 1 ? clauses[0] : (group.logic === 'OR' ? or(...clauses)! : and(...clauses)!)

  const ordersWhere = combine(rules.map(r => orderScopedPredicate(r, 'orders')))
  const eventsWhere = combine(rules.map(r => orderScopedPredicate(r, 'events')))

  return sql`(
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.customer_id = customers.id
      AND ${ordersWhere}
    ) OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.project_id = customers.project_id AND e.customer_id = customers.id
      AND e.event_name IN ('order_placed', 'order_completed')
      AND ${eventsWhere}
    )
  )`
}

// ============ SCOPED-AGGREGATE LEAF ============
// Filter behavioural line-item rows by timeframe + scope FIRST, aggregate over
// the survivors (GROUP BY customer), then HAVING-compare. Dual-source so it runs
// on Shopify-direct (orders table) AND event-driven tenants (order_placed events).

// scope/aggregate field → [snake_case, camelCase] keys on a JSONB line item.
const LI_TEXT_FIELDS: Record<string, [string, string]> = {
  product_id:       ['product_id', 'productId'],
  product_name:     ['product_name', 'productName'],
  collection:       ['product_collection', 'productCollection'],
  product_category: ['product_type', 'productType'],
}

/** Numeric per-line value the aggregate runs on. line_value = price × quantity. */
function aggValueExpr(field?: AggregateField): SQL {
  switch (field) {
    case 'quantity': return sql`COALESCE((li->>'quantity')::numeric, 0)`
    case 'price':    return sql`COALESCE((li->>'price')::numeric, 0)`
    case 'line_value':
    default:         return sql`COALESCE((li->>'price')::numeric, 0) * COALESCE((li->>'quantity')::numeric, 1)`
  }
}

/** One scope filter (attribute test on a line-item row) → predicate on `li`. */
function scopeFilterPredicate(filter: FilterRule): SQL {
  const f = filter.field
  if (f === 'price' || f === 'quantity') {
    const col = sql`COALESCE((li->>${f})::numeric, 0)`
    const v = filter.value
    switch (filter.operator) {
      case 'is':           return sql`${col} = ${Number(v)}`
      case 'greater_than': return sql`${col} > ${Number(v)}`
      case 'less_than':    return sql`${col} < ${Number(v)}`
      case 'between': { const [lo, hi] = v as [number, number]; return sql`${col} BETWEEN ${lo} AND ${hi}` }
      default:             return sql`TRUE`
    }
  }
  // Collection / category live on the PRODUCT (normalized into products /
  // product_collections), and are sparse-or-null on the order line item for
  // event-driven tenants. Resolve via the catalogue (line-item product id →
  // products), OR the line-item field if it happens to be populated.
  if (f === 'collection' || f === 'product_category') {
    const v = String(filter.value ?? '')
    const liProductId = sql`COALESCE(li->>'product_id', li->>'productId')`
    const liField = f === 'collection'
      ? sql`COALESCE(li->>'product_collection', li->>'productCollection')`
      : sql`COALESCE(li->>'product_type', li->>'productType')`
    const catalogue = f === 'collection'
      ? sql`EXISTS (
          SELECT 1 FROM products p
          JOIN product_collections pc ON pc.product_id = p.id
          JOIN collections c ON c.id = pc.collection_id
          WHERE p.project_id = customers.project_id
            AND p.shopify_product_id = ${liProductId}
            AND c.name = ${v}
        )`
      : sql`EXISTS (
          SELECT 1 FROM products p
          WHERE p.project_id = customers.project_id
            AND p.shopify_product_id = ${liProductId}
            AND p.product_type = ${v}
        )`
    const match = sql`(${liField} = ${v} OR ${catalogue})`
    return filter.operator === 'is_not' ? sql`(NOT ${match})` : match
  }

  const keys = LI_TEXT_FIELDS[f]
  if (!keys) return sql`TRUE` // unknown scope field — neutral, never silently excludes
  const col = sql`COALESCE(li->>${keys[0]}, li->>${keys[1]})`
  const v = filter.value
  if (Array.isArray(v)) { // multi-select id field: is → IN, is_not → NOT IN
    const vals = (v as unknown[]).map(String)
    if (vals.length === 0) return filter.operator === 'is_not' ? sql`TRUE` : sql`FALSE`
    const list = vals.reduce<SQL | null>((acc, x) => (acc ? sql`${acc}, ${x}` : sql`${x}`), null)!
    return filter.operator === 'is_not' ? sql`${col} NOT IN (${list})` : sql`${col} IN (${list})`
  }
  const s = String(v ?? '')
  switch (filter.operator) {
    case 'is':          return sql`${col} = ${s}`
    case 'is_not':      return sql`${col} IS DISTINCT FROM ${s}`
    case 'contains':    return sql`${col} ILIKE ${'%' + s + '%'}`
    case 'begins_with': return sql`${col} ILIKE ${s + '%'}`
    case 'ends_with':   return sql`${col} ILIKE ${'%' + s}`
    default:            return sql`${col} = ${s}`
  }
}

/** Date-window predicate on the source's date column. UI dates are inclusive of
 *  both ends → translated to a half-open [start, end+1day) range. */
function aggTimeframePredicate(tf: AggregateTimeframe | undefined, dateCol: SQL): SQL | null {
  if (!tf || tf.type === 'all_time') return null
  if (tf.type === 'last_n_days') return sql`${dateCol} >= NOW() - (${tf.n}::int * INTERVAL '1 day')`
  return sql`${dateCol} >= ${tf.start}::date AND ${dateCol} < (${tf.end}::date + INTERVAL '1 day')`
}

function aggMetricExpr(rule: AggregateRule, orderIdCol: SQL): SQL {
  const fn = rule.aggregate.fn
  if (fn === 'COUNT') return sql`COUNT(*)`
  if (fn === 'COUNT_DISTINCT') return sql`COUNT(DISTINCT ${orderIdCol})`
  const v = aggValueExpr(rule.aggregate.field)
  switch (fn) {
    case 'AVG': return sql`AVG(${v})`
    case 'MIN': return sql`MIN(${v})`
    case 'MAX': return sql`MAX(${v})`
    case 'SUM':
    default:    return sql`SUM(${v})`
  }
}

function aggHavingCompare(metric: SQL, op: AggregateCompareOp, value: number | [number, number]): SQL {
  switch (op) {
    case 'is':  return sql`${metric} = ${Number(value)}`
    case 'gt':  return sql`${metric} > ${Number(value)}`
    case 'gte': return sql`${metric} >= ${Number(value)}`
    case 'lt':  return sql`${metric} < ${Number(value)}`
    case 'lte': return sql`${metric} <= ${Number(value)}`
    case 'between': { const [lo, hi] = value as [number, number]; return sql`${metric} BETWEEN ${lo} AND ${hi}` }
    default:    return sql`${metric} > ${Number(value)}`
  }
}

/** Build one source's correlated EXISTS(… GROUP BY … HAVING …). */
function aggSourceExists(rule: AggregateRule, source: 'events' | 'orders'): SQL {
  const scopePreds = (rule.scope?.filters ?? []).map(scopeFilterPredicate)
  if (source === 'events') {
    const where: SQL[] = [
      sql`e.project_id = customers.project_id`,
      sql`e.customer_id = customers.id`,
      sql`e.event_name IN ('order_placed', 'order_completed')`,
    ]
    const tf = aggTimeframePredicate(rule.timeframe, sql`e.timestamp`)
    if (tf) where.push(tf)
    where.push(...scopePreds)
    return sql`EXISTS (
      SELECT 1
      FROM events e, jsonb_array_elements(COALESCE(e.properties->'line_items', '[]'::jsonb)) li
      WHERE ${and(...where)!}
      GROUP BY e.customer_id
      HAVING ${aggHavingCompare(aggMetricExpr(rule, sql`e.id`), rule.operator, rule.value)}
    )`
  }
  const where: SQL[] = [sql`o.customer_id = customers.id`]
  const tf = aggTimeframePredicate(rule.timeframe, sql`o.created_at`)
  if (tf) where.push(tf)
  where.push(...scopePreds)
  return sql`EXISTS (
    SELECT 1
    FROM orders o, jsonb_array_elements(COALESCE(o.line_items::jsonb, '[]'::jsonb)) li
    WHERE ${and(...where)!}
    GROUP BY o.customer_id
    HAVING ${aggHavingCompare(aggMetricExpr(rule, sql`o.id`), rule.operator, rule.value)}
  )`
}

/** Compile a scoped-aggregate leaf to a boolean expression (dual-source OR — each
 *  tenant populates one source, so OR yields that source's verdict). */
export function compileAggregateRule(rule: AggregateRule): SQL {
  return sql`(${aggSourceExists(rule, 'events')} OR ${aggSourceExists(rule, 'orders')})`
}

function ruleToSql(rule: FilterRule): SQL {
  const value = rule.value

  // Dealer-attribute fields (Phase F-fed) — JOIN against agents table.
  // "Customers whose dealer's name contains tiruvarur" → EXISTS on agents.
  if (rule.field === 'dealer_name' || rule.field === 'dealer_city' || rule.field === 'dealer_region') {
    const col = rule.field === 'dealer_name' ? sql`a.name`
              : rule.field === 'dealer_city' ? sql`a.city`
              : sql`a.region`
    const v = String(value ?? '')
    let predicate: SQL
    switch (rule.operator) {
      case 'is':         predicate = sql`${col} = ${v}`; break
      case 'is_not':     predicate = sql`${col} IS DISTINCT FROM ${v}`; break
      case 'contains':   predicate = sql`${col} ILIKE ${'%' + v + '%'}`; break
      case 'begins_with':predicate = sql`${col} ILIKE ${v + '%'}`; break
      case 'ends_with':  predicate = sql`${col} ILIKE ${'%' + v}`; break
      default:
        // Unsupported operator on dealer-attribute fields → match nothing rather than throw
        return sql`FALSE`
    }
    // is_not matches customers whose dealer is different OR who have no dealer at all
    if (rule.operator === 'is_not') {
      return sql`NOT EXISTS (
        SELECT 1 FROM agents a
        WHERE a.id = customers.agent_id
        AND ${col} = ${v}
      )`
    }
    return sql`EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = customers.agent_id
      AND ${predicate}
    )`
  }

  // Order-scoped fields used standalone (not inside a same-order group) →
  // independent EXISTS: ANY single order satisfying the one predicate matches.
  // Dual-source (orders table OR order events) like the rest of the engine.
  if (rule.field === 'order_total' || rule.field === 'order_date') {
    return sql`(
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.customer_id = customers.id
        AND ${orderScopedPredicate(rule, 'orders')}
      ) OR EXISTS (
        SELECT 1 FROM events e
        WHERE e.project_id = customers.project_id AND e.customer_id = customers.id
        AND e.event_name IN ('order_placed', 'order_completed')
        AND ${orderScopedPredicate(rule, 'events')}
      )
    )`
  }

  // Product-based operators use special subqueries
  switch (rule.operator) {
    case 'has_purchased': {
      // For product_category field, match by product_type via products table
      if (rule.field === 'product_category') {
        return sql`EXISTS (
          SELECT 1 FROM orders o
          JOIN products p ON p.project_id = o.project_id
          WHERE o.customer_id = customers.id
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(o.line_items::jsonb) item
            WHERE COALESCE(item->>'product_id', item->>'productId') = p.shopify_product_id
          )
          AND p.product_type = ${value}
        )`
      }
      // For product_name and collection_name: a purchase can live in two
      // places — the `orders` table (Shopify-direct path, eventProcessor
      // writes camelCase) OR the order events themselves (event-driven
      // tenants like GWM/VirpanAI where the connector keeps snake_case).
      // Match either source, and tolerate either casing on each, so a single
      // segment rule "Product has_purchased X" works regardless of stack.
      const isCollection = rule.field === 'collection_name'
      const snakeKey = isCollection ? 'product_collection' : 'product_name'
      const camelKey = isCollection ? 'productCollection' : 'productName'
      return sql`(
        EXISTS (
          SELECT 1 FROM orders
          WHERE orders.customer_id = customers.id
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(orders.line_items::jsonb) item
            WHERE COALESCE(item->>${snakeKey}, item->>${camelKey}) = ${value}
          )
        ) OR EXISTS (
          SELECT 1 FROM events
          WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
          AND events.event_name IN ('order_placed', 'order_completed')
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(events.properties->'line_items') item
            WHERE COALESCE(item->>${snakeKey}, item->>${camelKey}) = ${value}
          )
        )
      )`
    }
    case 'has_not_purchased': {
      if (rule.field === 'product_category') {
        return sql`NOT EXISTS (
          SELECT 1 FROM orders o
          JOIN products p ON p.project_id = o.project_id
          WHERE o.customer_id = customers.id
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(o.line_items::jsonb) item
            WHERE COALESCE(item->>'product_id', item->>'productId') = p.shopify_product_id
          )
          AND p.product_type = ${value}
        )`
      }
      // Mirror of has_purchased; negate both sources so the customer hasn't
      // bought it in `orders` AND hasn't bought it via order events.
      const isCollection = rule.field === 'collection_name'
      const snakeKey = isCollection ? 'product_collection' : 'product_name'
      const camelKey = isCollection ? 'productCollection' : 'productName'
      return sql`(
        NOT EXISTS (
          SELECT 1 FROM orders
          WHERE orders.customer_id = customers.id
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(orders.line_items::jsonb) item
            WHERE COALESCE(item->>${snakeKey}, item->>${camelKey}) = ${value}
          )
        ) AND NOT EXISTS (
          SELECT 1 FROM events
          WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
          AND events.event_name IN ('order_placed', 'order_completed')
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(events.properties->'line_items') item
            WHERE COALESCE(item->>${snakeKey}, item->>${camelKey}) = ${value}
          )
        )
      )`
    }
    case 'has_viewed':
      // Check if customer has product_viewed events for a product name or category
      if (rule.field === 'product_category') {
        return sql`EXISTS (
          SELECT 1 FROM events
          WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
          AND events.event_name = 'product_viewed'
          AND events.properties->>'product_type' = ${value}
        )`
      }
      return sql`EXISTS (
        SELECT 1 FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name = 'product_viewed'
        AND events.properties->>'product_name' = ${value}
      )`
    case 'has_not_viewed':
      if (rule.field === 'product_category') {
        return sql`NOT EXISTS (
          SELECT 1 FROM events
          WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
          AND events.event_name = 'product_viewed'
          AND events.properties->>'product_type' = ${value}
        )`
      }
      return sql`NOT EXISTS (
        SELECT 1 FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name = 'product_viewed'
        AND events.properties->>'product_name' = ${value}
      )`
    case 'has_wishlisted':
      return sql`EXISTS (
        SELECT 1 FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name = 'added_to_wishlist'
        AND events.properties->>'product_name' = ${value}
      )`
    case 'has_not_wishlisted':
      return sql`NOT EXISTS (
        SELECT 1 FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name = 'added_to_wishlist'
        AND events.properties->>'product_name' = ${value}
      )`
    case 'in_month': {
      // value is month number (1-12)
      return sql`EXISTS (
        SELECT 1 FROM orders
        WHERE orders.customer_id = customers.id
        AND EXTRACT(MONTH FROM orders.created_at) = ${value}
      )`
    }
    case 'in_year': {
      // value is year (e.g. 2024)
      return sql`EXISTS (
        SELECT 1 FROM orders
        WHERE orders.customer_id = customers.id
        AND EXTRACT(YEAR FROM orders.created_at) = ${value}
      )`
    }
    case 'before_date': {
      const column = fieldToSqlExpression(rule.field)
      return sql`${column} < ${new Date(String(value))}::timestamptz`
    }
    case 'after_date': {
      const column = fieldToSqlExpression(rule.field)
      return sql`${column} > ${new Date(String(value))}::timestamptz`
    }
    case 'between_dates': {
      // value = [fromISO, toISO]; inclusive range on a date field (e.g.
      // first_order_date). order_date is handled above via the order-scoped path.
      const [from, to] = value as [string, string]
      const column = fieldToSqlExpression(rule.field)
      return sql`${column} BETWEEN ${new Date(from)}::timestamptz AND ${new Date(to)}::timestamptz`
    }
    case 'within_last': {
      // value = N, optional unit on the rule. Default unit is 'days'. Translates
      // to `field >= NOW() - N * interval`. Used by pack-seeded segments like
      // "Recent visitors (within last 7 days)".
      const column = fieldToSqlExpression(rule.field)
      const num = Number(value)
      const unit = ((rule as unknown as { unit?: string }).unit ?? 'days').toLowerCase()
      const baseInterval =
        unit === 'hours'  ? sql`INTERVAL '1 hour'` :
        unit === 'weeks'  ? sql`INTERVAL '1 week'` :
        unit === 'months' ? sql`INTERVAL '1 month'` :
                            sql`INTERVAL '1 day'`
      return sql`${column} >= NOW() - (${num}::int * ${baseInterval})`
    }
    default:
      break
  }

  // Engagement fields (Phase E3.2). The "days since last X event" is not a
  // materialized column — translate <N / >N / between into EXISTS / NOT EXISTS
  // subqueries against the events table. Customers who never had the event
  // count as "infinity days since" (NOT EXISTS in any window).
  //
  // Email-open events were renamed `email_opened` → `email_read` to match
  // `whatsapp_read` / `sms_read`. Match BOTH names so historical data and
  // new data both count.
  if (rule.field === 'days_since_email_open' || rule.field === 'days_since_email_click') {
    const eventNames = rule.field === 'days_since_email_open'
      ? sql`('email_opened', 'email_read')`
      : sql`('email_clicked')`
    const op = rule.operator
    const num = Number(value)

    // less_than N: "opened in the last N days" → EXISTS within window
    if (op === 'less_than') {
      return sql`EXISTS (
        SELECT 1 FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name IN ${eventNames}
        AND events.timestamp >= NOW() - (${num}::int * INTERVAL '1 day')
      )`
    }
    // greater_than N: "has NOT opened in the last N days" (inc. never-openers) → NOT EXISTS within window
    if (op === 'greater_than') {
      return sql`NOT EXISTS (
        SELECT 1 FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name IN ${eventNames}
        AND events.timestamp >= NOW() - (${num}::int * INTERVAL '1 day')
      )`
    }
    // between [a,b]: opened with last open between a and b days ago — EXISTS in [now-b, now-a]
    if (op === 'between') {
      const [a, b] = value as [number, number]
      const minDays = Math.min(a, b)
      const maxDays = Math.max(a, b)
      return sql`EXISTS (
        SELECT 1 FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name IN ${eventNames}
        AND events.timestamp >= NOW() - (${maxDays}::int * INTERVAL '1 day')
        AND events.timestamp <= NOW() - (${minDays}::int * INTERVAL '1 day')
      )`
    }
    // is N: opened exactly N days ago (rarely useful, support for completeness)
    if (op === 'is') {
      return sql`EXISTS (
        SELECT 1 FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name IN ${eventNames}
        AND events.timestamp >= NOW() - ((${num}::int + 1) * INTERVAL '1 day')
        AND events.timestamp < NOW() - (${num}::int * INTERVAL '1 day')
      )`
    }
    // Other operators don't make sense on this field — fall through to error
  }

  const column = fieldToSqlExpression(rule.field)

  switch (rule.operator) {
    case 'is':
      return sql`${column} = ${value}`
    case 'is_not':
      return sql`${column} != ${value}`
    case 'greater_than':
      return sql`${column} > ${value}`
    case 'less_than':
      return sql`${column} < ${value}`
    case 'between': {
      const [min, max] = value as [number, number]
      return sql`${column} BETWEEN ${min} AND ${max}`
    }
    case 'contains':
      return sql`${column} ILIKE ${'%' + String(value) + '%'}`
    case 'begins_with':
      return sql`${column} ILIKE ${String(value) + '%'}`
    case 'ends_with':
      return sql`${column} ILIKE ${'%' + String(value)}`
    case 'is_true':
      return sql`${column} = TRUE`
    case 'is_false':
      return sql`${column} = FALSE`
    default:
      throw new Error(`Unknown operator: ${rule.operator}`)
  }
}

/**
 * Maps filter field names to SQL column expressions.
 * Computed fields use SQL functions on actual columns.
 */
function fieldToSqlExpression(field: string): SQL {
  switch (field) {
    // Direct columns
    case 'total_orders':
      return sql`total_orders`
    case 'total_spent':
      return sql`total_spent`
    case 'avg_order_value':
      return sql`avg_order_value`
    case 'clv':
      return sql`clv`
    case 'email':
      return sql`email`
    case 'name':
      return sql`name`
    case 'phone':
      return sql`phone`
    case 'email_subscribed':
      return sql`email_subscribed`
    case 'sms_subscribed':
      return sql`sms_subscribed`
    case 'first_seen':
      return sql`first_seen`
    case 'last_seen':
      return sql`last_seen`
    case 'first_order_date':
      return sql`first_order_date`
    case 'last_order_date':
      return sql`last_order_date`

    // B2B agent / region scoping
    case 'agent_id':
      return sql`agent_id`
    case 'region':
      return sql`region`
    case 'city':
      return sql`city`

    // Computed fields
    case 'days_since_last_order':
      return sql`EXTRACT(DAY FROM NOW() - COALESCE(last_order_date, first_seen))`
    case 'days_since_first_seen':
      return sql`EXTRACT(DAY FROM NOW() - first_seen)`
    case 'discount_order_percentage':
      // Source: order events' properties.discount, like the rest of the
      // event-driven order metrics. Negative or non-numeric values are
      // treated as no-discount via the > 0 filter on the cast.
      return sql`COALESCE((
        SELECT ROUND(100.0 * COUNT(*) FILTER (
          WHERE (events.properties->>'discount')::numeric > 0
        ) / NULLIF(COUNT(*), 0))
        FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name IN ('order_placed', 'order_completed')
      ), 0)`
    case 'product_purchase_count':
      // Total distinct products the customer has bought. Pulls from BOTH the
      // orders table (Shopify-direct: camelCase) AND order events (event-
      // driven tenants like GWM/VirpanAI: snake_case). UNION + DISTINCT
      // dedups across sources; COALESCE on both casings tolerates either.
      return sql`COALESCE((
        SELECT COUNT(DISTINCT name) FROM (
          SELECT COALESCE(elem->>'product_name', elem->>'productName') AS name
          FROM orders, jsonb_array_elements(orders.line_items::jsonb) AS elem
          WHERE orders.customer_id = customers.id
          UNION ALL
          SELECT COALESCE(elem->>'product_name', elem->>'productName') AS name
          FROM events, jsonb_array_elements(events.properties->'line_items') AS elem
          WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
          AND events.event_name IN ('order_placed', 'order_completed')
        ) names
        WHERE name IS NOT NULL AND name <> ''
      ), 0)`
    case 'orders_in_last_30_days':
      // Count order events within the window — robust across both tenant
      // shapes since the orders table is empty for event-driven tenants
      // (eventProcessor's external-id dedup collapses GWM-style orders).
      return sql`COALESCE((
        SELECT COUNT(*) FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name IN ('order_placed', 'order_completed')
        AND events.timestamp > NOW() - INTERVAL '30 days'
      ), 0)`
    case 'orders_in_last_90_days':
      return sql`COALESCE((
        SELECT COUNT(*) FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name IN ('order_placed', 'order_completed')
        AND events.timestamp > NOW() - INTERVAL '90 days'
      ), 0)`
    case 'orders_in_last_365_days':
      return sql`COALESCE((
        SELECT COUNT(*) FROM events
        WHERE events.project_id = customers.project_id AND events.customer_id = customers.id
        AND events.event_name IN ('order_placed', 'order_completed')
        AND events.timestamp > NOW() - INTERVAL '365 days'
      ), 0)`

    // ──── Metrics-based fields (domain-agnostic — reads from customers.metrics JSONB) ────
    // Fintech metrics
    case 'total_transactions':
      return sql`COALESCE((metrics->>'total_transactions')::numeric, 0)`
    case 'total_debit':
      return sql`COALESCE((metrics->>'total_debit')::numeric, 0)`
    case 'total_credit':
      return sql`COALESCE((metrics->>'total_credit')::numeric, 0)`
    case 'avg_transaction_value':
      return sql`COALESCE((metrics->>'avg_transaction_value')::numeric, 0)`
    case 'days_since_last_txn':
      return sql`COALESCE((metrics->>'days_since_last_txn')::numeric, 999)`
    case 'emi_overdue':
      return sql`COALESCE((metrics->>'emi_overdue')::boolean, false)`
    case 'active_loans':
      return sql`COALESCE((metrics->>'active_loans')::numeric, 0)`
    case 'active_sips':
      return sql`COALESCE((metrics->>'active_sips')::numeric, 0)`
    case 'lifecycle_stage':
      return sql`COALESCE(metrics->>'lifecycle_stage', 'new')`
    case 'kyc_status':
      return sql`COALESCE(metrics->>'kyc_status', 'pending')`

    // SaaS metrics
    case 'feature_usage_count':
      return sql`COALESCE((metrics->>'feature_usage_count')::numeric, 0)`
    case 'days_since_signup':
      return sql`COALESCE((metrics->>'days_since_signup')::numeric, 0)`
    case 'plan':
      return sql`COALESCE(metrics->>'plan', 'free')`
    case 'mrr':
      return sql`COALESCE((metrics->>'mrr')::numeric, 0)`
    case 'trial_status':
      return sql`COALESCE(metrics->>'trial_status', 'no_trial')`

    // Customer attribute fields (from custom_attributes JSONB)
    case 'account_type':
      return sql`COALESCE(custom_attributes->>'account_type', '')`
    case 'balance_bracket':
      return sql`COALESCE(custom_attributes->>'balance_bracket', '')`
    case 'salary_bracket':
      return sql`COALESCE(custom_attributes->>'salary_bracket', '')`
    case 'city_tier':
      return sql`COALESCE(custom_attributes->>'city_tier', '')`
    case 'age_group':
      return sql`COALESCE(custom_attributes->>'age_group', '')`
    case 'transaction_channel':
      return sql`COALESCE(metrics->>'primary_channel', '')`
    case 'card_type':
      return sql`COALESCE(custom_attributes->>'card_type', '')`
    case 'loan_type':
      return sql`COALESCE(custom_attributes->>'loan_type', '')`
    case 'investment_type':
      return sql`COALESCE(custom_attributes->>'investment_type', '')`
    case 'portfolio_value':
      return sql`COALESCE((metrics->>'portfolio_value')::numeric, 0)`

    // Reachability (Gap 13) — exposed as boolean fields backed by computed
    // SQL. Filters like "reachable_email is_true" let marketers size
    // campaigns accurately without counting unsubscribed / no-email rows.
    case 'reachable_email':
      return sql`(email_subscribed IS TRUE AND email IS NOT NULL AND email <> '')`
    case 'reachable_sms':
      return sql`(sms_subscribed IS TRUE AND phone IS NOT NULL AND phone <> '')`
    case 'reachable_whatsapp':
      return sql`(phone IS NOT NULL AND phone <> '')`

    // AI & Prediction scores (0-100, stored in customers.metrics JSONB)
    case 'engagement_score':
      return sql`COALESCE((metrics->>'engagement_score')::numeric, 0)`
    case 'churn_risk':
      return sql`COALESCE((metrics->>'churn_risk')::numeric, 0)`
    case 'conversion_score':
      return sql`COALESCE((metrics->>'conversion_score')::numeric, 0)`
    case 'dormancy_risk':
      return sql`COALESCE((metrics->>'dormancy_risk')::numeric, 0)`
    case 'prediction_bucket':
      return sql`COALESCE(metrics->>'prediction_bucket', 'low')`

    // Reorder intelligence (written by batch_score.py for repeat purchase goals)
    case 'days_overdue':
      return sql`COALESCE((metrics->>'days_overdue')::numeric, 0)`
    case 'expected_reorder_days':
      return sql`COALESCE((metrics->>'expected_reorder_days')::numeric, 999)`
    case 'avg_cycle_days':
      return sql`COALESCE((metrics->>'avg_cycle_days')::numeric, 0)`
    case 'reorder_timing':
      return sql`COALESCE(metrics->>'reorder_timing', '')`

    default:
      // Per-prediction-goal filters: 'prediction:<uuid>:bucket' or
      // 'prediction:<uuid>:score'. Translates to a correlated subquery
      // against prediction_scores so a customer's bucket for a SPECIFIC
      // goal is filterable in segments. Validates the goal id is a UUID
      // before injecting (we still parameterize, but the regex narrows the
      // attack surface to bind-variable-level injection only).
      const predMatch = /^prediction:([0-9a-f-]{36}):(bucket|score)$/i.exec(field)
      if (predMatch) {
        const goalId = predMatch[1]
        const attr = predMatch[2]
        // Latest score per (customer, goal) — prediction_scores can have multiple
        // rows over time as the model re-runs; take the most recent computed_at.
        if (attr === 'bucket') {
          return sql`(
            SELECT bucket FROM prediction_scores
            WHERE prediction_scores.customer_id = customers.id
              AND prediction_scores.goal_id = ${goalId}
            ORDER BY prediction_scores.computed_at DESC
            LIMIT 1
          )`
        }
        return sql`COALESCE((
          SELECT score::numeric FROM prediction_scores
          WHERE prediction_scores.customer_id = customers.id
            AND prediction_scores.goal_id = ${goalId}
          ORDER BY prediction_scores.computed_at DESC
          LIMIT 1
        ), 0)`
      }

      // Fallback: try metrics JSONB, then custom_attributes JSONB
      // Validate field name to prevent unexpected values (defense-in-depth;
      // Drizzle's sql`` already parameterizes ${field} as a bind variable)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
        console.warn(`[Segments] Rejected invalid field name: ${field}`)
        return sql`''`
      }
      return sql`COALESCE(
        metrics->>${field},
        custom_attributes->>${field},
        ''
      )`
  }
}

// ============ JS EVALUATION (single customer) ============

/**
 * Evaluates a FilterConfig against a single Customer object in memory.
 * Supports nested groups. Product/month filters fall back to false (use SQL path).
 */
export function evaluateFilter(filters: FilterConfig, customer: Customer): boolean {
  const results = filters.rules.map(item => evaluateItem(item, customer))
  return filters.logic === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean)
}

function evaluateItem(item: FilterRule | FilterGroup | AggregateRule, customer: Customer): boolean {
  if ('type' in item && item.type === 'group') return evaluateGroup(item, customer)
  // Scoped aggregates need order/event rows — not in a single Customer object.
  // SQL path is authoritative for membership; mirror has_purchased → false here.
  if ('type' in item && item.type === 'aggregate') return false
  return evaluateRule(item as FilterRule, customer)
}

function evaluateGroup(group: FilterGroup, customer: Customer): boolean {
  // Recurse through nested groups — mirrors groupToSql so the SQL and in-memory
  // paths produce identical results.
  const results = group.rules.map(item => evaluateItem(item, customer))
  return group.logic === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean)
}

function evaluateRule(rule: FilterRule, customer: Customer): boolean {
  // Engagement fields require querying the events table — SQL path only
  if (rule.field === 'days_since_email_open' || rule.field === 'days_since_email_click') {
    return false
  }
  // Dealer-attribute fields require JOIN against agents — SQL path only
  if (rule.field === 'dealer_name' || rule.field === 'dealer_city' || rule.field === 'dealer_region') {
    return false
  }
  // Order-scoped fields + the date-range operator need order/event data — SQL
  // path is authoritative (same-order correlation can't be evaluated in-memory).
  if (rule.field === 'order_total' || rule.field === 'order_date' || rule.operator === 'between_dates') {
    return false
  }

  // Product/date operators can't be evaluated in-memory without order data
  // These return false as fallback — SQL path is the authoritative evaluator
  switch (rule.operator) {
    case 'has_purchased':
    case 'has_not_purchased':
    case 'has_viewed':
    case 'has_not_viewed':
    case 'has_wishlisted':
    case 'has_not_wishlisted':
    case 'in_month':
    case 'in_year':
      return false // Requires DB subquery — use SQL evaluation
    case 'before_date':
    case 'after_date': {
      const fieldValue = getFieldValue(rule.field, customer)
      if (!fieldValue) return false
      const fieldDate = new Date(fieldValue as string | Date).getTime()
      const targetDate = new Date(rule.value as string).getTime()
      return rule.operator === 'before_date' ? fieldDate < targetDate : fieldDate > targetDate
    }
    default:
      break
  }

  const fieldValue = getFieldValue(rule.field, customer)
  const target = rule.value

  switch (rule.operator) {
    case 'is':
      return fieldValue === target
    case 'is_not':
      return fieldValue !== target
    case 'greater_than':
      return (fieldValue as number) > (target as number)
    case 'less_than':
      return (fieldValue as number) < (target as number)
    case 'between': {
      const [min, max] = target as [number, number]
      const v = fieldValue as number
      return v >= min && v <= max
    }
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(target).toLowerCase())
    case 'begins_with':
      return String(fieldValue).toLowerCase().startsWith(String(target).toLowerCase())
    case 'ends_with':
      return String(fieldValue).toLowerCase().endsWith(String(target).toLowerCase())
    case 'is_true':
      return fieldValue === true
    case 'is_false':
      return fieldValue === false
    default:
      return false
  }
}

function getFieldValue(field: string, customer: Customer): unknown {
  switch (field) {
    case 'total_orders':
      return customer.totalOrders
    case 'total_spent':
      return customer.totalSpent
    case 'avg_order_value':
      return customer.avgOrderValue
    case 'clv':
      return customer.clv
    case 'email':
      return customer.email
    case 'name':
      return customer.name
    case 'phone':
      return customer.phone
    case 'email_subscribed':
      return customer.emailSubscribed
    case 'sms_subscribed':
      return customer.smsSubscribed

    // Reachability — composite booleans for the JS evaluation path
    case 'reachable_email':
      return customer.emailSubscribed === true && !!customer.email
    case 'reachable_sms':
      return customer.smsSubscribed === true && !!customer.phone
    case 'reachable_whatsapp':
      return !!customer.phone
    case 'first_seen':
      return customer.firstSeen
    case 'last_seen':
      return customer.lastSeen
    case 'first_order_date':
      return customer.firstOrderDate
    case 'last_order_date':
      return customer.lastOrderDate
    case 'days_since_last_order':
      return customer.lastOrderDate ? daysSince(customer.lastOrderDate) : daysSince(customer.firstSeen)
    case 'days_since_first_seen':
      return daysSince(customer.firstSeen)
    case 'discount_order_percentage':
    case 'product_purchase_count':
    case 'orders_in_last_30_days':
    case 'orders_in_last_90_days':
    case 'orders_in_last_365_days':
      return 0 // Requires DB — fallback for JS evaluation

    // Metrics-based fields — read from customer.metrics JSONB
    case 'total_transactions':
    case 'total_debit':
    case 'total_credit':
    case 'avg_transaction_value':
    case 'days_since_last_txn':
    case 'active_loans':
    case 'active_sips':
    case 'feature_usage_count':
    case 'days_since_signup':
    case 'mrr':
    case 'portfolio_value':
    case 'engagement_score':
    case 'churn_risk':
    case 'conversion_score':
    case 'dormancy_risk':
    case 'days_overdue':
    case 'expected_reorder_days':
    case 'avg_cycle_days':
      return Number(customer.metrics?.[field] ?? 0)

    case 'prediction_bucket':
      return customer.metrics?.prediction_bucket ?? 'low'

    case 'emi_overdue':
      return customer.metrics?.emi_overdue === true

    case 'lifecycle_stage':
    case 'kyc_status':
    case 'plan':
    case 'trial_status':
    case 'transaction_channel':
    case 'reorder_timing':
      return customer.metrics?.[field] ?? ''

    // Customer attributes
    case 'account_type':
    case 'balance_bracket':
    case 'salary_bracket':
    case 'city_tier':
    case 'age_group':
    case 'card_type':
    case 'loan_type':
    case 'investment_type':
      return customer.customAttributes?.[field] ?? ''

    default:
      // Fallback: check metrics, then customAttributes
      return customer.metrics?.[field] ?? customer.customAttributes?.[field] ?? undefined
  }
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

// ============ SCOPED-AGGREGATE: PURE EVALUATOR ============
// A row-level mirror of the SQL compiler, used by unit tests and any future
// single-customer evaluation. The ORDER is the contract: timeframe → scope →
// aggregate → compare. It must produce the same verdicts as compileAggregateRule.

/** One behavioural row (a line item with its order date). */
export type AggregateSourceRow = {
  date: string | Date
  product_id?: string
  product_name?: string
  product_collection?: string
  product_type?: string
  price?: number
  quantity?: number
  order_id?: string
}

const SCOPE_ROW_KEY: Record<string, keyof AggregateSourceRow> = {
  product_id: 'product_id',
  product_name: 'product_name',
  collection: 'product_collection',
  product_category: 'product_type',
}

function rowValue(r: AggregateSourceRow, field?: AggregateField): number {
  if (field === 'quantity') return Number(r.quantity ?? 0)
  if (field === 'price') return Number(r.price ?? 0)
  return Number(r.price ?? 0) * Number(r.quantity ?? 1) // line_value = price × quantity
}

function withinTimeframe(r: AggregateSourceRow, tf: AggregateTimeframe | undefined): boolean {
  if (!tf || tf.type === 'all_time') return true
  const t = new Date(r.date).getTime()
  if (Number.isNaN(t)) return false
  if (tf.type === 'last_n_days') return t >= Date.now() - tf.n * 86_400_000
  const start = new Date(tf.start).getTime()
  const endExclusive = new Date(tf.end).getTime() + 86_400_000 // inclusive end → half-open
  return t >= start && t < endExclusive
}

function rowMatchesScope(r: AggregateSourceRow, filter: FilterRule): boolean {
  const f = filter.field
  if (f === 'price' || f === 'quantity') {
    const col = Number(r[f] ?? 0)
    const v = filter.value
    switch (filter.operator) {
      case 'is':           return col === Number(v)
      case 'greater_than': return col > Number(v)
      case 'less_than':    return col < Number(v)
      case 'between':      { const [lo, hi] = v as [number, number]; return col >= lo && col <= hi }
      default:             return true
    }
  }
  const key = SCOPE_ROW_KEY[f]
  if (!key) return true
  const col = String(r[key] ?? '')
  const v = filter.value
  if (Array.isArray(v)) {
    const vals = (v as unknown[]).map(String)
    return filter.operator === 'is_not' ? !vals.includes(col) : vals.includes(col)
  }
  const s = String(v ?? '')
  switch (filter.operator) {
    case 'is':          return col === s
    case 'is_not':      return col !== s
    case 'contains':    return col.toLowerCase().includes(s.toLowerCase())
    case 'begins_with': return col.toLowerCase().startsWith(s.toLowerCase())
    case 'ends_with':   return col.toLowerCase().endsWith(s.toLowerCase())
    default:            return col === s
  }
}

function runAggregateRows(rows: AggregateSourceRow[], agg: AggregateRule['aggregate']): number {
  if (agg.fn === 'COUNT') return rows.length
  if (agg.fn === 'COUNT_DISTINCT') return new Set(rows.map(r => r.order_id ?? '')).size
  const vals = rows.map(r => rowValue(r, agg.field))
  if (vals.length === 0) return 0
  switch (agg.fn) {
    case 'AVG': return vals.reduce((a, b) => a + b, 0) / vals.length
    case 'MIN': return Math.min(...vals)
    case 'MAX': return Math.max(...vals)
    case 'SUM':
    default:    return vals.reduce((a, b) => a + b, 0)
  }
}

function compareMetric(metric: number, op: AggregateCompareOp, value: number | [number, number]): boolean {
  switch (op) {
    case 'is':  return metric === Number(value)
    case 'gt':  return metric > Number(value)
    case 'gte': return metric >= Number(value)
    case 'lt':  return metric < Number(value)
    case 'lte': return metric <= Number(value)
    case 'between': { const [lo, hi] = value as [number, number]; return metric >= lo && metric <= hi }
    default:    return false
  }
}

/** Evaluate one scoped-aggregate leaf against a customer's behavioural rows.
 *  timeframe → scope → aggregate → compare. Zero surviving rows = no GROUP-BY
 *  group in SQL = not matched (for every operator), so we return false. */
export function evaluateAggregateRows(rule: AggregateRule, rows: AggregateSourceRow[]): boolean {
  let kept = rows.filter(r => withinTimeframe(r, rule.timeframe))
  for (const f of rule.scope?.filters ?? []) kept = kept.filter(r => rowMatchesScope(r, f))
  if (kept.length === 0) return false
  return compareMetric(runAggregateRows(kept, rule.aggregate), rule.operator, rule.value)
}
