const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

// Field names MUST match SegmentFilterBuilder's FIELD_CATEGORIES (snake_case)
const SYSTEM_PROMPT = `You are a segment filter generator for an e-commerce customer data platform.

Your job: convert natural language customer segment descriptions (in ANY language) into a FilterConfig JSON object.

## FilterConfig Schema

{
  "logic": "AND" | "OR",
  "rules": [
    { "field": "<field_name>", "operator": "<operator>", "value": <value> }
  ]
}

## Available Fields and Operators

### Purchase Activity
- total_orders (number): is, is_not, greater_than, less_than, between
- total_spent (number): is, is_not, greater_than, less_than, between
- avg_order_value (number): is, is_not, greater_than, less_than, between
- clv (number): is, is_not, greater_than, less_than, between
- discount_order_percentage (number): is, is_not, greater_than, less_than, between

### Product Filters
- product_name (product): has_purchased, has_not_purchased
- collection_name (collection): has_purchased, has_not_purchased

### Order Frequency
- orders_in_last_30_days (number): is, is_not, greater_than, less_than, between
- orders_in_last_90_days (number): is, is_not, greater_than, less_than, between
- orders_in_last_365_days (number): is, is_not, greater_than, less_than, between
- days_since_last_order (number): is, is_not, greater_than, less_than, between

### Customer Properties
- email (string): is, is_not, contains, begins_with, ends_with
- name (string): is, is_not, contains, begins_with, ends_with

### Engagement
- days_since_first_seen (number): is, is_not, greater_than, less_than, between
- first_seen (date): before_date, after_date
- last_seen (date): before_date, after_date

### Subscriptions
- email_subscribed (boolean): is_true, is_false
- sms_subscribed (boolean): is_true, is_false

## CRITICAL RULES
1. All monetary values are in PAISE (smallest currency unit). ₹5000 = 500000, $100 = 10000, ₹1000 = 100000.
2. For boolean fields (is_true/is_false), set value to true or false.
3. For "between" operator, value must be an array of two numbers: [min, max].
4. For date fields, value must be an ISO 8601 date string (YYYY-MM-DD).
5. Use "AND" logic by default unless the user explicitly says "any" or "or".
6. For product searches, translate product names to English for the value.
7. For collection-based queries (e.g. "from Summer Collection", "bought from category X"), use collection_name with has_purchased/has_not_purchased.
8. Field names are ALWAYS snake_case. Never use camelCase.
9. Output ONLY the FilterConfig JSON. No explanations, no markdown, no code fences.

## Examples

Input: "Customers who spent more than 5000 rupees"
Output: {"logic":"AND","rules":[{"field":"total_spent","operator":"greater_than","value":500000}]}

Input: "People who ordered more than 3 times and are email subscribers"
Output: {"logic":"AND","rules":[{"field":"total_orders","operator":"greater_than","value":3},{"field":"email_subscribed","operator":"is_true","value":true}]}

Input: "கடந்த 90 நாட்களில் ஆர்டர் செய்யாத வாடிக்கையாளர்கள்"
Output: {"logic":"AND","rules":[{"field":"days_since_last_order","operator":"greater_than","value":90}]}

Input: "Clients qui ont acheté des chaussures et dépensé plus de 10000 roupies"
Output: {"logic":"AND","rules":[{"field":"product_name","operator":"has_purchased","value":"shoes"},{"field":"total_spent","operator":"greater_than","value":1000000}]}

Input: "高价值客户，CLV大于50000"
Output: {"logic":"AND","rules":[{"field":"clv","operator":"greater_than","value":5000000}]}

Input: "Customers who spent between 1000 and 5000 and haven't ordered in 30 days"
Output: {"logic":"AND","rules":[{"field":"total_spent","operator":"between","value":[100000,500000]},{"field":"days_since_last_order","operator":"greater_than","value":30}]}

Input: "Recent buyers in last 30 days who bought shoes"
Output: {"logic":"AND","rules":[{"field":"orders_in_last_30_days","operator":"greater_than","value":0},{"field":"product_name","operator":"has_purchased","value":"shoes"}]}

Input: "Customers who bought from Summer Collection and spent over 3000"
Output: {"logic":"AND","rules":[{"field":"collection_name","operator":"has_purchased","value":"Summer Collection"},{"field":"total_spent","operator":"greater_than","value":300000}]}`

type ChatMessage = {
  role: 'user' | 'model'
  text: string
}

type AiSegmentResult = {
  filters: {
    logic: 'AND' | 'OR'
    rules: Array<{ field: string; operator: string; value: unknown }>
  }
  summary: string
}

