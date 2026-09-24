# Storees ML — Release Runbook

> **Audience:** whoever deploys the release that replaces the ML data layer.
> Read top to bottom before deploying, not during.
>
> **Time required:** ~10 min of deploy steps, plus retraining every goal on every
> project. **Retraining is the long part, and budget for the slow case.** Measured on
> two projects, same sealed test before and after: a small project's cart goal went
> 50.2 min -> 10.1, but a large one went 57.5 -> 52.9. The day-cache that produces the
> speedup fills its memory budget on a busy shop, so **assume ~50 min per cart goal on
> a large project**, not 10. The other four models take 1-4 minutes each.
>
> **What this release changes:** the ML service's entire data layer. Fourteen files
> added, ten deleted, four modified. Feature building moved from pandas to DuckDB, windows are
> now derived per project rather than taken from the form, and the cart goal
> forecasts in hours rather than whole days.

---

## The whole thing on one screen

| # | Step | Who | Time | Fails how? |
|---|---|---|---|---|
| 0 | Checkouts clean, `orders` row count (§0.4, §0.2) | DevOps | 2 min | loudly |
| 1 | **Jenkins** — backend + frontend, migrations included (§1.1) | the button | 5 min | loudly; old version keeps serving |
| 2 | **ML service, BY HAND** — Jenkins never touches it (§1.2) | DevOps | 3 min | loudly — service won't boot |
| 3 | **Re-train every goal, every project** (§2) | anyone with admin | 1-2 hrs | **SILENTLY** |
| 4 | Verify nothing stale (§2 Verify) | anyone | 1 min | — |

**Order matters: 1 before 2.** See the note under §1.

**Step 3 is the one that hurts.** Every other failure announces itself. A model that was
never retrained shows a normal AUC and a normal ranked list built from mostly-zero
inputs, with no error anywhere.

**No new environment variables, no new node packages.** The only genuinely new thing is
`pip install` bringing in DuckDB.

---

## 0. Before you deploy

### 0.1 `duckdb` must be in `packages/ml/requirements.txt`

Eight files import it — `serve.py`, `train_propensity.py`, `trainer.py`,
`dataset.py`, `sources.py`, `feature_builder.py`, `labeling.py`, `cart_rows.py`.
`serve.py` is the one that decides whether the service boots at all. No branch before
this release used DuckDB, so the dependency was never declared.

Verify:

```bash
grep duckdb packages/ml/requirements.txt
```

**If that prints nothing, stop.** `pip install -r requirements.txt` will not
install it, and the service raises `ModuleNotFoundError: No module named 'duckdb'`
on its first import. It does not start degraded; it does not start at all.

### 0.2 Expect about fourteen migrations, of which three are this release's

**Three belong to this release. The rest are older ones production never received.**

Measured against a production dump taken 23 Sep: the live ledger stops at
`0080_whatsapp_provisioning_requests`, so a deploy applies **14** — eleven that have sat
on `main` unapplied, plus the three below. All fourteen ran in **6 seconds** on 1.4M
events, with no errors.

This is worth knowing before the deploy rather than during it: a run told to expect
three and printing fourteen looks like something has gone wrong, and a failure in one of
the eleven would be read as belonging to this release when it does not.

The eleven are `0062`-`0068` and `0081`-`0085`: WhatsApp template variables and
carousel, message failure reason, tracked links, Shopify as a data source, the events
idempotency index, campaign recipient, cart abandonment notes, abandonment transcript,
inbound event customer, and user-project membership.

**Numbering diverged between branches** — production's `0062` is
`dealer_owned_segments_flows`, this branch's is `whatsapp_template_variables`. The
ledger keys on FILENAME, not on the number, so each file applies exactly once and the
collision is harmless. Confirmed on the dump: both spellings of `0062`-`0066` coexist.


