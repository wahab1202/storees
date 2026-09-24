import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { dataSourceConnectors, interactionConfigs, projects } from '../db/schema.js'
import { loadPack } from './verticalPackService.js'

/** A project states its industry as `domain_type`; the packs are named for the business
 *  they serve. `fintech` is served by the NBFC pack — the only pair where the two words
 *  differ, and the reason this map exists rather than a direct lookup. */
const PACK_FOR_DOMAIN: Record<string, string> = {
  ecommerce: 'ecommerce',
  fintech: 'nbfc',
  saas: 'saas',
  edtech: 'edtech',
}
import { filterToSql, scopedFilterToSql, type SegmentVocabulary } from '@storees/segments'
import type { FilterConfig } from '@storees/shared'
import type { SQL } from 'drizzle-orm'

/**
 * What THIS project calls the things Storees reasons about.
 *
 * Storees is generic in the pipeline and hardcoded everywhere else. The ML asks the
 * project which event is a purchase and where the money sits; the dashboard, the
 * metrics worker, the customer aggregates and the segment evaluator all assume
 * `order_placed` and `properties.total`. Those are a shop's words.
 *
 * The result, measured on a real lending project: a ₹5,00,000 loan stored as
 * `total_orders=1, total_spent=0.00`. The model trains on the correct amount while
 * every screen reports zero, and nothing anywhere explains the difference. EdTech is
 * worse — `course_enrolled` is on no hardcoded list, so even the count is zero.
 *
 * This is the one place that answers the question. It reads what the industry pack
 * already wrote at onboarding; it does not introduce new storage or new configuration.
 *
 * PRECEDENCE mirrors the pipeline's, and for the same reason — stated beats assumed:
 *
 *   1. the connector's `config.mapping`   somebody declared this project's vocabulary
 *   2. `interaction_configs`              what onboarding recorded for its industry
 *   3. the retail defaults                only when nothing else answered
 *
 * (3) is a deliberate fallback rather than a refusal: unlike the ML, a blank dashboard
 * helps nobody, and every project that predates vertical packs relies on it. It is
 * also why this is safe for GoWelmart — retail's real vocabulary IS the fallback, so
 * replacing a literal with this lookup cannot change its numbers.
 */

export type ProjectVocabulary = {
  /** false when NOTHING was declared for this project and the retail defaults are
   *  standing in. Callers that display numbers should surface it; a lender running on
   *  a shop's vocabulary produces plausible, wrong figures with no other symptom. */
  declared: boolean
  /** every event that means "the customer committed" — the revenue events */
  purchaseEvents: string[]
  /** EVERY event that reverses a sale, whichever kind. The union of the three lists
   *  below, and the only one anything touching MONEY should read: a reversal takes the
   *  revenue back off regardless of why, and a caller that had to remember three lists
   *  would eventually forget one. */
  cancellationEvents: string[]
  /** the order shipped and came back. Distinct from a cancellation, which never
   *  shipped, and from the refund that usually follows. */
  returnEvents: string[]
  /** money going back to the customer. Can be PARTIAL, and can happen with no return
   *  at all — a goodwill refund on a delivered order. */
  refundEvents: string[]
  /** the order reached the customer. Moves no money, which is why it sits outside
   *  `cancellationEvents` and why nothing here reads it for revenue. */
  fulfilmentEvents: string[]
  /** true only when THIS PROJECT filled in a reversal box on the mapping screen.
   *
   *  The difference matters to one caller: deciding what a reversal it cannot place
   *  should be filed as. A project that deliberately put `order_refunded` in the
   *  Cancelled box has answered the question and its answer wins. A project that has
   *  merely inherited its industry's starter mapping has answered nothing — and
   *  reading that as a deliberate "all reversals are cancellations" is how every
   *  standard-name shop suddenly lost the difference between a return and a refund. */
  reversalsDeclared: boolean
  /** browsing */
  viewEvents: string[]
  /** unfinished intent — a cart, an application, a course added to a list */
  cartEvents: string[]
  /** TAKEN BACK OUT of that basket. Empty for a shop that never reports it.
   *
   *  A slot of its own rather than one of the project's own signals, because two
   *  things need to know: totalling a basket honestly, and deciding whether a
   *  shopper is still active. Emptying a basket is engagement — the clock should
   *  reset on it exactly as it does on an add. */
  cartRemoveEvents: string[]
  /** THE WHOLE BASKET, not a move made to it.
   *
   *  `added_to_cart` says "a shampoo went in"; this says "the basket is now four
   *  items worth 3,190". Both arrive on every change — the action carries the
   *  behaviour, this carries the value — and reading the second is what stops the
   *  first being asked a question it cannot answer.
   *
   *  Empty for a shop that sends only actions; the basket is then reconstructed
   *  from adds and removes exactly as before. */
  cartSnapshotEvents: string[]
  /** saved-for-later. Retail's wishlist; most verticals have no equivalent. */
  wishlistEvents: string[]
  /** the property on a purchase event holding the amount */
  amountKey: string
  /** the property holding the transaction's own id */
  orderIdKey: string
  /** the property holding the currency */
  currencyKey: string
  /** the property holding the discount applied to the transaction */
  discountKey: string
  /** on a basket snapshot: the property holding the basket's value */
  cartTotalKey: string
  /** on a basket snapshot: the property holding how many items are in it */
  cartItemCountKey: string
  /** on a basket snapshot: the property holding the array of lines */
  cartLinesKey: string
}

