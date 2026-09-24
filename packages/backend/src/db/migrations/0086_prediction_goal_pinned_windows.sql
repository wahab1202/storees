-- Let ONE goal keep windows a person chose, while every other goal keeps deriving
-- its own.
--
-- `observation_window_days` and `prediction_window_days` have always been on this
-- table and the Create Prediction form has always asked for them — but training never
-- read either one. It derives windows from the project's data, searches candidate
-- look-backs over held-out rounds, keeps the best, and then writes the winner back
-- over whatever was typed. The form collected two numbers and threw them away.
--
-- The columns cannot answer "did somebody choose this?" on their own: every row has
-- values, because the industry pack fills them in at onboarding. A default 90 and a
-- deliberate 90 look identical. Hence a flag rather than a sentinel.
--
-- Default FALSE, so nothing that exists changes behaviour: every current goal keeps
-- deriving and searching exactly as before.
ALTER TABLE prediction_goals
  ADD COLUMN IF NOT EXISTS windows_pinned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN prediction_goals.windows_pinned IS
  'When true, training uses observation_window_days/prediction_window_days as given '
  'and skips the look-back search; publish_results leaves both columns alone. The '
  'resulting AUC is NOT comparable with a derived goal''s — one was selected on '
  'held-out rounds, the other was asserted — so any screen showing both must say which '
  'is which.';
