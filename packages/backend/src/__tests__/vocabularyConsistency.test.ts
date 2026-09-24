import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { EVENT_PROPERTIES } from '@storees/shared'
import { getDomainFields } from '../services/domainRegistry.js'
import type { DomainType } from '@storees/shared'

/**
 * The three lists that have to agree, and never did.
 *
 * Storees describes the same thing in several files and nothing compared them, so they
 * drifted — quietly, because a mismatch never throws. A filter naming a field the query
 * engine has no case for compiles to a dead branch and the segment reports zero members,
 * which reads exactly like "nobody qualifies". An event mapped by a pack but missing
 * from the schema registry ingests fine and shows "No properties yet" the moment a
 * marketer tries to filter on it.
 *
 * Found by hand in one sweep: 17 seeded segments across three verticals filtering on
 * fields that did not exist (including all three of lending's collection buckets and
 * NPA Risk), two dropdown entries the engine could not run, and five event names that
 * appeared in exactly one file each — `product_reviewed`, `subscription_created`,
 * `certificate_earned`, `remove_from_cart`, `invite_sent`. One of those meant the
 * ecommerce review flow could never fire, since its trigger used the other spelling.
 *
 * Each was a two-minute fix and none was visible without going looking. This test is
 * the thing that goes looking, on every push.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKS_DIR = join(HERE, '../packs')
const EVALUATOR = join(HERE, '../../../segments/src/evaluator.ts')

type Pack = {
  id: string
  interaction_config: Array<{ event_name: string }>
  segment_templates: Array<{ name: string; filter: unknown }>
  prediction_goals: Array<{ name: string; target_event: string }>
}

function loadPacks(): Pack[] {
  return readdirSync(PACKS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(PACKS_DIR, f), 'utf8')) as Pack)
}

/**
 * Every field name the evaluator can resolve.
 *
 * Read out of the source rather than exported, because the switch IS the list — there
 * is no registry to import. Both forms count: most fields are `case 'x':` in the field
 * switch, a few (the email-engagement ones) are handled by an `if (rule.field === 'x')`
 * before it. An earlier version of this sweep matched only `case` and wrongly reported
 * two working ecommerce fields as broken.
 */
function evaluatorFields(): Set<string> {
  const src = readFileSync(EVALUATOR, 'utf8')
  return new Set([
    ...[...src.matchAll(/case '([a-z_0-9]+)':/g)].map(m => m[1]),
    ...[...src.matchAll(/rule\.field === '([a-z_0-9]+)'/g)].map(m => m[1]),
  ])
}

/** Every `field` mentioned anywhere in a filter, however deeply nested. */
function fieldsIn(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    node.forEach(n => fieldsIn(n, found))
    return found
  }
  const obj = node as Record<string, unknown>
  if (typeof obj.field === 'string') found.push(obj.field)
  Object.values(obj).forEach(v => fieldsIn(v, found))
  return found
}

/** Goal targets that are keywords the resolver translates, not events a client sends. */
const PSEUDO_EVENTS = new Set([
  'purchase', 'repeat_purchase', 'churn', 'dormancy', 'cart_abandoned',
])

describe('vocabulary consistency', () => {
  const packs = loadPacks()
  const known = evaluatorFields()

  it('finds the packs and the evaluator', () => {
    expect(packs.length).toBeGreaterThan(0)
    expect(known.size).toBeGreaterThan(20)
  })

  describe.each(packs.map(p => [p.id, p] as const))('%s pack', (_id, pack) => {
    it('every mapped event is defined in eventSchemas', () => {
      const missing = pack.interaction_config
        .map(e => e.event_name)
        .filter(name => !(name in EVENT_PROPERTIES))
      expect(missing, 'mapped but undefined — its properties cannot be filtered on').toEqual([])
    })

    it('maps no event twice', () => {
      const names = pack.interaction_config.map(e => e.event_name)
      expect(names.length - new Set(names).size, 'duplicate event_name').toBe(0)
    })

    it('every segment template filters on fields the evaluator can resolve', () => {
      const broken = pack.segment_templates
        .map(t => ({ name: t.name, missing: [...new Set(fieldsIn(t.filter))].filter(f => !known.has(f)) }))
        .filter(t => t.missing.length > 0)
        .map(t => `${t.name} → ${t.missing.join(', ')}`)
      expect(broken, 'these segments would report zero members forever').toEqual([])
    })

    it('every prediction goal targets a mapped event or a known keyword', () => {
      const mapped = new Set(pack.interaction_config.map(e => e.event_name))
      const dangling = pack.prediction_goals
        .filter(g => !PSEUDO_EVENTS.has(g.target_event) && !mapped.has(g.target_event))
        .map(g => `${g.name} → ${g.target_event}`)
      expect(dangling, 'the goal has no event to learn from').toEqual([])
    })
  })

  describe.each(['ecommerce', 'fintech', 'saas', 'edtech'] as DomainType[])(
    '%s segment builder', (domain) => {
      it('offers only fields the evaluator can resolve', () => {
        const unrunnable = getDomainFields(domain)
          .map(f => f.field)
          .filter(f => !known.has(f))
        expect(unrunnable, 'offered in the dropdown, cannot be queried').toEqual([])
      })
    })
})

