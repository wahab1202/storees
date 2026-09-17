/**
 * Event-mapping lock — one remap per project, then deliberate.
 *
 * WHY A LOCK AT ALL.
 *
 * Saving a mapping is not a settings change. It replays events, rebuilds order rows and
 * retires the ones the previous mapping built. Measured on GoWelmart: correcting the
 * purchase event moved the reported revenue from ₹16.3 crore to ₹101 crore. A wrong
 * save moves it just as far in the other direction, and nothing about the screen says
 * so — it looks like every other form in the product.
 *
 * Mapping is a SETUP act. A shop declares its vocabulary once, at onboarding, and
 * changes it about never. Leaving the door open for ever so that a rare event stays
 * possible is the wrong trade when the common case is an accident.
 *
 * WHERE THE FLAG LIVES.
 *
 * In the connector's `config.mapping.lock`, beside the mapping it guards — no column, no
 * migration, and it travels with the thing it protects. A project with no connector has
 * nothing to lock, which is correct: it has no saved mapping either.
 *
 * THE UNLOCK EXISTS FIRST.
 *
 * Built and proven before the lock was switched on. A lock whose key does not work is
 * not safety, it is a trap: the first person to save a typo would leave a client with
 * wrong revenue and no way back short of a code deploy.
 */

import { db } from '../db/connection.js'
import { dataSourceConnectors } from '../db/schema.js'
import { eq } from 'drizzle-orm'

export type MappingLock = {
  /** ISO timestamp of the save that locked it. */
  lockedAt: string
  /** Who saved it — an email where we have one, otherwise how it was done. */
  lockedBy: string
  /** Set while an unlock is open. The lock returns on its own after this. */
  unlockedUntil?: string
  unlockedBy?: string
  unlockReason?: string
}

/** How long an unlock stays open.
 *
 *  Time-boxed on purpose. An unlock that never expires is a lock that was removed once
 *  and then forgotten — the project drifts back to unlimited remapping without anybody
 *  deciding that. Long enough to fix a mapping and watch the replay drain; short enough
 *  that walking away closes it. */
export const UNLOCK_WINDOW_MS = Number(process.env.MAPPING_UNLOCK_MINUTES ?? 60) * 60_000

type ConnectorRow = { id: string; config: Record<string, unknown> | null }

async function connectorFor(projectId: string): Promise<ConnectorRow | null> {
  const [row] = await db
    .select({ id: dataSourceConnectors.id, config: dataSourceConnectors.config })
    .from(dataSourceConnectors)
    .where(eq(dataSourceConnectors.projectId, projectId))
    .limit(1)
  return (row as ConnectorRow) ?? null
}

function readLock(config: Record<string, unknown> | null): MappingLock | null {
  const mapping = (config?.mapping ?? null) as Record<string, unknown> | null
  const lock = (mapping?.lock ?? null) as MappingLock | null
  return lock?.lockedAt ? lock : null
}

/** Write `lock` into `config.mapping`, leaving every other key alone. */
async function writeLock(row: ConnectorRow, lock: MappingLock | null): Promise<void> {
  const cfg = (row.config ?? {}) as Record<string, unknown>
  const mapping = { ...((cfg.mapping ?? {}) as Record<string, unknown>) }
  if (lock) mapping.lock = lock
  else delete mapping.lock
  await db
    .update(dataSourceConnectors)
    .set({ config: { ...cfg, mapping }, updatedAt: new Date() })
    .where(eq(dataSourceConnectors.id, row.id))
}

export type LockState = {
  locked: boolean
  lockedAt?: string
  lockedBy?: string
  /** Present while an unlock is open — the screen shows the remaining time. */
  unlockedUntil?: string
  unlockedBy?: string
}

/** Whether this project's mapping may be saved right now, and why not.
 *
 *  A project that has never saved a mapping is UNLOCKED: the first save is the one this
 *  design intends to allow. Everything after it needs an unlock.
 */
export async function mappingLockState(projectId: string): Promise<LockState> {
  const row = await connectorFor(projectId)
  const lock = readLock(row?.config ?? null)
  if (!lock) return { locked: false }

  const open = lock.unlockedUntil && Date.parse(lock.unlockedUntil) > Date.now()
  return {
    locked: !open,
    lockedAt: lock.lockedAt,
    lockedBy: lock.lockedBy,
    ...(open ? { unlockedUntil: lock.unlockedUntil, unlockedBy: lock.unlockedBy } : {}),
  }
}

/** Lock after a successful save. Also closes any unlock that allowed it — an unlock buys
 *  one save, not a window in which every save is free. */
export async function lockMapping(projectId: string, by: string): Promise<void> {
  const row = await connectorFor(projectId)
  if (!row) return
  await writeLock(row, { lockedAt: new Date().toISOString(), lockedBy: by })
  console.log(`[mapping-lock] ${projectId} locked by ${by}`)
}

/** Open the lock for `UNLOCK_WINDOW_MS`. Deliberately not exposed over HTTP — the point
 *  is that changing a live client's vocabulary takes more than a click. */
export async function unlockMapping(
  projectId: string, by: string, reason: string,
): Promise<LockState> {
  const row = await connectorFor(projectId)
  if (!row) throw new Error(`project ${projectId} has no connector — nothing to unlock`)
  const lock = readLock(row.config)
  if (!lock) return { locked: false }

  const until = new Date(Date.now() + UNLOCK_WINDOW_MS).toISOString()
  await writeLock(row, { ...lock, unlockedUntil: until, unlockedBy: by, unlockReason: reason })
  console.log(`[mapping-lock] ${projectId} unlocked by ${by} until ${until} — ${reason}`)
  return { locked: false, lockedAt: lock.lockedAt, lockedBy: lock.lockedBy,
           unlockedUntil: until, unlockedBy: by }
}
