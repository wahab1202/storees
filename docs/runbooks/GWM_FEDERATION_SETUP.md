# GoWelmart Federation Setup — DevOps Runbook

> One-time setup to wire Storees prod → GoWelmart's source DB via
> postgres_fdw. After this, customer region/city, total_orders/spent,
> first/last order dates, and dealer assignment all populate live (within
> ~5 min) for the GoWelmart project — without copying data into Storees.
>
> Time required: 15-20 min active work, plus initial MV refresh (~minutes
> depending on source DB size).
>
> Pre-read: [LIVE_DB_INTEGRATION_PLAN.md](../strategy/LIVE_DB_INTEGRATION_PLAN.md)
> for the architecture rationale.

---

## What this sets up

```
┌──────────────────────┐  postgres_fdw  ┌───────────────────────┐
│   Storees prod DB    │  ─────────────→│  GoWelmart source DB  │
│  (Storees-native)    │   (read-only)  │  (Medusa-based)       │
│                      │                │                       │
│ events, messages,    │                │  customer, customer_  │
│ consents, segments,  │                │  address, order,      │
│ campaigns, agents,   │                │  order_summary,       │
│ customers (identity) │                │  order_line_item,     │
│                      │                │  dealer, dealer_order,│
│ + materialised view  │                │  cat_product          │
│   refreshed every    │                │                       │
│   5 min from gwm     │                │                       │
└──────────────────────┘                └───────────────────────┘
```

Customer profile attributes (region, city, total_orders, total_spent,
first/last order date, agent assignment) get computed live from
GoWelmart's tables via foreign-data-wrapper queries, materialised into a
view, and copied into the `customers.*` columns on a 5-min cron. The
existing segment evaluator queries those columns — **zero application
code change needed for segments to start working**.

---

## Prerequisites

Before starting, you need:

- **Read-only role** on the GoWelmart source DB. The dev DB
  (`187.127.162.252:5432/gwm_dev_db`) works for testing; switch to the
  prod credentials when ready.
  - For prod, run as superuser:
    ```sql
    CREATE USER storees_readonly WITH PASSWORD '<from-secrets-vault>';
    GRANT CONNECT ON DATABASE gwm_prod_db TO storees_readonly;
    GRANT USAGE ON SCHEMA public TO storees_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO storees_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT ON TABLES TO storees_readonly;
    ```

- **Network reachability** from the Storees prod DB host to the
  GoWelmart DB host (port 5432). If they're on different VPCs / private
  networks, set up a peering or whitelist the Storees DB's outbound IP
  in GoWelmart's `pg_hba.conf` and any firewall.

- **Migration 0023 applied** to Storees prod. Adds the
  `project_data_sources` table + creates the `postgres_fdw` extension.
  ```bash
  psql "$STOREES_PROD_URL" -f packages/backend/src/db/migrations/0023_data_source_federation.sql
  ```

---

## Step 1 — Create the foreign server + user mapping (5 min)

This step has **credentials in the SQL** — keep them in a secrets vault,
not in git. Run via psql variable substitution:

```bash
psql "$STOREES_PROD_URL" \
  -v gwm_host="187.127.162.252" \
  -v gwm_port=5432 \
  -v gwm_db="gwm_dev_db" \
  -v gwm_user="storees_readonly" \
  -v gwm_password="$(echo $GWM_RO_PASSWORD)" \
  -f packages/backend/src/db/data/setup_fdw_gwm.sql
```

The script:
1. Creates (or recreates) the `gwm_source` foreign server pointing at
   GoWelmart
2. Creates a `USER MAPPING` for the Postgres role Storees connects as
3. Returns `fdw_setup_ok` if it works

If it fails: most likely network reachability or wrong credentials. Test
with:
```bash
psql -h 187.127.162.252 -U storees_readonly -d gwm_prod_db -c '\dt' \
  | head -5
```

If THAT works but the FDW doesn't, the issue is at the Storees-DB host's
firewall (outbound port 5432).

---

## Step 2 — Import foreign tables + create views (10 min)

