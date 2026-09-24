"""Which of the ~179 candidate features THIS model should use.

PORTED from the platform reference implementation, unchanged in method:
  1. group correlated features so credit that bounces between them is not mistaken
     for instability
  2. keep only groups that carry real weight in EVERY training snapshot
  3. sweep candidate set sizes and pick one on held-out, customer-grouped splits

What changed: the project is the tenant key, windows are passed in rather than read
from a global table, and the result is RETURNED for the caller to persist alongside
the model version instead of being written to a shared file on disk.

LEAK RULE, unchanged: selection only ever sees training snapshots and the validation
checkpoint. The test checkpoint belongs to training and is read exactly once.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split, GroupKFold


from shared.dataset import ProjectDataset
from shared.feature_builder import build_feature_matrix
from shared.cart_xy import build_cart_xy
from shared.labeling import build_labels


# Date layout per business type. "folds" and "validation" are selection's
# territory; "test" belongs exclusively to train.py.
# B2C: fit inside Oct'19-Mar'20.
# B2B: fit inside 2025-10-01 - 2026-04-01 -- the verified dense, internally
# consistent window (see storees_db_adapter.py docstring: customer base was
# under 25 people before the 2025-08-28 dealer-network onboarding, and a
# second bulk-import/migration boundary lands at 2026-04-01 13:15:48).
# These B2B cutoffs are sized for PURCHASE specifically (obs=60d, pred=14d
# -> valid cutoff range is 2025-11-30 to 2026-03-17; earliest fold below
# sits at Dec 1, a 1-day margin over the Nov 30 floor -- tight but valid).
# NOTE: churn's B2B
# footprint (obs=150d + pred=60d = 210 days) does NOT fit inside this
# 6-month window at all -- that goal needs its own resolution (extend the
# window, or shrink its observation length) before it can be selected/
# trained; don't reuse these cutoffs for churn unchanged.

CLUSTER_CORR_THRESHOLD = 0.7   # |spearman| above this -> same cluster
MIN_CLUSTER_GAIN_SHARE = 0.01  # cluster must carry >=1% of total gain in EVERY fold
K_SWEEP = [5, 8, 12, 16, 20, 25, 30, 40, 55]
# Smallest k whose blended score is within TOLERANCE of the best wins. The
# tolerance is NOISE-AWARE, not flat: a fixed 0.002 sat below the noise floor
# for small clients (b2b cart_abandoned's sweep jitters ~+/-0.01, so k=5 vs
# k=16 tied EXACTLY and k was effectively chosen at random). Tolerance is now
# the Hanley-McNeil standard error of the blended validation score for THIS
# dataset's sample size, floored at the old 0.002 so big datasets keep the
# tight bar they've earned.
K_TOLERANCE_FLOOR = 0.002
MIN_POSITIVES_PER_FOLD = 30

# WHICH NUMBER SELECTION OPTIMIZES.
#   "blend"  = 0.5*global + 0.5*active-segment (the honest-metric default; picks
#              windows/features that also serve the customers who are actually
#              active, at some cost to the headline global AUC)
#   "global" = global AUC alone (headline-first; on mix-heavy goals global is
#              partly inflated by easy active-vs-dormant separation, so this
#              can buy headline AUC while the active segment flattens or slips)
# Reporting is UNAFFECTED either way -- both numbers are always measured and
# logged. This switch only changes what the search maximizes.
SELECTION_TARGET = "blend"

XGB_PARAMS = dict(
    n_estimators=150, max_depth=4, learning_rate=0.1,
    eval_metric="auc", n_jobs=-1, random_state=42,
)


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _build_xy(dataset: ProjectDataset, goal: str, cutoff: str, win):
    """Features off the FEATURE window, eligibility/labels off the eligibility one.
    They differ only where a goal's window defines its own population (carts)."""
    # Carts are rows in their own right — see shared/cart_rows.py for why a
    # per-customer cart label cannot carry an hours-scale question.
    if goal == "cart_abandoned":
        return build_cart_xy(dataset, cutoff, win, build_feature_matrix)
    X = build_feature_matrix(dataset, cutoff, win.feature_days)
    y = build_labels(dataset, goal, cutoff, win.eligibility_days, win.predict_days)
    common = X.index.intersection(y.index)
    return X.loc[common], y.loc[common]


