"""Fit, calibrate and guardrail-check one model for one project.

PORTED from the platform reference implementation. The method is unchanged: a single
tuned model with customer-grouped cross-validation, isotonic calibration, and a
metrics contract that refuses to report a headline number on its own.

METRICS CONTRACT, unchanged and the point of the whole thing:
    overall AUC          — flattered when most of a base is dormant
    active-segment AUC   — the honest ranking among customers who actually act
    top-decile lift      — what a team gets if they work the top 10%
    calibration          — are the probabilities believable

What changed: the project is the tenant key, windows and the selected feature set are
passed in rather than read from global tables, and artifacts are written into the
caller's versioned model directory instead of a flat shared folder.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import duckdb
import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold, ParameterSampler, cross_val_score


from shared.config import load_config
from shared.dataset import ProjectDataset
from shared.feature_builder import build_feature_matrix
from shared.cart_xy import build_cart_xy
from shared.labeling import build_labels


AUC_LEAKAGE_THRESHOLD = 0.92
BRIER_POOR_THRESHOLD = 0.25
MIN_POSITIVES = 200
MIN_COVERAGE = 0.20
TOP_DECILE = 0.10
LOW_LIFT_THRESHOLD = 1.5  # top-decile lift below this -> barely beats guessing, flag it

#: THE FLOOR, NOT A TARGET. A model at or below these has no information in it at all,
#: which is a different claim from "weak" and is the only one worth refusing outright.
#: Stated as chance itself so it needs no tuning per project or per vertical.
NO_SIGNAL_AUC = 0.5    # AUC at or under chance — at 0.5 uninformative, under it inverted
NO_SIGNAL_LIFT = 1.0   # top decile converts no better than a random tenth

LIFT_TIERS = [(3.0, "Strong"), (2.0, "Good"), (LOW_LIFT_THRESHOLD, "Fair")]



#: A guardrail's technical text -> what the goal card should say instead.
#:
#: The log keeps the exact numbers, because the person debugging a pipeline needs them.
#: The card does not: "NO_SIGNAL: test AUC 0.3733 is at or below 0.5 — the model ranks no
#: better than chance, and below it the ranking is inverted. Not published." is a
#: sentence written for whoever wrote the guardrail, and it appeared verbatim on a
#: marketing screen. A person reading that card wants to know what happened, whether
#: anything was damaged, and what would change the answer.
_PLAIN_REASONS = (
    ("NO_SIGNAL: test AUC",
     "This model was no better than guessing, so it was not published. "
     "Your previous model, if there is one, is untouched."),
    # Same sentence as the AUC check above, deliberately: both fire together on an
    # inverted model, and two lines each ending "not published" read as two separate
    # faults. Deduplication collapses them into one.
    ("NO_SIGNAL: top-decile",
     "This model was no better than guessing, so it was not published. "
     "Your previous model, if there is one, is untouched."),
    ("INSUFFICIENT_DATA:",
     "There are not enough customers who did this yet for a model to learn from. "
     "It will work once the shop has more history."),
    ("INSUFFICIENT_CONTRAST:",
     "Almost every customer in this shop already did the thing being predicted, "
     "so there is nothing to tell apart yet."),
    ("AUTO_REJECT: coverage",
     "Too few of this shop's customers qualified for this prediction to be reliable. "
     "It will work once the shop has more history."),
    ("SUSPECTED_LEAKAGE:",
     "This model scored suspiciously well, which usually means it was given a clue it "
     "will not have in real use. It was not published."),
)


def _plain_reasons(failures: list[str]) -> str:
    """The guardrail verdicts, said to the person reading the goal card.

    One sentence per distinct meaning, deduplicated: both `NO_SIGNAL` checks fire
    together on an inverted model, and two sentences saying "not published" read like two
    separate faults.

    An unrecognised guardrail falls back to its own text rather than being dropped. A new
    check added later is then merely ugly on the card, never silent — and silence is the
    failure this whole week was spent recovering from.
    """
    out: list[str] = []
    for f in failures:
        plain = next((m for needle, m in _PLAIN_REASONS if f.startswith(needle)), f)
        if plain not in out:
            out.append(plain)
    return " ".join(out)

def _lift_quality(lift: float) -> str:
    for floor, label in LIFT_TIERS:
        if lift >= floor:
            return label
    return "Weak"


# SETTLED: one stable, well-regularized configuration instead of a per-model
# hyperparameter search. The search demonstrably overfit -- worst at long
# look-backs (churn cratered: high CV score, low real-world score) -- and its
# pick wobbled window-to-window. A fixed regularized config is stable,
# competitive, and (crucially) makes the observation-window SEARCH and the
# deployed model use the SAME training, so what we optimise is what we ship.
# Generic: identical for every model and client.
STABLE_PARAMS = {
    "max_depth": 4, "learning_rate": 0.05, "n_estimators": 300,
    "subsample": 0.8, "colsample_bytree": 0.8, "min_child_weight": 5, "reg_lambda": 2.0,
}

# AUTO-TUNER restored: random search over these, 3-fold CV, pick best (what the
# live models used). Fixed STABLE_PARAMS underfit fussy degenerate goals (cart).
SEARCH_SPACE = {
    "max_depth": [3, 4, 5, 6],
    "learning_rate": [0.02, 0.03, 0.05, 0.1, 0.15],
    "n_estimators": [150, 250, 400, 600],
    "subsample": [0.6, 0.7, 0.85, 1.0],
    "colsample_bytree": [0.6, 0.7, 0.85, 1.0],
    "min_child_weight": [1, 3, 5, 10],
    "reg_lambda": [0.5, 1.0, 2.0, 5.0],
}
N_SEARCH_ITER = 20


def _build_model(params: dict, scale_pos_weight: float):
    return xgb.XGBClassifier(**params, scale_pos_weight=scale_pos_weight,
                             eval_metric="auc", n_jobs=-1, random_state=42)


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def eligible_customers(dataset: ProjectDataset, goal: str,
                       eligibility_days: float, as_of: str | None = None) -> list[str]:
    """WHO this goal applies to — the same populations `_eligible_ceiling` counts.

    Scoring needs the members, not the size. Storees was scoring every customer row in
    the project because nothing here exposed the set: 16,322 people handed to a dormancy
    model whose population is 5,843, so roughly ten thousand customers with no recorded
    activity were given a prediction anyway. An empty feature row scores as whatever
    all-blank maps to — a flat ceiling of identical scores — and those fabricated rows
    then drove every count on the screen.

    Deliberately reads the SAME definitions as the ceiling above, in the same order, so
    the population a model is graded against and the population it scores cannot drift
    apart. If one changes, both change.

    `as_of` and `eligibility_days` only matter for `cart_abandoned`, whose population is
    a snapshot rather than a cumulative set; the other goals ignore them.

    `eligibility_days` IS A FLOAT. A cart window is hours — 0.2083 days — and the caller
    used to hand this an `int()` of it, which is 0. `>= as_of - 0 days AND < as_of` is
    an empty range, so every cart model reported "0 eligible" and was never scored at
    all: 157 training runs on one project, not one score written, nothing raised.
    `as_of` must likewise be an instant, not a date — midnight excludes everything that
    happened today, which for a five-hour window is the only thing that could qualify.

    AND `as_of=None` MEANS NOW, ANSWERED BY THE DATABASE. Event timestamps are
    timezone-aware; a naive string is read as local time, so a caller that formatted
    `utcnow()` shifted the whole window by the UTC offset and found nobody — the same
    empty answer as the truncated window, from a different cause. `now()` compares
    aware against aware and cannot be got wrong by the machine's timezone.
    """
    con = duckdb.connect()
    con.execute("PRAGMA disable_progress_bar")
    dataset.prepare(con)
    orders_src = dataset.source("orders")
    events_src = dataset.source("events")
    customers_src = dataset.source("customers")

    if goal == "purchase":
        # `customer_id`, NOT `id`. The customers SOURCE is a normalised projection, and
        # its key column is `customer_id` — that is what `normalise` emits, what
        # `materialise` writes to parquet, and what every other reader of this source
        # joins on (`feature_builder`, `labeling`, and the four branches below).
        # `id` was left over from hand-made parquet fixtures that carried the raw table's
        # column, and it does not exist on any project whose rows come from the database.
        # So this branch raised BinderException for every real project — meaning the
        # purchase model could not name its population, could not be scored, and sat at
        # "never trained" with the failure visible only as `eligibility_unavailable` in a
        # worker log.
        sql = f"SELECT DISTINCT customer_id FROM ({customers_src}) WHERE customer_id IS NOT NULL"
    elif goal in ("repeat_purchase", "churn"):
        sql = f"SELECT DISTINCT customer_id FROM ({orders_src}) WHERE customer_id IS NOT NULL"
    elif goal == "dormancy":
        sql = f"""SELECT DISTINCT customer_id FROM (
                    SELECT customer_id FROM ({events_src})
                    UNION SELECT customer_id FROM ({orders_src})
                  ) WHERE customer_id IS NOT NULL"""
    elif goal == "cart_abandoned":
        # AN OPEN CART, NOT "ADDED SOMETHING RECENTLY".
        #
        # This asked one question — did this customer send a cart-add inside the
        # window — and nothing else. It never subtracted removals, never noticed an
        # order, never computed a basket. So a shopper who emptied their cart item by
        # item and then checked out stayed on the live list for the rest of the hour,
        # and a win-back flow reading that list would message someone minutes after
        # they paid.
        #
        # Worse, it disagreed with TRAINING. `build_cart_rows` reconstructs a cart
        # properly — removals subtract, purchased lines drop out, a cleared cart
        # closes — so the model was fitted on real baskets and then served a
        # population assembled by a proxy. Two definitions of "cart" in one pipeline,
        # and only one of them ever looked at what was in it.
        #
        # `build_open_carts` is the serving half of that same reconstruction and
        # already exists for exactly this. Calling it means the question scoring asks
        # is the question the model was trained to answer.
        from shared.cart_rows import build_open_carts
        open_carts = build_open_carts(
            dataset, as_of,
            eligibility_days=eligibility_days,
            prediction_days=eligibility_days,
            con=con,
        )
        if open_carts is None or open_carts.empty:
            return []
        return [str(c) for c in open_carts.index.tolist() if c is not None]
    elif goal == "__never__":
        sql = ""
    else:
        # An `event:<name>` goal. Same union `labeling.py` trains on: bought before, or
        # sent this event before. Scoring a narrower set than the model was fitted for
        # would leave real candidates unscored for no stated reason.
        target = goal.split(":", 1)[1] if ":" in goal else goal
        safe = target.replace("'", "''")
        sql = f"""SELECT DISTINCT customer_id FROM (
                    SELECT customer_id FROM ({orders_src})
                    UNION
                    SELECT customer_id FROM ({events_src}) WHERE event_name = '{safe}'
                  ) WHERE customer_id IS NOT NULL"""

    try:
        return [str(r[0]) for r in con.execute(sql).fetchall() if r[0] is not None]
    finally:
        con.close()


def _eligible_ceiling(dataset: ProjectDataset, goal: str, win) -> int:
    """The realistic maximum this goal's eligible population could ever reach."""
    con = duckdb.connect()
    con.execute("PRAGMA disable_progress_bar")
    orders_src = dataset.source("orders")
    events_src = dataset.source("events")
    customers_src = dataset.source("customers")
    if goal == "purchase":
        return con.execute(f"SELECT count(*) FROM ({customers_src})").fetchone()[0]
    if goal == "repeat_purchase":
        return con.execute(f"SELECT count(DISTINCT customer_id) FROM ({orders_src})").fetchone()[0]
    if goal == "churn":
        # ORDER-BASED churn: population is BUYERS -> ceiling = all-time buyers.
        return con.execute(f"""
            SELECT count(DISTINCT customer_id) FROM ({orders_src})
        """).fetchone()[0]
    if goal == "dormancy":
        # ACTIVITY-BASED dormancy: population is anyone active -> ceiling = all-time
        # distinct customers with any event or order.
        return con.execute(f"""
            SELECT count(DISTINCT customer_id) FROM (
                SELECT customer_id FROM ({events_src})
                UNION SELECT customer_id FROM ({orders_src})
            )
        """).fetchone()[0]
    if goal == "cart_abandoned":
        # UNLIKE the goals above, cart_abandoned's eligible population is an
        # instantaneous SNAPSHOT (who is sitting in an abandoned-cart state in
        # this one observation window), not a cumulative set that grows toward
        # the all-time total. Measuring it against all-time carters
        # (count DISTINCT add_to_cart over the whole dataset) is the exact
        # apples-to-oranges mismatch that made B2C coverage read a false 5.9%
        # and AUTO_REJECT a model whose top-decile lift is actually 3.2x
        # (Strong) -- verified by a gate-bypassed diagnostic before this fix.
        # The fair ceiling is the largest single-observation-window snapshot:
        # distinct customers who add to cart within one obs-window span ending
        # at the test cutoff (the same time-scope the eligible population lives
        # in), so coverage checks "did the eligibility join break" honestly.
        # COUNTED IN CARTS, OVER THE SPAN THE ROWS ARE COLLECTED FROM.
        #
        # This counted DISTINCT CUSTOMERS across the eligibility window while the rows
        # above are CARTS across the feature window. Two different units over two
        # different spans, so coverage read 408% — 5,726 carts divided by 1,401 people —
        # and a guardrail that reports 408% cannot report a break either. If the
        # eligibility join failed tomorrow and half the rows vanished, this would still
        # say "over 100%, fine".
        #
        # A cart opens when nothing preceded it inside the eligibility window: the same
        # rule `cart_rows.build_cart_rows` uses, deliberately, so the numerator and
        # denominator cannot drift apart. The event NAME still comes from the project's
        # own vocabulary, never from a constant here.
        elig = win.eligibility_days
        span = win.feature_days
        test_cutoff = win.checkpoints["test"]
        return con.execute(f"""
            WITH adds AS (
                SELECT customer_id, timestamp AS t FROM ({events_src})
                WHERE event_name IN ({dataset.events.sql_in('cart_add')})
                  AND customer_id IS NOT NULL
            ),
            marked AS (
                SELECT *, lag(t) OVER (PARTITION BY customer_id ORDER BY t) AS prev_add
                FROM adds
            )
            SELECT count(*) FROM marked
            WHERE (prev_add IS NULL OR t >= prev_add + INTERVAL '{elig} days')
              AND t >= TIMESTAMP '{test_cutoff}' - INTERVAL '{span} days'
              AND t <  TIMESTAMP '{test_cutoff}'
        """).fetchone()[0]

    # AN `event:<name>` GOAL — the population is whoever has ever sent that event.
    #
    # This raised a bare `ValueError(goal)` instead. Every stage before it handles these
    # goals: `derive` sizes their windows, `select_features` builds them, the model fits
    # and the sealed test is read — and then coverage, a reporting figure, threw the whole
    # run away at the last step. The caller saw `ValueError: event:cart_updated` with no
    # indication that a trained model had just been discarded over a denominator.
    #
    # Not a retail edge case: ten of the twenty-one goals the industry packs define are
    # this shape, including a lender's EMI-default risk and a course platform's dropout
    # risk. They could each train exactly once — and then die here.
    from shared.windows import event_goal_target
    target = event_goal_target(goal)
    if target:
        # THE SAME POPULATION `labeling.py` USES — bought before, OR sent this event
        # before. Not "sent this event", which is what this first said: that is the
        # narrower set, and the coverage line immediately reported 3,702/2,005 = 184.6%
        # for a checkout goal — a test set larger than the ceiling it was measured
        # against. A percentage over 100 is the giveaway that two different populations
        # are being compared.
        #
        # The union is the right one because the question is "will this happen", not
        # "will it happen again": someone who has bought but never started a checkout is
        # plainly a candidate for starting one.
        safe = target.replace("'", "''")
        return con.execute(f"""
            SELECT count(DISTINCT customer_id) FROM (
                SELECT customer_id FROM ({orders_src})
                UNION
                SELECT customer_id FROM ({events_src}) WHERE event_name = '{safe}'
            ) WHERE customer_id IS NOT NULL
        """).fetchone()[0] or 1

    raise ValueError(goal)


