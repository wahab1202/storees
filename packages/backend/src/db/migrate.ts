import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from './connection.js'
import type { PoolClient } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, 'migrations')

/**
 * Apply any unapplied SQL migrations in `migrations/` against the database.
 *
 * Each migration runs inside its own transaction; on failure, the transaction
 * rolls back and the function throws so the caller can prevent the API from
 * starting against a half-applied schema.
 *
 * Tracks applied migrations in `storees_migrations(filename, applied_at)`.
 * Migrations apply in filename-sorted order (the 4-digit prefix is the de facto
 * version). Already-applied filenames are skipped.
 */
export async function runMigrations(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS storees_migrations (
        filename     TEXT PRIMARY KEY,
        applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort()

    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM storees_migrations',
    )
    const applied = new Set(rows.map(r => r.filename))

    // Baseline adoption. An empty ledger against a database that already has
    // the core schema means this DB pre-dates the ledger — it was provisioned
    // from a dump, or the ledger table was lost/wiped. Replaying from
    // 0000_init would collide with existing objects ("relation ... already
    // exists") and, worse, re-run data migrations. So adopt the schema:
    // record every current migration as applied WITHOUT running it. A truly
    // fresh DB has no `customers` table and falls through to a normal run;
    // an in-flight DB has a non-empty ledger and applies only what's pending.
    if (applied.size === 0 && files.length > 0) {
      const { rows: [{ exists }] } = await client.query<{ exists: boolean }>(
        `SELECT to_regclass('public.customers') IS NOT NULL AS exists`,
      )
      if (exists) {
        // ADOPT WHAT THE FILENAMES CLAIM, BUT SAY SO WHEN THE SCHEMA DISAGREES.
        //
        // This used to record every file as applied on the strength of one table
        // existing, and print a single line giving the count. On 2026-05-27 that marked
        // 62 migrations done in the same second against a database missing four UNIQUE
        // indexes, and the ledger then read "applied" for work nobody had run.
        // `scoringWorker`'s ON CONFLICT had no index to conflict on, so every scoring
        // batch was rejected and no customer was scored for four months. Nothing failed:
        // the goal cards said "0 users scored", which was true, and read as a data
        // problem rather than a schema one.
        //
        // REPORTED, NOT REPLAYED. Re-running a file whose object is absent sounds like
        // the fix and is not: migrations before 0016 create objects without IF NOT
        // EXISTS, so replaying one for a single missing index collides on the twenty that
        // are already there. A repair migration states the gap once, in order, and is a
        // no-op where it has already closed — see 0089.
        for (const filename of files) {
          await client.query(
            'INSERT INTO storees_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [filename],
          )
        }
        console.warn(
          `[migrate] Empty ledger but schema already present — baselining ${files.length} migration(s) as applied without running them.`,
        )
        await reportSchemaGaps(client, files)
        console.log(`[migrate] Baseline complete (${files.length} recorded); skipping replay.`)
        return
      }
    }

    const pending = files.filter(f => !applied.has(f))
    if (pending.length === 0) {
      console.log(`[migrate] DB schema up to date (${files.length} migrations recorded)`)
      // AND A FULL LEDGER IS NOT A HEALTHY SCHEMA. A database baselined in the past
      // arrives here every boot with nothing pending, which is exactly the state live
      // has been in since 2026-05-27 while missing 24 objects. Checking only on the
      // baseline path would protect the next database and stay silent about the one
      // already hurt.
      await reportSchemaGaps(client, files)
      return
    }

    console.log(`[migrate] Applying ${pending.length} pending migration(s)…`)
    for (const filename of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8')
      console.log(`[migrate] ▶ ${filename}`)
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query(
          'INSERT INTO storees_migrations (filename) VALUES ($1)',
          [filename],
        )
        await client.query('COMMIT')
        console.log(`[migrate] ✓ ${filename}`)
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`Migration ${filename} failed and was rolled back: ${message}`)
      }
    }

    console.log(`[migrate] All ${pending.length} migration(s) applied successfully`)
    await reportSchemaGaps(client, files)
  } finally {
    client.release()
  }
}