/**
 * THE SAME TRANSLATION LIVES IN TWO LANGUAGES.
 *
 * `ROLE_TO_MEANING` (this package, event-mapping route) turns an onboarding role into
 * one of the eight mapping slots, and fills the Event Mapping screen.
 * `_MEANING_OF_INTERACTION` (packages/ml, train_propensity.py) does the identical job
 * for the prediction pipeline.
 *
 * They drifted. `cart_remove` was added here and not there, so the screen showed the
 * Removed-from-cart slot filled while the pipeline read it as blank — and every cart
 * calculation silently ignored removals. A shopper who emptied a basket was still
 * scored as holding it, and an emptied cart still counted as open.
 *
 * Nothing failed. Two tables, one rule, and no way to tell they disagreed.
 *
 * A shared source would be better than a test; TypeScript and Python cannot hold one
 * without a build step neither side has. So this reads the Python file and compares.
 * It is coarse — a regex over source — but it turns silent drift into a red test,
 * which is the property that was missing.
 */
describe('role translation agrees across the TypeScript and Python halves', () => {
  it('every role the pipeline understands is understood by the mapping screen too', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')

    const pyPath = path.resolve(__dirname,
      '../../../ml/propensity/train_propensity.py')
    if (!fs.existsSync(pyPath)) {
      // The ML package is not always checked out beside this one. Skipping is honest;
      // asserting against a file that is not there would fail for the wrong reason.
      return
    }
    const py = fs.readFileSync(pyPath, 'utf8')
    const block = py.match(/_MEANING_OF_INTERACTION = \{([\s\S]*?)\n\}/)
    expect(block, 'could not find _MEANING_OF_INTERACTION in train_propensity.py').toBeTruthy()

    const pyRoles = [...block![1].matchAll(/^\s*"([a-z_]+)":\s*"([a-z_]+)"/gm)]
      .map(m => m[1])

    const ts = fs.readFileSync(path.resolve(__dirname, '../routes/eventMapping.ts'), 'utf8')
    const tsBlock = ts.match(/const ROLE_TO_MEANING[^=]*= \{([\s\S]*?)\n\}/)
    expect(tsBlock, 'could not find ROLE_TO_MEANING in eventMapping.ts').toBeTruthy()
    const tsRoles = [...tsBlock![1].matchAll(/^\s*([a-z_]+):\s*'([a-z_]+)'/gm)].map(m => m[1])

    const missingHere = pyRoles.filter(r => !tsRoles.includes(r))
    expect(missingHere,
      `roles the pipeline understands but this screen does not: ${missingHere.join(', ')}`,
    ).toEqual([])

    // AND THE OTHER DIRECTION, which the first check cannot see.
    //
    // Drift runs both ways. A slot added to the screen and not to the pipeline looks
    // perfect to a client — the box is there, it accepts an event name, it saves —
    // while the models never receive it. That is the shape `cart_remove` had, and the
    // shape `cart_snapshot` would have had without this half.
    //
    // `fulfilment` is exempt and always will be: it moves an order's STATUS and builds
    // no feature, so the pipeline has no slot for it and needs none. Listed rather than
    // pattern-matched, so adding a genuinely missing role cannot be waved through by a
    // loose rule.
    const TS_ONLY_BY_DESIGN = ['fulfilment', 'fulfillment']
    const missingInPipeline = tsRoles
      .filter(r => !pyRoles.includes(r))
      .filter(r => !TS_ONLY_BY_DESIGN.includes(r))
    expect(missingInPipeline,
      `roles this screen offers but the pipeline ignores: ${missingInPipeline.join(', ')}`,
    ).toEqual([])
  })

  it('the cart slots are understood by both halves', () => {
    // Named explicitly rather than left to the coverage checks above. The three cart
    // meanings are the ones that have actually drifted, and a test that says which
    // slot broke is worth more at 2am than one that says "a role is missing".
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const pyPath = path.resolve(__dirname, '../../../ml/propensity/train_propensity.py')
    if (!fs.existsSync(pyPath)) return

    const py = fs.readFileSync(pyPath, 'utf8')
    const ts = fs.readFileSync(path.resolve(__dirname, '../routes/eventMapping.ts'), 'utf8')

    for (const role of ['intent', 'cart_remove', 'cart_snapshot']) {
      expect(new RegExp(`"${role}":`).test(py), `${role} missing from _MEANING_OF_INTERACTION`).toBe(true)
      expect(new RegExp(`\\b${role}:`).test(ts), `${role} missing from ROLE_TO_MEANING`).toBe(true)
    }

    // And the screen must actually OFFER the slot, not merely translate a role into it.
    // A meaning absent from MEANINGS is a role that resolves to a box nobody can fill.
    for (const key of ['add_to_cart', 'cart_remove', 'cart_snapshot']) {
      expect(ts.includes(`key: '${key}'`), `${key} is not one of the mapping screen's MEANINGS`).toBe(true)
    }
  })
})