| | What | Lock |
|---|---|---|
| `0086` | `prediction_goals.windows_pinned` boolean, default false | negligible — small table |
| `0087` | `orders.source_event` + index on `(project_id, source_event)` | **index build blocks writes to `orders`** |
| `0088` | `prediction_window_days` integer → double precision | rewrites `prediction_goals` — tiny table, seconds |

`0087` builds an index, which blocks writes to `orders` while it runs. **Measured:
74 ms over 106,464 rows (94 MB).** Index build scales close to linearly, so a million
rows is about a second and ten million about ten. Confirm before deploying:

```sql
SELECT count(*) FROM orders;
```

Under a million, deploy whenever you like — no quiet window needed. The caution here
was written before the measurement; it is kept only so the number is on record.

`0088` is **one-way**. Widening to double precision is lossless; narrowing back
would round a cart goal's fractional window (4.19 hours = 0.1746 days) to 0, which
is the silent total failure the migration exists to remove.

### 0.3 Nightly retraining — what it will do, and the switch if you want it

**Nothing here needs changing.** This section is so the behaviour is not a surprise.

The old scheduler counted 24 hours from process start, so every restart reset the
countdown and a box that redeploys daily could go a long time without sweeping — with
no error and no log line to notice. The new one fires at a clock time instead, and
remembers the last sweep in Redis, so it fires whether or not the process restarted.

The practical difference: **on a frequently-restarted box, nightly retraining may now
actually happen where before it quietly did not.** Same intent, newly reliable.

What the backend does on boot, given what is already in its `.env`:

| Already on the box | After this release |
|---|---|
| `RETRAIN_INTERVAL_HOURS=0` | **off** — the old spelling is still honoured |
| `RETRAIN_INTERVAL_HOURS=<anything else>` | on, 21:30 UTC |
| nothing set | on, 21:30 UTC |

21:30 UTC is 03:00 India. The sweep queues every goal of every project, trained one at
a time.

**If you want the first night quiet** — so that nobody sees numbers from a pipeline
that has not been looked at yet — add one line to the backend `.env` and remove it
whenever you like:

```
RETRAIN_AT_UTC=off
```

It takes effect on restart, needs no deploy, and beats any other value present. A typo
in it still means off, deliberately.

Either way the backend states which on boot:

```
[scheduler] Prediction-training retrain is OFF (RETRAIN_AT_UTC). Models train only when someone asks.
[scheduler] Prediction-training retrain is OFF (RETRAIN_INTERVAL_HOURS=0). Models train only when someone asks.
[scheduler] Prediction-training retrain daily at 21:30 UTC
```

Whichever line appears is what is happening — the first two differ only in which switch was read, and both mean OFF. This does not replace §2 — retraining
every goal by hand after deploying is required regardless, because a nightly sweep
that has not happened yet leaves stale models scoring in the meantime.

### 0.4 Check the server checkouts are clean first

`scripts/deploy.sh` pulls with `git pull --ff-only`, which **refuses** to run if anyone
has edited files directly on the server or left a checkout on another branch. It fails
after `git pull` and before the build, so the deploy simply stops — nothing is broken,
but nothing is deployed either.

**THE PATHS DIFFER PER BOX — CHECK WHICH ONE YOU ARE ON FIRST.** `Jenkinsfile` names two,
and the backend directory is spelled differently on each:

| | GWM box (`goweldev`) | main box (`storees`) |
|---|---|---|
| backend dir | `/var/www/html/storees-backend` | `/var/www/html/storees_backend` ← **underscore** |
| frontend dir | `/var/www/html/storees-frontend` | `/var/www/html/storees-frontend` |
| PM2 api name | `storees-api` | `storees-backend` |
| PM2 web name | `storees-web` | `storees-frontend` |

The `environment` block in `Jenkinsfile` is set for the GWM box. **Deploying to the main
box means those values are wrong** — the job would `cd` into a directory that does not
exist and fail before pulling anything. Confirm with `ls /var/www/html` on the box, and
adjust the block if needed.

