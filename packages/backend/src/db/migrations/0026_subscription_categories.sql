-- 0026_subscription_categories.sql
--
-- Phase 1 — subscription categories.
--
-- MoEngage lets a campaign target a specific subscription category instead
-- of treating "promotional consent" as one global switch. This adds:
--   1. project-defined categories
--   2. per-customer category opt-in rows
--   3. campaign/category join table

CREATE TABLE IF NOT EXISTS subscription_categories (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  description TEXT,
  channel     VARCHAR(20),                         -- NULL means all channels
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uniq_subscription_category_name UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_subscription_categories_project
  ON subscription_categories(project_id, is_active);

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id  UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  category_id  UUID        NOT NULL REFERENCES subscription_categories(id) ON DELETE CASCADE,
  opted_in_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opted_out_at TIMESTAMPTZ,
  source       VARCHAR(30),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uniq_customer_subscription_category UNIQUE (customer_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_category
  ON customer_subscriptions(project_id, category_id, opted_out_at);

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_customer
  ON customer_subscriptions(customer_id);

CREATE TABLE IF NOT EXISTS campaign_subscription_categories (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES subscription_categories(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (campaign_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_subscription_categories_category
  ON campaign_subscription_categories(category_id);
