-- Link each raw inbound-webhook row to the customer its processing resolved, so
-- the Event Sources → Data rows can click through to the customer detail page.
-- The resolved customerId is computed in emitDefinedEvent but was only ever
-- written onto the separate `events` row (idempotency key `ibw_<rawRowId>_<defId>`),
-- never back onto the raw row. Add the column and backfill existing rows by
-- borrowing the customer from the event they produced (read-only join — no
-- customer is created).

ALTER TABLE inbound_webhook_events ADD COLUMN IF NOT EXISTS customer_id uuid;

UPDATE inbound_webhook_events ibw
SET customer_id = e.customer_id
FROM events e
WHERE ibw.customer_id IS NULL
  AND e.customer_id IS NOT NULL
  AND e.idempotency_key LIKE 'ibw\_' || ibw.id || '\_%';

CREATE INDEX IF NOT EXISTS idx_inbound_events_customer
  ON inbound_webhook_events (customer_id);