/** What a project that has declared nothing gets. Retail's words, because retail was
 *  first and because these are the values every pre-pack project already behaves as. */
const RETAIL_DEFAULTS: ProjectVocabulary = {
  declared: false,
  // ONE name, not two.
  //
  // `order_completed` was here as a hedge — catch either word and you probably catch
  // the shop's purchases. It cost more than it caught:
  //   - the word is ambiguous. Completed the checkout, or completed the delivery?
  //     One code path read it as delivered and created the order already fulfilled,
  //     so the same order came out `pending` or `fulfilled` depending on which of the
  //     two events happened to arrive first.
  //   - it is not in the published spec, so no shop is ever asked to send it — yet
  //     six files watched for it.
  //   - measured on GoWelmart: 66,627 orders carry `order_placed`, 9,575 also carry
  //     `order_completed`, and just 21 carry it ALONE. A 0.03% catch for a permanent
  //     ambiguity.
  // A purchase is the moment money is committed. That is `order_placed`.
  purchaseEvents: ['order_placed'],
  cancellationEvents: ['order_cancelled', 'order_refunded', 'order_returned'],
  returnEvents: ['order_returned'],
  refundEvents: ['order_refunded'],
  fulfilmentEvents: ['order_fulfilled'],
  reversalsDeclared: false,
  viewEvents: ['product_viewed'],
  cartEvents: ['added_to_cart'],
  // THE PUBLISHED NAME, LIKE EVERY OTHER SLOT.
  //
  // This was deliberately left empty, reasoning that a shop which has not declared a
  // removal event does not have one, and that a slot looking configured while matching
  // nothing is worse than a blank.
  //
  // Sound in general, and wrong here: every sibling above makes the same bet. Nothing
  // guarantees a shop sends `added_to_cart` or `order_fulfilled` either, and both are
  // defaulted. Singling this one out meant a shop following the published names to the
  // letter — sending `removed_from_cart`, the name in STANDARD_EVENTS and in the
  // ecommerce pack's own interaction config — still arrived with the slot blank and had
  // to wire it by hand. Bazario, built to the documentation, landed exactly there.
  //
  // The cost of the blank is not cosmetic: without it a basket counts items the shopper
  // took back out. Measured on one shop, 770 removals against 10,418 adds — roughly one
  // basket in fourteen overstated, and an abandoned-cart flow chasing people over
  // baskets they had emptied.
  //
  // A shop that never sends the event is unaffected: the mapping simply matches nothing,
  // which is the same position the empty default left it in.
  cartRemoveEvents: ['removed_from_cart'],
  // The published name, like every slot above it. A shop following EVENT_SPEC.md
  // sends `cart_updated` on every cart change; one that sends nothing by this name
  // matches nothing, which is the same position an empty default would leave it in.
  cartSnapshotEvents: ['cart_updated'],
  wishlistEvents: ['added_to_wishlist'],
  amountKey: 'total',
  orderIdKey: 'order_id',
  currencyKey: 'currency',
  discountKey: 'discount',
  // The three properties a basket snapshot carries, per EVENT_SPEC.md. Overridable
  // for the same reason `amountKey` is: the spec is what shops are ASKED to send,
  // not what every shop will send, and a wrong key reads as an empty basket rather
  // than as an error.
  cartTotalKey: 'total',
  cartItemCountKey: 'item_count',
  cartLinesKey: 'line_items',
}