/**
 * Convert natural language to FilterConfig using Gemini Flash.
 */
export async function generateSegmentFilter(
  input: string,
  history?: ChatMessage[],
): Promise<AiSegmentResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  // Build conversation contents
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

  // Add history if provided (for follow-up messages)
  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      })
    }
  }

  // Add current user input
  contents.push({
    role: 'user',
    parts: [{ text: input.slice(0, 500) }],
  })

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    }),
  })

  if (!response.ok) {
    const status = response.status
    if (status === 429) {
      throw new Error('AI assistant is busy. Please try again in a moment.')
    }
    const errText = await response.text().catch(() => 'Unknown error')
    console.error(`[AI] Gemini API error: ${status} — ${errText}`)
    throw new Error('AI service unavailable')
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error("Couldn't understand the request. Try rephrasing.")
  }

  const filters = JSON.parse(text)

  // Validate basic structure
  if (!filters.logic || !Array.isArray(filters.rules) || filters.rules.length === 0) {
    throw new Error("Couldn't generate valid filters. Try being more specific.")
  }

  // Validate each rule has required fields
  for (const rule of filters.rules) {
    if (!rule.field || !rule.operator) {
      throw new Error("Couldn't map all conditions to filter fields. Try rephrasing.")
    }
    // Validate field exists in our schema
    if (!VALID_FIELDS.has(rule.field)) {
      throw new Error(`Unknown field "${rule.field}". Try rephrasing your request.`)
    }
  }

  const summary = generateSummary(filters)
  console.log(`[AI] Segment query: "${input}" → ${filters.rules.length} rules`)

  return { filters, summary }
}

/**
 * Check if Gemini API key is configured.
 */
export function isAiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY
}

// Valid field names (must match SegmentFilterBuilder FIELD_CATEGORIES)
const VALID_FIELDS = new Set([
  'total_orders', 'total_spent', 'avg_order_value', 'clv', 'discount_order_percentage',
  'product_name', 'collection_name', 'product_purchase_count',
  'orders_in_last_30_days', 'orders_in_last_90_days', 'orders_in_last_365_days', 'days_since_last_order',
  'email', 'name',
  'days_since_first_seen', 'first_seen', 'last_seen',
  'email_subscribed', 'sms_subscribed',
])

/**
 * Generate a human-readable summary of the filters.
 */
function generateSummary(filters: AiSegmentResult['filters']): string {
  const parts = filters.rules.map(rule => {
    const fieldLabel = FIELD_LABELS[rule.field] ?? rule.field
    const opLabel = OPERATOR_LABELS[rule.operator] ?? rule.operator

    if (rule.operator === 'is_true') return `${fieldLabel}`
    if (rule.operator === 'is_false') return `not ${fieldLabel}`
    if (rule.operator === 'between' && Array.isArray(rule.value)) {
      return `${fieldLabel} ${formatValue(rule.field, rule.value[0])}–${formatValue(rule.field, rule.value[1])}`
    }
    if (rule.operator === 'has_purchased') {
      const label = rule.field === 'collection_name' ? 'from collection' : 'purchased'
      return `${label} "${rule.value}"`
    }
    if (rule.operator === 'has_not_purchased') {
      const label = rule.field === 'collection_name' ? 'not from collection' : 'not purchased'
      return `${label} "${rule.value}"`
    }

    return `${fieldLabel} ${opLabel} ${formatValue(rule.field, rule.value)}`
  })

  const joiner = filters.logic === 'AND' ? ' and ' : ' or '
  return parts.join(joiner)
}

function formatValue(field: string, value: unknown): string {
  if (typeof value === 'number' && MONEY_FIELDS.has(field)) {
    return `₹${(value / 100).toLocaleString()}`
  }
  return String(value)
}

const MONEY_FIELDS = new Set(['total_spent', 'avg_order_value', 'clv'])

const FIELD_LABELS: Record<string, string> = {
  total_spent: 'total spent',
  avg_order_value: 'avg order value',
  days_since_last_order: 'days since last order',
  product_name: 'product',
  collection_name: 'collection',
  total_orders: 'total orders',
  discount_order_percentage: 'discount order %',
  orders_in_last_30_days: 'orders in last 30 days',
  orders_in_last_90_days: 'orders in last 90 days',
  orders_in_last_365_days: 'orders in last year',
  name: 'name',
  email: 'email',
  clv: 'CLV',
  days_since_first_seen: 'days since first seen',
  first_seen: 'first seen',
  last_seen: 'last seen',
  email_subscribed: 'email subscribed',
  sms_subscribed: 'SMS subscribed',
}

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
}