def _cluster_features(X: pd.DataFrame) -> dict[str, int]:
    """Hierarchical clustering on |spearman| correlation. Returns feature -> cluster id."""
    # Constant columns have no correlation signal; isolate each in its own cluster.
    nunique = X.nunique()
    constant = nunique[nunique <= 1].index.tolist()
    variable = [c for c in X.columns if c not in constant]

    corr = X[variable].corr(method="spearman").abs().fillna(0).to_numpy().copy()
    np.fill_diagonal(corr, 1.0)
    dist = 1 - corr
    dist = (dist + dist.T) / 2  # enforce symmetry against float noise
    np.fill_diagonal(dist, 0.0)
    condensed = squareform(dist, checks=False)
    Z = linkage(condensed, method="average")
    labels = fcluster(Z, t=1 - CLUSTER_CORR_THRESHOLD, criterion="distance")

    assignment = dict(zip(variable, labels))
    next_id = labels.max() + 1 if len(labels) else 1
    for c in constant:
        assignment[c] = next_id
        next_id += 1
    return assignment


def _fold_importance(X: pd.DataFrame, y: pd.Series) -> pd.Series | None:
    n_pos = int(y.sum())
    if n_pos < MIN_POSITIVES_PER_FOLD or (len(y) - n_pos) < MIN_POSITIVES_PER_FOLD:
        log(f"    skipping fold: only {n_pos} positives / {len(y) - n_pos} negatives")
        return None
    X_tr, _, y_tr, _ = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
    spw = (y_tr == 0).sum() / max((y_tr == 1).sum(), 1)
    model = xgb.XGBClassifier(**XGB_PARAMS, scale_pos_weight=spw, importance_type="gain")
    model.fit(X_tr, y_tr)
    gains = pd.Series(model.feature_importances_, index=X.columns)
    total = gains.sum()
    return gains / total if total > 0 else gains


def _blended_score(y_true: pd.Series, y_prob: np.ndarray, active_mask: pd.Series) -> tuple[float, float, float]:
    """Return (score, global_auc, active_auc). `score` is what selection maximizes:
    50/50 global+active-segment under SELECTION_TARGET="blend", or global alone
    under "global". Both components are always returned so reporting is identical
    either way."""
    global_auc = roc_auc_score(y_true, y_prob)
    ya, pa = y_true[active_mask], y_prob[active_mask.to_numpy()]
    if ya.sum() >= 10 and (len(ya) - ya.sum()) >= 10:
        active_auc = roc_auc_score(ya, pa)
    else:
        active_auc = global_auc  # too few active customers to score separately
    if SELECTION_TARGET == "global":
        return global_auc, global_auc, active_auc
    return 0.5 * global_auc + 0.5 * active_auc, global_auc, active_auc


def _auc_se(auc: float, n_pos: int, n_neg: int) -> float:
    """Hanley-McNeil (1982) standard error of an AUC estimate — the classic
    closed-form answer to "how much would this AUC wobble if we redrew a
    validation set of the same size?". Depends only on the AUC value and the
    positive/negative counts, so it needs no bootstrap passes."""
    if n_pos <= 0 or n_neg <= 0:
        return float("inf")
    a = min(max(auc, 0.5), 1.0 - 1e-9)  # SE formula assumes AUC >= chance
    q1 = a / (2.0 - a)
    q2 = 2.0 * a * a / (1.0 + a)
    var = (a * (1 - a) + (n_pos - 1) * (q1 - a * a) + (n_neg - 1) * (q2 - a * a)) / (n_pos * n_neg)
    return max(var, 0.0) ** 0.5


def _blended_tolerance(best_r: dict, y_val: pd.Series, active_mask: pd.Series) -> float:
    """Noise floor for the k-sweep tie-break: 1 standard error of THE SCORE
    SELECTION IS ACTUALLY MAXIMIZING, floored at K_TOLERANCE_FLOOR. Large
    validation sets keep the old tight 0.002 bar; small ones get a bar matching
    their real jitter, so 'tied' means statistically tied instead of coin-flip
    k selection.

    The bar must track SELECTION_TARGET. The active segment is a small slice of
    the population, so its Hanley-McNeil SE is much larger than global's; the
    blended bar (independent-halves approximation 0.5*sqrt(SE_g^2 + SE_a^2)) is
    therefore WIDER than SE_g. Keeping the blended bar under global-only
    selection would call k's 'tied' that global can genuinely separate, and so
    systematically under-select features."""
    n_pos_g = int(y_val.sum())
    n_neg_g = len(y_val) - n_pos_g
    se_g = _auc_se(best_r["global_auc"], n_pos_g, n_neg_g)
    if SELECTION_TARGET == "global":
        return max(K_TOLERANCE_FLOOR, se_g)
    ya = y_val[active_mask]
    n_pos_a = int(ya.sum())
    n_neg_a = len(ya) - n_pos_a
    se_a = _auc_se(best_r["active_auc"], n_pos_a, n_neg_a)
    if se_a == float("inf"):  # blended fell back to global-only in _blended_score
        se_a = se_g
    se_blended = 0.5 * (se_g ** 2 + se_a ** 2) ** 0.5
    return max(K_TOLERANCE_FLOOR, se_blended)


