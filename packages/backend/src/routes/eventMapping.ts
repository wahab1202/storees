/**
 * Which of a project's event names carries which meaning.
 *
 * The models cannot be told this by a template alone. Picking an industry supplies a
 * starting mapping, and it is a guess: one live store sends `cart_updated`, another
 * sends `added_to_cart`, and a guess that is wrong produces a model trained on almost
 * nothing rather than an error — one real project's purchase slot matched 6,266 of its
 * 81,164 orders and still returned a plausible score.
 *
 * So the mapping has to be editable per project, and the choices offered here are the
 * events that project has ACTUALLY SENT, with counts. That is the point of the screen:
 * a name with no rows behind it cannot be picked in the first place.
 *
 * Saved onto the project's connector config, which is the first place the pipeline
 * looks — ahead of the environment and ahead of what onboarding recorded. Whatever is
 * set here wins, and takes effect on the next training run.
 */
import { Router } from 'express'
import { db } from '../db/connection.js'
import { dataSourceConnectors, events, interactionConfigs, orders } from '../db/schema.js'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { requireProjectId } from '../middleware/projectId.js'
import { mappingLockState, lockMapping } from '../services/mappingLock.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'
import { invalidateVocabulary } from '../services/projectVocabulary.js'
import { customerAggregateQueue } from '../services/queue.js'

const router = Router()

/** The meanings the pipeline acts on, in the order a person reads them. */
const MEANINGS = [
  { key: 'purchase', label: 'Purchase',
    help: 'The moment money is committed. Every prediction is built from it.',
    required: true },
  { key: 'product_viewed', label: 'Browse',
    help: 'Showed interest without committing.', required: false },
  { key: 'add_to_cart', label: 'Unfinished intent',
    help: 'Started but did not finish — a cart, an application, a trial.',
    required: false },
  // WITHOUT THIS THE BASKET CANNOT BE TOTALLED HONESTLY.
  //
  // It was carried as one of the project's own signals, which means the pipeline knew
  // the NAME and nothing else — so a basket was totalled by adding up its adds, and an
  // item the shopper took back out kept counting. Measured on one shop: 770 removals
  // against 10,418 adds, so roughly one basket in fourteen was overstated with nothing
  // to say which.
  //
  // Optional, and empty is a real answer: a shop that never reports removals gets the
  // sum of its adds, which is exactly right where nothing is ever removed.
  { key: 'cart_remove', label: 'Removed from cart',
    help: 'Taken back out of the basket before checkout. Used to total what is '
        + 'actually in a cart — without it, an item removed still counts.',
    required: false },
  { key: 'fulfilment', label: 'Delivered',
    help: 'The order reached the customer. Moves no money — it only advances the '
        + 'order\'s status out of pending.', required: false },
  { key: 'cancellation', label: 'Cancelled',
    help: 'Called off before it shipped. The sale comes back off revenue.',
    required: false },
  { key: 'return', label: 'Returned',
    help: 'Shipped, then came back. The sale comes back off revenue.',
    required: false },
  { key: 'refund', label: 'Refunded',
    help: 'Money paid back to the customer, with or without a return. The sale comes '
        + 'back off revenue.', required: false },
] as const

// The last three are one question asked three times, and they used to be a single
// "Undo" box. That box could say money had been reversed but never WHICH KIND, so a
// shop using its own words had every cancellation, return and refund land as
// `cancelled` — and return rate was not a figure this product could produce. Splitting
// them is what lets a project's own vocabulary reach the right order status. Everything
// touching MONEY still reads the union of the three, so nothing has to remember all
// three lists to take revenue back off.

/** Every meaning the pipeline acts on — the keys validation and replay iterate. */
const MEANING_KEYS = MEANINGS.map(m => m.key)

const labelOf = (key: string) => MEANINGS.find(m => m.key === key)?.label ?? key

type Mapping = Record<string, unknown>

function readMapping(config: unknown): Mapping {
  const c = (config ?? {}) as Record<string, any>
  return (c.mapping?.events ?? {}) as Mapping
}