This step is **safe and credential-free** (the FDW connection is already
configured). Run:

```bash
psql "$STOREES_PROD_URL" \
  -f packages/backend/src/db/data/gwm_federated_views.sql
```

What it does (~step-by-step):

1. **Imports gwm tables** (`customer`, `customer_address`, `order`,
   `order_summary`, `order_line_item`, `dealer`, `dealer_order`,
   `cat_product`) into a new `gwm` schema as foreign tables.
2. **Creates `v_gwm_customer_attrs`** — live view that JOINs gwm tables +
   Storees customers, computing per-customer region, city, dealer,
   total_orders, total_spent, first/last order date.
3. **Creates `mv_gwm_customer_attrs`** — materialised version, indexed
   by customer_id (required for `REFRESH MATERIALIZED VIEW CONCURRENTLY`).
4. **Defines `sync_gwm_customer_attrs()`** function that copies MV →
   `customers.region/city/total_orders/etc.` (only diffed rows).
5. **Defines `sync_gwm_agents(project_id)`** function that upserts
   `gwm.dealer` rows into Storees `agents` and links `customers.agent_id`.
6. **Registers the GoWelmart project** in `project_data_sources` so the
   refresh worker picks it up.
7. **Flips the `agentScopedAccess` feature flag** on the project so
   Dealer/Region/City segment fields appear in the builder.
8. **Runs the first refresh + sync** so data is populated before the
   worker schedule kicks in.
9. **Prints verification numbers** — total in MV, with-region, with-city,
   with-orders, etc.

**Expected output for verification at the end:**

```
total_in_mv | with_region | with_city | with_orders | avg_total_spent
------------+-------------+-----------+-------------+-----------------
      15123 |       6340  |     6520  |        4800 |        12450.30
```

(Approximate numbers — actual values depend on GoWelmart data state.)

If `total_in_mv = 0`: the JOIN between Storees `customers.external_id` and
`gwm.customer.id` isn't matching. Spot-check:
```sql
SELECT
  (SELECT external_id FROM customers WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611' LIMIT 1) AS storees_external_id,
  (SELECT id FROM gwm.customer WHERE deleted_at IS NULL LIMIT 1) AS gwm_id;
```
Both should be `cus_01...`-shaped Medusa IDs.

---

## Step 3 — Confirm worker is scheduled (1 min)

After the backend deploys with the new `federationRefreshWorker`,
the BullMQ scheduler registers a repeatable every 5 minutes.

Verify:
```sql
SELECT
  project_id,
  source_type,
  fdw_server_name,
  last_refresh_at,
  last_refresh_status,
  last_refresh_duration_ms,
  last_refresh_error
FROM project_data_sources
WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611';
```

Within 10 min of backend boot, `last_refresh_at` should be recent and
`last_refresh_status='success'`. If status='failed', the `last_refresh_error`
column has the message — typically a network or schema issue.

---

## Step 4 — Confirm segment fields populated (5 min)

Open the Storees admin → **Segments → New Segment** for the GoWelmart
project. Field dropdown should now show:

- **Customer Info**: email, name, phone, etc.
- **Purchase History**: total orders, total spent, etc.
- **Engagement**: days since last order, etc.
- **Dealer & Region**: Dealer / Region / City ← these only appear when
  `agentScopedAccess=true`, which Step 2 set
- **Product Filters**: product, collection, product category

Quick functional test:
- Create a segment "Region is Tamil Nadu" → save → check member count > 0
- Create a segment "Total Spent > 10000" → save → check member count > 0
- Create a segment "Dealer is RAM MOBILES" → save → check member count > 0

If all three return non-zero counts, the federation is working.

---

## Operating notes

### Refresh cadence

Default: every 5 minutes. Trade-off:

- Lower cadence (e.g. 1 min): fresher data, more load on gwm DB
- Higher cadence (e.g. 30 min): less load, staler segments

Change `REFRESH_INTERVAL_MS` in `packages/backend/src/workers/federationRefreshWorker.ts`
+ redeploy. The job scheduler picks up the new interval automatically.

