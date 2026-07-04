import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { getDomainFields } from './domainRegistry.js'
import { getProjectFieldDefs } from './agentFieldDefs.js'
import type { DomainType, DomainFieldDef, FilterConfig, FilterRule, FilterGroup, AggregateRule , EventOccurrenceRule } from '@storees/shared'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
}

type AiSegmentResult = {
  filters: FilterConfig
  summary: string
}

// ---- System prompt builder ----

function buildSystemPrompt(fields: DomainFieldDef[]): string {
  // Group fields by category for readability
  const byCategory: Record<string, DomainFieldDef[]> = {}
  for (const f of fields) {
    if (!byCategory[f.category]) byCategory[f.category] = []
    byCategory[f.category].push(f)
  }

  const fieldDocs = Object.entries(byCategory).map(([cat, flds]) => {
    const lines = flds.map(f => {
      const ops = (f.operators ?? []).join(', ')
      const opts = f.options?.length ? ` — options: ${f.options.join(', ')}` : ''
      return `- ${f.field} (${f.type}): ${ops}${opts}`
    })
    return `### ${cat}\n${lines.join('\n')}`
  }).join('\n\n')

  const moneyFields = fields.filter(f => f.type === 'number' && f.metricKey && ['total_spent', 'total_debit', 'total_credit', 'avg_order_value', 'clv', 'avg_transaction_value', 'portfolio_value', 'mrr'].includes(f.field))
  const moneyNote = moneyFields.length
    ? `All monetary values (${moneyFields.map(f => f.field).join(', ')}) are in PAISE/smallest currency unit. ₹5000 = 500000, $100 = 10000.`
    : ''

  return `You are a segment filter generator for a customer data platform.

Your job: convert natural language customer segment descriptions (in ANY language) into a FilterConfig JSON object.

## FilterConfig Schema

{
  "logic": "AND" | "OR",
  "rules": [
    { "field": "<field_name>", "operator": "<operator>", "value": <value> }
  ]
}

## Available Fields and Operators

${fieldDocs}

## CRITICAL RULES
1. ${moneyNote || 'Use numeric values as-is for non-monetary number fields.'}
2. For boolean fields (is_true/is_false), set value to true or false.
3. For "between" operator, value must be an array of two numbers: [min, max].
4. For date fields, value must be an ISO 8601 date string (YYYY-MM-DD).
5. Use "AND" logic by default unless the user explicitly says "any" or "or".
6. Field names are ALWAYS snake_case. Never use camelCase.
7. For select fields, value must be one of the listed options exactly.
8. Output ONLY the FilterConfig JSON. No explanations, no markdown, no code fences.

## Behavioural AGGREGATE conditions (scoped sum/count over orders)

Some segments cannot be expressed with the customer fields above — they need to
SUM or COUNT a customer's ORDER LINE ITEMS, filtered by product/collection/
category and a date window, then compare to a threshold. Phrases like "spent
over X on <product/brand>", "bought more than N units of <X>", "ordered over X
worth in the last 30 days" are aggregates. For these, put an "aggregate" leaf in
the "rules" array (it may sit alongside normal rules):

{
  "type": "aggregate",
  "source": "order_fulfilled",
  "scope": { "operator": "AND", "filters": [ { "field": "<scope_field>", "operator": "<op>", "value": <value> } ] },
  "timeframe": { "type": "all_time" } | { "type": "last_n_days", "n": <int> } | { "type": "between", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "aggregate": { "fn": "SUM"|"COUNT"|"COUNT_DISTINCT"|"AVG"|"MIN"|"MAX", "field": "line_value"|"quantity"|"price" },
  "operator": "gt"|"gte"|"lt"|"lte"|"is"|"between",
  "value": <number, or [min,max] for between>
}

Scope filter fields (these filter the LINE ITEMS before aggregating — NOT the same as the customer fields above):
- product_name (is, is_not): a product title
- collection (is, is_not): a collection / brand name
- product_category (is, is_not): a category
- price (is, greater_than, less_than, between): unit price
- quantity (is, greater_than, less_than, between)

Aggregate field: line_value (= price × quantity — use for "spent"/"worth"), quantity (use for "units"), price. COUNT omits "field". "count units" = SUM of quantity.

AGGREGATE CRITICAL RULES:
- Scope + timeframe select the rows FIRST, then aggregate, then compare. "spent 20000 on Brand X" = SUM line_value WHERE collection=Brand X > 20000. Do NOT use total_spent for product/brand-scoped spend.
- line_value / price are in MAJOR currency units (rupees), NOT paise. "20000" stays 20000. (This is the OPPOSITE of total_spent, which is paise.)
- Omit "timeframe" or use {"type":"all_time"} when no date window is mentioned.

## Field-mapping guidance

DEALER VS CUSTOMER GEOGRAPHY — the most common confusion:
- "city" / "region" describe THE CUSTOMER's location
- "dealer_name" / "dealer_city" / "dealer_region" describe the customer's
  ASSIGNED DEALER (B2B model — each customer is owned by one dealer)

CRITICAL — prefer dealer_name when geography is mentioned with "dealer":
In real B2B catalogues the geography is almost always embedded in the dealer
name (e.g. "TIRUVARUR GWM", "MUMBAI WEST DISTRIBUTOR"). The dealer_city
column is nearly always empty — using it produces zero matches.

So when the user says "dealers FROM <place>" or "dealers IN <place>":
  → use dealer_name with operator "contains" and the place as value.
  → Do NOT use dealer_city even though it's a valid field.
The only exception: if the user explicitly says "dealer's CITY is X" with
the word "city" — then use dealer_city.

For other phrases:
- "dealer's name has X" / "dealer named X"      → dealer_name + contains
- "dealers in <state>" / "dealer state is X"    → dealer_region + contains
- "Tamil Nadu customers"                         → region (the customer's own region) + is
- "customers under <DealerName>" exact full name → dealer_name + is
- "from <place>" / "in <place>" WITHOUT "dealer" → city (the customer's own city)

## Examples

Input: "Active customers who haven't transacted in 30 days"
Output: {"logic":"AND","rules":[{"field":"lifecycle_stage","operator":"is","value":"active"},{"field":"days_since_last_txn","operator":"greater_than","value":30}]}

Input: "Customers with verified KYC and active SIPs"
Output: {"logic":"AND","rules":[{"field":"kyc_status","operator":"is","value":"verified"},{"field":"active_sips","operator":"greater_than","value":0}]}

Input: "கடந்த 90 நாட்களில் பரிவர்த்தனை செய்யாத வாடிக்கையாளர்கள்"
Output: {"logic":"AND","rules":[{"field":"days_since_last_txn","operator":"greater_than","value":90}]}

Input: "High value customers with portfolio over 5 lakh"
Output: {"logic":"AND","rules":[{"field":"portfolio_value","operator":"greater_than","value":50000000}]}

Input: "Customers whose dealers are from Tiruvarur"
Output: {"logic":"AND","rules":[{"field":"dealer_name","operator":"contains","value":"Tiruvarur"}]}

Input: "Customers under dealers in Tamil Nadu"
Output: {"logic":"AND","rules":[{"field":"dealer_region","operator":"contains","value":"Tamil Nadu"}]}

Input: "Customers in Chennai"
Output: {"logic":"AND","rules":[{"field":"city","operator":"is","value":"Chennai"}]}

Input: "Customers from Tamil Nadu who spent over 10000"
Output: {"logic":"AND","rules":[{"field":"region","operator":"is","value":"Tamil Nadu"},{"field":"total_spent","operator":"greater_than","value":1000000}]}

Input: "Customers who spent over 20000 on Factory Price Gadgets between 20 May 2026 and 20 July 2026"
Output: {"logic":"AND","rules":[{"type":"aggregate","source":"order_fulfilled","scope":{"operator":"AND","filters":[{"field":"collection","operator":"is","value":"Factory Price Gadgets"}]},"timeframe":{"type":"between","start":"2026-05-20","end":"2026-07-20"},"aggregate":{"fn":"SUM","field":"line_value"},"operator":"gt","value":20000}]}

Input: "Customers who bought more than 10 units of GOWELL-1234 in the last 90 days"
Output: {"logic":"AND","rules":[{"type":"aggregate","source":"order_fulfilled","scope":{"operator":"AND","filters":[{"field":"product_name","operator":"is","value":"GOWELL-1234"}]},"timeframe":{"type":"last_n_days","n":90},"aggregate":{"fn":"SUM","field":"quantity"},"operator":"gt","value":10}]}

Input: "Customers in Chennai who have spent more than 5000 in the Mattress collection"
Output: {"logic":"AND","rules":[{"field":"city","operator":"is","value":"Chennai"},{"type":"aggregate","source":"order_fulfilled","scope":{"operator":"AND","filters":[{"field":"collection","operator":"is","value":"Mattress"}]},"aggregate":{"fn":"SUM","field":"line_value"},"operator":"gt","value":5000}]}`
}

