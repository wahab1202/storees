-- Phase 2 (CleverSend parity): flow goals + WhatsApp template quality rating
-- All idempotent — safe to re-run.

-- Meta's per-template quality rating (GREEN/YELLOW/RED/UNKNOWN). Fetched from
-- the provider on status refresh/poll; surfaced in the templates UI.
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS quality_score varchar(20);

-- "Goal for this journey is achieved when <event + filters>" — jsonb GoalConfig.
ALTER TABLE flows ADD COLUMN IF NOT EXISTS goal_config jsonb;

-- Stamped when the goal event (with matching filters) fires during a trip.
-- Powers the flow conversion metric.
ALTER TABLE flow_trips ADD COLUMN IF NOT EXISTS converted_at timestamptz;
