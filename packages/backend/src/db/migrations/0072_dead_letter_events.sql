-- Failed event/webhook processing attempts land here instead of being silently
-- dropped, so they can be inspected and replayed.
CREATE TABLE IF NOT EXISTS dead_letter_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  event_name varchar(255),
  payload    jsonb NOT NULL DEFAULT '{}',
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_events_project
  ON dead_letter_events (project_id, created_at);
