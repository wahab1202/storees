import { Request, Response, NextFunction } from 'express'

type MaskingViolation = {
  field: string
  type: 'card_number' | 'aadhaar' | 'unmasked_account'
  action: 'rejected' | 'masked'
}

type MaskingResult = {
  violations: MaskingViolation[]
  sanitized: Record<string, unknown>
}

/** Luhn algorithm — validates potential card numbers. */
function passesLuhn(num: string): boolean {
  let sum = 0
  let alternate = false
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

/** Check if a string looks like a card number (13-19 digits, passes Luhn). */
function isLikelyCardNumber(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '')
  if (!/^\d{13,19}$/.test(digits)) return false
  return passesLuhn(digits)
}

/** Check if a string looks like an Aadhaar number (exactly 12 digits). */
function isLikelyAadhaar(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '')
  return /^\d{12}$/.test(digits)
}

/** Check if a string is an unmasked account number (9-18 digits without masking). */
function isUnmaskedAccount(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '')
  // If it's all digits and 9-18 chars, and doesn't contain X masking, it's likely unmasked
  return /^\d{9,18}$/.test(digits)
}

/** Recursively scan and mask sensitive data in an object. */
function scanAndMask(
  obj: Record<string, unknown>,
  path: string = '',
  violations: MaskingViolation[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = path ? `${path}.${key}` : key

    if (typeof value === 'string') {
      // Check for card numbers
      if (isLikelyCardNumber(value)) {
        violations.push({ field: fieldPath, type: 'card_number', action: 'rejected' })
        result[key] = '***REDACTED_CARD***'
        continue
      }

      // Check for Aadhaar
      if (isLikelyAadhaar(value)) {
        violations.push({ field: fieldPath, type: 'aadhaar', action: 'rejected' })
        result[key] = '***REDACTED_AADHAAR***'
        continue
      }

      // Check for unmasked account numbers (skip known safe fields)
      const safeNumericFields = ['amount', 'price', 'quantity', 'total', 'balance', 'rate', 'tenure', 'count', 'age', 'days', 'months', 'years', 'id', 'port']
      const isNumericSafe = safeNumericFields.some(f => key.toLowerCase().includes(f))
      if (!isNumericSafe && isUnmaskedAccount(value)) {
        // Auto-mask: keep last 4 digits
        const masked = 'XXXX' + value.slice(-4)
        violations.push({ field: fieldPath, type: 'unmasked_account', action: 'masked' })
        result[key] = masked
        continue
      }

      result[key] = value
    } else if (typeof value === 'number') {
      // Numbers in properties are generally safe (amounts, counts)
      result[key] = value
    } else if (Array.isArray(value)) {
      result[key] = value.map((item, i) => {
        if (typeof item === 'object' && item !== null) {
          return scanAndMask(item as Record<string, unknown>, `${fieldPath}[${i}]`, violations)
        }
        return item
      })
    } else if (typeof value === 'object' && value !== null) {
      result[key] = scanAndMask(value as Record<string, unknown>, fieldPath, violations)
    } else {
      result[key] = value
    }
  }

  return result
}

/** Scan event properties for sensitive data. Returns sanitized properties + violations. */
export function maskSensitiveData(properties: Record<string, unknown>): MaskingResult {
  const violations: MaskingViolation[] = []
  const sanitized = scanAndMask(properties, '', violations)
  return { violations, sanitized }
}

/**
 * Express middleware: scan request body properties for sensitive financial data.
 * Rejects requests with card numbers or Aadhaar. Auto-masks account numbers.
 * Only applies to event ingestion routes.
 */
export function dataMaskingMiddleware(mode: 'strict' | 'warn' = 'strict') {
  return (req: Request, res: Response, next: NextFunction) => {
    const properties = req.body?.properties
    if (!properties || typeof properties !== 'object') {
      return next()
    }

    const { violations, sanitized } = maskSensitiveData(properties)

    if (violations.length === 0) {
      return next()
    }

    // In strict mode, reject if card/Aadhaar found
    const hardViolations = violations.filter(v => v.type === 'card_number' || v.type === 'aadhaar')
    if (mode === 'strict' && hardViolations.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Sensitive data detected in event properties',
        violations: hardViolations.map(v => ({
          field: v.field,
          type: v.type,
          message: v.type === 'card_number'
            ? 'Card numbers must not be sent. Use masked format (XXXX1234).'
            : 'Aadhaar numbers must not be sent.',
        })),
      })
    }

    // Replace properties with sanitized version
    req.body.properties = sanitized

    // Log warnings for masked fields
    const masked = violations.filter(v => v.action === 'masked')
    if (masked.length > 0) {
      console.warn(`[data-masking] Auto-masked ${masked.length} field(s):`, masked.map(v => v.field))
    }

    next()
  }
}