def _segment_filter(X: pd.DataFrame, y: pd.Series, segment: str | None):
    """Restrict to the active (total_orders>0) or inactive population, for
    per-segment feature selection matching the hurdle model's two segments in
    train.py. segment=None (default) keeps the pooled behavior unchanged."""
    if segment is None:
        return X, y
    mask = X["total_orders"] > 0 if segment == "active" else X["total_orders"] == 0
    return X.loc[mask], y.loc[mask]


def select_features(dataset: ProjectDataset, goal: str, win,
                    segment: str | None = None) -> dict:
    assert segment in (None, "active", "inactive")
    cfg = win.checkpoints
    log(f"Selecting features for {dataset.project_id}/{goal} "
        f"(look-back={win.feature_days}d, forecast={win.predict_days}d)"
        + (f" [segment={segment}]" if segment else ""))
    log(f"  snapshots={cfg['snapshots']}  validation={cfg['validation']}  (test={cfg['test']} — untouched here)")

    # ---- build fold data ----
    fold_data = []
    for cutoff in cfg["snapshots"]:
        log(f"  building fold cutoff={cutoff}...")
        fold_data.append(_segment_filter(*_build_xy(dataset, goal, cutoff, win), segment))

    # ---- guard: empty / degenerate population -> INSUFFICIENT_DATA (don't crash) ----
    # A goal whose eligibility never triggers for this client (e.g. cart_abandoned
    # when there are no add_to_cart events) yields zero rows -> clustering would
    # crash on an empty distance matrix. Report N/A cleanly instead.
    total_rows = sum(len(X) for X, _ in fold_data)
    total_pos = sum(int(y.sum()) for _, y in fold_data)
    if total_rows < 2 or total_pos < MIN_POSITIVES_PER_FOLD:
        log(f"  INSUFFICIENT_DATA: eligible population too small "
            f"(rows={total_rows}, positives={total_pos}) -> N/A")
        result = {"project_id": dataset.project_id, "goal": goal, "segment": segment,
                  "status": "INSUFFICIENT_DATA",
                  "reason": f"eligible population too small (rows={total_rows}, positives={total_pos})",
                  "selected_features": [], "n_folds": len(fold_data)}
        return result

    # ---- Stage 1: cluster correlated candidates (on pooled fold data) ----
    X_pool = pd.concat([X for X, _ in fold_data])
    clusters = _cluster_features(X_pool)
    n_clusters = len(set(clusters.values()))
    log(f"  Stage 1: {X_pool.shape[1]} candidates -> {n_clusters} correlation clusters "
        f"(|spearman| >= {CLUSTER_CORR_THRESHOLD} groups together)")

    # ---- Stage 2: per-fold importance, aggregated to cluster level ----
    fold_importances = []
    for (X, y), cutoff in zip(fold_data, cfg["snapshots"]):
        imp = _fold_importance(X, y)
        if imp is not None:
            fold_importances.append(imp)
    if not fold_importances:
        result = {"project_id": dataset.project_id, "goal": goal, "status": "INSUFFICIENT_DATA",
                  "selected_features": [], "n_folds": 0}
        return result

    imp_df = pd.concat(fold_importances, axis=1).fillna(0)
    imp_df.columns = [f"fold_{i}" for i in range(len(fold_importances))]
    imp_df["cluster"] = imp_df.index.map(clusters)

    cluster_fold = imp_df.groupby("cluster")[[c for c in imp_df.columns if c.startswith("fold_")]].sum()
    stable_clusters = cluster_fold[(cluster_fold >= MIN_CLUSTER_GAIN_SHARE).all(axis=1)].index
    log(f"  Stage 2: {len(stable_clusters)}/{n_clusters} clusters stable "
        f"(carry >={MIN_CLUSTER_GAIN_SHARE*100:.0f}% total gain in every fold)")

    # Rank features: only members of stable clusters, ordered by mean gain across folds.
    fold_cols = [c for c in imp_df.columns if c.startswith("fold_")]
    imp_df["mean_gain"] = imp_df[fold_cols].mean(axis=1)
    eligible = imp_df[imp_df["cluster"].isin(stable_clusters)].sort_values("mean_gain", ascending=False)
    ranked = eligible.index.tolist()
    log(f"  ranked pool: {len(ranked)} features from stable clusters")

    # ---- Stage 3: k-sweep on a BAND (customer-grouped CV) ----
    # [#1 BAND] Choose the feature COUNT robustly, not on a single lucky window:
    # score each top-k with GroupKFold(3)-BY-CUSTOMER over the pooled
    # folds+validation data, and AVERAGE the blended (0.5*global + 0.5*active)
    # score across the 3 held-out splits. Removes the single-validation-window
    # luck in the feature count. Leak-safe: the TEST cutoff is never touched, and
    # customers are grouped so none straddles train/held-out (no entity leak).
    log(f"  Stage 3: k-sweep via GroupKFold(3)-by-customer over folds+validation "
        f"(mean {SELECTION_TARGET} score over 3 held-out splits)...")
    X_val_full, y_val = _segment_filter(*_build_xy(dataset, goal, cfg["validation"], win), segment)
    X_all = pd.concat([X for X, _ in fold_data] + [X_val_full])
    y_all = pd.concat([y for _, y in fold_data] + [y_val])
    groups = X_all.index.to_numpy()
    splits = list(GroupKFold(n_splits=3).split(X_all, y_all, groups))

    sweep_results = []
    ks = sorted({k for k in K_SWEEP if k <= len(ranked)} | ({len(ranked)} if ranked else set()))
    for k in ks:
        feats = ranked[:k]
        blends, gs, a_s = [], [], []
        for tr_idx, va_idx in splits:
            Xtr, ytr = X_all.iloc[tr_idx], y_all.iloc[tr_idx]
            Xva, yva = X_all.iloc[va_idx], y_all.iloc[va_idx]
            spw = (ytr == 0).sum() / max((ytr == 1).sum(), 1)
            model = xgb.XGBClassifier(**XGB_PARAMS, scale_pos_weight=spw)
            model.fit(Xtr[feats], ytr)
            y_prob = model.predict_proba(Xva[feats])[:, 1]
            b, g, a = _blended_score(yva, y_prob, Xva["total_orders"] > 0)
            blends.append(b); gs.append(g); a_s.append(a)
        sweep_results.append({"k": k, "blended": float(np.mean(blends)),
                              "global_auc": float(np.mean(gs)), "active_auc": float(np.mean(a_s)),
                              "blended_std": float(np.std(blends))})
        log(f"    k={k:<3} {SELECTION_TARGET}={np.mean(blends):.4f}(+/-{np.std(blends):.4f})  "
            f"global={np.mean(gs):.4f}  active={np.mean(a_s):.4f}")

    best_r = max(sweep_results, key=lambda r: r["blended"])
    best = best_r["blended"]
    # Keep adding features while they measurably help; the band already de-noises
    # the estimate, so the fixed floor is the honest bar (smallest k within it).
    #
    # TESTED 2026-08-03 AND REVERTED: `_blended_tolerance` below computes a
    # Hanley-McNeil standard error per fold, so a small goal gets a bar matching its
    # real jitter instead of this flat 0.002. The diagnosis was right -- churn was
    # carrying 55 features on 5,123 rows and cart 30 on 2,235, and both improved
    # (churn +0.0096, cart active +0.0061) on a quarter of the features. But the bar
    # it produces is too wide: ALL FIVE goals collapsed to k=5, the floor of the
    # sweep, and repeat_purchase lost 0.0377 active AUC -- five times the noise band
    # and larger than every gain combined. A rule that returns the minimum whatever
    # the input is not measuring anything. Re-test when a second client exists; the
    # overfitting it found on the small goals is real and still unfixed.
    tolerance = K_TOLERANCE_FLOOR
    chosen = next(r for r in sweep_results if r["blended"] >= best - tolerance)
    selected = ranked[:chosen["k"]]
    log(f"  -> chose k={chosen["k"]} (mean-{SELECTION_TARGET}={chosen["blended"]:.4f}, "
        f"best={best:.4f}, tolerance={tolerance:.4f}, banded over 3 CV splits)")

    result = {
        "project_id": dataset.project_id,
        "goal": goal,
        "segment": segment,
        "method": "cluster_stability_v2",
        "n_candidates": int(X_pool.shape[1]),
        "n_clusters": int(n_clusters),
        "n_stable_clusters": int(len(stable_clusters)),
        "n_folds": len(fold_importances),
        "k_sweep": sweep_results,
        "chosen_k": chosen["k"],
        "k_tolerance_used": tolerance,
        "validation_global_auc": chosen["global_auc"],
        "validation_active_auc": chosen["active_auc"],
        "selected_features": selected,
        "ranked_pool": ranked,
        "cutoffs": cfg,
    }
    # returned, not written: the caller persists it beside the model version it
    # belongs to, so two projects can never contend over one file
    log(f"  selected {len(selected)} features")
    return result


