-- 0055: prediction_training_runs — one row per training attempt per goal.
--
-- Purpose: drift detection + retrain transparency. Without this, the
-- prediction goal carries only the latest AUC and we lose all history.
-- The dashboard renders a mini-trend per goal from these rows so users
-- can see "this goal used to be 0.84, now it's 0.71 — what changed?".
--
-- Inserted by trainingWorker after every train attempt (success /
-- insufficient_data / failed / error). Cascade-deletes with the goal.

CREATE TABLE IF NOT EXISTS prediction_training_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      UUID NOT NULL REFERENCES prediction_goals(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trained_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       VARCHAR(30) NOT NULL,           -- 'success' | 'insufficient_data' | 'failed' | 'error'
  auc          NUMERIC(6,4),                   -- nullable: only set on success
  baseline_auc NUMERIC(6,4),                   -- naive-recency baseline
  lift         NUMERIC(6,4),                   -- auc - baseline_auc
  n_positive   INTEGER,                        -- positive labels in train set
  reason       TEXT,                           -- failure_reason / warning when non-success
  duration_ms  INTEGER                         -- wall time of the train call
);

CREATE INDEX IF NOT EXISTS idx_training_runs_goal
  ON prediction_training_runs (goal_id, trained_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_runs_project
  ON prediction_training_runs (project_id, trained_at DESC);
