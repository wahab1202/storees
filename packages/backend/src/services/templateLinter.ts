/**
 * Pre-submission lint for WhatsApp templates (Phase F1b).
 *
 * Catches common rejection reasons before we waste a submission attempt
 * (Meta rate-limits to 250 templates/day per WABA; rejections cost time).
 * Each finding is severity 'error' (blocks submission) or 'warning'
 * (admin can override).
 *
 * The rules below are derived from Meta's published rejection-reason
 * documentation plus the most common patterns seen across Storees customer
 * submissions. Not exhaustive — Meta has a final-call reviewer who flags
 * brand-impersonation, vague CTAs, or out-of-policy promotions; we can't
 * pre-detect those. The intent is to catch the mechanical errors.
 */

export type LintFindingSeverity = 'error' | 'warning'

export type TemplateLintFinding = {
  code: string
  severity: LintFindingSeverity
  message: string
}

export type TemplateLintInput = {
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | string
  bodyText: string
  header?: { type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string } | null
  footer?: string | null
  buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone?: string }>
}

const BODY_MAX_CHARS = 1024
const HEADER_TEXT_MAX = 60
const FOOTER_MAX = 60
const BUTTON_TEXT_MAX = 25
const NAME_PATTERN = /^[a-z0-9_]+$/  // Meta requires lowercase + underscore; rejects camelCase, dashes, spaces

// Phrases that nearly always cause Utility templates to be down-classified
// to Marketing on review. If the merchant intended Utility, flag them.
const MARKETING_PHRASES_IN_UTILITY = [
  /\b(flat|extra|upto|up to)\s+\d+%?\s*(off|discount)\b/i,
  /\bsale\b/i,
  /\b(buy|grab)\s+now\b/i,
  /\blimited\s+(time|period|offer)\b/i,
  /\bclaim\s+(your|now)\b/i,
  /\bspecial\s+offer\b/i,
  /\bdeal\s+of\s+the\s+day\b/i,
  /\b(₹|rs\.?|inr)\s*\d+\s*off\b/i,
]

// In Marketing, these phrases are mostly fine. In Utility/Authentication,
// they're hard rejects.
const PROMO_INDICATORS = [/\bemoji\b/i] // (placeholder — emoji check is below)

