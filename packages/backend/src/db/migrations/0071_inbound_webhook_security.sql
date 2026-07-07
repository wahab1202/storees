-- Optional shared-secret header for inbound webhooks (defense-in-depth for
-- senders that CAN set headers; the URL token remains the baseline auth).
ALTER TABLE inbound_webhooks ADD COLUMN IF NOT EXISTS secret_header varchar(128);