/** A mapping value may be one name or several; the UI always works with a list. */
function asList(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  return String(v).split(',').map(s => s.trim()).filter(Boolean)
}

/** What onboarding recorded for this project, in the shape the models read.
 *
 * Picking an industry writes one row per event, tagged with the role it plays. Three
 * of those roles are meanings the pipeline acts on; the rest describe the customer
 * rather than the transaction and become signals. `strong_intent` is deliberately not
 * a purchase — it is the step before committing, and a model handed it as the answer
 * would score well and mean nothing. */
const ROLE_TO_MEANING: Record<string, string> = {
  conversion: 'purchase',
  intent: 'add_to_cart',
  view: 'product_viewed',
  cancellation: 'cancellation',
  // A pack that distinguishes them gets the finer boxes filled in; one that files
  // everything under `cancellation` still lands in the union, so nothing regresses.
  fulfilment: 'fulfilment',
  fulfillment: 'fulfilment',
  return: 'return',
  refund: 'refund',
  // THE EIGHTH SLOT. Seven meanings were listed for eight boxes, so the Removed-from-
  // cart box was the one thing this screen could never suggest. A pack DID name the
  // event — retail files `removed_from_cart` here — but with no role mapped to it the
  // row fell through to `signals` and the box rendered empty, which reads as "your
  // industry has no such event" rather than "nobody wired this up".
  //
  // `cart_remove` is the pack's own role name; `cart_removal` and `remove_from_cart`
  // are accepted because a pack author writing this from memory lands on one of the
  // three, and a role that is nearly right should not silently mean nothing.
  cart_remove: 'cart_remove',
  cart_removal: 'cart_remove',
  remove_from_cart: 'cart_remove',
}

async function inheritedMapping(projectId: string): Promise<Mapping> {
  const rows = await db
    .select({
      eventName: interactionConfigs.eventName,
      role: interactionConfigs.interactionType,
    })
    .from(interactionConfigs)
    .where(eq(interactionConfigs.projectId, projectId))

  const out: Mapping = {}
  const signals: Record<string, string> = {}
  for (const r of rows) {
    const key = ROLE_TO_MEANING[String(r.role).toLowerCase()]
    if (!key) { signals[r.eventName] = r.eventName; continue }
    const current = asList(out[key])
    out[key] = [...current, r.eventName]
  }
  for (const key of Object.keys(out)) {
    const v = asList(out[key])
    out[key] = v.length === 1 ? v[0] : v
  }
  if (Object.keys(signals).length) out.signals = signals
  return out
}


/** The connector whose mapping this project actually runs on.
 *
 *  THE ONE CARRYING A MAPPING WINS, most recently updated first. Every read here was
 *  `.limit(1)` with no ORDER BY — an arbitrary row. A project routinely has two: the
 *  industry pack creates an `event_mapping` connector on activation, and installing
 *  Shopify or saving this screen creates another. Whichever the database happened to
 *  return decided what the screen displayed, and it could differ from the one
 *  `projectVocabulary` picked for the same project — so the mapping page showed
 *  `order_placed` while the system was really running on `sale_done`.
 *
 *  Same ordering as `projectVocabulary` and the ML service's `_saved_config`, so all
 *  three read one project the same way.
 */
async function mappingConnector(projectId: string) {
  const rows = await db
    .select({ id: dataSourceConnectors.id, config: dataSourceConnectors.config,
              updatedAt: dataSourceConnectors.updatedAt })
    .from(dataSourceConnectors)
    .where(eq(dataSourceConnectors.projectId, projectId))
  const hasEvents = (c: { config: unknown }) =>
    Object.keys(((c.config as Record<string, any>)?.mapping?.events ?? {})).length > 0
  return rows.filter(hasEvents)
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))[0] ?? rows[0]
}