// ---- Summary generator ----

function generateSummary(filters: AiSegmentResult['filters'], fields: DomainFieldDef[]): string {
  const labelMap: Record<string, string> = {}
  for (const f of fields) labelMap[f.field] = f.label

  const OPERATOR_LABELS: Record<string, string> = {
    greater_than: '>',
    less_than: '<',
    between: 'between',
    is: 'is',
    is_not: 'is not',
    contains: 'contains',
    begins_with: 'starts with',
    ends_with: 'ends with',
    before_date: 'before',
    after_date: 'after',
    has_purchased: 'purchased',
    has_not_purchased: 'not purchased',
    is_true: 'is true',
    is_false: 'is false',
  }

  const MONEY_FIELDS = new Set(['total_spent', 'total_debit', 'total_credit', 'avg_order_value', 'clv', 'avg_transaction_value', 'portfolio_value', 'mrr'])

  function formatValue(field: string, value: unknown): string {
    if (typeof value === 'number' && MONEY_FIELDS.has(field)) {
      return `₹${(value / 100).toLocaleString()}`
    }
    return String(value)
  }

  const AGG_FN_LABEL: Record<string, string> = { SUM: 'sum of', COUNT: 'count of', COUNT_DISTINCT: 'distinct count of', AVG: 'average', MIN: 'min', MAX: 'max' }
  const AGG_OP_LABEL: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', is: '=', between: 'between' }

  const describe = (item: FilterRule | FilterGroup | AggregateRule | EventOccurrenceRule): string => {
    if ('type' in item && item.type === 'event') {
      const tf = item.timeframeDays ? ` in last ${item.timeframeDays}d` : ''
      return `performed ${item.event} ${item.countOp.replace('_', ' ')} ${item.count}×${tf}`
    }
    if ('type' in item && item.type === 'group') {
      return `(${item.rules.map(describe).join(item.logic === 'OR' ? ' or ' : ' and ')})`
    }
    if ('type' in item && item.type === 'aggregate') {
      const fn = AGG_FN_LABEL[item.aggregate.fn] ?? item.aggregate.fn
      const fld = item.aggregate.field ? ` ${item.aggregate.field.replace(/_/g, ' ')}` : ''
      const scope = (item.scope?.filters ?? [])
        .map(f => `${f.field.replace(/_/g, ' ')} ${f.operator.replace(/_/g, ' ')} ${Array.isArray(f.value) ? f.value.join('–') : String(f.value)}`)
        .join(' and ')
      const tf = item.timeframe?.type === 'between' ? `, ${item.timeframe.start}–${item.timeframe.end}`
        : item.timeframe?.type === 'last_n_days' ? `, last ${item.timeframe.n}d` : ''
      const val = Array.isArray(item.value) ? `${item.value[0]}–${item.value[1]}` : item.value
      return `${fn}${fld} on orders${scope ? ` where ${scope}` : ''}${tf} ${AGG_OP_LABEL[item.operator] ?? item.operator} ${val}`
    }
    const rule = item
    const fieldLabel = labelMap[rule.field] ?? rule.field
    const opLabel = OPERATOR_LABELS[rule.operator] ?? rule.operator
    if (rule.operator === 'is_true') return `${fieldLabel}`
    if (rule.operator === 'is_false') return `not ${fieldLabel}`
    if (rule.operator === 'between' && Array.isArray(rule.value)) {
      return `${fieldLabel} ${formatValue(rule.field, rule.value[0])}–${formatValue(rule.field, rule.value[1])}`
    }
    if (rule.operator === 'has_purchased') return `purchased "${rule.value}"`
    if (rule.operator === 'has_not_purchased') return `not purchased "${rule.value}"`
    return `${fieldLabel} ${opLabel} ${formatValue(rule.field, rule.value)}`
  }

  return filters.rules.map(describe).join(filters.logic === 'AND' ? ' and ' : ' or ')
}

