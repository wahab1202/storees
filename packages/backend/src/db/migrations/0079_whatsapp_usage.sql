-- WhatsApp usage metering (visibility). Meta bills per CONVERSATION, not per
-- message, and reports the pricing category (marketing / utility /
-- authentication / service) on the message-status webhook — data we currently
-- drop. One row per billable conversation window, idempotent per conversation,
-- so a brand's usage dashboard reflects the real cost driver.
CREATE TABLE IF NOT EXISTS whatsapp_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider          varchar(30) NOT NULL,            -- 'meta' | 'pinnacle'
  phone_number_id   varchar(255),                    -- which sender number
  conversation_id   varchar(255) NOT NULL,           -- Meta conversation id (idempotency key)
  category          varchar(20) NOT NULL,            -- marketing | utility | authentication | service
  pricing_model     varchar(30),                     -- CBP / PMP as Meta reports it
  origin_type       varchar(30),                     -- conversation.origin.type
  billable          boolean NOT NULL DEFAULT true,
  started_at        timestamptz NOT NULL DEFAULT NOW(),
  expiration_at     timestamptz,                     -- conversation.expiration_timestamp
  raw               jsonb,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);

-- One conversation is billed once per project — dedup on re-delivered statuses.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_usage_conversation
  ON whatsapp_usage (project_id, conversation_id);

-- Dashboard aggregation: by project + category over a time range.
CREATE INDEX IF NOT EXISTS idx_wa_usage_project_cat
  ON whatsapp_usage (project_id, category, started_at);
