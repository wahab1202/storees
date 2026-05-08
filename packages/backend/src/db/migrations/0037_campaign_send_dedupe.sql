-- Phase 5 hardening: one staged send row per campaign/customer.
-- Prevents duplicate recipients if a dispatch is retried or two send requests race.

DELETE FROM campaign_sends a
USING campaign_sends b
WHERE a.campaign_id = b.campaign_id
  AND a.customer_id = b.customer_id
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_campaign_sends_campaign_customer
  ON campaign_sends(campaign_id, customer_id);
