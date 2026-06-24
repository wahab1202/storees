import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { AggregateRule, FilterConfig } from '@storees/shared'
import {
  evaluateAggregateRows,
  compileAggregateRule,
  filterToSql,
  type AggregateSourceRow,
} from './evaluator.js'

// lowercased so keyword-case (HAVING vs having) doesn't make assertions brittle
const renderSql = (q: SQL): string => new PgDialect().sqlToQuery(q).sql.toLowerCase()

// ── Seed data from the spec (§5). Unit price 1500 for Product 4; window
//    20/05/2026 → 20/07/2026. Scope = product_id is P-4. ─────────────────────
const P4 = 'P-4'
const SEED: Record<string, AggregateSourceRow[]> = {
  // 01/06 x8 + 20/06 x6 = 21000 in window
  Ravi: [
    { date: '2026-06-01', product_id: P4, price: 1500, quantity: 8, order_id: 'r1' },
    { date: '2026-06-20', product_id: P4, price: 1500, quantity: 6, order_id: 'r2' },
  ],
  // 10/06 x16 = 24000
  Meena: [{ date: '2026-06-10', product_id: P4, price: 1500, quantity: 16, order_id: 'm1' }],
  // 05/06 x1 P4 = 1500, plus 25000 spent on OTHER products → scope must drop those
  Sneha: [
    { date: '2026-06-05', product_id: P4, price: 1500, quantity: 1, order_id: 's1' },
    { date: '2026-06-06', product_id: 'P-9', price: 25000, quantity: 1, order_id: 's2' },
  ],
  // 01/05 x8 (BEFORE window, dropped) + 15/06 x10 = 15000 in window
  Karthik: [
    { date: '2026-05-01', product_id: P4, price: 1500, quantity: 8, order_id: 'k1' },
    { date: '2026-06-15', product_id: P4, price: 1500, quantity: 10, order_id: 'k2' },
  ],
  // 12/06 x13 = 19500
  Arjun: [{ date: '2026-06-12', product_id: P4, price: 1500, quantity: 13, order_id: 'a1' }],
}

const baseScope = {
  source: 'order_fulfilled' as const,
  scope: { operator: 'AND' as const, filters: [{ field: 'product_id', operator: 'is', value: [P4] }] },
  timeframe: { type: 'between' as const, start: '2026-05-20', end: '2026-07-20' },
}

const sumRule: AggregateRule = {
  type: 'aggregate',
  ...baseScope,
  aggregate: { fn: 'SUM', field: 'line_value' },
  operator: 'gt',
  value: 20000,
}

const countUnitsRule: AggregateRule = {
  type: 'aggregate',
  ...baseScope,
  aggregate: { fn: 'SUM', field: 'quantity' }, // COUNT units = SUM of quantity (spec convention)
  operator: 'gte',
  value: 14,
}

describe('scoped aggregate — pure evaluator (the spec acceptance tests)', () => {
  it('SUM of Product-4 line value > 20000 returns exactly Ravi and Meena', () => {
    const inSegment = Object.entries(SEED)
      .filter(([, rows]) => evaluateAggregateRows(sumRule, rows))
      .map(([name]) => name)
    expect(inSegment.sort()).toEqual(['Meena', 'Ravi'])
  })

  it('Sneha is OUT — scope runs BEFORE the sum (her 26500 total is on other products)', () => {
    expect(evaluateAggregateRows(sumRule, SEED.Sneha)).toBe(false)
  })

  it('Karthik is OUT — timeframe drops his 01/05 rows before the sum', () => {
    expect(evaluateAggregateRows(sumRule, SEED.Karthik)).toBe(false)
    // sanity: if we DON'T scope time, his 8+10 units = 27000 would flip him IN
    const noTime: AggregateRule = { ...sumRule, timeframe: { type: 'all_time' } }
    expect(evaluateAggregateRows(noTime, SEED.Karthik)).toBe(true)
  })

  it('Arjun is OUT — 19500 is below the 20000 threshold', () => {
    expect(evaluateAggregateRows(sumRule, SEED.Arjun)).toBe(false)
  })

  it('COUNT units >= 14 returns the same set at uniform price (Ravi, Meena)', () => {
    const inSegment = Object.entries(SEED)
      .filter(([, rows]) => evaluateAggregateRows(countUnitsRule, rows))
      .map(([name]) => name)
    expect(inSegment.sort()).toEqual(['Meena', 'Ravi'])
  })

  it('a customer with zero surviving rows is OUT (no GROUP BY group)', () => {
    expect(evaluateAggregateRows(sumRule, [])).toBe(false)
  })
})

describe('scoped aggregate — SQL compiler shape', () => {
  it('filters in WHERE then aggregates in HAVING (scope before sum)', () => {
    const text = renderSql(compileAggregateRule(sumRule))
    const whereIdx = text.indexOf('in (')      // scope product filter (lowercased)
    const groupIdx = text.indexOf('group by')
    const havingIdx = text.indexOf('having')
    expect(whereIdx).toBeGreaterThanOrEqual(0)
    expect(groupIdx).toBeGreaterThan(whereIdx)   // scope before grouping
    expect(havingIdx).toBeGreaterThan(groupIdx)  // aggregate compared after grouping
    expect(text).toContain('sum(')
    expect(text).toContain('jsonb_array_elements')
  })

  it('is dual-source (orders table OR order events) and windows the date half-open', () => {
    const text = renderSql(compileAggregateRule(sumRule))
    expect(text).toContain('from events')
    expect(text).toContain('from orders')
    expect(text).toMatch(/\)\s+or\s+exists/i)
    expect(text).toContain("interval '1 day'") // between-dates → [start, end+1day)
  })

  it('composes into the boolean tree: (A or B) AND aggregate, properly bracketed', () => {
    const tree: FilterConfig = {
      logic: 'AND',
      rules: [
        {
          type: 'group',
          logic: 'OR',
          rules: [
            { field: 'city', operator: 'is', value: 'Mattress' },
            { field: 'city', operator: 'is', value: 'Frames' },
          ],
        },
        sumRule,
      ],
    }
    const text = renderSql(filterToSql(tree))
    expect(text).toContain(' or ')   // inner OR group
    expect(text).toContain(' and ')  // top-level AND with the aggregate
    expect(text).toContain('having') // the aggregate leaf is present
  })
})
