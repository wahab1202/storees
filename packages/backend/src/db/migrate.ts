import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from './connection.js'

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
        console.warn(
          `[migrate] Empty ledger but schema already present — baselining ${files.length} migration(s) as applied without running them.`,
        )
        for (const filename of files) {
          await client.query(
            'INSERT INTO storees_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [filename],
          )
        }
        console.log(`[migrate] Baseline complete (${files.length} recorded); skipping replay.`)
        return
      }
    }

    const pending = files.filter(f => !applied.has(f))
    if (pending.length === 0) {
      console.log(`[migrate] DB schema up to date (${files.length} migrations recorded)`)
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
  } finally {
    client.release()
  }
}
