import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { getDomainFields } from './domainRegistry.js'
import type { DomainType, DomainFieldDef } from '@storees/shared'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
}

type AiSegmentResult = {
  filters: {
    logic: 'AND' | 'OR'
    rules: Array<{ field: string; operator: string; value: unknown }>
  }
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

## Examples

Input: "Active customers who haven't transacted in 30 days"
Output: {"logic":"AND","rules":[{"field":"lifecycle_stage","operator":"is","value":"active"},{"field":"days_since_last_txn","operator":"greater_than","value":30}]}

Input: "Customers with verified KYC and active SIPs"
Output: {"logic":"AND","rules":[{"field":"kyc_status","operator":"is","value":"verified"},{"field":"active_sips","operator":"greater_than","value":0}]}

Input: "கடந்த 90 நாட்களில் பரிவர்த்தனை செய்யாத வாடிக்கையாளர்கள்"
Output: {"logic":"AND","rules":[{"field":"days_since_last_txn","operator":"greater_than","value":90}]}

Input: "High value customers with portfolio over 5 lakh"
Output: {"logic":"AND","rules":[{"field":"portfolio_value","operator":"greater_than","value":50000000}]}`
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

  const parts = filters.rules.map(rule => {
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
  })

  const joiner = filters.logic === 'AND' ? ' and ' : ' or '
  return parts.join(joiner)
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
  const fields = getDomainFields(domainType)

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

  for (const rule of filters.rules) {
    if (!rule.field || !rule.operator) {
      throw new Error("Couldn't map all conditions to filter fields. Try rephrasing.")
    }
    if (!validFields.has(rule.field)) {
      throw new Error(`Unknown field "${rule.field}". Try rephrasing your request.`)
    }
  }

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
