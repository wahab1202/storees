-- Phase 5: per-campaign frequency-cap controls.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ignore_frequency_cap BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS count_for_frequency_cap BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS counts_toward_frequency_cap BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_messages_freq_cap
  ON messages (project_id, customer_id, channel, message_type, created_at)
  WHERE counts_toward_frequency_cap = TRUE;