/** onboarding's interaction types -> the meaning the rest of the product uses */
const ROLE: Record<string, keyof ProjectVocabulary> = {
  conversion: 'purchaseEvents',
  cancellation: 'cancellationEvents',
  view: 'viewEvents',
  intent: 'cartEvents',
  // Packs that distinguish the reversals get the finer lists. One that files them all
  // under `cancellation` still lands in the union below, so nothing regresses.
  return: 'returnEvents',
  refund: 'refundEvents',
  fulfilment: 'fulfilmentEvents',
  fulfillment: 'fulfilmentEvents',
  cart_snapshot: 'cartSnapshotEvents',
}

// Vocabulary changes only when someone edits the mapping screen or re-runs a pack —
// rare, while these lookups sit in per-event and per-request hot paths. Sixty seconds
// is long enough to matter and short enough that a correction is visible almost at
// once. `invalidateVocabulary` makes it immediate for the writers that know.
const TTL_MS = 60_000
const cache = new Map<string, { at: number; value: ProjectVocabulary }>()
/** projects already warned about, so the log records the problem once rather than
 *  once per event. */
const warned = new Set<string>()

export function invalidateVocabulary(projectId: string): void {
  cache.delete(projectId)
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  return []
}

const uniq = (xs: string[]) => [...new Set(xs)]

