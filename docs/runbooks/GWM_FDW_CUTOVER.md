# GoWelmart FDW → Events Cutover — One-time Runbook

> Migrate the GoWelmart project from FDW polling (5-min cron pulling from
> gwm's DB) to standard event-based ingestion. After this runs, GWM behaves
> like every other client — no DB access required, no bespoke SQL.
>
> **Risk profile:** low — backfill is idempotent, FDW infra stays available
> until step 5 in case rollback is needed.
>
> **Order matters.** Read all five steps before running anything.

---

## Pre-flight checklist

Before starting, confirm:

- [ ] Backend deployed at the commit that introduces `customerAggregateWorker`
      + `/api/v1/import/*` endpoints + drops `startFederationRefreshWorker`
- [ ] PR title commit hash for reference: __________ (fill in)
- [ ] Migration `0040_events_processed_at.sql` applied to prod
- [ ] (Optional but recommended) take a logical pg_dump backup of
      `customers`, `orders`, `events` for the GWM project before cutting over

---

## Step 1 — apply migration 0040 (events.processed_at column)

```bash
cd /var/www/html/storees
git pull   # latest

sudo -u postgres psql storees_prod \
  -f packages/backend/src/db/migrations/0040_events_processed_at.sql
```

Verify:
```bash
sudo -u postgres psql storees_prod -P pager=off -c "
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'events' AND column_name = 'processed_at';
"
# expect one row
```

---

## Step 2 — restart backend

Backend boot:
- Starts `customerAggregateWorker` (subscribes to `customer-aggregates` queue)
- Triggers a one-time startup catch-up: scans `events` rows where
  `processed_at IS NULL` in chronological order and folds them into customer
  aggregates. Idempotent.
- **Does NOT** start `federationRefreshWorker` — that's deleted

```bash
pm2 restart storees-backend
```

Wait ~30 sec, verify:
```bash
pm2 logs storees-backend --lines 50 --nostream | grep -iE 'customer-aggregate|startup catch-up'
```

Expect to see `[customer-aggregate] startup catch-up: processed N historical events`.

Also confirm the federation worker is gone:
```bash
pm2 logs storees-backend --lines 100 --nostream | grep -i federation-refresh
# expect: no recent matches
```

---

## Step 3 — backfill historical orders from gwm (one-time)

This is the only time we ever touch the FDW connection again. We use it once
to convert every historical gwm.order into a synthetic `order_placed` event
(marked `historical: true`), then the FDW connection can be removed.

**Bonus side-effect:** the aggregator's product-extraction (Option A) runs
on every replayed `order_placed`, so this same step re-populates the
`products` + `collections` + `product_collections` tables from line item
data. No separate product backfill needed.

```bash
sudo -u postgres psql storees_prod \
  -f packages/backend/src/db/data/gwm_one_time_event_backfill.sql
```

The script:
1. Prints a pre-flight count
2. INSERTs synthetic `order_placed` events with `historical: true` and
   `idempotency_key = 'order_placed_historical:<gwm_order_id>'`
3. Prints final counts

The `customerAggregateWorker` picks them up on its next tick (the
startup catch-up will eventually scan the new rows; or restart backend to
force-run catch-up immediately).

Verify aggregates converged:
```bash
sudo -u postgres psql storees_prod -P pager=off -c "
  SELECT name, total_orders, total_spent, first_order_date, last_order_date
  FROM customers
  WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611'
    AND total_spent > 0
  ORDER BY total_spent DESC LIMIT 10;
"
```

These should match what FDW was producing before. Spot-check a few against
the gwm source to confirm.

---

## Step 4 — validation window

Let the system run for at least **24 hours** in this state:
- FDW DB-side artefacts (foreign tables, MV, sync functions, gwm_source) all
  still exist on the Postgres side — they're just not being USED by anyone
  (the worker that called them is gone)
- New live events from gwm's webhook integration update aggregates via the
  new worker
- If anything breaks, you can revert the backend deploy (the FDW SQL is still
  there to fall back on)

Watch:
```bash
sudo -u postgres psql storees_prod -P pager=off -c "
  -- Live event arrival rate
  SELECT
    DATE_TRUNC('hour', received_at) AS hour,
    COUNT(*) AS events,
    COUNT(*) FILTER (WHERE event_name = 'order_placed') AS orders
  FROM events
  WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611'
    AND received_at > NOW() - INTERVAL '24 hours'
  GROUP BY hour
  ORDER BY hour DESC;
"
```

```bash
sudo -u postgres psql storees_prod -P pager=off -c "
  -- Aggregator processed-rate (everything should clear)
  SELECT
    COUNT(*) FILTER (WHERE processed_at IS NULL) AS pending,
    COUNT(*) FILTER (WHERE processed_at IS NOT NULL) AS done
  FROM events
  WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611'
    AND received_at > NOW() - INTERVAL '1 hour';
"
```

`pending` should stay near 0 — events get processed within seconds.

---

## Step 5 — drop FDW infrastructure (final cleanup)

Once you're confident (24+ hours of clean operation):

```bash
sudo -u postgres psql storees_prod \
  -f packages/backend/src/db/migrations/0041_drop_fdw_federation.sql
```

Drops:
- `project_data_sources` table (Storees-side)
- `mv_gwm_customer_attrs` materialised view
- `v_gwm_customer_attrs` view
- All `sync_gwm_*` functions
- `refresh_gwm_customer_attrs_mv()` function
- `normalize_indian_region` + `normalize_city` helpers
- `gwm.*` foreign tables (via `DROP SCHEMA gwm CASCADE`)
- `gwm_source` FDW server

Verify nothing references them:
```bash
sudo -u postgres psql storees_prod -P pager=off -c "
  SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'gwm';
"
# expect: 0 rows

sudo -u postgres psql storees_prod -P pager=off -c "
  SELECT srvname FROM pg_foreign_server WHERE srvname LIKE '%gwm%';
"
# expect: 0 rows
```

---

## Rollback

If something goes wrong between step 2 and step 5, you can:

1. **Revert the backend deploy** to the previous commit (FDW worker comes
   back, federation cron resumes)
2. Historical events generated by step 3 stay in the `events` table — they
   don't conflict with anything (idempotency_key prefix is unique)
3. The customer aggregate worker stays running but is now a no-op for legacy
   data since FDW handles it

If you've passed step 5 and need to rollback, you'd need to:
- Re-apply `gwm_federated_views.sql` + `gwm_federated_products_orders.sql`
  + `gwm_federated_permissions_fix.sql` from git history (commit `da746d4`
  or earlier)
- Re-apply `setup_fdw_gwm.sql` with current credentials
- Revert the backend deploy

Plan to complete steps 1-4 in one ops window so the rollback window stays small.
