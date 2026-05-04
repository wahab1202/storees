/**
 * Pre-send content lint for marketing email (Phase E3.3).
 *
 * Quick checks against an HTML body + subject + plain text alternative,
 * surfacing warnings before the campaign is staged. Each rule is a
 * cheap heuristic — none are perfect, all are well-known signals
 * mailbox providers also use to score messages.
 *
 * Returns a warnings array; admin can acknowledge and send anyway. We
 * never *block* sends from the lint itself — that's the user's call.
 *
 * Rules included:
 *   • image-only body (very high image-to-text ratio)
 *   • missing plain-text alternative
 *   • missing unsubscribe link in body (List-Unsubscribe header is
 *     added at send-time, but Gmail also looks for in-body unsubscribe)
 *   • subject all caps / excessive emoji / classic spam triggers
 *   • body very short (often a header-only campaign that still needs body)
 *   • {{ }} unrendered template variables (often a forgot-to-fill bug)
 */

export type LintSeverity = 'warning' | 'info'

export type LintFinding = {
  code: string
  severity: LintSeverity
  message: string
}

export type LintInput = {
  subject: string
  html: string
  text?: string | null
}

export function lintCampaignContent(input: LintInput): LintFinding[] {
  const findings: LintFinding[] = []
  const subject = (input.subject ?? '').trim()
  const html = (input.html ?? '').trim()
  const text = (input.text ?? '').trim()

  // ── Subject checks ────────────────────────────────────────────────

  if (!subject) {
    findings.push({
      code: 'subject_empty',
      severity: 'warning',
      message: 'Subject line is empty.',
    })
  }

  if (subject.length > 0 && subject.length === subject.toUpperCase().length && /[A-Z]/.test(subject) && subject.length >= 8) {
    findings.push({
      code: 'subject_all_caps',
      severity: 'warning',
      message: 'Subject line is all caps. Mailbox providers often flag this as spam.',
    })
  }

  // Loose emoji counter — counts surrogate pairs + miscellaneous symbol blocks.
  // 3+ emoji in a subject is a strong spam-folder signal.
  const emojiMatches = subject.match(/(\p{Extended_Pictographic})/gu) ?? []
  if (emojiMatches.length >= 3) {
    findings.push({
      code: 'subject_emoji_heavy',
      severity: 'warning',
      message: `Subject has ${emojiMatches.length} emoji. 3+ emoji is a common spam-folder trigger.`,
    })
  }

  // Classic high-risk phrases — minimal list focused on patterns that
  // genuinely score high in spam classifiers, not over-inclusive.
  const SPAM_PHRASES = [
    /\bfree\s+(money|gift|cash)\b/i,
    /\bwin\s+(big|now)\b/i,
    /\b100%\s+(free|guaranteed)\b/i,
    /\bact\s+now\b/i,
    /!{3,}/,        // "!!!"
    /\$\$+/,        // "$$" or more
    /\bclick\s+here\b/i,
  ]
  for (const re of SPAM_PHRASES) {
    if (re.test(subject)) {
      findings.push({
        code: 'subject_spam_phrase',
        severity: 'warning',
        message: `Subject contains a phrase commonly flagged as spam ("${subject.match(re)![0]}").`,
      })
      break // one finding is enough; don't spam the response
    }
  }

  // ── Body checks ───────────────────────────────────────────────────

  if (!html) {
    findings.push({
      code: 'html_empty',
      severity: 'warning',
      message: 'Email body is empty.',
    })
    return findings // remaining checks need the html — bail
  }

  // Image-to-text ratio. Strip HTML tags to estimate visible text length;
  // count <img> tags. >2 images per 100 chars is "image-only-feeling".
  const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const imgCount = (html.match(/<img\b[^>]*>/gi) ?? []).length
  if (imgCount > 0 && visibleText.length < 100) {
    findings.push({
      code: 'image_only_body',
      severity: 'warning',
      message: `Body has ${imgCount} image(s) and only ${visibleText.length} characters of visible text. Image-only campaigns frequently land in spam.`,
    })
  }

  if (visibleText.length > 0 && visibleText.length < 30) {
    findings.push({
      code: 'body_too_short',
      severity: 'warning',
      message: `Visible body text is only ${visibleText.length} characters. Mailbox providers expect meaningful body content.`,
    })
  }

  // Unrendered template variables — common bug where the template engine
  // didn't get a value and "{{firstName}}" lands in the customer's inbox.
  const unrenderedVars = html.match(/\{\{\s*[a-zA-Z_][\w.]*\s*\}\}/g)
  if (unrenderedVars && unrenderedVars.length > 0) {
    findings.push({
      code: 'unrendered_template_var',
      severity: 'warning',
      message: `Body contains ${unrenderedVars.length} unrendered template variable(s) (e.g. ${unrenderedVars[0]}). Customers will see literal {{...}} text.`,
    })
  }

  // Body unsubscribe link. The List-Unsubscribe header is set at send-time
  // (Phase E2.2), but Gmail's spam classifier also rewards a visible body
  // link. Look for an <a> with href containing /u/ (our unsub path) or a
  // {{unsubscribe_url}} placeholder, or an "unsubscribe" link with any href.
  const hasUnsubLink =
    /<a\b[^>]*href\s*=\s*["'][^"']*\/u\/[^"']*["']/i.test(html) ||
    /\{\{\s*unsubscribe_url\s*\}\}/i.test(html) ||
    /<a\b[^>]*>\s*[^<]*unsubscribe[^<]*<\/a>/i.test(html)
  if (!hasUnsubLink) {
    findings.push({
      code: 'no_unsubscribe_link',
      severity: 'warning',
      message: 'Body has no visible "Unsubscribe" link. The List-Unsubscribe header covers mailbox-provider one-click, but a visible footer link is recommended (and required by CAN-SPAM and many EU jurisdictions).',
    })
  }

  // ── Plain-text alternative ────────────────────────────────────────

  if (!text || text.length < 30) {
    findings.push({
      code: 'no_plain_text',
      severity: 'info',
      message: 'No plain-text alternative provided. Mailbox providers boost deliverability for multipart messages; the campaign builder should auto-generate one from the HTML body.',
    })
  }

  return findings
}
