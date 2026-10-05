import { describe, it, expect } from 'vitest'
import { deliveredAt, orderEventMoment, refundedAt, shippedAt, statedMoment } from '../services/orderMoments.js'

const ORDERED = new Date('2026-09-01T10:00:00Z')   // the order's own created_at

describe('when things happened to an order', () => {
  it('dates a cancellation by when it was cancelled, not when it was ordered', () => {
    const t = orderEventMoment('reversal', { created_at: ORDERED.toISOString(), cancelled_at: '2026-09-08T09:00:00Z' }, ORDERED)
    expect(t.toISOString()).toBe('2026-09-08T09:00:00.000Z')
    // the one-'l' spelling other platforms use
    expect(orderEventMoment('reversal', { canceled_at: '2026-09-05T00:00:00Z' }, ORDERED).toISOString())
      .toBe('2026-09-05T00:00:00.000Z')
  })

  it('dates a shipment by its latest shipment, not the order', () => {
    const t = orderEventMoment('fulfilment', {
      created_at: ORDERED.toISOString(),
      fulfillments: [{ created_at: '2026-09-03T08:00:00Z' }, { created_at: '2026-09-04T08:00:00Z' }],
    }, ORDERED)
    expect(t.toISOString()).toBe('2026-09-04T08:00:00.000Z')
  })

  it('dates a delivery by what the payload says about the delivery', () => {
    expect(orderEventMoment('delivery', { delivered_at: '2026-09-06T12:00:00Z' }, ORDERED).toISOString())
      .toBe('2026-09-06T12:00:00.000Z')
    expect(orderEventMoment('delivery', {
      fulfillments: [{ shipment_status: 'delivered', updated_at: '2026-09-07T12:00:00Z' }],
    }, ORDERED).toISOString()).toBe('2026-09-07T12:00:00.000Z')
  })

  it('falls back to the change that produced the message, then to what it had', () => {
    expect(orderEventMoment('fulfilment', { updated_at: '2026-09-02T00:00:00Z' }, ORDERED).toISOString())
      .toBe('2026-09-02T00:00:00.000Z')
    expect(orderEventMoment('reversal', {}, ORDERED)).toBe(ORDERED)
  })

  it('never dates anything in the future', () => {
    const t = orderEventMoment('reversal', { cancelled_at: '2999-01-01T00:00:00Z' }, ORDERED)
    expect(t.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('reads a past order\'s shipped date from its shipments, or leaves it empty', () => {
    expect(shippedAt([{ created_at: '2026-09-03T08:00:00Z' }, { created_at: '2026-09-04T08:00:00Z' }])?.toISOString())
      .toBe('2026-09-04T08:00:00.000Z')
    expect(shippedAt([])).toBeNull()
    expect(shippedAt(undefined)).toBeNull()
    expect(shippedAt([{ created_at: null }])).toBeNull()
  })

  it('never borrows the order date for a status a record merely states', () => {
    // A purchase record saying "delivered", timestamped when it was ordered: no date.
    expect(statedMoment('delivery', { status: 'pending', fulfillment_status: 'delivered' })).toBeNull()
    expect(statedMoment('fulfilment', { fulfillment_status: 'shipped', updated_at: '2026-09-02T00:00:00Z' })).toBeNull()
    // ...unless it states one.
    expect(statedMoment('delivery', { fulfillment_status: 'delivered', delivered_at: '2026-09-06T12:00:00Z' })?.toISOString())
      .toBe('2026-09-06T12:00:00.000Z')
  })

  it('reads a past order\'s delivered date from the courier\'s delivered shipment only', () => {
    expect(deliveredAt([
      { shipment_status: 'in_transit', updated_at: '2026-09-04T00:00:00Z' },
      { shipment_status: 'delivered', updated_at: '2026-09-06T12:00:00Z' },
    ])?.toISOString()).toBe('2026-09-06T12:00:00.000Z')
    expect(deliveredAt([{ shipment_status: 'picked_up', updated_at: '2026-09-05T00:00:00Z' }])?.toISOString())
      .toBe('2026-09-05T00:00:00.000Z')
    expect(deliveredAt([{ shipment_status: 'out_for_delivery', updated_at: '2026-09-05T00:00:00Z' }])).toBeNull()
    expect(deliveredAt(undefined)).toBeNull()
  })

  it('dates a refund by the refund itself', () => {
    expect(refundedAt([{ created_at: '2026-10-01T05:00:00Z', processed_at: '2026-10-01T05:01:00Z' }])?.toISOString())
      .toBe('2026-10-01T05:01:00.000Z')
    expect(refundedAt([{ created_at: '2026-09-02T00:00:00Z' }, { created_at: '2026-09-09T00:00:00Z' }])?.toISOString())
      .toBe('2026-09-09T00:00:00.000Z')
    expect(refundedAt([])).toBeNull()
  })
})
