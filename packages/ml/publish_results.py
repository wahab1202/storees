"""Put a project's trained models in front of the people who use them.

Training produces a model and a set of honest numbers. This puts both where the
product reads them:

    prediction_goals           the windows the pipeline DERIVED, and the headline metric
    prediction_training_runs   both AUCs, lift, and how many positives it saw
    prediction_scores          every eligible customer, with a score and a band

Scoring reuses the model's OWN saved feature window. Scoring a customer over a
different window than the model was fitted on would hand it columns that share a
name with training but mean something else — the numbers would look fine and be
quietly wrong.

Usage:
    python3 publish_results.py <project_id>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shared.config import load_config
from shared.feature_builder import build_feature_matrix
from shared.labeling import build_labels
from shared.cart_xy import build_cart_xy, CART_FEATURES, OCCASION_STARTED_AT, OUTCOME
from propensity.pipeline import Windows, POPULATION_DEFINED_BY_WINDOW
from propensity.train_propensity import resolve_dataset, GOAL_BY_TARGET_EVENT, resolve_goal, dataset_cache_dir

#: bands the product shows. Percentile-based, not a fixed score: a rare event never
#: produces a high probability for anyone, while a common one clears any fixed bar
#: for most of the base — the same number would mean something different per goal.
BANDS = [("High", 0.90, 1.01), ("Medium", 0.70, 0.90), ("Low", 0.0, 0.70)]

#: the product's goal names -> what the pipeline calls them. Matched on a lowered
#: name because the wording drifts between deployments ("Predict Dormancy" here,
#: "Dormancy" elsewhere) while the goal underneath is the same one.
#:
#: The goal is resolved from the NAME rather than `target_event` because two goals
#: legitimately share a target event: "Propensity to Purchase" and "Repeat Purchase
#: Propensity" are both about `order_placed`. The event is identical; the population
#: and the label are not. Keying on it would publish one model's scores twice.
#: The table itself lives in train_propensity, alongside the resolver that also handles
#: goals no name table has heard of — "EMI Default Risk", "Completion Risk" — by
#: falling back to the event they target. Imported rather than copied so publishing and
#: training can never disagree about which model a goal row means.


def log(m: str) -> None:
    print(f"[publish] {m}", flush=True)


def dsn_from_url(url: str) -> str:
    return url


def main(project_id: str) -> None:
    cfg = load_config()
    conn = psycopg2.connect(cfg.database_url)
    conn.autocommit = False
    cur = conn.cursor()

    dataset = resolve_dataset(project_id)
    # the pipeline read the database once and cached the cleaned rows; score against
    # exactly those, so what the UI shows is what the model was judged on.
    #
    # The directory name comes from `dataset_cache_dir`, the same function training
    # writes with. Spelling it out here instead was how the promise above got quietly
    # broken: this looked for `ml_<project>` while training wrote
    # `ml_<project>_<fingerprint>`, so it never matched, fell through to the database
    # every time, and published scores computed from re-read rows.
    cache = dataset_cache_dir(dataset)
    if (cache / "events.parquet").exists():
        from shared.dataset import ProjectDataset
        from dataclasses import replace
        dataset = ProjectDataset(project_id=project_id, root=cache,
                                 events=replace(dataset.events, cart_add_mode="event"))

    cur.execute("SELECT id, name, target_event, windows_pinned "
                "FROM prediction_goals WHERE project_id = %s",
                (project_id,))
    rows = cur.fetchall()
    if not rows:
        log("this project has no goals configured — nothing to publish")
        return

    purchase_events = tuple(dataset.events.purchase)
    abandon_events = tuple(dataset.events.cart_abandon)

    published, skipped = [], []
    for goal_id, name, target_event, windows_pinned in rows:
        goal = resolve_goal(name, target_event, purchase_events, abandon_events)
        # models are written per GOAL ROW, not per goal kind -- train_propensity keys
        # the directory on goal_id so two goals sharing a target event keep their own
        model_dir = Path(cfg.model_dir) / f"propensity_{goal_id}"
        if not goal:
            skipped.append((name, "no pipeline goal and no target event"))
            continue
        if not (model_dir / "model.joblib").exists():
            skipped.append((name, "no trained model yet"))
            continue

        meta = json.loads((model_dir / "metadata.json").read_text())
        bundle = joblib.load(model_dir / "model.joblib")
        model = bundle["model"] if isinstance(bundle, dict) else bundle
        feats = meta["feature_names"]
        obs = meta["observation_window_days"]
        elig = meta.get("eligibility_window_days", obs)
        pred_days = meta["prediction_window_days"]
        cutoff = meta["test_cutoff"]

        if goal in POPULATION_DEFINED_BY_WINDOW:
            # AN OCCASION MODEL IS SCORED ON OCCASIONS, exactly as it was fitted.
            #
            # Building the customer matrix here and selecting `feature_names` off it
            # raised `KeyError: ['cart_value'] not in index` — the two cart columns are
            # carried on the cart row, not the customer, so they simply are not there.
            # Reaching for the customer matrix is the same mistake `serve.py` made
            # quietly, and the only reason this one is loud is that it selects columns
            # strictly instead of defaulting what it cannot find.
            #
            # `build_cart_xy` is the function training uses, so the population, the
            # labels and the per-day as-of dates that keep the leak out are identical.
            X, y, opened = build_cart_xy(
                dataset, cutoff,
                Windows(eligibility_days=elig, feature_days=obs,
                        predict_days=pred_days, checkpoints={}),
                build_feature_matrix, with_opened_at=True)
            # ONE ROW PER CUSTOMER before anything is written. `prediction_scores` holds
            # one row per (project, goal, customer) and a cart index repeats, so a
            # customer with five carts would arrive five times. Rows are assembled
            # oldest day first, so the last is the newest cart — the basket they are
            # actually holding, which is the one worth a message.
            keep = ~X.index.duplicated(keep="last")
            X, y, opened = X[keep], y[keep], opened[keep]
        else:
            X = build_feature_matrix(dataset, cutoff, obs)
            y = build_labels(dataset, goal, cutoff, elig, pred_days)
            common = X.index.intersection(y.index)
            X, y = X.loc[common], y.loc[common]
        if X.empty:
            skipped.append((name, "no eligible customers at the test cutoff"))
            continue

        p = model.predict_proba(X[feats])[:, 1]
        overall = float(roc_auc_score(y, p)) if y.nunique() > 1 else None

        active_mask = (X["total_orders"] > 0) if "total_orders" in X else pd.Series(False, index=X.index)
        ya, pa = y[active_mask], p[active_mask.to_numpy()]
        active = (float(roc_auc_score(ya, pa))
                  if ya.nunique() > 1 and ya.sum() >= 10 else None)

        # what a team actually gets by working the top 10%
        order = np.argsort(-p)
        top = order[: max(1, int(0.10 * len(p)))]
        base = float(y.mean())
        lift = float(y.iloc[top].mean() / base) if base > 0 else None

        pct = pd.Series(p, index=X.index).rank(pct=True)
        band = pd.Series("Low", index=X.index)
        for label, lo, hi in BANDS:
            band[(pct >= lo) & (pct < hi)] = label

        # 1. the goal row carries the DERIVED windows -- nobody typed them.
        #
        # UNLESS somebody did. A goal with `windows_pinned` was given its windows on
        # purpose, and writing the run's numbers back over them would erase the setting
        # the moment it was first used — the goal would silently revert to deriving on
        # the next run. So a pinned goal has its metric and status updated and its two
        # window columns left exactly as its owner set them.
        if windows_pinned:
            cur.execute("""UPDATE prediction_goals
                           SET current_metric = %s, status = 'active',
                               last_trained_at = now(), updated_at = now()
                           WHERE id = %s""",
                        (round(active if active is not None else (overall or 0), 4), goal_id))
        else:
            cur.execute("""UPDATE prediction_goals
                           SET observation_window_days = %s, prediction_window_days = %s,
                               current_metric = %s, status = 'active',
                               last_trained_at = now(), updated_at = now()
                           WHERE id = %s""",
                        (obs, pred_days, round(active if active is not None else (overall or 0), 4), goal_id))

        # 2. the run: overall AUC alongside the honest active-segment one
        cur.execute("""INSERT INTO prediction_training_runs
                       (goal_id, project_id, trained_at, status, auc, lift, n_positive, segment_metrics)
                       VALUES (%s, %s, now(), 'success', %s, %s, %s, %s)""",
                    (goal_id, project_id,
                     None if overall is None else round(overall, 4),
                     None if lift is None else round(lift, 4),
                     int(y.sum()),
                     json.dumps([] if active is None else
                                [{"segment_label": "Active buyers", "auc": round(active, 4)}])))

        # 3. every scored customer, replacing this goal's previous set wholesale
        cur.execute("DELETE FROM prediction_scores WHERE goal_id = %s", (goal_id,))
        # ids come back from the feature matrix as UUID objects; the driver wants text
        # `factors` is free-form jsonb the UI already reads for its extra columns, so
        # the cart's own values ride along here rather than needing a schema change.
        # Only for a cart model; every other goal keeps the empty list it always had.
        cart_cols = [c for c in CART_FEATURES if c in X.columns]
        opened = opened if goal in POPULATION_DEFINED_BY_WINDOW else None
        def _factors(cid):
            if not cart_cols:
                return json.dumps([])
            row = X.loc[cid]
            out = [{"feature": c, "value": (None if pd.isna(row[c]) else float(row[c]))}
                   for c in cart_cols]
            # WHEN THE BASKET OPENED, so the countdown is measured from the cart rather
            # than from the moment this script happened to run. Anchored to the row's
            # write time, every cart in a fourteen-day collection window rendered with
            # the same "4h 49m left", a week after the last one had died.
            if opened is not None:
                t = opened.loc[cid]
                if not pd.isna(t):
                    out.append({"feature": OCCASION_STARTED_AT, "value": None,
                                "at": pd.Timestamp(t).isoformat()})
            # WHAT ACTUALLY HAPPENED. This run scores a sealed period and grades itself
            # against it — the label is already in hand, and throwing it away is why the
            # screen could show a confident prediction beside no way to check it. Only
            # ever written here; a live score has no outcome to write.
            out.append({"feature": OUTCOME, "value": float(y.loc[cid])})
            return json.dumps(out)
        recs = [(project_id, str(cid), str(goal_id), float(round(score * 100, 2)), 0.0,
                 band.loc[cid], _factors(cid), meta["model_version"])
                for cid, score in zip(X.index, p)]
        execute_values(cur, """INSERT INTO prediction_scores
            (project_id, customer_id, goal_id, score, confidence, bucket, factors,
             model_version, computed_at) VALUES %s""",
            recs, template="(%s,%s::uuid,%s::uuid,%s,%s,%s,%s,%s,now())", page_size=2000)

        counts = band.value_counts().to_dict()
        log(f"{name:<22} overall={overall:.4f} active={'-' if active is None else f'{active:.4f}'} "
            f"lift={'-' if lift is None else f'{lift:.2f}'} scored={len(X):,} "
            f"High={counts.get('High',0)} Medium={counts.get('Medium',0)} Low={counts.get('Low',0)}")
        published.append(name)

    conn.commit()
    cur.close()
    conn.close()
    log(f"published {len(published)} goal(s)")
    for name, why in skipped:
        log(f"skipped {name}: {why}")


if __name__ == "__main__":
    # REQUIRED, not defaulted -- see run_all_goals.py. A default project id here would
    # overwrite one tenant's published scores whenever the argument was forgotten.
    if len(sys.argv) < 2:
        sys.exit("usage: python3 publish_results.py <project_id>")
    main(sys.argv[1])
