import { describe, it, expect } from 'vitest'
import {
  laterStatus, statusFromProperties, translateSourceStatus, ORDER_STATUS,
} from '../db/orderStatus.js'

describe('order status — one reader, one direction', () => {
  it('keeps "is the order on?" and "where is the parcel?" apart', () => {
    // The combinations measured on a connector-fed shop, both fields present.
    expect(statusFromProperties({ status: 'pending', fulfillment_status: 'delivered' })).toBe('delivered')
    expect(statusFromProperties({ status: 'pending', fulfillment_status: 'shipped' })).toBe('fulfilled')
    expect(statusFromProperties({ status: 'pending', fulfillment_status: 'fulfilled' })).toBe('fulfilled')
    expect(statusFromProperties({ status: 'pending', fulfillment_status: 'not_fulfilled' })).toBe('pending')
    expect(statusFromProperties({ status: 'canceled', fulfillment_status: 'not_fulfilled' })).toBe('cancelled')
    expect(statusFromProperties({ status: 'canceled', fulfillment_status: 'fulfilled' })).toBe('cancelled')
    expect(statusFromProperties({ status: 'canceled', fulfillment_status: 'shipped' })).toBe('cancelled')
  })

  it('gives the same answer whichever field a source happens to use', () => {
    expect(statusFromProperties({ fulfillment_status: 'delivered' })).toBe('delivered')
    expect(statusFromProperties({ status: 'delivered' })).toBe('delivered')
    expect(statusFromProperties({ order_status: 'delivered' })).toBe('delivered')
    expect(statusFromProperties({ shipment_status: 'in_transit' })).toBe('fulfilled')
  })

  it('says nothing when the payload states nothing', () => {
    expect(statusFromProperties({})).toBeNull()
    expect(statusFromProperties({ status: '', fulfillment_status: null })).toBeNull()
  })

  it('picks reversals in one fixed priority when two fields disagree', () => {
    expect(statusFromProperties({ status: 'canceled', fulfillment_status: 'refunded' })).toBe('refunded')
    expect(statusFromProperties({ status: 'returned', fulfillment_status: 'canceled' })).toBe('returned')
  })

  it('translates foreign words and refuses to guess', () => {
    expect(translateSourceStatus('Canceled')).toBe('cancelled')
    expect(translateSourceStatus('shipped')).toBe('fulfilled')
    expect(translateSourceStatus('delivered')).toBe('delivered')
    expect(translateSourceStatus('processing')).toBe('pending')
    expect(translateSourceStatus('partially_fulfilled')).toBe('pending')
    expect(translateSourceStatus(undefined)).toBe('pending')
  })

  it('only ever moves forward, and a reversal is final', () => {
    const { PENDING, FULFILLED, DELIVERED, CANCELLED, REFUNDED } = ORDER_STATUS
    expect(laterStatus(PENDING, FULFILLED)).toBe(FULFILLED)
    expect(laterStatus(FULFILLED, DELIVERED)).toBe(DELIVERED)
    expect(laterStatus(DELIVERED, FULFILLED)).toBe(DELIVERED)   // a late "shipped" cannot walk it back
    expect(laterStatus(DELIVERED, PENDING)).toBe(DELIVERED)
    expect(laterStatus(DELIVERED, REFUNDED)).toBe(REFUNDED)     // a refund after delivery wins
    expect(laterStatus(CANCELLED, DELIVERED)).toBe(CANCELLED)   // a late delivery never undoes a cancel
    expect(laterStatus(CANCELLED, REFUNDED)).toBe(CANCELLED)    // first reversal stands
  })
})
