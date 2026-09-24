-- WHERE DID THIS ORDER ROW COME FROM?
--
-- The orders table could not say, and that one gap made the Event Mapping screen a
-- one-way door. Saving a mapping REPLAYS stored events and materialises order rows;
-- changing the mapping back cannot remove them, because nothing records which mapping
-- created which row. The table ends up holding the union of every mapping ever saved —
-- a number that no single mapping would produce.
--
-- Measured on a GoWelmart copy: mapping `order_placed` created 59,533 orders, and
-- mapping back to `order_completed` added 21 more rather than removing anything. The
-- table then held 58,684 live orders, which is neither mapping's answer.
--
-- Deleting blind was never an option, and that is the point of this column: orders
-- arrive by FOUR doors, and only one of them is replayable.
--
--   'order_placed' (or whatever the project calls it)  a purchase EVENT — rebuildable,
--                                                      because the event is kept for ever
--   'shopify_sync'                                     pulled from Shopify's API. There is
--                                                      no event behind it. Delete it and it
--                                                      is gone until the next full sync.
--   'historical_import'                                a bulk upload. Same — no event, no
--                                                      way to rebuild.
--   NULL                                               written before this column existed.
--                                                      Provenance unknown, so never touched.
--
-- The rule the cleanup follows: delete only rows whose source is an event name that is
-- no longer mapped as a purchase. Everything else — every other door, and every row
-- from before this migration — is left exactly alone.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS source_event varchar(100);

-- The cleanup filters on (project, source_event); without this it is a sequential scan
-- of the whole table on every mapping save.
CREATE INDEX IF NOT EXISTS idx_orders_source_event
  ON orders (project_id, source_event);

COMMENT ON COLUMN orders.source_event IS
  'Which door created this row: a purchase event name (rebuildable from the events '
  'table), ''shopify_sync'', ''historical_import'', or NULL for rows predating this '
  'column. Only event-sourced rows may be removed when a mapping changes.';