export async function projectVocabulary(projectId: string): Promise<ProjectVocabulary> {
  const hit = cache.get(projectId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  const value = await read(projectId)
  cache.set(projectId, { at: Date.now(), value })
  return value
}

async function read(projectId: string): Promise<ProjectVocabulary> {
  const out: ProjectVocabulary = { ...RETAIL_DEFAULTS }

  // 1. the connector's declared mapping.
  //
  // THE ONE THAT ACTUALLY HAS A MAPPING WINS, and among those, the most recently
  // updated. This was `.limit(1)` with no ORDER BY, which returns an ARBITRARY row —
  // fine while a project had one connector, wrong the moment it has two.
  //
  // Two is not unusual: activating an industry pack creates an `event_mapping`
  // connector, and installing Shopify or saving the mapping screen creates another.
  // Whichever Postgres happened to return decided the project's entire vocabulary.
  // Reproduced on a fresh e-commerce project: the pack's empty connector was chosen
  // over the one carrying the shop's own event names, so every meaning silently fell
  // back to retail defaults — the exact failure the mapping screen exists to prevent.
  const connectors = await db
    .select({ config: dataSourceConnectors.config, updatedAt: dataSourceConnectors.updatedAt })
    .from(dataSourceConnectors)
    .where(eq(dataSourceConnectors.projectId, projectId))
  const hasEvents = (c: { config: unknown }) =>
    Object.keys(((c.config as Record<string, any>)?.mapping?.events ?? {})).length > 0
  const connector = connectors.filter(hasEvents)
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))[0]
    ?? connectors[0]

  const mapping = ((connector?.config as Record<string, any> | undefined)?.mapping ?? {}) as Record<string, any>
  const ev = (mapping.events ?? {}) as Record<string, unknown>
  const fields = ((mapping.fields ?? {}).order ?? {}) as Record<string, unknown>

  // Events and fields are tracked SEPARATELY, per category. They are written to
  // different places: the pack puts field paths on the connector config and event
  // roles in `interaction_configs`. A single "did the connector declare anything"
  // flag returns the retail defaults for a project whose events are perfectly well
  // recorded — which is what a freshly onboarded ecommerce project looked like on the
  // first run of this helper: `fields` present, `events` absent, so it answered
  // `order_placed, order_completed` from the fallback rather than the one real
  // `order_placed` its pack had mapped.
  const settled = new Set<keyof ProjectVocabulary>()

  const fromMapping: Array<[keyof ProjectVocabulary, string]> = [
    ['purchaseEvents', 'purchase'],
    ['cancellationEvents', 'cancellation'],
    ['returnEvents', 'return'],
    ['refundEvents', 'refund'],
    ['fulfilmentEvents', 'fulfilment'],
    ['viewEvents', 'product_viewed'],
    ['cartEvents', 'add_to_cart'],
    ['cartRemoveEvents', 'cart_remove'],
    ['cartSnapshotEvents', 'cart_snapshot'],
  ]
  for (const [key, mapKey] of fromMapping) {
    const names = asList(ev[mapKey])
    if (names.length) { (out[key] as string[]) = names; settled.add(key) }
  }

  // The three reversal boxes are one decision, so they resolve together. Someone who
  // named their cancellations and left `return` blank means "we don't distinguish
  // one" -- NOT "fall back to the retail word", which is how they would otherwise
  // inherit `order_returned` and quietly file a shop event they never send.
  const REVERSAL_KEYS = ['cancellationEvents', 'returnEvents', 'refundEvents'] as const
  out.reversalsDeclared = REVERSAL_KEYS.some(k => settled.has(k))
  if (out.reversalsDeclared) {
    // Marked settled, not just emptied: the project ANSWERED this question, and
    // onboarding's older record must not reach in below and un-answer it.
    for (const k of REVERSAL_KEYS) if (!settled.has(k)) { out[k] = []; settled.add(k) }
  }
  if (typeof fields.amount === 'string' && fields.amount) { out.amountKey = fields.amount; settled.add('amountKey') }
  if (typeof fields.order_id === 'string' && fields.order_id) { out.orderIdKey = fields.order_id; settled.add('orderIdKey') }
  if (typeof fields.currency === 'string' && fields.currency) { out.currencyKey = fields.currency; settled.add('currencyKey') }
  if (typeof fields.discount === 'string' && fields.discount) { out.discountKey = fields.discount; settled.add('discountKey') }

  // The snapshot's own field names live under `fields.cart`, beside the order's. A
  // project that never mentions them keeps the published defaults, which is the
  // common case and the one the spec describes.
  const cartFields = ((mapping.fields ?? {}) as Record<string, unknown>).cart as Record<string, unknown> | undefined
  if (cartFields) {
    if (typeof cartFields.total === 'string' && cartFields.total) { out.cartTotalKey = cartFields.total; settled.add('cartTotalKey') }
    if (typeof cartFields.item_count === 'string' && cartFields.item_count) { out.cartItemCountKey = cartFields.item_count; settled.add('cartItemCountKey') }
    if (typeof cartFields.line_items === 'string' && cartFields.line_items) { out.cartLinesKey = cartFields.line_items; settled.add('cartLinesKey') }
  }

  // 2. onboarding's record fills any EVENT category the connector left unsaid.
  // Field paths have no equivalent there, so an undeclared one keeps the default.
  const eventKeys: Array<keyof ProjectVocabulary> = [
    'purchaseEvents', 'cancellationEvents', 'returnEvents', 'refundEvents',
    'fulfilmentEvents', 'viewEvents', 'cartEvents', 'cartSnapshotEvents',
  ]
  if (eventKeys.some(k => !settled.has(k))) {
    const rows = await db
      .select({ eventName: interactionConfigs.eventName, role: interactionConfigs.interactionType })
      .from(interactionConfigs)
      .where(eq(interactionConfigs.projectId, projectId))

    const collected: Partial<Record<keyof ProjectVocabulary, string[]>> = {}
    for (const r of rows) {
      const key = ROLE[String(r.role).toLowerCase()]
      if (!key) continue
      ;(collected[key] ??= []).push(r.eventName)
    }
    for (const key of eventKeys) {
      if (settled.has(key)) continue
      const names = collected[key]
      // An industry with no such event -- lending has no cancellation -- records
      // nothing, and must end up EMPTY rather than inheriting a shop's three
      // cancellation names, which it will never send.
      //
      // MARK IT SETTLED. This layer answered but never said so, which had two costs:
      // `declared` stayed false for a project whose pack HAD named its events — so
      // every `declared ? strict : loose` branch took the wide guess for a project
      // that was perfectly well configured — and the pack-file layer below would
      // otherwise overwrite a stored answer with a generic one.
      if (rows.length) {
        ;(out[key] as string[]) = names?.length ? names : []
        settled.add(key)
      }
    }
  }

  // 2b. Still unanswered? Read the PACK for this project's own industry.
  //
  // Layer 2 reads `interaction_configs` — rows a pack writes when somebody activates it.
  // Five ordinary situations leave a project without them: created through a door that
  // skips the pack, onboarding failing between creating the project and activating it,
  // the industry changed afterwards, a pack edited later, or a client clearing a box.
  // In every one of those the project still KNOWS its industry — `domain_type` is set —
  // and the pack file on disk still says what that industry calls a sale. Nothing was
  // reading it.
  //
  // Without this the fall-through is retail's vocabulary, so a lender books revenue only
  // if it happens to send `order_placed`. It sends `loan_disbursed`. Its whole ledger
  // reads as zero, and nothing errors.
  //
  // This is the layer that makes "every project has slots" true rather than aspirational,
  // and it is what allows the wide multi-industry guess elsewhere to be retired.
  if (eventKeys.some(k => !settled.has(k))) {
    const [proj] = await db
      .select({ domainType: projects.domainType })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    const pack = loadPack(PACK_FOR_DOMAIN[String(proj?.domainType ?? '')] ?? '')
    if (pack) {
      const collected: Partial<Record<keyof ProjectVocabulary, string[]>> = {}
      for (const e of (pack.interaction_config ?? []) as Array<{ event_name: string; interaction_type: string }>) {
        const key = ROLE[String(e.interaction_type).toLowerCase()]
        if (key) (collected[key] ??= []).push(e.event_name)
      }
      for (const key of eventKeys) {
        if (settled.has(key)) continue
        const names = collected[key]
        // Same rule as layer 2: an industry that records no such event ends up EMPTY,
        // not inheriting a shop's words. Lending has no cancellation.
        ;(out[key] as string[]) = names?.length ? names : []
        settled.add(key)
      }
    }
  }

  // 3. Whatever is still untouched keeps the retail default — but say so.
  //
  // A silent fallback is the dangerous half of this design. The ML REFUSES when a
  // project declares nothing, because guessing there trains a wrong model that looks
  // right; this layer cannot refuse (a blank dashboard helps nobody, and every project
  // predating vertical packs relies on the default), so it records that it guessed and
  // says so once per project.
  //
  // Five ordinary situations reach here: a client clears a field on the Event Mapping
  // screen, a project is created through a door that skips the pack, onboarding fails
  // between creating the project and activating the pack, a project's industry is
  // changed without re-running it, or a pack is edited and existing projects keep the
  // old copy. None of them errors. All of them produce a lender reading shop numbers.
  // 4. Reconcile the four sale-lifecycle lists so no caller can read a contradiction.
  //
  // `cancellationEvents` is the UNION of the three reversal kinds and is what every
  // money path reads. Splitting the mapping screen into three boxes must not mean
  // three places to forget: a name in ANY of them takes the revenue back off.
  out.cancellationEvents = uniq([...out.cancellationEvents, ...out.returnEvents, ...out.refundEvents])

  // A name can only mean one thing. Precedence runs purchase > reversal > fulfilment,
  // matching the worker, because getting it wrong the other way is the expensive
  // direction: a shop whose sale event happens to be called `order_fulfilled` would
  // have every sale swallowed by the fulfilment branch and book no revenue at all.
  const isPurchase = new Set(out.purchaseEvents)
  out.cancellationEvents = out.cancellationEvents.filter(n => !isPurchase.has(n))
  const isReversal = new Set(out.cancellationEvents)
  out.returnEvents = out.returnEvents.filter(n => isReversal.has(n))
  out.refundEvents = out.refundEvents.filter(n => isReversal.has(n))
  out.fulfilmentEvents = out.fulfilmentEvents.filter(n => !isPurchase.has(n) && !isReversal.has(n))

  out.declared = settled.size > 0
  if (!out.declared && !warned.has(projectId)) {
    warned.add(projectId)
    console.warn(
      `[vocabulary] project ${projectId} has declared no event mapping — falling back ` +
      `to retail defaults (order_placed / total). Any non-retail project here is ` +
      `reporting the wrong events.`)
  }
  return out
}

