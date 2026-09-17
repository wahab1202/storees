-- A prediction window measured in days, where days may be FRACTIONAL.
--
-- `prediction_window_days` has always been an integer, which is correct for every goal
-- whose answer plays out over weeks: purchase forecasts 14 days here, repeat 28, churn
-- 49, dormancy 7. It is wrong for exactly one goal.
--
-- Carts do not resolve in days. Measured on GoWelmart's own data (2026-09-02, 64,800
-- adds across Jun-Aug): half of every add that ever converts has converted within
-- 4.19 HOURS, and 56% within the first hour. A 14- or 28-day cart window is not a
-- slightly-loose horizon, it is a different question — by the time it closes the
-- decision was made a fortnight ago.
--
-- 4.19 hours is 0.1746 days. In an integer column that stores as 0, and the failure is
-- silent and total: the label window has no length, every cart resolves to "still
-- abandoned", and the positive rate comes out 99.7% (measured: 13 negatives in 336).
-- The goal cannot train, and nothing in the output points at the column that caused it.
--
-- WHY double precision AND NOT numeric.
--
-- Drizzle types a `numeric` column as a STRING. Every reader would then need a cast,
-- including `predictionLiveEvalScheduler`, which does arithmetic on this value to place
-- its evaluation window — and the one call site that forgot the cast would be a quiet
-- wrong answer rather than a compile error. `double precision` types as `number`, so no
-- code that reads this column has to change at all.
--
-- Precision is not a concern: this is a duration in days, not money.
--
-- DIRECTION. Widening is lossless — 14 stays 14, 28 stays 28, 90 stays 90, and the
-- default is preserved. Narrowing back is NOT: any goal that has since stored a
-- fractional window would round to 0, which is the exact failure this migration exists
-- to remove. Treat it as one-way.

ALTER TABLE prediction_goals
  ALTER COLUMN prediction_window_days TYPE double precision;

ALTER TABLE prediction_goals
  ALTER COLUMN prediction_window_days SET DEFAULT 14;

COMMENT ON COLUMN prediction_goals.prediction_window_days IS
  'How far ahead the goal is asked to see, in days. Fractional on purpose: a cart '
  'abandonment goal derives its horizon in hours (GoWelmart: 4.19h = 0.1746d) because '
  'carts resolve in minutes, not weeks. Whole numbers for every other goal. Anything '
  'formatting this for a person must handle values below 1 — "0d prediction" is wrong '
  'and 14d/4.2h is the shape the screen needs.';