`storees-ml` is the same on both (`tasks/handover-2026-05-21.md`).

```bash
ls /var/www/html                    # which spelling does THIS box use?

# then, substituting the backend dir this box actually has:
cd /var/www/html/<backend-dir>    && git status && git branch --show-current
cd /var/www/html/storees-frontend && git status && git branch --show-current
cd /var/www/html/storees-ml       && git status && git branch --show-current
```

Expect "nothing to commit, working tree clean" and `main` in each. Resolve anything
else before starting, not halfway through.

---

## 1. Deploy

**Order is not free: 1.1 before 1.2.** The new ML service writes a fractional
`prediction_window_days` (a cart horizon is hours). That column is still `integer`
until migration `0088` runs, and migrations run inside the BACKEND deploy — so an ML
service deployed first writes `0.1746` into an integer column and Postgres rounds it
to **0**, with no error. A 0-length prediction window is the silent total failure
`0088` exists to remove.

### 1.1 Backend and frontend — Jenkins

Nothing unusual. Migrations run as they always do — `deploy.sh` calls
`npm run db:migrate` as part of the backend stage.

The job takes two booleans, `DEPLOY_BACKEND` and `DEPLOY_FRONTEND`, both **true** by
default; leave them alone to deploy both. `disableConcurrentBuilds` means a second run
queues rather than racing the first for the same port.

What each stage runs, in order (`scripts/deploy.sh`):

```
git pull --ff-only          refuses if the checkout has local edits — see §0.4
npm install
build @storees/shared
build @storees/segments     ← added this release
build @storees/flows        ← added this release
build @storees/backend
npm run db:migrate          backend stage only
pm2 stop, free the port, pm2 restart --update-env, pm2 save
verify the process is "online", exit 1 if not
```

Measured end to end against a copy of the production database: install 7s, the four
builds 6s, migrations 6s, the frontend build 23s.

**A failed build never reaches production.** `set -e` aborts before PM2 is touched, so
the previous process keeps serving and the job simply goes red.

**Tests do NOT gate this.** There is no test stage in `Jenkinsfile` and no test command
in `deploy.sh`. Worth knowing because `npm test` currently fails two `dataMasking`
assertions on `main` as well as here — it cannot block the deploy, and it is not this
release's doing.

**No new environment variables and no new node dependencies in this release.** Nothing
to add to any `.env` before deploying; every new switch (§4) has a working default.

**`scripts/deploy.sh` changed in this release, and it had to.** The backend depends on
`@storees/segments` and `@storees/flows` and resolves them through their compiled
`dist/`, which is gitignored — so `git pull` brought new source and left last deploy's
compiled output in place. The previous script built only `shared` and `backend`, so the
backend compiled against a stale `dist` and failed:

```
error TS2305: Module '"@storees/segments"' has no exported member 'SegmentVocabulary'
```

Reproduced by rebuilding `dist` from `main`'s source and running the old script — exit 2;
with the two extra build steps — exit 0. A dev machine hides this, because it has freshly
built `dist/` folders lying around and a server does not. Nothing for the deployer to do;
the script handles it.

### 1.2 The ML service — BY HAND. Jenkins does not deploy it.

The pipeline has two stages, backend and frontend. **The ML service is not one of
them.** It lives in its own checkout with its own venv and is restarted through PM2
(`tasks/handover-2026-05-21.md`).

Deploy it separately, or the backend will be new while the ML service still runs the
previous pipeline. That gap is **loud, not silent**: the new backend calls
`/propensity/eligible`, which the previous ML service does not expose, so scoring jobs
fail with a 404 until this is done. Nothing is corrupted — but nothing scores either.

Confirm the process id first; `1` is from the handover note, not a guarantee:

```bash
pm2 list                             # find the row named storees-ml
```

