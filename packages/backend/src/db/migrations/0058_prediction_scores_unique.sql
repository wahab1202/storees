-- 0058: dedupe prediction_scores + enforce one current score per (project, goal, customer)
--
-- Bug: the scoring worker did plain INSERT on every batch, so every daily
-- scheduled run added a new row per customer per goal. After N days the
-- table holds N*customers rows per goal, inflating the "Total Scored"
-- count on goal detail pages well past the actual customer base.
--
-- Fix: keep only the most recent row per (project_id, goal_id, customer_id)
-- and add a partial unique index so future inserts can use ON CONFLICT
-- UPDATE — one row per customer per goal, always the latest score.
--
-- Order matters: dedup BEFORE the unique constraint, otherwise the
-- constraint creation fails with "could not create unique index" on the
-- duplicates that exist today.

BEGIN;

-- 1. Keep only the most recent score per (project_id, goal_id, customer_id)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, goal_id, customer_id
      ORDER BY computed_at DESC, id DESC
    ) AS rn
  FROM prediction_scores
)
DELETE FROM prediction_scores
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Enforce uniqueness going forward. ON CONFLICT in scoringWorker keys
--    on this same triple.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_scores_one_per_customer
  ON prediction_scores (project_id, goal_id, customer_id);

COMMIT;
