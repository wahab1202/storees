-- 0056: add segment_metrics jsonb to prediction_training_runs
--
-- Per-segment AUC breakdowns (returning vs new, region, dealer) computed
-- by the Python ML service at train time. Lets the UI flag "model works
-- overall but is useless on a specific cohort" — e.g. global AUC 0.82
-- but new-customer AUC 0.54.
--
-- JSONB array of:
--   {
--     "segment_type": "behaviour" | "region" | "dealer",
--     "segment_value": "<raw id or category>",
--     "segment_label": "<human-readable>",
--     "n": <int>, "n_positive": <int>,
--     "auc": <0..1>, "delta_vs_overall": <signed>
--   }

ALTER TABLE prediction_training_runs
  ADD COLUMN IF NOT EXISTS segment_metrics JSONB;