```bash
cd /var/www/html/storees-ml
git pull
cd packages/ml
source venv/bin/activate
pip install -r requirements.txt     # installs duckdb — the new dependency
pm2 restart 1 --update-env         # process id 1, named storees-ml
                                    # --update-env is not optional: plain `pm2 restart`
                                    # reuses the env cached at first start, so any .env
                                    # edit (incl. the rollback switches in §4) is ignored
```

**Do not skip the `pip install`.** The new code imports DuckDB, which no previous
release used. Without it uvicorn raises `ModuleNotFoundError: No module named
'duckdb'` and PM2 restarts into the same failure repeatedly.

Verify it came up:

```bash
curl -s localhost:8000/health        # {"status":"ok","service":"storees-ml",...}
pm2 logs 1 --lines 20                # no ModuleNotFoundError
pm2 save                             # keep it across a server reboot
```

`pm2 save` matters here and not for the other two: `deploy.sh` runs it for the backend
and frontend, and nothing runs it for this one. Without it the ML service comes back on
the pre-deploy definition after a reboot.

**Then check what the library versions actually are**, because `pip install -r` will not
tell you. Every pin in `requirements.txt` is a `>=`, and pip leaves an already-satisfied
package alone — so a venv that has carried `pandas` 2.x since it was created keeps it,
while this code was written and tested against `pandas` 3.x. Verified: installing this
requirements file over a venv holding `pandas==2.2.3` left it at 2.2.3.

```bash
pip list | grep -Ei "pandas|numpy|duckdb|scikit-learn|xgboost|scipy"
python -V
```

Expect `pandas` 3.x and `duckdb` 1.5+. If `pandas` is 2.x, recreate the venv rather than
installing on top of it:

```bash
deactivate; rm -rf venv; python3 -m venv venv
source venv/bin/activate && pip install -r requirements.txt
```

A clean install of this requirements file was rehearsed end to end and the whole module
graph imports on it. **No Python version is recorded anywhere for this box** — worth
writing down next to the PM2 id once somebody looks.

---

## 2. Retrain every goal on every project — THE STEP THAT MATTERS

**Do this immediately after deploying. Before anyone looks at a prediction
screen.**

### Why

A model is stored with the list of features it was trained on. Models trained
before this release carry the **old** feature names. The new builder produces a
different set, overlapping only in part.

When the new scoring path loads an old model, it looks for the old names, does not
find most of them, and fills each missing one with zero:

```python
for col in expected_cols:
    if col in features.columns: continue
    if col in CART_FEATURES: raise ...   # carts refuse
    features[col] = 0                    # everything else defaults
```

So the model is asked its question with most of its inputs set to zero, and
answers. **A prediction page will show an AUC and a ranked customer list as
usual. The numbers mean nothing.** No exception, no warning, nothing red.

Old metadata also lacks `goal`, `observation_window_days`,
`prediction_window_days` and `eligibility_window_days`; those default quietly too.

Cart goals are the exception — they refuse to score rather than assume an empty
basket, and return a 500 saying so.

### How

Per project, press **Re-train all**, or per goal, **Re-train**.

Do not skip a project because its dashboard looks healthy. **A stale model looks
exactly like a working one** — that is the whole problem with this step.

### Verify

A retrained goal writes a fresh row. Anything still showing a pre-release
`trained_at` has not been done:

```sql
SELECT p.name AS project, g.name AS goal,
       g.last_trained_at, ROUND(g.current_metric, 4) AS auc
FROM prediction_goals g
JOIN projects p ON p.id = g.project_id
WHERE g.status = 'active'
ORDER BY g.last_trained_at NULLS FIRST;
```

Sorted oldest first, so anything stale is at the top.

---

## 3. What will look different afterwards, and is not a fault

**Windows change on every project.** Training now uses one snapshot and two
held-out rounds, where it used two and three. Both numbers spend history —
`horizon_cap` subtracts them before deciding how far ahead a goal may forecast,
and `needed()` adds them back before deciding which look-backs fit — so asking for
fewer returns that history to the question.