// GET /api/event-mapping?projectId=...
// The current mapping, plus every event this project has sent and how often.
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    const sent = await db
      .select({
        eventName: events.eventName,
        count: sql<number>`count(*)::int`,
        lastSeen: sql<string>`max(${events.timestamp})`,
      })
      .from(events)
      .where(eq(events.projectId, projectId))
      .groupBy(events.eventName)
      .orderBy(sql`count(*) desc`)

    const connector = await mappingConnector(projectId)

    // WHAT THE PIPELINE WOULD ACTUALLY USE, not just what is saved here.
    //
    // The connector config is only the first of three places the models consult; a
    // project with nothing saved still trains, on whatever its industry recorded at
    // onboarding. Showing only the saved copy makes a working project look unmapped —
    // and saving from that blank screen would REPLACE a mapping that was fine, because
    // this config outranks the rest. So the inherited values are shown, marked as
    // inherited, and saving is what promotes them to this project's own.
    const saved = readMapping(connector?.config)
    const inherited = await inheritedMapping(projectId)
    const mapping: Mapping = { ...inherited, ...saved }
    const source: Record<string, 'project' | 'industry' | 'none'> = {}
    for (const m of MEANINGS) {
      source[m.key] = saved[m.key] ? 'project' : inherited[m.key] ? 'industry' : 'none'
    }
    const signals = (mapping.signals ?? {}) as Record<string, string>

    // A mapped name with no rows behind it is the failure this screen exists to
    // prevent, so it is reported rather than left for someone to notice in an AUC.
    const counts = new Map(sent.map(e => [e.eventName, e.count]))
    const unmatched: string[] = []
    for (const m of MEANINGS) {
      for (const name of asList(mapping[m.key])) {
        if (!counts.has(name)) unmatched.push(name)
      }
    }
    for (const name of Object.values(signals)) {
      if (!counts.has(name)) unmatched.push(name)
    }

    res.json({
      success: true,
      data: {
        meanings: MEANINGS.map(m => ({
          ...m, events: asList(mapping[m.key]), source: source[m.key],
        })),
        signals: Object.values(signals),
        ignored: asList(mapping.ignore_events),
        available: sent,
        unmatched: [...new Set(unmatched)],
        configured: Boolean(Object.keys(saved).length),
        // Whether Save will be accepted. Sent with the mapping so the screen can say so
        // BEFORE somebody fills the boxes in — a form that looks editable and then
        // refuses on submit is worse than one that tells you up front.
        lock: await mappingLockState(projectId),
      },
    })
  } catch (err) {
    console.error('Event mapping read error:', err)
    res.status(500).json({ success: false, error: 'Failed to read the event mapping' })
  }
})

/**
 * Is a replay still draining for this project?
 *
 * Saving the mapping re-queues every stored event the new meanings cover — 97,060 of
 * them for one real project — and that takes minutes. Nothing said so. The order count
 * simply climbed while somebody watched, which reads as the screen malfunctioning, and
 * a second Save during the drain interleaves two replays: one run deleted rows the
 * other was still inserting and the count fell to 32,616 before recovering.
 *
 * TWO SIGNALS, because neither alone is enough. The connector config records that THIS
 * project started a replay; the queue says whether any work is left. A marker with an
 * empty queue is a finished replay, so the marker is cleared lazily on read rather than
 * needing the worker to report back.
 *
 * The queue depth is process-wide, not per project. That makes this conservative: a
 * busy queue belonging to another project keeps Save disabled here for a moment. Better
 * than the alternative — the failure this prevents is silent and corrupts the books.
 */
async function replayStatus(projectId: string): Promise<{
  running: boolean; remaining: number; total: number; startedAt: string | null
}> {
  const connector = await mappingConnector(projectId)

  const cfg = (connector?.config ?? {}) as Record<string, any>
  const marker = (cfg.mapping?.replay ?? null) as { startedAt?: string; total?: number } | null
  if (!marker?.startedAt) return { running: false, remaining: 0, total: 0, startedAt: null }

  const counts = await customerAggregateQueue.getJobCounts('waiting', 'active', 'delayed')
  const remaining = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)

  // Nothing left to drain -> the replay is done. Clear the marker so the next reader
  // does no work, and so a crashed worker cannot lock the screen for ever.
  if (remaining === 0 && connector) {
    const next = { ...cfg, mapping: { ...(cfg.mapping ?? {}) } }
    delete (next.mapping as Record<string, unknown>).replay
    await db.update(dataSourceConnectors).set({ config: next, updatedAt: new Date() })
      .where(eq(dataSourceConnectors.id, connector.id))
    return { running: false, remaining: 0, total: marker.total ?? 0, startedAt: marker.startedAt }
  }

  return { running: true, remaining, total: marker.total ?? 0, startedAt: marker.startedAt }
}