// ---- Main export ----

/**
 * Convert natural language to FilterConfig using Groq (llama-3.3-70b-versatile).
 * Domain-aware: loads field definitions from domainRegistry based on project's domainType.
 */
export async function generateSegmentFilter(
  projectId: string,
  input: string,
  history?: ChatMessage[],
): Promise<AiSegmentResult> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  // Resolve domain for this project
  const [project] = await db.select({ domainType: projects.domainType }).from(projects).where(eq(projects.id, projectId)).limit(1)
  const domainType: DomainType = (project?.domainType as DomainType) ?? 'ecommerce'
  // Enriched field set: includes dynamic B2B fields (Dealer, Region, City,
  // Dealer Name/City/Region) when the project has agentScopedAccess enabled.
  // Same set the segment-builder UI sees → AI generates filters that are
  // valid against the same evaluator.
  const baseFields = getDomainFields(domainType)
  const fields = await getProjectFieldDefs(projectId, baseFields)

  const validFields = new Set(fields.map(f => f.field))
  const systemPrompt = buildSystemPrompt(fields)

  // Build messages (OpenAI-compatible format)
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.text })
    }
  }

  messages.push({ role: 'user', content: input.slice(0, 500) })

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const status = response.status
    if (status === 429) {
      throw new Error('AI assistant is busy. Please try again in a moment.')
    }
    const errText = await response.text().catch(() => 'Unknown error')
    console.error(`[AI] Groq API error: ${status} — ${errText}`)
    throw new Error('AI service unavailable')
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content

  if (!text) {
    throw new Error("Couldn't understand the request. Try rephrasing.")
  }

  const filters = JSON.parse(text)

  if (!filters.logic || !Array.isArray(filters.rules) || filters.rules.length === 0) {
    throw new Error("Couldn't generate valid filters. Try being more specific.")
  }

  // Recursive, node-type-aware validation: attribute rules check field/operator
  // against the domain schema; groups recurse; aggregate leaves validate their
  // own shape (and their scope-filter fields against the line-item field set).
  const AGG_SCOPE_FIELDS = new Set(['product_name', 'collection', 'product_category', 'price', 'quantity'])
  const validateNode = (item: unknown): void => {
    const node = (item ?? {}) as Record<string, unknown>
    if (node.type === 'group') {
      if (!Array.isArray(node.rules) || node.rules.length === 0) {
        throw new Error("Couldn't generate valid filters. Try being more specific.")
      }
      for (const r of node.rules) validateNode(r)
      return
    }
    if (node.type === 'aggregate') {
      const agg = node.aggregate as Record<string, unknown> | undefined
      if (!agg?.fn || !node.operator) {
        throw new Error("Couldn't build the behavioural condition. Try rephrasing.")
      }
      const scope = node.scope as { filters?: Array<Record<string, unknown>> } | undefined
      for (const f of scope?.filters ?? []) {
        if (!f?.field || !AGG_SCOPE_FIELDS.has(f.field as string)) {
          throw new Error("Couldn't map the behavioural filter. Try rephrasing.")
        }
      }
      return
    }
    if (!node.field || !node.operator) {
      throw new Error("Couldn't map all conditions to filter fields. Try rephrasing.")
    }
    if (!validFields.has(node.field as string)) {
      throw new Error(`Unknown field "${String(node.field)}". Try rephrasing your request.`)
    }
  }
  for (const item of filters.rules) validateNode(item)

  const summary = generateSummary(filters, fields)
  console.log(`[AI] [${domainType}] Segment query: "${input}" → ${filters.rules.length} rules`)

  return { filters, summary }
}

/**
 * Check if Groq API key is configured.
 */
export function isAiEnabled(): boolean {
  return !!process.env.GROQ_API_KEY
}