Measured on a live-sized project: churn +0.0154, purchase +0.0040, dormancy
+0.0018, repeat purchase +0.0006, and dormancy's candidate grid widened from two
options to four. Every model held or improved. **But every project's derived
windows will move**, so a goal that read "90d observation / 14d prediction" may
now read something else. That is the pipeline measuring rather than accepting a
default.

**Cart goals forecast in hours.** A cart horizon of 0.2083 days is five hours, and
that is deliberate — half of the adds that ever convert do so within about four
hours. Any screen formatting this must handle values below 1; "0d prediction" is
wrong.

**Cart training is faster.** Repeated per-day feature builds are reused within a
run. Bounded by `ML_CART_DAY_CACHE_MB`, default 512, which stops storing rather
than evicting when full — so the worst case is the old speed, never swapping.

---

## 4. Rollback

Two switches, both read at process start. No deploy, no code change.

```bash
ML_SCAFFOLD_LEGACY=1    # back to 2 snapshots / 3 held-out rounds
ML_CART_DAY_CACHE=0     # back to rebuilding every day's features
```

Restart the ML service after setting either.

`ML_SCAFFOLD_LEGACY=1` is the first thing to reach for if a project's models
degrade after this release: the scaffold moves every derived window, so it is the
change most likely to be responsible and the cheapest to rule out.

**Neither switch reverts the migrations**, and `0088` should not be reverted — see
0.2.

---

## 4b. The data cache, and the one rule for changing a projection

The ML service keeps each project's cleaned rows as parquet in a temp directory and
reuses them within a run and between runs. The directory name is a fingerprint of
everything that shapes those rows: the project's event mapping, its config, **and the
SQL of the projections that produce them**.

That last part was added after it bit us. The key covered the mapping but not the code,
so adding `cart_id` to the orders projection changed which COLUMNS the cache should
hold without changing its name. Every project with a warm cache kept its old file, and
the cart query died binding a column that file had never had:

```
BinderException: Values list "o" does not have a column named "cart_id"
```

Restarting does not help — the file is on disk, not in memory — and the symptom on
screen is "Training did not complete" with the previous model still scoring. On a live
box, where those caches already exist, every cart retrain would have failed this way.

**If you change what a projection in `shared/normalise.py` emits — a column added,
renamed or removed — nothing needs doing.** The fingerprint now covers the generated
SQL, so every warm cache misses once and rebuilds. `CLEANING_SCHEMA_VERSION` in that
file remains as a manual lever for a change the SQL text would not reveal.

The cost is one re-read, which is the trade this cache key has always made: wrong only
ever costs a rebuild, never the wrong rows.

**Manual escape hatch**, if a cache is ever suspected regardless:

```bash
ML_REFRESH=1        # rebuild this project's rows from the database on the next run
ML_CACHE_DIR=/path  # where those caches live (defaults to the system temp directory)
```

---

## 5. If something is wrong

| Symptom | Likely cause |
|---|---|
| ML service will not start, `No module named 'duckdb'` | §0.1 — dependency not declared |
| A cart goal returns 500, "metadata carries no cart windows; retrain it" | model predates the release — retrain it (§2) |
| A prediction page shows plausible but wrong scores | **stale model** — §2 was skipped for that project |
| A goal's AUC dropped after retraining | try `ML_SCAFFOLD_LEGACY=1`, restart, retrain, compare |
| Cart training slower than expected, budget message in logs | raise `ML_CART_DAY_CACHE_MB` if the host has room |
| Scoring jobs fail with 404 on `/propensity/eligible` | §1.2 not done — the ML box is still on the previous release |
| A cart goal shows a 0-day prediction window | §1.2 ran before §1.1 — `0088` had not widened the column yet; re-run the migration, then retrain that goal |
| An `.env` edit (incl. §4's switches) had no effect | restarted without `--update-env` — PM2 reused its cached env |
