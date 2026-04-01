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
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared.config import load_config
from shared.prepare import extract_training_data, temporal_split
from shared.eval import evaluate


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

    model = xgb.XGBClassifier(**params)
    model.fit(
        X_train_scaled, y_train,
        eval_set=[(X_val_scaled, y_val)],
        verbose=False,
    )

    # Evaluate with baseline comparison
    y_prob = model.predict_proba(X_val_scaled)[:, 1]
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

    # Compute SHAP values for global feature importance
    feature_names = list(X_train.columns)
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_val_scaled[:min(500, len(X_val_scaled))])

    global_importance = np.abs(shap_values).mean(axis=0)
    feature_ranking = sorted(
        zip(feature_names, global_importance.tolist()),
        key=lambda x: x[1],
        reverse=True,
    )

    # Save model artifacts
    model_version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    model_dir = Path(config.model_dir) / f"propensity_{goal_id}"
    model_dir.mkdir(parents=True, exist_ok=True)

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

    print(f"[train] Model saved to {model_dir}, version={model_version}")

    return {
        "status": "success",
        "model_version": model_version,
        "auc": eval_result.auc,
        "baseline_auc": eval_result.baseline_auc,
        "model_lift_over_baseline": eval_result.model_lift_over_baseline,
        "brier": eval_result.brier,
        "validation_method": validation_method,
        "feature_ranking": feature_ranking[:10],
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
