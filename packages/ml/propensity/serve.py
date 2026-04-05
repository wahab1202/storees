"""FastAPI scoring endpoint for propensity models.

Endpoints:
- POST /score         — Score a batch of customers for a goal
- GET  /health        — Health check
- GET  /models        — List available models
- POST /explain       — Get SHAP factors for a single customer
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import shap
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared.config import load_config
from shared.features import compute_features
from shared.feature_registry import get_domain_config

app = FastAPI(title="Storees ML Service", version="0.1.0")

# Model cache: goal_id -> (model, scaler, explainer, metadata)
_model_cache: dict[str, tuple] = {}


def _load_model(goal_id: str):
    """Load model artifacts from disk, cache in memory."""
    if goal_id in _model_cache:
        return _model_cache[goal_id]

    config = load_config()
    model_dir = Path(config.model_dir) / f"propensity_{goal_id}"

    if not model_dir.exists():
        raise HTTPException(status_code=404, detail=f"No model found for goal {goal_id}")

    model = joblib.load(model_dir / "model.joblib")
    scaler = joblib.load(model_dir / "scaler.joblib")
    explainer = joblib.load(model_dir / "explainer.joblib")

    with open(model_dir / "metadata.json") as f:
        metadata = json.load(f)

    _model_cache[goal_id] = (model, scaler, explainer, metadata)
    return _model_cache[goal_id]


class ScoreRequest(BaseModel):
    project_id: str
    goal_id: str
    customer_ids: list[str]
    observation_days: int = 90


class ScoreResult(BaseModel):
    customer_id: str
    score: float  # 0-100
    confidence: float  # 0-1
    bucket: str  # High / Medium / Low


class ScoreResponse(BaseModel):
    scores: list[ScoreResult]
    model_version: str
    computed_at: str


class ExplainRequest(BaseModel):
    project_id: str
    goal_id: str
    customer_id: str
    observation_days: int = 90


class Factor(BaseModel):
    feature: str
    value: float
    impact: float
    direction: str  # positive / negative
    label: str  # human-readable


class ExplainResponse(BaseModel):
    customer_id: str
    score: float
    confidence: float
    bucket: str
    factors: list[Factor]
    model_version: str


def _get_feature_labels(domain: str) -> dict[str, str]:
    """Get human-readable feature labels for the given domain."""
    domain_config = get_domain_config(domain)
    return domain_config.feature_labels


def _score_to_bucket(score: float) -> str:
    if score >= 70:
        return "High"
    elif score >= 40:
        return "Medium"
    return "Low"


@app.get("/health")
def health():
    return {"status": "ok", "service": "storees-ml", "timestamp": datetime.utcnow().isoformat()}


@app.get("/models")
def list_models():
    config = load_config()
    model_dir = Path(config.model_dir)
    if not model_dir.exists():
        return {"models": []}

    models = []
    for d in model_dir.iterdir():
        if d.is_dir() and d.name.startswith("propensity_"):
            meta_path = d / "metadata.json"
            if meta_path.exists():
                with open(meta_path) as f:
                    meta = json.load(f)
                models.append({
                    "goal_id": meta["goal_id"],
                    "model_version": meta["model_version"],
                    "auc": meta["auc"],
                    "trained_at": meta["trained_at"],
                })

    return {"models": models}


class TrainRequest(BaseModel):
    project_id: str
    goal_id: str
    target_event: str
    observation_days: int = 90
    prediction_days: int = 14
    domain: str = "ecommerce"


class TrainResponse(BaseModel):
    status: str  # success / failed / insufficient_data
    auc: float = 0.0
    baseline_auc: float = 0.0
    model_lift_over_baseline: float = 0.0
    model_version: str = ""
    warning: str | None = None
    reason: str | None = None


@app.post("/train", response_model=TrainResponse)
def train_model(req: TrainRequest):
    """Train a propensity model for a prediction goal."""
    from propensity.train_propensity import train

    result = train(
        project_id=req.project_id,
        goal_id=req.goal_id,
        target_event=req.target_event,
        observation_days=req.observation_days,
        prediction_days=req.prediction_days,
        domain=req.domain,
    )

    # Clear model cache so next score request loads the new model
    _model_cache.pop(req.goal_id, None)

    return TrainResponse(
        status=result.get("status", "failed"),
        auc=result.get("auc", 0),
        baseline_auc=result.get("baseline_auc", 0),
        model_lift_over_baseline=result.get("model_lift_over_baseline", 0),
        model_version=result.get("model_version", ""),
        warning=result.get("warning"),
        reason=result.get("reason"),
    )


@app.post("/score", response_model=ScoreResponse)
def score_customers(req: ScoreRequest):
    model, scaler, _, metadata = _load_model(req.goal_id)
    config = load_config()

    cutoff = datetime.utcnow()
    from datetime import timedelta
    obs_start = cutoff - timedelta(days=req.observation_days)

    domain = metadata.get("domain", "ecommerce")
    features = compute_features(config, req.project_id, req.customer_ids, obs_start, cutoff, domain=domain)

    if features.empty:
        return ScoreResponse(scores=[], model_version=metadata["model_version"], computed_at=cutoff.isoformat())

    # Align feature columns with training
    expected_cols = metadata["feature_names"]
    for col in expected_cols:
        if col not in features.columns:
            features[col] = 0
    features = features[expected_cols]

    X = scaler.transform(features.values)
    probs = model.predict_proba(X)[:, 1]

    scores = []
    for cid, prob in zip(features.index, probs):
        score_100 = round(float(prob) * 100, 1)
        scores.append(ScoreResult(
            customer_id=str(cid),
            score=score_100,
            confidence=round(min(float(prob), 1 - float(prob)) * 2, 3),  # higher near 0.5 = less confident
            bucket=_score_to_bucket(score_100),
        ))

    return ScoreResponse(
        scores=scores,
        model_version=metadata["model_version"],
        computed_at=cutoff.isoformat(),
    )


@app.post("/explain", response_model=ExplainResponse)
def explain_customer(req: ExplainRequest):
    model, scaler, explainer, metadata = _load_model(req.goal_id)
    config = load_config()

    cutoff = datetime.utcnow()
    from datetime import timedelta
    obs_start = cutoff - timedelta(days=req.observation_days)

    domain = metadata.get("domain", "ecommerce")
    features = compute_features(config, req.project_id, [req.customer_id], obs_start, cutoff, domain=domain)

    if features.empty:
        raise HTTPException(status_code=404, detail="No data found for customer")

    expected_cols = metadata["feature_names"]
    for col in expected_cols:
        if col not in features.columns:
            features[col] = 0
    features = features[expected_cols]

    X = scaler.transform(features.values)
    prob = float(model.predict_proba(X)[:, 1][0])
    score_100 = round(prob * 100, 1)

    # SHAP explanation
    shap_values = explainer.shap_values(X)[0]

    feature_labels = _get_feature_labels(domain)
    factors = []
    for feat_name, shap_val, feat_val in sorted(
        zip(expected_cols, shap_values, X[0]),
        key=lambda x: abs(x[1]),
        reverse=True,
    )[:10]:
        factors.append(Factor(
            feature=feat_name,
            value=round(float(feat_val), 2),
            impact=round(float(abs(shap_val)), 4),
            direction="positive" if shap_val > 0 else "negative",
            label=feature_labels.get(feat_name, feat_name.replace("_", " ").title()),
        ))

    return ExplainResponse(
        customer_id=req.customer_id,
        score=score_100,
        confidence=round(min(prob, 1 - prob) * 2, 3),
        bucket=_score_to_bucket(score_100),
        factors=factors,
        model_version=metadata["model_version"],
    )