// GET /api/event-mapping/replay-status?projectId=...
// Polled by the screen while a rebuild is draining, so Save can be held shut and the
// person can see it is working rather than guessing.
router.get('/replay-status', requireProjectId, async (req, res) => {
  try {
    res.json({ success: true, data: await replayStatus(req.projectId!) })
  } catch (err) {
    console.error('Replay status error:', err)
    res.status(500).json({ success: false, error: 'Failed to read replay status' })
  }
})

// PUT /api/event-mapping?projectId=...
// Body: { purchase: string[], product_viewed: string[], add_to_cart: string[],
//         fulfilment: string[], cancellation: string[], return: string[],
//         refund: string[], signals: string[], ignore_events: string[] }
router.put('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const body = req.body ?? {}

    // ONE REMAP PER PROJECT.
    //
    // A save rebuilds this client's orders from their events. Correcting GoWelmart's
    // purchase event moved their reported revenue from ₹16.3 crore to ₹101 crore; a
    // wrong save moves it just as far the other way, and the screen looks like any other
    // form while doing it. Mapping is declared once at onboarding and changes about
    // never, so the door closes after the save that gets it right.
    //
    // Reopening it takes `npm run mapping:unlock` on the server — deliberately not a
    // click. The unlock was built and proven before this check existed.
    const lock = await mappingLockState(projectId)
    if (lock.locked) {
      return res.status(423).json({
        success: false,
        error: 'This project\'s event mapping is locked. It was set on '
             + `${new Date(lock.lockedAt!).toLocaleString()} by ${lock.lockedBy}. `
             + 'Reopen it from the server with: npm run mapping:unlock -- '
             + `--project ${projectId} --reason "<why>"`,
        data: { locked: true, lockedAt: lock.lockedAt, lockedBy: lock.lockedBy },
      })
    }

    // ONE REBUILD AT A TIME.
    //
    // A save re-queues every stored event the meanings cover, and on a large project
    // that drains for minutes. A second save during the drain runs a second replay
    // alongside the first: one deletes rows the other is inserting, and the order count
    // moves in both directions before settling. Observed live — 59,533 orders fell to
    // 32,616 mid-flight. It recovered, but only because nobody pressed Save again.
    const busy = await replayStatus(projectId)
    if (busy.running) {
      return res.status(409).json({
        success: false,
        error: `A rebuild from a previous save is still running — about ${busy.remaining} `
             + `event(s) left. Wait for it to finish before changing the mapping again.`,
      })
    }

    const purchase = asList(body.purchase)
    if (purchase.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'A purchase event is required — every prediction is built from it.',
      })
    }

    // Refuse a name this project has never sent. The pipeline would accept it, match
    // nothing, and train a model on an empty column; catching it at the point someone
    // types it is the only place the mistake is still obvious.
    const sent = await db
      .select({ eventName: events.eventName })
      .from(events)
      .where(eq(events.projectId, projectId))
      .groupBy(events.eventName)
    const known = new Set(sent.map(e => e.eventName))

    // Strict on the meanings, permissive on the rest — the two mistakes are not the
    // same size. A meaning pointed at a name with no rows silently guts the models:
    // one project's purchase slot matched 6,266 of its 81,164 orders and still
    // returned a plausible score. A SIGNAL with no rows costs a constant column that
    // selection drops, and refusing it would block the legitimate case of mapping an
    // event whose tracking ships tomorrow. Those are reported on the screen instead.
    const byMeaning = new Map<string, string[]>(
      MEANING_KEYS.map(k => [k, k === 'purchase' ? purchase : asList(body[k])]),
    )
    const meanings = [...byMeaning.values()].flat()
    const unknown = [...new Set(meanings.filter(n => !known.has(n)))]
    if (unknown.length) {
      return res.status(400).json({
        success: false,
        error: `This project has never sent: ${unknown.join(', ')}. `
             + `A meaning must point at an event that has data behind it.`,
      })
    }

    // One name, one meaning. With seven boxes instead of four this is now easy to get
    // wrong by hand, and the consequences are silent: the vocabulary resolves conflicts
    // by precedence, so a name left in two boxes would just stop doing one of the two
    // jobs its owner thinks it does. Refusing is the only version of that they can see.
    const seen = new Map<string, string>()
    for (const [key, names] of byMeaning) {
      for (const n of names) {
        const first = seen.get(n)
        if (first) {
          return res.status(400).json({
            success: false,
            error: `"${n}" is in both ${labelOf(first)} and ${labelOf(key)}. `
                 + `An event can only carry one meaning.`,
          })
        }
        seen.set(n, key)
      }
    }

    const one = (v: string[]) => (v.length === 1 ? v[0] : v)
    const nextEvents: Mapping = { purchase: one(purchase) }
    for (const key of MEANING_KEYS) {
      if (key === 'purchase') continue
      const v = byMeaning.get(key) ?? []
      if (v.length) nextEvents[key] = one(v)
    }
    const ignore = asList(body.ignore_events)
    if (ignore.length) nextEvents.ignore_events = one(ignore)
    const signals = asList(body.signals)
    if (signals.length) {
      nextEvents.signals = Object.fromEntries(signals.map(s => [s, s]))
    }

    const connector = await mappingConnector(projectId)

    // Everything else in the config — transforms, identity, field paths — is left
    // exactly as it was. Only the event names are this screen's business.
    const existing = (connector?.config ?? {}) as Record<string, any>
    const nextConfig = {
      ...existing,
      mapping: { ...(existing.mapping ?? {}), events: nextEvents },
    }

    if (connector) {
      await db.update(dataSourceConnectors)
        .set({ config: nextConfig, updatedAt: new Date() })
        .where(eq(dataSourceConnectors.id, connector.id))
    } else {
      // A project with no connector still needs somewhere to keep its mapping, since
      // that config is the first place the pipeline looks. The row is deliberately
      // NOT active: the sync worker fans out over `status = 'active'` connectors and
      // would try to pull from a base URL that does not exist.
      await db.insert(dataSourceConnectors).values({
        projectId,
        template: 'event_mapping',
        name: 'Event mapping',
        baseUrl: '',
        authConfig: '{}',
        config: nextConfig,
        status: 'inactive',
      })
    }

    // Drop the cached vocabulary for this project so the change is live on the next
    // request rather than up to 60s later. `invalidateVocabulary` existed and was
    // exported for exactly this — "immediate for the writers that know" — and no
    // writer knew, so this screen, the only thing that edits the mapping, left every
    // reader on the old words for a full TTL. Long enough to save a correction, watch
    // a number not move, and conclude the save had failed.
    invalidateVocabulary(projectId)

    // ── REPLAY WHAT ALREADY ARRIVED ──────────────────────────────────────────
    //
    // An event becomes an order at the moment it lands: the aggregate worker asks
    // "is this name this project's purchase?" and, if not, stores the row and moves
    // on. Nothing ever re-asks. So everything received before a mapping existed stays
    // worth zero — no order, no revenue, no segment membership — while sitting in the
    // events table looking perfectly healthy.
    //
    // That window is not avoidable by mapping first, either: this endpoint REFUSES a
    // meaning pointing at a name with no data behind it (deliberately — it is the only
    // place a typo is still obvious). So a project must receive events before it can
    // describe them, which makes the dead zone structural rather than a mistake.
    //
    // Re-enqueuing through the same queue the live path uses is what closes it. No new
    // order-building code: the worker reads the vocabulary fresh, so it now recognises
    // what it skipped, and its insert is `onConflictDoNothing` on
    // (project_id, external_order_id) — replaying cannot double-count. It also
    // recomputes customer totals from the orders table, which reconciles the two
    // sources that otherwise disagree.
    let reprocessing = 0
    let retired = 0
    try {
      // Only when a MEANING moved. Signals are ML features and build no orders, so a
      // save that only adds one has nothing to replay — and without this check,
      // someone adjusting signals four times replays the whole history four times.
      const prevEvents = (existing.mapping?.events ?? {}) as Record<string, unknown>
      const moved = MEANING_KEYS
        .some(k => JSON.stringify(prevEvents[k] ?? null) !== JSON.stringify(nextEvents[k] ?? null))

      // A save that reports "nothing to do" when the caller expected a rebuild is
      // indistinguishable from a broken one, and it happened once during testing with
      // no explanation left behind. Recording what the comparison actually saw makes
      // the next occurrence diagnosable instead of a guess.
      if (!moved) {
        console.log(`[event-mapping] ${projectId}: no meaning changed — `
          + `purchase was ${JSON.stringify(prevEvents.purchase ?? null)}, `
          + `now ${JSON.stringify(nextEvents.purchase ?? null)}; nothing replayed`)
      }

      if (moved) {
        // The names that can rebuild an order: the purchase that creates it, and the
        // four that move it afterwards.
        //
        // This used to be the purchase box alone, because the fulfilment and reversal
        // branches added to running totals and a second pass would double-count. Both
        // now mark the order and recompute from the orders table, so both are safe to
        // re-run — and leaving them out had a cost that only showed up on the seven-box
        // screen: the mapping page REFUSES a name with no data behind it, so a shop
        // must send events before it can describe them. Every shop using its own words
        // therefore had a window where its deliveries and cancellations arrived
        // unrecognised, and mapping them afterwards fixed the future and abandoned the
        // past. Measured: a ₹7,499 cancelled order still counted as revenue after the
        // Cancelled box was filled in correctly.
        //
        // Views and carts stay out. They feed per-event counters with no order row to
        // converge on, so replaying them really would inflate what they touch.
        const purchaseNames = asList(nextEvents.purchase)
        const statusNames = [...new Set(
          (['fulfilment', 'cancellation', 'return', 'refund'] as const)
            .flatMap(k => asList(nextEvents[k])),
        )]

        // ── RETIRE THE ORDERS THE PREVIOUS PURCHASE EVENT BUILT ──────────────
        //
        // Without this the screen is a one-way door: saving materialises order rows,
        // and changing your mind cannot remove them. The table becomes the union of
        // every mapping ever saved — a figure no single mapping would produce. Measured
        // on a GoWelmart copy: `order_placed` created 59,533 orders, then mapping back
        // to `order_completed` added 21 more instead of removing them, leaving 58,684,
        // which is neither answer.
        //
        // Deleting is only safe because `events` is permanent. Orders are Storees'
        // READING of that ledger under the current mapping; the reading can be redone,
        // the ledger cannot be lost. So an order built from an event that is no longer
        // a purchase has no reason to exist, and rebuilding it later costs one replay.
        //
        // THREE GUARDS, each protecting a row that could never be rebuilt:
        //   - `source_event` must be set. NULL means the row predates this column and
        //     its provenance is unknown, so it is never touched.
        //   - it must not be 'shopify_sync' or 'historical_import'. Those doors have no
        //     event behind them; deleting one loses it until the next full sync.
        //   - the name must no longer be mapped as a purchase. Re-saving the same
        //     mapping must be a no-op, not a delete-and-rebuild.
        //
        // AND IT RUNS AFTER THE REBUILD, NOT BEFORE.
        //
        // Deleting first assumes the rebuild that follows will succeed. When it does
        // not, the save has destroyed more than it created and the client is left with
        // FEWER orders than before they touched anything. Measured on GoWelmart: a save
        // retired 9,368 rows and rebuilt 1,119, taking the dashboard from 16,462 orders
        // to 8,213 — a number that matches no mapping, past or present, and reads as
        // ₹13 crore of revenue vanishing.
        //
        // Retiring last makes a failed rebuild a no-op: the old rows are still there,
        // the numbers are still the old numbers, and saving again is safe. The cost is
        // a window where both readings coexist, which is harmless — the new rows are
        // keyed by external_order_id, so a re-read of the same order updates in place
        // rather than duplicating.
        const retiredPurchaseEvents = asList(prevEvents.purchase)
          .filter(n => !purchaseNames.includes(n))
        const retireOldOrders = async (): Promise<number> => {
          if (!retiredPurchaseEvents.length) return 0
          const gone = await db.delete(orders)
            .where(and(
              eq(orders.projectId, projectId),
              inArray(orders.sourceEvent, retiredPurchaseEvents),
            ))
            .returning({ id: orders.id })
          if (gone.length) {
            console.log(`[event-mapping] ${projectId}: retired ${gone.length} order(s) `
              + `built from ${retiredPurchaseEvents.join(', ')} — no longer the purchase event`)
          }
          return gone.length
        }

        const fetchStored = (names: string[]) => names.length
          ? db.select({
              id: events.id, customerId: events.customerId,
              eventName: events.eventName, properties: events.properties,
              timestamp: events.timestamp,
            })
            .from(events)
            .where(and(eq(events.projectId, projectId), inArray(events.eventName, names)))
          : Promise.resolve([])

        // Chunked, and each chunk AWAITED before the next is sent.
        //
        // This used to fire every chunk at once — `void addBulk(...)` in a loop, 178 of
        // them for GoWelmart's 88,722 purchase events — and then move on. Redis cannot
        // absorb that in one tick: chunks were rejected, their rejections went to a
        // `.catch` that only logged, and the save reported success having queued a
        // fraction of the work. Measured: 88,722 events "replayed", 11,136 orders built,
        // and the queue empty within minutes. The worker was never at fault — one of the
        // missing events, enqueued by hand, produced its order immediately.
        //
        // Awaiting each chunk costs nothing that matters (the whole replay is already
        // off the request path) and turns a silent partial into either a complete
        // enqueue or a loud error.
        type Stored = Awaited<ReturnType<typeof fetchStored>>
        const enqueue = async (rows: Stored, delay: number, label: string): Promise<number> => {
          const CHUNK = 500
          let sent = 0
          for (let i = 0; i < rows.length; i += CHUNK) {
            try {
              await customerAggregateQueue.addBulk(
                rows.slice(i, i + CHUNK).map(e => ({
                  name: e.eventName,
                  data: {
                    eventId: e.id,
                    projectId,
                    customerId: e.customerId,
                    eventName: e.eventName,
                    properties: e.properties ?? {},
                    timestamp: e.timestamp.toISOString(),
                    replay: true,
                  },
                  ...(delay ? { opts: { delay } } : {}),
                })),
              )
              sent += Math.min(CHUNK, rows.length - i)
            } catch (err) {
              // Say which chunk, and keep going — a transient Redis blip should cost
              // 500 events, not the remaining eighty thousand.
              console.error(`[event-mapping] ${projectId}: ${label} chunk at ${i} failed:`,
                (err as Error).message)
            }
          }
          if (sent < rows.length) {
            console.warn(`[event-mapping] ${projectId}: ${label} enqueued ${sent} of ${rows.length}`)
          }
          return sent
        }

        const [purchases, statuses] = await Promise.all([
          fetchStored(purchaseNames), fetchStored(statusNames),
        ])

        // PURCHASES FIRST, and the rest held back until they are ACTUALLY done.
        //
        // A reversal can only be applied idempotently once its order row exists, and
        // the worker skips one that arrives early rather than subtracting blind.
        //
        // This used to be a guessed delay — `min(60s, purchases/50 seconds)`. Sixty
        // seconds is not long enough to build 88,722 orders, so the two batches ran
        // together and fought for the same rows. Postgres resolves a deadlock by
        // killing one side, and the killed side was frequently a PURCHASE: the very
        // rows the status events were waiting for. Measured on GoWelmart: 88,722
        // purchase events enqueued, 1,119 orders written.
        //
        // So watch the queue instead of guessing. The status batch is released when
        // the purchases have genuinely drained, however long that takes.
        //
        // The whole rebuild is ONE sequential chain, off the request path. Previously
        // the drain-watcher could observe an empty queue while the purchase chunks were
        // still being pushed, and release the status batch — or retire — against a
        // rebuild that had barely started.
        const drained = async (limitMs: number) => {
          const deadline = Date.now() + limitMs
          while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 2_000))
            const [waiting, active, delayed] = await Promise.all([
              customerAggregateQueue.getWaitingCount(),
              customerAggregateQueue.getActiveCount(),
              customerAggregateQueue.getDelayedCount(),
            ])
            if (waiting + active + delayed === 0) return true
          }
          return false
        }

        void (async () => {
          try {
            const sent = await enqueue(purchases, 0, 'purchase')
            console.log(`[event-mapping] ${projectId}: queued ${sent} purchase event(s)`)
            if (purchases.length) await drained(60 * 60_000)

            if (statuses.length) {
              const s = await enqueue(statuses, 0, 'status')
              console.log(`[event-mapping] ${projectId}: queued ${s} status event(s)`)
              await drained(60 * 60_000)
            }

            // Retire the previous mapping's rows only once the new ones are in place,
            // and only if the rebuild actually produced something. A rebuild that wrote
            // nothing means the events could not be read; keeping the old rows is then
            // strictly better than being left with neither.
            const [{ built } = { built: 0 }] = await db
              .select({ built: sql<number>`count(*)::int` })
              .from(orders)
              .where(and(eq(orders.projectId, projectId),
                         inArray(orders.sourceEvent, purchaseNames)))
            if (built > 0) await retireOldOrders()
            else if (retiredPurchaseEvents.length) {
              console.warn(`[event-mapping] ${projectId}: rebuild produced 0 orders — `
                + `keeping the ${retiredPurchaseEvents.join(', ')} rows rather than leaving none`)
            }
            console.log(`[event-mapping] ${projectId}: rebuild complete — ${built} order(s) `
              + `from ${purchaseNames.join(', ')}`)
          } catch (err) {
            console.error(`[event-mapping] ${projectId}: rebuild failed:`, err)
          }
        })()

        reprocessing = purchases.length + statuses.length

        // Record that a rebuild is under way, so the screen can hold Save shut and show
        // progress. Cleared by `replayStatus` once the queue drains.
        if (reprocessing > 0 && connector) {
          await db.update(dataSourceConnectors)
            .set({ config: { ...nextConfig, mapping: { ...nextConfig.mapping,
                     replay: { startedAt: new Date().toISOString(), total: reprocessing } } },
                   updatedAt: new Date() })
            .where(eq(dataSourceConnectors.id, connector.id))
        }
        if (reprocessing) {
          console.log(`[event-mapping] ${projectId}: meanings changed, replaying `
            + `${purchases.length} purchase + ${statuses.length} status events`)
        }
      }
    } catch (err) {
      // The mapping is saved and correct either way. A replay that could not be queued
      // is a stale-history problem, not a reason to fail the write the user just made.
      console.error('[event-mapping] replay failed (mapping still saved):', err)
    }

    // The save succeeded, so this project's vocabulary is now declared. Locking here
    // rather than at the top means a save that FAILED leaves the door open — a failed
    // attempt must not cost somebody their one remap.
    await lockMapping(projectId,
      (req as AuthenticatedRequest).adminUser?.email ?? 'unknown')

    res.json({ success: true, data: { events: nextEvents, reprocessing, retired, locked: true } })
  } catch (err) {
    console.error('Event mapping write error:', err)
    res.status(500).json({ success: false, error: 'Failed to save the event mapping' })
  }
})

export default router
