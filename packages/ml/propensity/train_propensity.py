"""Propensity model training — AUTORESEARCH EDITABLE.

This file trains an XGBoost classifier for propensity scoring.
Autoresearch can modify hyperparameters, feature selection, and
preprocessing, but NOT the evaluation harness or data preparation.

Validation strategy: Walk-forward (out-of-time)
- Training data:   features from [obs_start_t, cutoff_t], labels from [cutoff_t, cutoff_t + pred]
- Validation data:  features from [obs_start_v, cutoff_v], labels from [cutoff_v, cutoff_v + pred]
- No overlap between training and validation prediction windows.
- Falls back to random split if validation window has insufficient data.

Usage:
    python -m propensity.train_propensity --project-id <UUID> --goal-id <UUID>
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared.config import load_config
from shared.prepare import extract_training_data, temporal_split
from shared.eval import evaluate
from sqlalchemy import create_engine, text


def _compute_segment_metrics(
    database_url: str,
    project_id: str,
    val_customer_ids: list[str],
    y_val: np.ndarray,
    y_prob: np.ndarray,
    overall_auc: float,
) -> list[dict]:
    """Slice the val set by customer attributes (returning/new, region, dealer)
    and compute AUC per segment so the UI can surface 'this model is great
    overall but useless on new customers' situations.

    Each segment needs ≥30 rows AND ≥5 positive labels to report — AUC on
    smaller slices is too noisy to be meaningful.
    """
    if len(val_customer_ids) == 0:
        return []

    engine = create_engine(database_url)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
              c.id::text          AS customer_id,
              c.total_orders      AS total_orders,
              c.region            AS region,
              c.agent_id::text    AS agent_id,
              COALESCE(a.name, '') AS agent_name
            FROM customers c
            LEFT JOIN agents a ON a.id = c.agent_id
            WHERE c.project_id = :project_id
              AND c.id = ANY(CAST(:ids AS uuid[]))
        """), {"project_id": project_id, "ids": val_customer_ids}).fetchall()

    if not rows:
        return []

    attrs = pd.DataFrame(rows, columns=["customer_id", "total_orders", "region", "agent_id", "agent_name"])
    attrs = attrs.set_index("customer_id")
    # Align with val DataFrame ordering
    aligned = attrs.reindex([str(cid) for cid in val_customer_ids])

    def _seg_auc(mask: np.ndarray, label: str, segment_type: str, segment_value: str | None) -> dict | None:
        n = int(mask.sum())
        if n < 30:
            return None
        y_t = y_val[mask]
        y_p = y_prob[mask]
        n_pos = int(y_t.sum())
        if n_pos < 5 or n_pos == n:
            return None  # AUC undefined when all labels are one class
        try:
            seg_auc = float(roc_auc_score(y_t, y_p))
        except ValueError:
            return None
        return {
            "segment_type": segment_type,
            "segment_value": segment_value,
            "segment_label": label,
            "n": n,
            "n_positive": n_pos,
            "auc": seg_auc,
            "delta_vs_overall": seg_auc - overall_auc,
        }

    segments: list[dict] = []

    # Returning vs new — most universal cut
    is_returning = (aligned["total_orders"].fillna(0).astype(float) >= 2).values
    for seg in [
        _seg_auc(is_returning, "Returning customers", "behaviour", "returning"),
        _seg_auc(~is_returning, "New customers", "behaviour", "new"),
    ]:
        if seg: segments.append(seg)

    # Top 5 regions by population in val
    region_counts = aligned["region"].value_counts().dropna().head(5)
    for region, _count in region_counts.items():
        if not region:
            continue
        mask = (aligned["region"] == region).values
        seg = _seg_auc(mask, str(region), "region", str(region))
        if seg: segments.append(seg)

    # Top 5 dealers by population in val (B2B projects only)
    dealer_counts = aligned[aligned["agent_id"].notna() & (aligned["agent_id"] != "None")]["agent_id"].value_counts().head(5)
    for agent_id, _count in dealer_counts.items():
        if not agent_id:
            continue
        mask = (aligned["agent_id"] == agent_id).values
        # Pull the human name once
        label = aligned[mask]["agent_name"].iloc[0] if mask.any() else str(agent_id)
        seg = _seg_auc(mask, str(label) or str(agent_id), "dealer", str(agent_id))
        if seg: segments.append(seg)

    return segments


