import { sql, and, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { FilterConfig, FilterRule, FilterGroup, Customer } from '@storees/shared'

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

function ruleOrGroupToSql(item: FilterRule | FilterGroup): SQL {
  if ('type' in item && item.type === 'group') {
    return groupToSql(item)
  }
  return ruleToSql(item as FilterRule)
}

function groupToSql(group: FilterGroup): SQL {
  // Groups can contain rules OR nested groups. Recurse through
  // ruleOrGroupToSql so arbitrary depth works.
  const clauses = group.rules.map(ruleOrGroupToSql)
  if (clauses.length === 0) return sql`TRUE`
  if (clauses.length === 1) return clauses[0]
  return group.logic === 'AND' ? and(...clauses)! : or(...clauses)!
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

  // Product-based operators use special subqueries
  switch (rule.operator) {
    case 'has_purchased':
      // For product_category field, match by product_type via products table
      if (rule.field === 'product_category') {
        return sql`EXISTS (
          SELECT 1 FROM orders o
          JOIN products p ON p.project_id = o.project_id
          WHERE o.customer_id = customers.id
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(o.line_items::jsonb) item
            WHERE item->>'productId' = p.shopify_product_id
          )
          AND p.product_type = ${value}
        )`
      }
      // value is product name (string) — check if customer has any order with this product
      return sql`EXISTS (
        SELECT 1 FROM orders
        WHERE orders.customer_id = customers.id
        AND orders.line_items::jsonb @> ${JSON.stringify([{ productName: value }])}::jsonb
      )`
    case 'has_not_purchased':
      // For product_category field, match by product_type via products table
      if (rule.field === 'product_category') {
        return sql`NOT EXISTS (
          SELECT 1 FROM orders o
          JOIN products p ON p.project_id = o.project_id
          WHERE o.customer_id = customers.id
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(o.line_items::jsonb) item
            WHERE item->>'productId' = p.shopify_product_id
          )
          AND p.product_type = ${value}
        )`
      }
      return sql`NOT EXISTS (
        SELECT 1 FROM orders
        WHERE orders.customer_id = customers.id
        AND orders.line_items::jsonb @> ${JSON.stringify([{ productName: value }])}::jsonb
      )`
    case 'has_viewed':
      // Check if customer has product_viewed events for a product name or category
      if (rule.field === 'product_category') {
        return sql`EXISTS (
          SELECT 1 FROM events
          WHERE events.customer_id = customers.id
          AND events.event_name = 'product_viewed'
          AND events.properties->>'product_type' = ${value}
        )`
      }
      return sql`EXISTS (
        SELECT 1 FROM events
        WHERE events.customer_id = customers.id
        AND events.event_name = 'product_viewed'
        AND events.properties->>'product_name' = ${value}
      )`
    case 'has_not_viewed':
      if (rule.field === 'product_category') {
        return sql`NOT EXISTS (
          SELECT 1 FROM events
          WHERE events.customer_id = customers.id
          AND events.event_name = 'product_viewed'
          AND events.properties->>'product_type' = ${value}
        )`
      }
      return sql`NOT EXISTS (
        SELECT 1 FROM events
        WHERE events.customer_id = customers.id
        AND events.event_name = 'product_viewed'
        AND events.properties->>'product_name' = ${value}
      )`
    case 'has_wishlisted':
      return sql`EXISTS (
        SELECT 1 FROM events
        WHERE events.customer_id = customers.id
        AND events.event_name = 'added_to_wishlist'
        AND events.properties->>'product_name' = ${value}
      )`
    case 'has_not_wishlisted':
      return sql`NOT EXISTS (
        SELECT 1 FROM events
        WHERE events.customer_id = customers.id
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
        WHERE events.customer_id = customers.id
        AND events.event_name IN ${eventNames}
        AND events.timestamp >= NOW() - (${num}::int * INTERVAL '1 day')
      )`
    }
    // greater_than N: "has NOT opened in the last N days" (inc. never-openers) → NOT EXISTS within window
    if (op === 'greater_than') {
      return sql`NOT EXISTS (
        SELECT 1 FROM events
        WHERE events.customer_id = customers.id
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
        WHERE events.customer_id = customers.id
        AND events.event_name IN ${eventNames}
        AND events.timestamp >= NOW() - (${maxDays}::int * INTERVAL '1 day')
        AND events.timestamp <= NOW() - (${minDays}::int * INTERVAL '1 day')
      )`
    }
    // is N: opened exactly N days ago (rarely useful, support for completeness)
    if (op === 'is') {
      return sql`EXISTS (
        SELECT 1 FROM events
        WHERE events.customer_id = customers.id
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
      return sql`COALESCE((
        SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE discount > 0) / NULLIF(COUNT(*), 0))
        FROM orders WHERE orders.customer_id = customers.id
      ), 0)`
    case 'product_purchase_count':
      // Used with a value parameter — but as a standalone field, returns total distinct products
      return sql`COALESCE((
        SELECT COUNT(DISTINCT elem->>'productName')
        FROM orders, jsonb_array_elements(orders.line_items::jsonb) AS elem
        WHERE orders.customer_id = customers.id
      ), 0)`
    case 'orders_in_last_30_days':
      return sql`COALESCE((
        SELECT COUNT(*) FROM orders
        WHERE orders.customer_id = customers.id
        AND orders.created_at > NOW() - INTERVAL '30 days'
      ), 0)`
    case 'orders_in_last_90_days':
      return sql`COALESCE((
        SELECT COUNT(*) FROM orders
        WHERE orders.customer_id = customers.id
        AND orders.created_at > NOW() - INTERVAL '90 days'
      ), 0)`
    case 'orders_in_last_365_days':
      return sql`COALESCE((
        SELECT COUNT(*) FROM orders
        WHERE orders.customer_id = customers.id
        AND orders.created_at > NOW() - INTERVAL '365 days'
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
  const results = filters.rules.map(item => {
    if ('type' in item && item.type === 'group') {
      return evaluateGroup(item, customer)
    }
    return evaluateRule(item as FilterRule, customer)
  })

  return filters.logic === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean)
}

function evaluateGroup(group: FilterGroup, customer: Customer): boolean {
  // Recurse through nested groups — mirrors groupToSql so the SQL and in-memory
  // paths produce identical results.
  const results = group.rules.map(item => {
    if ('type' in item && item.type === 'group') {
      return evaluateGroup(item, customer)
    }
    return evaluateRule(item as FilterRule, customer)
  })
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
