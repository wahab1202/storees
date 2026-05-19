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
