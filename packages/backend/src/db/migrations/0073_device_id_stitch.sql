-- Durable device id (SDK localStorage anonymousId) as a persistent stitch key
-- alongside the ephemeral session_id, so a returning visitor's prior anonymous
-- history can be back-attributed once they identify. Additive + nullable —
-- old events/clients simply carry NULL.
ALTER TABLE events              ADD COLUMN IF NOT EXISTS device_id varchar(255);
ALTER TABLE anonymous_sessions  ADD COLUMN IF NOT EXISTS device_id varchar(255);

CREATE INDEX IF NOT EXISTS idx_events_device
  ON events (project_id, device_id)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anon_sessions_device
  ON anonymous_sessions (project_id, device_id)
  WHERE device_id IS NOT NULL;
