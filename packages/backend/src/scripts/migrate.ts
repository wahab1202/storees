/**
 * Standalone migration runner. Applies the hand-written SQL migrations in
 * src/db/migrations via the same runMigrations() the server runs at boot.
 * Run: npx tsx src/scripts/migrate.ts  (or `npm run db:migrate`)
 *
 * NOTE: this project does NOT migrate with `drizzle-kit push`. Drizzle ORM is
 * used for queries (schema.ts); the schema of record is the numbered SQL
 * migrations applied by runMigrations() + the storees_migrations ledger.
 */

import 'dotenv/config'
import { runMigrations } from '../db/migrate.js'
import { pool } from '../db/connection.js'

runMigrations()
  .then(async () => {
    await pool.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[migrate] failed:', err instanceof Error ? err.message : err)
    await pool.end().catch(() => {})
    process.exit(1)
  })