/**
 * A FilterConfig compiled against THIS project's vocabulary.
 *
 * `filterToSql` lives in `packages/segments`, which cannot reach the database, so the
 * vocabulary has to be handed in. Every caller doing that by hand is how half of them
 * end up not doing it — and a filter compiled with the wrong vocabulary does not fail,
 * it silently matches nobody. The Segments page and a campaign built on the same rule
 * would then disagree, which is worse than both being wrong.
 */
export async function filterSqlForProject(projectId: string, filters: FilterConfig): Promise<SQL> {
  return filterToSql(filters, await segmentVocabulary(projectId))
}

/** The same thing, with the caller's agent scope folded in.
 *
 *  Exists because the Segments screen's Preview reached for the raw
 *  `scopedFilterToSql`, which takes no vocabulary and quietly used retail's words — so
 *  a shop with its own vocabulary previewed 0 and then saved a segment with members.
 *  Nothing that needs scoping should have to remember the vocabulary separately. */
export async function scopedFilterSqlForProject(
  projectId: string, filters: FilterConfig, scopedAgentIds: string[] | null,
): Promise<SQL> {
  return scopedFilterToSql(filters, scopedAgentIds, await segmentVocabulary(projectId))
}

async function segmentVocabulary(projectId: string): Promise<SegmentVocabulary> {
  const v = await projectVocabulary(projectId)
  return {
    purchaseEvents: v.purchaseEvents,
    // The union of the three reversal boxes. Segments had no notion of a reversal at
    // all, so a cancelled order still counted towards "spent over ₹X" — and that
    // number is not shown anywhere, it just decides who gets messaged.
    cancellationEvents: v.cancellationEvents,
    viewEvents: v.viewEvents,
    cartEvents: v.cartEvents,
    // A project that declared its own vocabulary gets ONLY its own — a lender has no
    // wishlist and must not inherit a shop's name. A project that declared nothing is
    // already on retail defaults, so keeping the retail name there changes nothing.
    wishlistEvents: v.wishlistEvents,
    amountKey: v.amountKey,
    discountKey: v.discountKey,
    orderIdKey: v.orderIdKey,
  }
}

/**
 * `column` matches any of these event names.
 *
 * Written as OR-ed equality rather than `= ANY(array)`. Passing a JS array into a raw
 * `sql` template does not reliably become a Postgres array: a multi-element list may
 * survive, while a single-element one arrives as the bare string and Postgres rejects it
 * — `malformed array literal: "loan_disbursed"`. That failed only for the vertical whose
 * vocabulary happens to hold exactly one purchase event, which is every vertical except
 * retail. Each name here is its own bound parameter and the shape never varies.
 *
 * An empty list yields a never-true test rather than matching everything.
 */
export function eventIn(column: SQL, names: string[]): SQL {
  if (!names.length) return sql`FALSE`
  if (names.length === 1) return sql`${column} = ${names[0]}`
  return sql`(${sql.join(names.map(n => sql`${column} = ${n}`), sql` OR `)})`
}
