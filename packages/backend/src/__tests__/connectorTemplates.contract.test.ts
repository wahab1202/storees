import { describe, it, expect } from 'vitest'
import { listTemplates, getTemplate } from '../services/connectorRegistry.js'

// Contract test — the CI guard that would have blocked the GWM bug at source.
//
// In June a template edit silently dropped `order_status` / `fulfillment_status`
// from the VirpanAI orders mapping. Nothing failed; every order quietly went
// 'pending' for months. This test asserts every connector template DECLARES the
// core order fields plus a status field, and that concrete (non-blank) templates
// actually MAP them (non-empty). Removing the status mapping now fails CI.

// Keys every orders field-map must at least declare.
const REQUIRED_ORDER_FIELDS = ['customer_id', 'order_id', 'total', 'timestamp'] as const
// At least one of these must be declared so order status can be surfaced.
const ORDER_STATUS_FIELDS = ['order_status', 'fulfillment_status'] as const

// 'custom' is a blank scaffold — onboarding fills the source field names in
// later, so its declared keys are intentionally empty strings. Concrete
// templates must have real (non-empty) mappings.
const SCAFFOLD_TEMPLATE_IDS = new Set(['custom'])

function orderMap(templateId: string): Record<string, unknown> {
  const t = getTemplate(templateId)
  if (!t) throw new Error(`template ${templateId} not found`)
  return (t.fieldMap.orders ?? {}) as Record<string, unknown>
}

describe('connector template contract', () => {
  const templates = listTemplates()

  it('registers at least one template', () => {
    expect(templates.length).toBeGreaterThan(0)
  })

  for (const { id } of templates) {
    describe(`template: ${id}`, () => {
      it('declares the core order fields', () => {
        const map = orderMap(id)
        for (const field of REQUIRED_ORDER_FIELDS) {
          expect(map, `orders map missing "${field}"`).toHaveProperty(field)
        }
      })

      it('declares a status field (order_status or fulfillment_status)', () => {
        const map = orderMap(id)
        const declared = ORDER_STATUS_FIELDS.some((f) => f in map)
        expect(
          declared,
          `orders map must declare one of ${ORDER_STATUS_FIELDS.join(' / ')} — ` +
            'without it every order renders "Unknown". This is the guard against ' +
            'the dropped-status-mapping bug.',
        ).toBe(true)
      })

      if (!SCAFFOLD_TEMPLATE_IDS.has(id)) {
        it('maps a status field to a non-empty source path (concrete template)', () => {
          const map = orderMap(id)
          const mapped = ORDER_STATUS_FIELDS.some(
            (f) => typeof map[f] === 'string' && (map[f] as string).trim() !== '',
          )
          expect(
            mapped,
            `concrete template "${id}" must MAP a status field to a source path, ` +
              'not just declare it.',
          ).toBe(true)
        })

        it('maps the core order fields to non-empty source paths', () => {
          const map = orderMap(id)
          for (const field of REQUIRED_ORDER_FIELDS) {
            expect(
              typeof map[field] === 'string' && (map[field] as string).trim() !== '',
              `concrete template "${id}" must map "${field}" to a source path`,
            ).toBe(true)
          }
        })
      }
    })
  }
})
