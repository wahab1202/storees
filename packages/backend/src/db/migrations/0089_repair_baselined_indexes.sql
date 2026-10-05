-- 0089: re-apply the indexes that baseline adoption recorded but never created.
--
-- On 2026-05-27 13:47:21 this database wrote all 62 migrations `0000_init` through
-- `0060` into `storees_migrations` in the same second — the baseline path in
-- `migrate.ts`, which marks a ledger-less database as up to date instead of replaying
-- setup over objects that already exist. That is right for a schema that genuinely
-- matches. It was not right here: the ledger was taken on trust, and four UNIQUE
-- indexes plus three plain ones had never been created.
--
-- The cost was not theoretical. `scoringWorker` upserts on
-- (project_id, goal_id, customer_id); with no unique index behind it Postgres rejects
-- EVERY batch with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Training succeeded, the eligible population was computed, the write
-- died, and the card reported "0 users scored" — which was true, and read as a data
-- problem rather than a schema one. No customer has been scored since 2026-04-07.
--
-- Every statement is IF NOT EXISTS, so this is a no-op on a database that ran 0005,
-- 0057 and 0058 for real (a developer machine baselined before 0058 was written, for
-- instance). Re-stating them here rather than un-recording those three migrations keeps
-- the ledger honest: what ran, ran.
--
-- The root cause is fixed separately in `migrate.ts` — baseline adoption now verifies a
-- migration's effects are present before recording it, instead of assuming.
--
-- NO BEGIN / COMMIT IN THIS FILE. The runner already wraps every migration in its own
-- transaction together with the ledger insert; a COMMIT in here ended that transaction
-- early, so the ledger row was written on its own afterwards.
--
-- THIS FILE MUST NOT BE ABLE TO STOP A DEPLOY. The runner refuses to start the API if a
-- migration fails, and three of the unique indexes below can only be built if the data
-- already obeys them — which nothing enforced while they were missing. Those three are
-- built only when the data allows; otherwise the file says why and carries on, and the
-- boot-time gap report in migrate.ts keeps naming the missing index until it is dealt
-- with. The prediction_scores duplicates are the exception: they are known, harmless to
-- remove, and scoring cannot work until they are gone.

-- ── 0058: one CURRENT score per customer per goal ──
--
-- Before the unique index can exist the duplicates it forbids must go. They accumulated
-- because the worker did a plain INSERT before 2026-05-21: every scheduled run appended
-- another row per customer, so the table holds far more rows than the customer base.
-- Keep the most recent row per triple; the older ones are superseded scores that no
-- screen reads and no model uses.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, goal_id, customer_id
           ORDER BY computed_at DESC, id DESC
         ) AS rn
  FROM prediction_scores
)
DELETE FROM prediction_scores
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_scores_one_per_customer
  ON prediction_scores (project_id, goal_id, customer_id);

-- ── 0057: model version identity ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM prediction_model_versions
             GROUP BY goal_id, model_version HAVING count(*) > 1) THEN
    RAISE WARNING '0089: idx_model_versions_goal_version not created — some goal has two versions with the same model_version';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_model_versions_goal_version
      ON prediction_model_versions (goal_id, model_version);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_model_versions_goal_trained
  ON prediction_model_versions (goal_id, trained_at DESC);

-- At most one active version per goal. Scoring loads "the active one"; two of them
-- means whichever the planner reached first decided what a customer was scored by.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM prediction_model_versions WHERE is_active
             GROUP BY goal_id HAVING count(*) > 1) THEN
    RAISE WARNING '0089: idx_model_versions_active_per_goal not created — some goal has more than one active model version';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_model_versions_active_per_goal
      ON prediction_model_versions (goal_id) WHERE is_active = TRUE;
  END IF;
END $$;

-- ── 0005: one live journey per customer per flow ──
--
-- `flowTriggerEvaluator` checks for an existing trip before enrolling, so nothing had
-- gone wrong on the 2026-09-28 copy of live — zero duplicates. The check cannot see a
-- second request arriving in the same instant, though: both read, both find nothing,
-- both enrol, and the customer receives every message in the flow twice. Which of two
-- live trips to end is a decision about a real customer's journey, so this file does
-- not make it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM flow_trips WHERE status IN ('active', 'waiting')
             GROUP BY flow_id, customer_id HAVING count(*) > 1) THEN
    RAISE WARNING '0089: idx_flow_trips_one_active not created — a customer has more than one live trip in the same flow';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_trips_one_active
      ON flow_trips (flow_id, customer_id)
      WHERE status IN ('active', 'waiting');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_flow_trips_lookup
  ON flow_trips (flow_id, customer_id, status);

-- ── 0005: the read path that lost its index ──
CREATE INDEX IF NOT EXISTS idx_events_customer_event
  ON events (project_id, customer_id, event_name, timestamp);

-- 0005 also creates `idx_dead_letter_pending` on dead_letter_events(status, created_at),
-- and it is NOT restated here. That table no longer has a `status` column —
-- (id, project_id, payload, created_at, event_name, error) — so the statement fails
-- outright, which is how this file first took the backend down on 2026-09-25: one
-- migration cannot start, and boot correctly refuses rather than run a half-applied
-- schema. An index for a column the table gave up is not a gap to close; whatever
-- replaced that workflow does not read it.