/**
 * Say, every boot, which objects the migration set promises that this database lacks.
 *
 * Deliberately not fatal. The gap it exists to catch went unnoticed for four months, so
 * silence is the failure mode to avoid — but a schema missing an index is a degraded
 * Storees, not a dangerous one, and refusing to boot over it would take a working live
 * deployment down to fix a reporting problem.
 */
async function reportSchemaGaps(client: PoolClient, files: string[]): Promise<void> {
  const gaps = await unmetExpectations(client, files)
  if (gaps.length === 0) return
  console.warn(
    `[migrate] ${gaps.length} migration(s) are recorded as applied but describe objects this database does NOT have:`,
  )
  for (const g of gaps) console.warn(`[migrate]   ${g}`)
  console.warn(
    '[migrate] Nothing above was created by this check. Until a repair migration states them, the ledger cannot be trusted for these files.',
  )
}

/**
 * Objects the migration set says should exist, that this database does not have.
 *
 * DROP-AWARE, because "created" is not "expected". `0023` creates
 * `project_data_sources` and a later migration drops it; `0048` does the same for the
 * in-app message tables. Checked naively, a correct database reports three missing
 * tables and the real gaps are lost in the noise — measured here, that was 12 false
 * reports against 2 true ones. An object dropped anywhere in the set is not expected
 * anywhere, which is conservative in the right direction: a false silence costs a
 * warning, a false alarm costs the warning its meaning.
 *
 * Deliberately shallow otherwise: `CREATE TABLE`, `CREATE [UNIQUE] INDEX` and
 * `ALTER TABLE … ADD COLUMN` are what a migration asserts about shape, and shape is what
 * the baseline skipped. A backfill, a constraint or a trigger does not vote — this says
 * nothing about them, and does not pretend to.
 */
async function unmetExpectations(client: PoolClient, files: string[]): Promise<string[]> {
  const TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][\w."]*)/gi
  // The index's OWN table is captured too: dropping a table takes its indexes with it,
  // and `0048` drops the in-app tables without ever naming the three indexes on them.
  const INDEX = /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z_][\w."]*)\s+on\s+(?:only\s+)?([a-z_][\w."]*)/gi
  const COLUMN = /alter\s+table\s+(?:if\s+exists\s+)?([a-z_][\w."]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][\w"]*)/gi
  const DROPPED = [
    /drop\s+table\s+(?:if\s+exists\s+)?([a-z_][\w."]*)/gi,
    /drop\s+index\s+(?:if\s+exists\s+)?([a-z_][\w."]*)/gi,
    /alter\s+table\s+(?:if\s+exists\s+)?[a-z_][\w."]*\s+drop\s+column\s+(?:if\s+exists\s+)?([a-z_][\w"]*)/gi,
  ]

  const bare = (n: string) => n.replace(/"/g, '').replace(/^public\./, '').toLowerCase()
  const sources = files.map(f => ({
    filename: f,
    text: readFileSync(join(MIGRATIONS_DIR, f), 'utf-8').replace(/--[^\n]*/g, ' '),
  }))

  const dropped = new Set<string>()
  for (const { text } of sources) {
    for (const re of DROPPED) for (const m of text.matchAll(re)) dropped.add(bare(m[1]))
  }

  const gaps: string[] = []
  for (const { filename, text } of sources) {
    const missing: string[] = []

    const relations = new Map<string, string | null>()
    for (const m of text.matchAll(TABLE)) relations.set(bare(m[1]), null)
    for (const m of text.matchAll(INDEX)) relations.set(bare(m[1]), bare(m[2]))
    for (const [name, onTable] of relations) {
      if (dropped.has(name) || (onTable && dropped.has(onTable))) continue
      const { rows: [row] } = await client.query<{ present: boolean }>(
        'SELECT to_regclass($1) IS NOT NULL AS present', [`public.${name}`],
      )
      if (!row?.present) missing.push(name)
    }

    for (const m of text.matchAll(COLUMN)) {
      const [table, column] = [bare(m[1]), bare(m[2])]
      if (dropped.has(column) || dropped.has(table)) continue
      const { rows: [row] } = await client.query<{ present: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2) AS present`,
        [table, column],
      )
      if (!row?.present) missing.push(`${table}.${column}`)
    }

    if (missing.length > 0) gaps.push(`${filename} (missing: ${missing.join(', ')})`)
  }
  return gaps
}
