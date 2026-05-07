import type { TemplateVariable, TemplateVariableSource } from '@storees/shared'
import { extractVariableKeys, SYSTEM_VARIABLE_KEYS } from './templateContext.js'

/**
 * Save-time validation for templates and campaigns. Catches the class of
 * problems that today silently land in inboxes as literal `{{ }}` text:
 *
 *   1. Body has `{{order_number}}` but no mapping declared for it
 *   2. Mapping declared for `discount_code` that no body references
 *   3. Mapping references an unknown customer/project field
 *   4. Two mappings declared for the same key
 *
 * The route layer treats issues with kind='error' as blocking (400) and
 * kind='warning' as advisory (returned alongside the saved row).
 */
export type LintIssue = {
  kind: 'error' | 'warning'
  code:
    | 'undefined_variable'
    | 'unused_mapping'
    | 'duplicate_key'
    | 'unknown_customer_field'
    | 'unknown_project_field'
    | 'invalid_format'
  key?: string
  message: string
}

const ALLOWED_CUSTOMER_FIELDS = new Set([
  'id', 'external_id', 'email', 'phone', 'name',
  'region', 'city',
  'total_orders', 'total_spent', 'avg_order_value', 'clv',
  'first_order_date', 'last_order_date', 'last_seen',
])

const ALLOWED_PROJECT_FIELDS = new Set([
  'name', 'email_from_address', 'email_from_name',
])

const ALLOWED_FORMATS = new Set([
  'money', 'date', 'date:long', 'date:short', 'upper', 'lower', 'title',
])

export function lintTemplate(opts: {
  variables: TemplateVariable[] | undefined | null
  subject?: string | null
  htmlBody?: string | null
  bodyText?: string | null
}): LintIssue[] {
  const issues: LintIssue[] = []
  const variables = opts.variables ?? []

  // 1. Duplicate keys
  const seen = new Set<string>()
  for (const v of variables) {
    if (seen.has(v.key)) {
      issues.push({
        kind: 'error',
        code: 'duplicate_key',
        key: v.key,
        message: `Variable "${v.key}" is declared more than once`,
      })
    }
    seen.add(v.key)
  }

  // 2. Source-field whitelist
  for (const v of variables) {
    issues.push(...validateSource(v.key, v.source))
    if (v.format && !ALLOWED_FORMATS.has(v.format)) {
      issues.push({
        kind: 'error',
        code: 'invalid_format',
        key: v.key,
        message: `Variable "${v.key}" uses unknown format "${v.format}"`,
      })
    }
  }

  // 3. Body usage vs declared mappings
  const referenced = new Set(extractVariableKeys(opts.subject, opts.htmlBody, opts.bodyText))
  const declared = new Set(variables.map(v => v.key))

  for (const key of referenced) {
    if (declared.has(key)) continue
    if (SYSTEM_VARIABLE_KEYS.has(key)) continue
    if (/^\d+$/.test(key)) continue        // {{1}}, {{2}} for WhatsApp positional — declared elsewhere
    issues.push({
      kind: 'error',
      code: 'undefined_variable',
      key,
      message: `Body uses {{${key}}} but no mapping is declared for it`,
    })
  }

  for (const key of declared) {
    if (referenced.has(key)) continue
    issues.push({
      kind: 'warning',
      code: 'unused_mapping',
      key,
      message: `Variable "${key}" is declared but not used in the subject or body`,
    })
  }

  return issues
}

function validateSource(key: string, source: TemplateVariableSource | undefined): LintIssue[] {
  if (!source) {
    return [{
      kind: 'error',
      code: 'undefined_variable',
      key,
      message: `Variable "${key}" has no source declared`,
    }]
  }
  if (source.kind === 'customer' && !ALLOWED_CUSTOMER_FIELDS.has(source.field)) {
    return [{
      kind: 'error',
      code: 'unknown_customer_field',
      key,
      message: `Variable "${key}" references unknown customer field "${source.field}"`,
    }]
  }
  if (source.kind === 'project' && !ALLOWED_PROJECT_FIELDS.has(source.field)) {
    return [{
      kind: 'error',
      code: 'unknown_project_field',
      key,
      message: `Variable "${key}" references unknown project field "${source.field}"`,
    }]
  }
  return []
}

/** Convenience: any blocking error in the issue list. */
export function hasBlockingErrors(issues: LintIssue[]): boolean {
  return issues.some(i => i.kind === 'error')
}
