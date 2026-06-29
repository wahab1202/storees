-- Outbound webhooks: per-project subscriptions + per-attempt delivery log.
-- Storees delivers domain events (e.g. customer.segment.entered) to customer
-- platforms (Gowelmart, future tenants) the way Stripe/Shopify deliver to merchants.

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url             text NOT NULL,
  description     text,
  auth_method     varchar(10) NOT NULL DEFAULT 'hmac',   -- 'hmac' | 'bearer'
  signing_secret  text NOT NULL,                          -- encrypted at rest
  events          jsonb NOT NULL DEFAULT '[]',            -- ['customer.segment.entered', ...]
  custom_headers  jsonb NOT NULL DEFAULT '{}',
  retry_policy    jsonb NOT NULL DEFAULT '{"max_attempts":5,"schedule_seconds":[1,4,16,64,256]}',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_project ON webhook_subscriptions(project_id, is_active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_id          text NOT NULL,                        -- 'customer.segment.entered'
  event_data        jsonb NOT NULL DEFAULT '{}',          -- full payload sent
  attempt           integer NOT NULL DEFAULT 1,
  attempted_at      timestamptz,
  status_code       integer,
  response_body     text,
  response_headers  jsonb,
  error             text,
  next_retry_at     timestamptz,
  final             boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub ON webhook_deliveries(subscription_id, created_at DESC);