export function lintTemplate(input: TemplateLintInput): TemplateLintFinding[] {
  const findings: TemplateLintFinding[] = []
  const cat = (input.category || '').toUpperCase()

  // ── Name (Meta rules: lowercase + underscore + digits only, ≤512 chars)
  if (!input.name || !NAME_PATTERN.test(input.name)) {
    findings.push({
      code: 'name_format',
      severity: 'error',
      message: 'Template name must be lowercase letters, digits, and underscores only (no spaces, dashes, or capitals).',
    })
  }
  if (input.name && input.name.length > 512) {
    findings.push({ code: 'name_too_long', severity: 'error', message: 'Template name must be 512 characters or fewer.' })
  }

  // ── Language (basic shape check; full BCP47 list is huge, just sanity-check)
  if (!input.language || !/^[a-z]{2}(_[A-Z]{2})?$/.test(input.language)) {
    findings.push({
      code: 'language_format',
      severity: 'error',
      message: `Language must be a Meta locale code like "en_US" or "hi" (got: "${input.language}").`,
    })
  }

  // ── Body
  const body = (input.bodyText ?? '').trim()
  if (!body) {
    findings.push({ code: 'body_empty', severity: 'error', message: 'Template body cannot be empty.' })
  } else {
    if (body.length > BODY_MAX_CHARS) {
      findings.push({
        code: 'body_too_long',
        severity: 'error',
        message: `Body is ${body.length} characters; max is ${BODY_MAX_CHARS}.`,
      })
    }

    // {{1}}, {{2}}, ... must be sequential starting at 1, no gaps. Meta rejects {{1}} {{3}}.
    const params = (body.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [])
      .map(m => Number(m.replace(/[^\d]/g, '')))
    const uniqSorted = [...new Set(params)].sort((a, b) => a - b)
    if (uniqSorted.length > 0) {
      const expected = Array.from({ length: uniqSorted.length }, (_, i) => i + 1)
      if (uniqSorted[0] !== 1 || JSON.stringify(uniqSorted) !== JSON.stringify(expected)) {
        findings.push({
          code: 'param_sequence_invalid',
          severity: 'error',
          message: `Body parameters must be {{1}}, {{2}}, ... in sequence (found: {{${uniqSorted.join('}}, {{')}}}).`,
        })
      }
    }

    // Body cannot start or end with a parameter (Meta rejects "{{1}} placed your order")
    if (/^\s*\{\{/.test(body) || /\}\}\s*$/.test(body)) {
      findings.push({
        code: 'param_at_boundary',
        severity: 'warning',
        message: 'Body starts or ends with a parameter. Meta usually rejects this — wrap with literal text.',
      })
    }

    // ── Category-specific rules
    if (cat === 'UTILITY' || cat === 'AUTHENTICATION') {
      for (const re of MARKETING_PHRASES_IN_UTILITY) {
        if (re.test(body)) {
          findings.push({
            code: 'utility_with_promo_phrase',
            severity: 'error',
            message: `${cat} templates cannot contain marketing phrases (matched "${body.match(re)![0]}"). Re-categorise as MARKETING or rewrite.`,
          })
          break
        }
      }
      // Emoji in Utility is almost always an auto-reject
      const emojiMatches = body.match(/(\p{Extended_Pictographic})/gu) ?? []
      if (emojiMatches.length > 0) {
        findings.push({
          code: 'utility_with_emoji',
          severity: 'warning',
          message: `${cat} templates often get rejected for containing emoji (found ${emojiMatches.length}).`,
        })
      }
    }
  }

  // ── Header
  if (input.header) {
    if (input.header.type === 'TEXT') {
      const ht = (input.header.text ?? '').trim()
      if (!ht) {
        findings.push({ code: 'header_text_empty', severity: 'error', message: 'TEXT header has no content.' })
      } else if (ht.length > HEADER_TEXT_MAX) {
        findings.push({
          code: 'header_too_long',
          severity: 'error',
          message: `Header is ${ht.length} characters; max is ${HEADER_TEXT_MAX}.`,
        })
      }
      // Header allows AT MOST one variable, and only at the END
      const headerVars = (ht.match(/\{\{\s*\d+\s*\}\}/g) ?? []).length
      if (headerVars > 1) {
        findings.push({
          code: 'header_multi_var',
          severity: 'error',
          message: 'TEXT header may contain at most one parameter.',
        })
      }
    }
    // Media headers (IMAGE/VIDEO/DOCUMENT) need a sample asset; we can't check
    // that here without uploading, but we flag if `text` was provided for media
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(input.header.type) && input.header.text) {
      findings.push({
        code: 'media_header_with_text',
        severity: 'warning',
        message: `${input.header.type} headers don't carry text — the "text" field will be ignored.`,
      })
    }
  }

  // ── Footer
  if (input.footer && input.footer.length > FOOTER_MAX) {
    findings.push({
      code: 'footer_too_long',
      severity: 'error',
      message: `Footer is ${input.footer.length} characters; max is ${FOOTER_MAX}.`,
    })
  }
  if (input.footer && /\{\{\s*\d+\s*\}\}/.test(input.footer)) {
    findings.push({
      code: 'footer_with_param',
      severity: 'error',
      message: 'Footer cannot contain template parameters.',
    })
  }

  // ── Buttons
  if (input.buttons && input.buttons.length > 0) {
    if (input.buttons.length > 10) {
      findings.push({
        code: 'too_many_buttons',
        severity: 'error',
        message: `Templates may have at most 10 buttons (found ${input.buttons.length}).`,
      })
    }
    let quickReplies = 0, urlButtons = 0, phoneButtons = 0
    for (const b of input.buttons) {
      if (!b.text || b.text.length > BUTTON_TEXT_MAX) {
        findings.push({
          code: 'button_text_invalid',
          severity: 'error',
          message: `Button text "${b.text}" is empty or exceeds ${BUTTON_TEXT_MAX} characters.`,
        })
      }
      if (b.type === 'QUICK_REPLY') quickReplies++
      if (b.type === 'URL') urlButtons++
      if (b.type === 'PHONE_NUMBER') phoneButtons++
      if (b.type === 'URL' && (!b.url || !/^https?:\/\//.test(b.url))) {
        findings.push({
          code: 'url_button_invalid',
          severity: 'error',
          message: `URL button "${b.text}" must have a valid http/https url.`,
        })
      }
      if (b.type === 'PHONE_NUMBER' && (!b.phone || !/^\+?\d{6,15}$/.test(b.phone))) {
        findings.push({
          code: 'phone_button_invalid',
          severity: 'error',
          message: `Phone button "${b.text}" must have a valid E.164 phone number.`,
        })
      }
    }
    // Meta rule: max 1 PHONE_NUMBER and max 2 URL; any number of QUICK_REPLY up to 10 total.
    if (urlButtons > 2) {
      findings.push({ code: 'too_many_url_buttons', severity: 'error', message: 'Templates may have at most 2 URL buttons.' })
    }
    if (phoneButtons > 1) {
      findings.push({ code: 'too_many_phone_buttons', severity: 'error', message: 'Templates may have at most 1 PHONE_NUMBER button.' })
    }
  }

  return findings
}

/** Convenience: returns true if any finding is severity='error'. */
export function hasBlockingErrors(findings: TemplateLintFinding[]): boolean {
  return findings.some(f => f.severity === 'error')
}