### Credentials rotation

When GoWelmart rotates `storees_readonly`'s password:
1. Get the new password
2. Re-run **Step 1** with the new value (it drops + recreates the user mapping)
3. Verify with the next worker tick — `last_refresh_status` flips back to `success`

No backend redeploy needed.

### Switching from dev DB → prod DB

When the prod GWM DB is ready:
1. Update the `setup_fdw_gwm.sql` invocation to use the prod host/db/creds
2. Re-run Step 1 — drops the dev server, recreates pointing at prod
3. Re-run Step 2 — re-imports foreign tables, refreshes MV (fresh data lands in 1-2 min)

### Adding more federated projects later

For a second merchant on a different source DB:
1. Run a new `setup_fdw_<merchant>.sql` (creates a new foreign server,
   e.g. `acme_source`)
2. Run a new `<merchant>_federated_views.sql` (uses a different schema,
   e.g. `acme`, with that merchant's table shape)
3. Insert into `project_data_sources` with `source_type='medusa_acme'`
   (or appropriate type)
4. Add the source-type handler in `SOURCE_HANDLERS` map in
   `federationRefreshWorker.ts`

Each project's MV refresh runs independently in the worker loop.

### Disabling federation for a project

```sql
UPDATE project_data_sources SET is_active = FALSE
  WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611';
```

The worker skips inactive sources. The `customers.region` etc. columns
keep their last-synced values until manually cleared. To roll back fully:

```sql
UPDATE customers
SET region = NULL, city = NULL, agent_id = NULL,
    total_orders = 0, total_spent = 0, avg_order_value = 0,
    first_order_date = NULL, last_order_date = NULL
WHERE project_id = 'a3fe60d4-aa5f-4db1-b775-ee926de78611';

DROP MATERIALIZED VIEW IF EXISTS mv_gwm_customer_attrs CASCADE;
DROP VIEW IF EXISTS v_gwm_customer_attrs CASCADE;
DROP SCHEMA IF EXISTS gwm CASCADE;
DROP SERVER IF EXISTS gwm_source CASCADE;
```

---

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `IMPORT FOREIGN SCHEMA` fails with "permission denied" | `storees_readonly` lacks SELECT on one of the listed tables | `GRANT SELECT ON <table> TO storees_readonly` on gwm DB |
| `IMPORT FOREIGN SCHEMA` fails with "no schema named ..." | Wrong dbname in `setup_fdw_gwm.sql`, or schema is `medusa` not `public` | Inspect with `\dt+` on gwm; adjust |
| MV refresh times out / >60s | gwm has 100K+ orders being aggregated; no index on `gwm.order(customer_id)` | Add index on gwm side, or change query to use `order_summary` directly |
| `mv_gwm_customer_attrs` is empty after refresh | `customers.external_id` doesn't match `gwm.customer.id` shape | Spot-check both, fix the import path |
| Segments still show empty Region dropdown | Worker hasn't completed first refresh yet, or `agentScopedAccess` flag not set | Wait 5 min; re-check `project_data_sources.last_refresh_status`; re-run Step 2's UPDATE on `projects.features` |
| Worker fails with "FDW: cannot connect" intermittently | gwm DB is restarting / network blip | Worker auto-retries on next tick; if persistent, check gwm DB health |

---

## Reference — file index

| File | Purpose |
|---|---|
| `packages/backend/src/db/migrations/0023_data_source_federation.sql` | Storees migration: extension + `project_data_sources` table |
| `packages/backend/src/db/data/setup_fdw_gwm.sql` | One-time FDW server + user-mapping setup (credentials at runtime) |
| `packages/backend/src/db/data/gwm_federated_views.sql` | Foreign tables + adapter views + MV + sync functions; idempotent |
| `packages/backend/src/workers/federationRefreshWorker.ts` | BullMQ repeatable, every 5 min |
| `packages/backend/src/services/queue.ts` | `federationRefreshQueue` definition |
| `packages/backend/src/db/schema.ts` | Drizzle representation of `project_data_sources` |
