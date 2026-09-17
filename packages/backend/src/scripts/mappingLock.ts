/**
 * Event-mapping lock — the terminal side.
 *
 *   npm run mapping:status  -- --project <id>
 *   npm run mapping:unlock  -- --project <id> --reason "why"
 *   npm run mapping:lock    -- --project
 * Deliberately not an API route. The lock exists because saving a mapping rebuilds a
 * client's orders and can move their reported revenue by crores; a door that needs
 * server access is the point, not an oversight.
 *
 * Built and proven BEFORE the lock was switched on — a lock whose key does not work is
 * a trap rather than a safeguard.
 */

import 'dotenv/config'
import { db } from '../db/connection.js'
import { projects, dataSourceConnectors } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { mappingLockState, unlockMapping, lockMapping, UNLOCK_WINDOW_MS } from '../services/mappingLock.js'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

const USAGE = `
  mapping:status  --project <id|name>
  mapping:unlock  --project <id|name> --reason "<why>"  [--by <who>]
  mapping:lock    --project <id|name>
`

/** Accept a name as well as a uuid — nobody has the uuid to hand in an incident. */
async function resolveProject(given: string): Promise<{ id: string; name: string }> {
  const byId = await db.select({ id: projects.id, name: projects.name })
    .from(projects).where(eq(projects.id, given)).limit(1).catch(() => [])
  if (byId.length) return byId[0]!
  const byName = await db.select({ id: projects.id, name: projects.name })
    .from(projects).where(eq(projects.name, given)).limit(1)
  if (byName.length) return byName[0]!
  throw new Error(`no project matches "${given}"`)
}

async function main() {
  const action = process.argv[2]
  const given = arg('project')
  if (!action || !given || !['status', 'unlock', 'lock'].includes(action)) {
    console.log(USAGE)
    process.exit(1)
  }

  const project = await resolveProject(given)
  const [connector] = await db
    .select({ id: dataSourceConnectors.id })
    .from(dataSourceConnectors)
    .where(eq(dataSourceConnectors.projectId, project.id))
    .limit(1)

  if (!connector) {
    console.log(`  ${project.name}: no connector, so no saved mapping and nothing to lock.`)
    process.exit(0)
  }

  if (action === 'unlock') {
    const reason = arg('reason')
    // A reason is required. The whole value of an audit trail is that somebody has to
    // write down why a client's vocabulary is being changed months after onboarding.
    if (!reason) {
      console.error('  --reason is required: say why this mapping is being reopened.')
      process.exit(1)
    }
    const by = arg('by') ?? `cli:${process.env.USER ?? 'unknown'}`
    const state = await unlockMapping(project.id, by, reason)
    const mins = Math.round(UNLOCK_WINDOW_MS / 60_000)
    console.log(`  ${project.name}: UNLOCKED for ${mins} minutes (until ${state.unlockedUntil}).`)
    console.log(`  Save the mapping in the UI now — it re-locks on save, and by itself when the window ends.`)
  } else if (action === 'lock') {
    await lockMapping(project.id, arg('by') ?? `cli:${process.env.USER ?? 'unknown'}`)
    console.log(`  ${project.name}: LOCKED.`)
  }

  const state = await mappingLockState(project.id)
  console.log(`  ${project.name}: ${state.locked ? 'LOCKED' : 'unlocked'}`
    + (state.lockedAt ? `  (locked ${state.lockedAt} by ${state.lockedBy})` : '')
    + (state.unlockedUntil ? `  unlock open until ${state.unlockedUntil}` : ''))
  process.exit(0)
}

main().catch(err => {
  console.error('  ' + (err as Error).message)
  process.exit(1)
})