def _compute_naive_baseline(val_features: pd.DataFrame, target_event: str) -> np.ndarray | None:
    """Compute naive baseline probability using simple recency rule.

    For conversion targets: inverse of days_since_last_purchase (recently ordered → will order again)
    For churn/dormancy targets: days_since_last_event (inactive → will churn)

    Returns None if the required feature is not available.
    """
    target_lower = target_event.lower()
    is_churn_like = any(k in target_lower for k in (
        "churn", "dormancy", "dormant", "cancel", "default", "missed", "expired",
    ))

    if is_churn_like:
        col_name = "days_since_last_event"
        if col_name not in val_features.columns:
            return None
        col = val_features[col_name].values.astype(float)
        max_val = col.max()
        if max_val <= 0:
            return None
        return col / max_val  # Higher days since → more likely to churn
    else:
        col_name = "days_since_last_purchase"
        if col_name not in val_features.columns:
            return None
        col = val_features[col_name].values.astype(float)
        max_val = col.max()
        if max_val <= 0:
            return None
        return 1.0 - (col / max_val)  # Lower days since → more likely to convert


def train(project_id: str, goal_id: str, target_event: str,
          observation_days: int = 90, prediction_days: int = 14,
          domain: str = "ecommerce") -> dict:
    """Train propensity model with walk-forward temporal validation."""
    config = load_config()
    start_time = time.time()

    # ---- WALK-FORWARD TEMPORAL VALIDATION ----
    # Train: observation ends at cutoff_train, prediction window = [cutoff_train, cutoff_train + pred_days]
    # Val:   observation ends at cutoff_val,   prediction window = [cutoff_val, cutoff_val + pred_days]
    # Prediction windows do NOT overlap.
    cutoff_val = datetime.utcnow() - timedelta(days=prediction_days)
    cutoff_train = cutoff_val - timedelta(days=prediction_days)

    print(f"[train] Walk-forward validation (out-of-time):")
    print(f"[train]   Train cutoff: {cutoff_train.date()} (pred window → {(cutoff_train + timedelta(days=prediction_days)).date()})")
    print(f"[train]   Val cutoff:   {cutoff_val.date()} (pred window → {(cutoff_val + timedelta(days=prediction_days)).date()})")
    print(f"[train]   Obs window:   {observation_days}d, Pred window: {prediction_days}d")

    # Extract training data
    print(f"[train] Extracting training data for project={project_id}, target={target_event}, domain={domain}")
    train_features, train_labels = extract_training_data(
        config, project_id, target_event,
        observation_days=observation_days,
        prediction_days=prediction_days,
        cutoff_date=cutoff_train,
        domain=domain,
    )

    if train_features.empty or train_labels.sum() < config.min_positive_labels:
        return {
            "status": "insufficient_data",
            "n_positive": int(train_labels.sum()) if not train_labels.empty else 0,
            "min_required": config.min_positive_labels,
        }

    # Extract validation data (shifted forward — non-overlapping prediction window)
    print(f"[train] Extracting validation data (out-of-time)...")
    val_features, val_labels = extract_training_data(
        config, project_id, target_event,
        observation_days=observation_days,
        prediction_days=prediction_days,
        cutoff_date=cutoff_val,
        domain=domain,
    )

    val_min_positive = max(int(config.min_positive_labels * 0.2), 5)
    validation_method = "walk_forward"

    if val_features.empty or val_labels.sum() < val_min_positive:
        val_pos = int(val_labels.sum()) if not val_labels.empty else 0
        print(f"[train] Val window insufficient ({val_pos} positives < {val_min_positive}), falling back to random split")
        X_train, y_train, X_val, y_val = temporal_split(train_features, train_labels)
        val_features_unscaled = X_val  # Keep reference for baseline
        validation_method = "random_fallback"
    else:
        # Align feature columns (both use same domain, should match)
        train_cols = set(train_features.columns)
        val_cols = set(val_features.columns)
        common_cols = sorted(train_cols & val_cols)

        if len(common_cols) < len(train_cols):
            missing = train_cols - val_cols
            print(f"[train] Warning: val missing {len(missing)} columns: {missing}")

        X_train = train_features[common_cols]
        y_train = train_labels
        X_val = val_features[common_cols]
        y_val = val_labels
        val_features_unscaled = X_val  # Keep reference for baseline

    print(f"[train] Train: {len(X_train)} samples, {int(y_train.sum())} positive ({y_train.mean()*100:.1f}%)")
    print(f"[train] Val:   {len(X_val)} samples, {int(y_val.sum())} positive ({y_val.mean()*100:.1f}%)")
    print(f"[train] Validation: {validation_method}, {len(X_train.columns)} features")

    # Compute naive baseline BEFORE scaling (needs original feature values)
    baseline_prob = _compute_naive_baseline(val_features_unscaled, target_event)
    if baseline_prob is not None:
        try:
            bl_auc = roc_auc_score(y_val.values, baseline_prob)
            print(f"[train] Naive baseline AUC: {bl_auc:.4f} (recency-only)")
        except ValueError:
            baseline_prob = None

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)

    # ---- AUTORESEARCH EDITABLE SECTION ----
    # Hyperparameters (autoresearch may modify these)
    params = {
        "n_estimators": 300,
        "max_depth": 5,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 5,
        "scale_pos_weight": float((y_train == 0).sum() / max((y_train == 1).sum(), 1)),
        "eval_metric": "auc",
        "random_state": 42,
        "n_jobs": -1,
    }
    # ---- END AUTORESEARCH EDITABLE SECTION ----

    # Hold out the temporally-most-recent 20% of train as a calibration set.
    # Isotonic calibration on top of XGBoost maps raw probabilities → empirically
    # accurate ones, so a "78%" score actually corresponds to ~78% conversion
    # in reality (Brier-tight). Falls back to uncalibrated when the cal slice
    # is too small or has too few positives — isotonic needs both.
    cal_size = max(int(len(X_train_scaled) * 0.2), 50)
    n_cal_positive = int(y_train.iloc[-cal_size:].sum()) if cal_size < len(X_train_scaled) else 0
    can_calibrate = cal_size < len(X_train_scaled) and n_cal_positive >= 10

    raw_model = xgb.XGBClassifier(**params)
    calibrated_model = None
    brier_before: float | None = None
    brier_after: float | None = None

    # Calibration is best-effort: if anything in the held-out / isotonic
    # flow throws (rare class imbalance in the cal slice, sklearn version
    # mismatch, etc.), fall back to the raw model rather than failing
    # the whole train.
    if can_calibrate:
        try:
            X_fit = X_train_scaled[:-cal_size]
            X_cal = X_train_scaled[-cal_size:]
            y_fit = y_train.iloc[:-cal_size]
            y_cal = y_train.iloc[-cal_size:]

            raw_model.fit(X_fit, y_fit, eval_set=[(X_cal, y_cal)], verbose=False)
            brier_before = float(brier_score_loss(y_val.values, raw_model.predict_proba(X_val_scaled)[:, 1]))

            # cv='prefit' tells the calibrator NOT to refit the estimator —
            # the held-out cal slice supplies the calibration mapping.
            calibrated_model = CalibratedClassifierCV(raw_model, method='isotonic', cv='prefit')
            calibrated_model.fit(X_cal, y_cal)

            y_prob = calibrated_model.predict_proba(X_val_scaled)[:, 1]
            brier_after = float(brier_score_loss(y_val.values, y_prob))
            print(f"[train] Calibration: Brier {brier_before:.4f} → {brier_after:.4f} "
                  f"({'improved' if brier_after < brier_before else 'kept'}, cal_n={cal_size}, cal_pos={n_cal_positive})")
        except Exception as e:
            print(f"[train] Calibration failed ({type(e).__name__}: {e}); falling back to raw model")
            calibrated_model = None
            brier_before = None
            brier_after = None
            # If the calibration path got partway, raw_model may already be
            # fitted on the 80% slice. Re-fit on the full train so the raw
            # path doesn't have stale state.
            raw_model = xgb.XGBClassifier(**params)
            raw_model.fit(X_train_scaled, y_train, eval_set=[(X_val_scaled, y_val)], verbose=False)
            y_prob = raw_model.predict_proba(X_val_scaled)[:, 1]
    else:
        print(f"[train] Skipping calibration (cal_size={cal_size}, cal_pos={n_cal_positive} < 10) — using raw probabilities")
        raw_model.fit(X_train_scaled, y_train, eval_set=[(X_val_scaled, y_val)], verbose=False)
        y_prob = raw_model.predict_proba(X_val_scaled)[:, 1]

    # model used for serving (calibrated when possible, raw otherwise);
    # SHAP always uses the raw XGBoost — the tree explainer can't traverse
    # CalibratedClassifierCV.
    model = calibrated_model if calibrated_model is not None else raw_model

    # Evaluate with baseline comparison
    eval_result = evaluate(
        y_val.values, y_prob,
        baseline_prob=baseline_prob,
        max_auc=config.max_auc_threshold,
        min_positive=val_min_positive,
    )

    print(f"[train] Model AUC={eval_result.auc:.4f}, Baseline AUC={eval_result.baseline_auc:.4f}, "
          f"Lift over baseline={eval_result.model_lift_over_baseline:+.4f}")
    print(f"[train] Brier={eval_result.brier:.4f}, Lift@10%={eval_result.lift_at_10pct:.2f}, Passed={eval_result.passed}")

    if eval_result.warning:
        print(f"[train] WARNING: {eval_result.warning}")

    if not eval_result.passed:
        print(f"[train] FAILED: {eval_result.failure_reason}")
        return {
            "status": "failed",
            "reason": eval_result.failure_reason,
            "auc": eval_result.auc,
            "baseline_auc": eval_result.baseline_auc,
            "model_lift_over_baseline": eval_result.model_lift_over_baseline,
            "validation_method": validation_method,
        }

    # Per-segment AUC breakdown — surfaces cohorts where the model performs
    # noticeably better or worse than overall. Treated as best-effort: if the
    # DB lookup or any segment metric blows up, we log + ship without it.
    segment_metrics: list[dict] = []
    try:
        val_ids = list(X_val.index)
        segment_metrics = _compute_segment_metrics(
            config.database_url,
            project_id,
            val_ids,
            y_val.values,
            y_prob,
            eval_result.auc,
        )
        if segment_metrics:
            print(f"[train] Computed {len(segment_metrics)} segment metrics")
    except Exception as e:
        print(f"[train] Segment metrics failed (non-fatal): {e}")

    # Compute SHAP values for global feature importance. TreeExplainer needs
    # the raw XGBoost; the calibration wrapper isn't a tree model.
    feature_names = list(X_train.columns)
    explainer = shap.TreeExplainer(raw_model)
    shap_values = explainer.shap_values(X_val_scaled[:min(500, len(X_val_scaled))])

    global_importance = np.abs(shap_values).mean(axis=0)
    feature_ranking = sorted(
        zip(feature_names, global_importance.tolist()),
        key=lambda x: x[1],
        reverse=True,
    )

    # Save model artifacts. We keep a per-version snapshot under versions/
    # so promote/rollback can swap by copying — the live model.joblib is
    # always whatever was last trained or last promoted to.
    model_version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    model_dir = Path(config.model_dir) / f"propensity_{goal_id}"
    versions_dir = model_dir / "versions"
    versions_dir.mkdir(parents=True, exist_ok=True)

    # Versioned snapshot (immutable record of every successful train)
    joblib.dump(model, versions_dir / f"model_{model_version}.joblib")
    joblib.dump(scaler, versions_dir / f"scaler_{model_version}.joblib")
    joblib.dump(explainer, versions_dir / f"explainer_{model_version}.joblib")

    # Live pointer — what serve.py loads. Overwritten on every train so the
    # latest model is the default-active one until someone Promotes another.
    joblib.dump(model, model_dir / "model.joblib")
    joblib.dump(scaler, model_dir / "scaler.joblib")
    joblib.dump(explainer, model_dir / "explainer.joblib")

    metadata = {
        "goal_id": goal_id,
        "project_id": project_id,
        "target_event": target_event,
        "domain": domain,
        "model_version": model_version,
        "feature_names": feature_names,
        "feature_ranking": feature_ranking[:20],
        "auc": eval_result.auc,
        "baseline_auc": eval_result.baseline_auc,
        "model_lift_over_baseline": eval_result.model_lift_over_baseline,
        "brier": eval_result.brier,
        "precision": eval_result.precision,
        "recall": eval_result.recall,
        "f1": eval_result.f1,
        "lift_at_10pct": eval_result.lift_at_10pct,
        "n_train": len(X_train),
        "n_val": len(X_val),
        "n_positive": eval_result.n_positive,
        "n_features": len(feature_names),
        "validation_method": validation_method,
        "warning": eval_result.warning,
        "training_time_seconds": round(time.time() - start_time, 1),
        "trained_at": datetime.utcnow().isoformat(),
    }

    with open(model_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    # Per-version metadata snapshot for the promote/rollback flow.
    with open(versions_dir / f"metadata_{model_version}.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"[train] Model saved to {model_dir}, version={model_version}")

    return {
        "status": "success",
        "model_version": model_version,
        "auc": eval_result.auc,
        "baseline_auc": eval_result.baseline_auc,
        "model_lift_over_baseline": eval_result.model_lift_over_baseline,
        "brier": eval_result.brier,
        "brier_before_calibration": brier_before,
        "brier_after_calibration": brier_after,
        "calibrated": calibrated_model is not None,
        "validation_method": validation_method,
        "feature_ranking": feature_ranking[:10],
        "segment_metrics": segment_metrics,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--goal-id", required=True)
    parser.add_argument("--target-event", required=True)
    parser.add_argument("--observation-days", type=int, default=90)
    parser.add_argument("--prediction-days", type=int, default=14)
    parser.add_argument("--domain", default="ecommerce", choices=["ecommerce", "fintech", "saas", "edtech"])
    args = parser.parse_args()

    result = train(
        args.project_id, args.goal_id, args.target_event,
        args.observation_days, args.prediction_days,
        domain=args.domain,
    )
    print(json.dumps(result, indent=2))
