-- 0021_session_resolution.sql
-- Phase F3 — retroactive identity-resolution flow re-evaluation.
--
-- When an anonymous browser_id resolves to a known customer (UTM token
-- from a prior email click, form submission, Shopify login), the workflow
-- engine re-evaluates the last 30 days of events for that browser and
-- triggers eligible flows. This is what makes "browse abandonment" actually
-- work — most browses are anonymous at first and resolve later.
--
-- Three changes:
--   1. anonymous_sessions table — maps (project, session_id) → customer_id
--      once the session has been identified. Source of truth for the
--      back-attribution worker.
--   2. flow_trips.trigger_event_id — what event entered this customer into
--      the flow. The (flow_id, customer_id, trigger_event_id) tuple is the
--      replay-idempotency key; without it, replays would double-enroll.
--   3. flows.lookback_days — how far back the replay engine attributes events
--      to a newly-identified session. Default 30 — industry standard.

-- 1. anonymous_sessions: links a browser session to a customer once we know who they are.
CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id VARCHAR(255) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Outcome of the back-attribution job. NULL until the worker runs.
  events_back_attributed INTEGER,
  flows_triggered INTEGER,
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_anon_sessions_unique ON anonymous_sessions (project_id, session_id);
CREATE INDEX idx_anon_sessions_customer ON anonymous_sessions (project_id, customer_id);

-- 2. flow_trips replay idempotency.
ALTER TABLE flow_trips
  ADD COLUMN trigger_event_id UUID;

-- Unique only when trigger_event_id is set. Pre-F3 trips without an event id
-- aren't subject to replay dedup; they're either active or completed and the
-- existing per-customer-per-flow check catches them.
CREATE UNIQUE INDEX idx_flow_trips_trigger_dedupe
  ON flow_trips (flow_id, customer_id, trigger_event_id)
  WHERE trigger_event_id IS NOT NULL;

-- 3. Per-flow lookback window for replay.
ALTER TABLE flows
  ADD COLUMN lookback_days INTEGER NOT NULL DEFAULT 30;
