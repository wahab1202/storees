-- The events idempotency unique index was created PARTIAL in migration 0003
-- (WHERE idempotency_key IS NOT NULL). Drizzle's
-- onConflictDoUpdate({ target: [project_id, idempotency_key] }) emits
-- ON CONFLICT (project_id, idempotency_key) WITHOUT that predicate, so Postgres
-- can't match the partial index → "no unique or exclusion constraint matching
-- the ON CONFLICT specification" on connector order syncs (dataSyncService).
--
-- Recreate it as a FULL unique index (matches schema.ts and the ON CONFLICT
-- inference). NULL idempotency_key rows remain allowed — NULLs are distinct in a
-- unique index — and non-null uniqueness was already enforced by the partial
-- index, so no duplicates can block creation.
DROP INDEX IF EXISTS idx_events_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency ON events (project_id, idempotency_key);
