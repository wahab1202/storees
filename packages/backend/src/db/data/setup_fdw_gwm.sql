-- setup_fdw_gwm.sql
-- One-time setup of the postgres_fdw connection from Storees prod → GWM source DB.
--
-- DO NOT COMMIT REAL CREDENTIALS to this file. Replace the placeholders below
-- inline before running, OR use psql variable substitution:
--
--   psql "$STOREES_PROD_URL" \
--     -v gwm_host="187.127.162.252" \
--     -v gwm_port=5432 \
--     -v gwm_db="gwm_dev_db" \
--     -v gwm_user="storees_readonly" \
--     -v gwm_password="<from-secrets-vault>" \
--     -f packages/backend/src/db/data/setup_fdw_gwm.sql
--
-- Run AFTER migration 0023_data_source_federation.sql.
-- Idempotent: drops + recreates. Safe to re-run when credentials rotate.

-- 1. Foreign server (drop + recreate so credentials can rotate cleanly)
DROP SERVER IF EXISTS gwm_source CASCADE;

CREATE SERVER gwm_source FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (
    host :'gwm_host',
    port :'gwm_port',
    dbname :'gwm_db',
    -- Performance + safety knobs
    fetch_size '1000',
    use_remote_estimate 'on',
    -- Don't pass through the WAL of the foreign DB on JOINs
    extensions ''
  );

-- 2. User mapping. The user this maps is the *Storees app* PG role —
--    not 'postgres'. Adjust the `FOR <role>` if your app connects as a
--    different role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_user_mappings WHERE srvname = 'gwm_source' AND usename = 'postgres') THEN
    DROP USER MAPPING FOR postgres SERVER gwm_source;
  END IF;
END$$;

CREATE USER MAPPING FOR postgres SERVER gwm_source
  OPTIONS (
    user :'gwm_user',
    password :'gwm_password'
  );

-- (Repeat the user mapping for each role that runs queries — typically
-- the application role, e.g. 'storees_app' or whichever your DATABASE_URL
-- connects as. Uncomment + edit if needed.)
--
-- CREATE USER MAPPING FOR storees_app SERVER gwm_source
--   OPTIONS (user :'gwm_user', password :'gwm_password');

-- 3. Sanity check — confirm the server + user mapping registered.
--    No actual cross-DB call is made here (that would require dblink and
--    add a runtime extension dep); the IMPORT FOREIGN SCHEMA in
--    gwm_federated_views.sql is the real proof the connection works.
SELECT
  'fdw_setup_ok' AS status,
  s.srvname,
  s.srvoptions,
  (SELECT COUNT(*) FROM pg_user_mappings WHERE srvname = 'gwm_source') AS user_mappings
FROM pg_foreign_server s
WHERE s.srvname = 'gwm_source';