def _build_xy(dataset: ProjectDataset, goal: str, cutoff: str, win):
    """Full candidate matrix + labels (full matrix so active-segment masks work).

    obs = ELIGIBILITY window (who is in the population); feature_obs = how far back
    features may look. Identical unless a search is varying feature history."""
    # Carts are rows in their own right — see shared/cart_rows.py.
    if goal == "cart_abandoned":
        return build_cart_xy(dataset, cutoff, win, build_feature_matrix)
    X = build_feature_matrix(dataset, cutoff, win.feature_days)
    y = build_labels(dataset, goal, cutoff, win.eligibility_days, win.predict_days)
    common = X.index.intersection(y.index)
    return X.loc[common], y.loc[common]


def _segment_auc(y: pd.Series, p: np.ndarray, mask: pd.Series) -> float | None:
    ym, pm = y[mask], p[mask.to_numpy()]
    if ym.sum() < 10 or (len(ym) - ym.sum()) < 10:
        return None
    return roc_auc_score(ym, pm)


def train(dataset: ProjectDataset, goal: str, win, selected: list[str],
          model_dir: Path, params: dict | None = None,
          learn_from_validation: bool = True) -> dict:
    """Fit one model.

    `params` and `learn_from_validation` exist for the LOOK-BACK SEARCH, which is a
    comparison rather than a build. Ranking six windows needs each treated the same,
    not each treated optimally — so the search hands in one set of hyperparameters,
    tuned once, and learns from the snapshots alone.

    Both default to today's behaviour, so the final fit — the model that actually
    ships — is unchanged: it tunes itself and learns from every date.

    WHY THE SEARCH SHOULD NOT TUNE PER CANDIDATE. Re-running the 20-config search
    inside every comparison cost ~91 fits per rehearsal, 18 rehearsals deep, to decide
    a single number. Worse, it confounded the answer: a candidate could win on luckier
    hyperparameters rather than on its window, and nothing distinguished the two.
    """
    # the selected set is passed in by the caller, which ran selection against the
    # same derived windows -- no shared file on disk for two projects to fight over
    feature_cols = list(selected)
    cfg = win.checkpoints
    # The search learns from the snapshots only. A comparison has to RANK the windows,
    # not squeeze the last row out of each — and validation's rows overlap the
    # snapshots' look-back by roughly two thirds, so they add far less than their cost.
    train_cutoffs = cfg["snapshots"] + ([cfg["validation"]] if learn_from_validation else [])
    test_cutoff = cfg["test"]
    log(f"Training {dataset.project_id}/{goal} on {len(feature_cols)} selected "
        f"features (single tuned model + calibration)")
    log(f"  features: {feature_cols}")

    # States what actually happened, not what the layout offers. This line always
    # claimed validation was included, so a search fit learning from the snapshots
    # alone still logged "+ held-out validation" — the log could not be used to check
    # the behaviour it was describing.
    log(f"Building training data (cutoffs {train_cutoffs}"
        + ("" if learn_from_validation else " — snapshots only, search fit") + ")...")
    # fit folds -> used to FIT each tuning candidate; the validation cutoff -> a
    # true forward hold-out used to SELECT the best candidate (never fit during
    # the search). The final model then refits on folds + validation together.
    Xf_parts, yf_parts = [], []
    for c in cfg["snapshots"]:
        X_c, y_c = _build_xy(dataset, goal, c, win)
        Xf_parts.append(X_c)
        yf_parts.append(y_c)
    X_fit_full = pd.concat(Xf_parts)
    y_fit = pd.concat(yf_parts)
    if learn_from_validation:
        X_val_full, y_val = _build_xy(dataset, goal, cfg["validation"], win)
        X_train_full = pd.concat([X_fit_full, X_val_full])
        y_train = pd.concat([y_fit, y_val])
    else:
        X_train_full, y_train = X_fit_full, y_fit
    X_train = X_train_full[feature_cols]
    # `X_fit` and `X_val` were split out here and never referenced again — the remains
    # of a design where validation was a forward hold-out for selection. That design
    # was never finished: everything downstream uses `X_train`, which contains both.
    # Removed rather than left as decoration; they also crashed outright the moment a
    # caller asked to learn from the snapshots alone, since `X_val_full` then does not
    # exist. Whether validation SHOULD be held out is a separate, deliberate question.

    log(f"Building FINAL test data from held-out cutoff {test_cutoff} (first and only read)...")
    X_test_full, y_test = _build_xy(dataset, goal, test_cutoff, win)
    X_test = X_test_full[feature_cols]
    active_test = X_test_full["total_orders"] > 0

    n_pos_train, n_pos_test = int(y_train.sum()), int(y_test.sum())
    log(f"  train: n={len(y_train):,} positives={n_pos_train:,} ({n_pos_train/len(y_train)*100:.2f}%)")
    log(f"  test:  n={len(y_test):,} positives={n_pos_test:,} ({n_pos_test/len(y_test)*100:.2f}%)  "
        f"active-segment={int(active_test.sum()):,} ({active_test.mean()*100:.1f}%)")

    ceiling = _eligible_ceiling(dataset, goal, win)
    coverage = len(y_test) / ceiling
    log(f"  coverage: {len(y_test):,}/{ceiling:,} = {coverage*100:.1f}% of this goal's realistic eligible ceiling")

    guardrail_failures = []
    if n_pos_train < MIN_POSITIVES:
        guardrail_failures.append(f"INSUFFICIENT_DATA: only {n_pos_train} positive labels in training set (need >={MIN_POSITIVES})")

    # HOW ONE-SIDED THIS IS — REPORTED, NOT REFUSED.
    #
    # A model learns by CONTRAST, and the floor above guards only one side of that: a
    # set that is almost entirely one answer passes as "plenty of data" and has nothing
    # to compare against. one shop's churn goal was 873 churned against 56 active — 94%
    # positive — and trained for twenty seconds to produce AUC 0.373, which is not weak
    # but inverted.
    #
    # THIS WAS A REJECTION AND IT WAS WRONG. Refusing on a negative COUNT punishes a set
    # that is small and perfectly balanced: one shop's dormancy goal trains on 156 rows,
    # 65 positive and 91 negative — 42/58, as even as it gets — and cannot ever hold 200
    # of either. Enforced, it killed a model scoring 0.716 with 2,375 customers scored.
    # Count is the wrong instrument for imbalance, and any share threshold in its place
    # would be a number invented here.
    #
    # `NO_SIGNAL` already refuses on the outcome itself, measured on held-out data, which
    # is the honest arbiter — it caught the churn model without this. So this only
    # explains WHY, next to that verdict: "94% already churned" is what a person can act
    # on; "ranks no better than chance" is not.
    n_neg_train = int(len(y_train) - n_pos_train)
    contrast_note = None
    if len(y_train) and n_pos_train / len(y_train) > 0.9:
        contrast_note = (
            f"ONE_SIDED: {n_pos_train / len(y_train) * 100:.1f}% of the training population "
            f"already did the thing being predicted ({n_neg_train} have not) — there is "
            f"little to tell apart, and any score here rests on very few counter-examples")
    if coverage < MIN_COVERAGE:
        guardrail_failures.append(f"AUTO_REJECT: coverage {coverage*100:.1f}% below the {MIN_COVERAGE*100:.0f}% floor")
    if guardrail_failures:
        log("  GUARDRAIL FAILURE(S) -- stopping before training:")
        for f in guardrail_failures:
            log(f"    {f}")
        return {"project_id": dataset.project_id, "goal": goal, "status": "REJECTED",
                # `serve.train_model` reads `reason`; this only ever set
                # `guardrail_failures`, so the sentence written right above — "only 70
                # positive labels (need >=200)" — reached the log and nothing else. The
                # card said "Training did not complete." and the person reading it had
                # no way to learn the shop simply has too few buyers yet.
                "reason": _plain_reasons(guardrail_failures),
                "guardrail_failures": guardrail_failures}

    # ---- AUTO-TUNER: random search, GROUPED 3-fold CV (by customer), pick best ----
    # GroupKFold on customer id: a customer appears at several stacked cutoffs, so
    # plain random folds would put copies of the same person in both the train and
    # the CV-validation fold -> leaky, inflated tuning score. Grouping keeps each
    # customer wholly in one fold so the tuning score is honest.
    scale_pos_weight = (y_train == 0).sum() / max((y_train == 1).sum(), 1)
    groups = X_train.index.to_numpy()
    gkf = GroupKFold(n_splits=3)
    if params is not None:
        # HANDED IN, NOT SEARCHED. Every candidate in a look-back comparison gets the
        # same hyperparameters, so whichever window wins, wins on the window.
        best_params, best_score = dict(params), float("nan")
        log("  hyperparameters supplied by the caller (shared across candidates)")
    else:
        log(f"  hyperparameter search ({N_SEARCH_ITER} configs, grouped 3-fold CV by customer)...")
        best_score, best_params = -1.0, None
        for cand in ParameterSampler(SEARCH_SPACE, n_iter=N_SEARCH_ITER, random_state=42):
            model = _build_model(cand, scale_pos_weight)
            scores = cross_val_score(model, X_train, y_train, cv=gkf, groups=groups,
                                     scoring="roc_auc", n_jobs=1)
            if scores.mean() > best_score:
                best_score, best_params = scores.mean(), cand
        log(f"  best grouped-CV AUC={best_score:.4f} with params={best_params}")

    # ---- final fit + isotonic calibration (refit on folds + validation) ----
    log("  fitting final XGBoost + isotonic calibration...")
    scale_pos_weight = (y_train == 0).sum() / max((y_train == 1).sum(), 1)
    base_model = _build_model(best_params, scale_pos_weight)  # uncalibrated, for SHAP
    base_model.fit(X_train, y_train)
    final_model = CalibratedClassifierCV(_build_model(best_params, scale_pos_weight),
                                         method="isotonic", cv=3)
    final_model.fit(X_train, y_train)

    # ---- evaluate ONCE on held-out test ----
    y_prob = final_model.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_test, y_prob)
    active_auc = _segment_auc(y_test, y_prob, active_test)
    inactive_auc = _segment_auc(y_test, y_prob, ~active_test)
    test_brier = brier_score_loss(y_test, y_prob)

    k = max(int(len(y_test) * TOP_DECILE), 1)
    top_idx = np.argsort(-y_prob)[:k]
    top_decile_precision = float(y_test.iloc[top_idx].mean())
    base_rate = float(y_test.mean())
    top_decile_lift = top_decile_precision / max(base_rate, 1e-9)

    log(f"  TEST global AUC={test_auc:.4f}  active-segment AUC={active_auc if active_auc is None else round(active_auc,4)}  "
        f"inactive AUC={inactive_auc if inactive_auc is None else round(inactive_auc,4)}")
    log(f"  top-decile: {top_decile_precision*100:.1f}% purchase (base {base_rate*100:.2f}%, lift {top_decile_lift:.1f}x)  Brier={test_brier:.4f}")

    # ---- guardrail arbitration ----
    flags = []
    if contrast_note:
        flags.append(contrast_note)
    if test_auc > AUC_LEAKAGE_THRESHOLD:
        if active_auc is not None and active_auc > AUC_LEAKAGE_THRESHOLD:
            guardrail_failures.append(
                f"SUSPECTED_LEAKAGE: global AUC {test_auc:.4f} AND active-segment AUC {active_auc:.4f} "
                f"both exceed {AUC_LEAKAGE_THRESHOLD} — near-perfect ranking even among active customers")
        else:
            flags.append(
                f"HIGH_GLOBAL_AUC_MIX_INFLATION: global AUC {test_auc:.4f} exceeds {AUC_LEAKAGE_THRESHOLD} but "
                f"active-segment AUC ({'n/a' if active_auc is None else f'{active_auc:.4f}'}) does not — "
                f"attributed to easy active-vs-dormant separation, not leakage")
    if test_brier > BRIER_POOR_THRESHOLD:
        flags.append(f"POOR_CALIBRATION: Brier {test_brier:.4f} > {BRIER_POOR_THRESHOLD}")
    lift_quality = _lift_quality(top_decile_lift)
    if top_decile_lift < LOW_LIFT_THRESHOLD:
        flags.append(f"LOW_LIFT: top-decile lift {top_decile_lift:.2f}x is below {LOW_LIFT_THRESHOLD}x — "
                     f"barely beats random guessing at finding the top prospects, regardless of raw AUC")
    log(f"  lift quality: {lift_quality} ({top_decile_lift:.2f}x baseline)")

    # NOTHING BELOW CHANCE IS PUBLISHABLE.
    #
    # Every guardrail above this point runs BEFORE the fit and asks whether there is
    # enough data to try. Nothing asked whether the finished model was worth having, so
    # `status` could only ever be decided by the pre-fit checks — and a model that had
    # learned nothing went live with a green badge. Measured on one shop 2026-09-25: a
    # churn model at AUC 0.373 was marked ACTIVE and scored 1,521 customers. Below 0.5 a
    # ranking is not weak, it is INVERTED: the customers it calls most likely to churn
    # are the least likely, so working that list is worse than working a random one.
    #
    # The comparison is to chance, not to a tuned number. 0.5 means the same thing for a
    # wine shop, a lender and a course platform, so this needs no per-project threshold
    # and can never be wrong for a vertical nobody has onboarded yet. `LOW_LIFT` above
    # stays a flag: a 1.2x model is weak and still useful, and refusing it would throw
    # away the honest middle of the range. Only "no better than chance" is refused.
    if test_auc <= NO_SIGNAL_AUC:
        guardrail_failures.append(
            f"NO_SIGNAL: test AUC {test_auc:.4f} is at or below {NO_SIGNAL_AUC} — the model ranks no "
            f"better than chance, and below it the ranking is inverted. Not published.")
    if top_decile_lift < NO_SIGNAL_LIFT:
        guardrail_failures.append(
            f"NO_SIGNAL: top-decile lift {top_decile_lift:.2f}x is below {NO_SIGNAL_LIFT}x — the top "
            f"10% it picks convert no better than 10% picked at random. Not published.")

    status = "REJECTED" if guardrail_failures else "ACTIVE"
    log(f"  STATUS: {status}")
    for f in guardrail_failures:
        log(f"    {f}")
    for f in flags:
        log(f"    [flag] {f}")

    # ---- SHAP importance (on the uncalibrated XGBoost; calibration is a
    # monotonic wrapper and doesn't change feature attributions) ----
    log("  computing SHAP feature importance...")
    sample = X_test.sample(min(2000, len(X_test)), random_state=42) if len(X_test) > 2000 else X_test
    shap_values = shap.TreeExplainer(base_model).shap_values(sample)
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    importance = sorted(zip(feature_cols, mean_abs_shap), key=lambda t: -t[1])
    for feat, val in importance:
        log(f"    {feat:<36} mean|SHAP|={val:.4f}")

    # ---- save ----
    # Versioned, matching the layout the service already promotes and rolls back:
    # every fit lands in versions/ and the live model.joblib is whatever was last
    # trained or last promoted to.
    model_version = time.strftime("%Y%m%d_%H%M%S")
    versions_dir = model_dir / "versions"
    versions_dir.mkdir(parents=True, exist_ok=True)

    bundle = {"model": final_model, "features": feature_cols}
    joblib.dump(bundle, versions_dir / f"model_{model_version}.joblib")
    model_path = model_dir / "model.joblib"
    # THE DATABASE SAYING "failed" DOES NOT UNLOAD A FILE. `serve._load_model` reads
    # `model.joblib` by goal id and knows nothing about run status, so a rejected fit
    # written here would be the model every later scoring request used — the run marked
    # failed, the customers scored by it anyway, and the previous good model gone. The
    # versioned copy above is still written: a rejected fit is evidence, and `/promote`
    # can reach it deliberately if somebody decides otherwise.
    if status == "ACTIVE":
        joblib.dump(bundle, model_path)
    else:
        log(f"  not published — {model_path.name} left as it was")

    # Everything scoring needs to rebuild the exact same inputs later. The windows
    # matter as much as the feature names: score a customer on a different look-back
    # than the model was fitted on and the columns silently mean something else.
    metadata = {
        "model_version": model_version,
        "project_id": dataset.project_id,
        "goal": goal,
        "feature_names": feature_cols,
        "observation_window_days": win.feature_days,
        "eligibility_window_days": win.eligibility_days,
        "prediction_window_days": win.predict_days,
        "test_cutoff": test_cutoff,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    (model_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))
    (versions_dir / f"metadata_{model_version}.json").write_text(json.dumps(metadata, indent=2))
    result = {
        "project_id": dataset.project_id, "goal": goal, "status": status,
        "test_auc_global": test_auc,
        "test_auc_active_segment": active_auc,
        "test_auc_inactive_segment": inactive_auc,
        "top_decile_precision": top_decile_precision,
        "top_decile_lift": top_decile_lift,
        "lift_quality": lift_quality,
        "base_rate": base_rate,
        "test_brier": test_brier,
        "model_type": "xgboost_single_tuned",
        "cv_auc": best_score, "best_params": best_params,
        "n_train": len(y_train), "n_pos_train": n_pos_train,
        "n_test": len(y_test), "n_pos_test": n_pos_test,
        "coverage": coverage,
        # Same reason the pre-fit path carries one: a post-fit rejection (NO_SIGNAL,
        # SUSPECTED_LEAKAGE) is the outcome most in need of explaining, and without this
        # it arrived as a bare "failed".
        "reason": _plain_reasons(guardrail_failures) or None,
        "guardrail_failures": guardrail_failures, "flags": flags,
        "selected_features": feature_cols,
        "feature_importance": [{"feature": f, "mean_abs_shap": float(v)} for f, v in importance],
        "train_cutoffs": train_cutoffs, "test_cutoff": test_cutoff,
        "model_path": str(model_path),
        "model_version": model_version,
    }
    log(f"  wrote {model_path}")
    return result


