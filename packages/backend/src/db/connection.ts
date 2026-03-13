import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,                      // Up from default 10 — needed for SDK traffic
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if pool exhausted
})

export const db = drizzle(pool, { schema })

export { pool }
