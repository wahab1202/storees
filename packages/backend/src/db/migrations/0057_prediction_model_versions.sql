-- 0057: prediction_model_versions — version registry per goal
--
-- Captures every successful model trained for a goal, with the AUC and
-- timestamp. Exactly one row per (goal_id, model_version) is marked
-- is_active = TRUE; that one corresponds to the live model.joblib in
-- the Python ML service. Promote/rollback flips is_active.
--
-- This is the foundation for champion/challenger. The full version
-- (shadow scoring + auto-promotion) lands as a follow-up; today the
-- UI surfaces a Versions list + manual Promote/Rollback button.

CREATE TABLE IF NOT EXISTS prediction_model_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         UUID NOT NULL REFERENCES prediction_goals(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  model_version   VARCHAR(64) NOT NULL,             -- timestamp from training script
  train_auc       NUMERIC(6,4),
  baseline_auc    NUMERIC(6,4),
  trained_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at    TIMESTAMPTZ,                       -- when this version was promoted
  notes           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_versions_goal_version
  ON prediction_model_versions (goal_id, model_version);

CREATE INDEX IF NOT EXISTS idx_model_versions_goal_trained
  ON prediction_model_versions (goal_id, trained_at DESC);

-- Partial unique index: ensures at most one active version per goal.
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_versions_active_per_goal
  ON prediction_model_versions (goal_id) WHERE is_active = TRUE;
