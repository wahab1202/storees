"""Evaluation harness for ML models.
FROZEN infrastructure — do not modify without hash update.

Metrics:
- AUC-ROC: discrimination quality
- Brier score: calibration quality
- Precision/Recall at thresholds
- Lift over baseline (naive recency predictor)
- Coverage: % of population scored

Guardrails:
- Hard ceiling (0.999): almost certainly data leakage
- No-lift check: model must beat naive baseline by 2%+ AUC
- Soft warning (>0.95): flags cycle detection but allows training
- Coverage minimum: model must score enough of the population
- Calibration check: Brier score must be reasonable
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
from sklearn.metrics import (
    roc_auc_score,
    brier_score_loss,
    precision_score,
    recall_score,
    f1_score,
    log_loss,
)


@dataclass
class EvalResult:
    auc: float
    brier: float
    precision: float
    recall: float
    f1: float
    logloss: float
    lift_at_10pct: float
    coverage: float
    n_positive: int
    n_negative: int
    passed: bool
    failure_reason: str | None
    baseline_auc: float = 0.0
    model_lift_over_baseline: float = 0.0
    warning: str | None = None


def evaluate(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    baseline_prob: Optional[np.ndarray] = None,
    max_auc: float = 0.98,
    min_coverage: float = 0.20,
    max_brier: float = 0.25,
    min_positive: int = 200,
) -> EvalResult:
    """Run full evaluation suite with guardrails and baseline comparison."""
    n_positive = int(y_true.sum())
    n_negative = int(len(y_true) - n_positive)
    coverage = float(len(y_prob[y_prob > 0.01])) / max(len(y_prob), 1)

    # Insufficient data check
    if n_positive < min_positive:
        return EvalResult(
            auc=0, brier=1, precision=0, recall=0, f1=0, logloss=1,
            lift_at_10pct=0, coverage=coverage,
            n_positive=n_positive, n_negative=n_negative,
            passed=False, failure_reason=f"INSUFFICIENT_DATA: {n_positive} < {min_positive} positive labels",
        )

    auc = roc_auc_score(y_true, y_prob)
    brier = brier_score_loss(y_true, y_prob)
    ll = log_loss(y_true, y_prob)

    # Threshold at 0.5 for classification metrics
    y_pred = (y_prob >= 0.5).astype(int)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1_val = f1_score(y_true, y_pred, zero_division=0)

    # Lift at top 10%
    top_10_idx = np.argsort(-y_prob)[: max(int(len(y_prob) * 0.1), 1)]
    top_10_rate = y_true[top_10_idx].mean()
    base_rate = y_true.mean() if y_true.mean() > 0 else 1e-6
    lift = top_10_rate / base_rate

    # Baseline AUC (naive recency-based predictor)
    baseline_auc = 0.0
    model_lift = 0.0
    if baseline_prob is not None:
        try:
            baseline_auc = roc_auc_score(y_true, baseline_prob)
            model_lift = auc - baseline_auc
        except ValueError:
            pass

    # ---- GUARDRAILS ----
    passed = True
    failure_reason = None
    warning = None

    if auc > max_auc:
        # Hard ceiling — near-perfect separation is almost always leakage
        passed = False
        diag = f"baseline_auc={baseline_auc:.4f}" if baseline_auc > 0 else "no baseline"
        failure_reason = f"DATA_LEAKAGE: AUC {auc:.4f} > {max_auc} ({diag}). Near-perfect separation indicates feature leakage or evaluation error."
    elif baseline_auc > 0 and model_lift < 0.02:
        # Model doesn't meaningfully beat naive baseline
        passed = False
        failure_reason = (
            f"NO_LIFT: model AUC {auc:.4f} vs baseline {baseline_auc:.4f} "
            f"(lift={model_lift:+.4f}). Model not adding value over simple recency rule."
        )
    elif coverage < min_coverage:
        passed = False
        failure_reason = f"LOW_COVERAGE: {coverage:.2%} < {min_coverage:.0%}"
    elif brier > max_brier:
        passed = False
        failure_reason = f"POOR_CALIBRATION: Brier {brier:.4f} > {max_brier}"

    # Tiered warnings for high AUC
    if passed and auc > 0.95:
        # Strong warning: cycle dominance — model works but is mostly recency
        warning = (
            f"CYCLE_DOMINATED: AUC {auc:.4f} — model is primarily detecting behavioral cycles, not predicting intent. "
            f"Baseline AUC={baseline_auc:.4f}, model adds +{model_lift:.4f}. "
            f"Scores reflect routine patterns. Consider this a reorder intelligence engine, not a prediction model."
        )
    elif passed and auc > 0.90:
        # Soft warning: suspiciously high — worth investigating
        warning = (
            f"HIGH_AUC: {auc:.4f} — unusually high discrimination. "
            f"Baseline AUC={baseline_auc:.4f}, model adds +{model_lift:.4f}. "
            f"Verify features aren't proxying the label."
        )

    return EvalResult(
        auc=auc,
        brier=brier,
        precision=prec,
        recall=rec,
        f1=f1_val,
        logloss=ll,
        lift_at_10pct=lift,
        coverage=coverage,
        n_positive=n_positive,
        n_negative=n_negative,
        passed=passed,
        failure_reason=failure_reason,
        baseline_auc=baseline_auc,
        model_lift_over_baseline=model_lift,
        warning=warning,
    )
