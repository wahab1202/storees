-- Human-captured abandonment reasons. The exec team calls a customer who
-- abandoned a cart and records WHY (a classified reason + free remarks). We
-- can't KNOW the reason from data (cartFrictionService only infers a *likely*
-- one) — this is the ground truth the team enters. One note per abandonment
-- event (checkout_abandoned), so per-cart history + Phase-2 reason analytics work.
CREATE TABLE IF NOT EXISTS cart_abandonment_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- The checkout_abandoned event this reason is for (events.id).
  event_id       uuid NOT NULL,
  reason         varchar(40) NOT NULL,           -- classified reason code (see ABANDONMENT_REASONS)
  remarks        text,                            -- free-text notes from the call
  marked_by      uuid,                            -- admin/agent user id who recorded it
  marked_by_name varchar(160),
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW()
);

-- One note per abandonment event (upsert on re-save).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_abandonment_notes_event
  ON cart_abandonment_notes (project_id, event_id);

-- Phase-2 analytics: reasons by project over time.
CREATE INDEX IF NOT EXISTS idx_cart_abandonment_notes_reason
  ON cart_abandonment_notes (project_id, reason, created_at);
