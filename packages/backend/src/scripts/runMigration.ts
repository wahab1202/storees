import 'dotenv/config'
import { pool } from '../db/connection.js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationFile = process.argv[2]

if (!migrationFile) {
  console.error('Usage: npx tsx src/scripts/runMigration.ts <migration-file>')
  process.exit(1)
}

const sql = readFileSync(join(__dirname, '../db/migrations', migrationFile), 'utf8')

async function run() {
  const client = await pool.connect()
  try {
    await client.query(sql)
    console.log(`✓ Migration applied: ${migrationFile}`)
  } catch (e) {
    console.error('Migration failed:', (e as Error).message)
    process.exit(1)
  } finally {
    client.release()
    process.exit(0)
  }
}

run()
