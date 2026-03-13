import { describe, it, expect } from 'vitest'
import { maskSensitiveData } from '../middleware/dataMasking.js'

describe('maskSensitiveData', () => {
  it('detects and rejects valid card numbers (Luhn)', () => {
    const result = maskSensitiveData({
      card: '4111111111111111', // Visa test card
      amount: 50000,
    })

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].type).toBe('card_number')
    expect(result.sanitized.card).toBe('***REDACTED_CARD***')
    expect(result.sanitized.amount).toBe(50000)
  })

  it('detects card numbers with spaces/dashes', () => {
    const result = maskSensitiveData({
      payment_ref: '4111-1111-1111-1111',
    })

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].type).toBe('card_number')
  })

  it('does not flag non-Luhn numbers', () => {
    const result = maskSensitiveData({
      order_id: '1234567890123456', // fails Luhn
    })

    // This might get flagged as unmasked_account instead, check accordingly
    const cardViolations = result.violations.filter(v => v.type === 'card_number')
    expect(cardViolations).toHaveLength(0)
  })

  it('detects Aadhaar numbers (12 digits)', () => {
    const result = maskSensitiveData({
      id_number: '123456789012',
    })

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].type).toBe('aadhaar')
    expect(result.sanitized.id_number).toBe('***REDACTED_AADHAAR***')
  })

  it('auto-masks unmasked account numbers', () => {
    const result = maskSensitiveData({
      account_ref: '987654321012', // 12 digits that look like Aadhaar
    })

    // 12 digits → flagged as Aadhaar
    expect(result.violations.length).toBeGreaterThan(0)
  })

  it('does not flag amount fields as account numbers', () => {
    const result = maskSensitiveData({
      amount: 50000000,
      total_amount: '1234567890', // 10-digit string but field name contains "amount"
    })

    const accountViolations = result.violations.filter(v => v.type === 'unmasked_account')
    expect(accountViolations).toHaveLength(0)
  })

  it('handles nested objects', () => {
    const result = maskSensitiveData({
      payment: {
        card_number: '4111111111111111',
        method: 'credit_card',
      },
    })

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].field).toBe('payment.card_number')
  })

  it('returns no violations for clean data', () => {
    const result = maskSensitiveData({
      type: 'debit',
      channel: 'upi',
      amount: 250000,
      currency: 'INR',
      merchant_name: 'Swiggy',
      account_masked: 'XXXX4567',
    })

    expect(result.violations).toHaveLength(0)
    expect(result.sanitized).toEqual({
      type: 'debit',
      channel: 'upi',
      amount: 250000,
      currency: 'INR',
      merchant_name: 'Swiggy',
      account_masked: 'XXXX4567',
    })
  })

  it('handles arrays in properties', () => {
    const result = maskSensitiveData({
      items: [
        { name: 'Widget', card: '4111111111111111' },
        { name: 'Gadget', price: 500 },
      ],
    })

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].field).toBe('items[0].card')
  })
})
