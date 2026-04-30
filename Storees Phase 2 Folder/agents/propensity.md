# Agent: Propensity

## Identity
You build the generic propensity scoring engine. This is commercially the most important model — banks and NBFCs buy engagement platforms primarily for propensity scoring. Your model must be production-grade, well-calibrated, and explainable.

## Ownership
```
packages/ml/propensity/
├── train_propensity.py      ← You build this (autoresearch editable)
├── program_propensity.md    ← Human writes, you reference
├── serve.py                 ← You build the scoring API
└── __init__.py
```

## What You Build

### train_propensity.py
- Loads user features via `shared.features.extract_features()`
- Loads labels via `shared.prepare` for a specific Prediction Goal
- Configuration block at top:
  - MODEL_TYPE: xgboost, lightgbm, logistic, random_forest, catboost
  - XGBoost params: N_ESTIMATORS, MAX_DEPTH, LEARNING_RATE, MIN_CHILD_WEIGHT, SUBSAMPLE, COLSAMPLE_BYTREE, GAMMA, REG_ALPHA, REG_LAMBDA, SCALE_POS_WEIGHT
  - Feature engineering: FEATURE_SELECTION_METHOD (all/top_20/rfe/boruta/mutual_info), FEATURE_INTERACTIONS, LOG_TRANSFORM_SKEWED, CLIP_OUTLIERS, STANDARDIZE, BINNING_STRATEGY
  - Training: CLASS_WEIGHT_METHOD (balanced/sqrt/none/smote), VALIDATION_STRATEGY (temporal/stratified_kfold_5), THRESHOLD_OPTIMIZATION, CALIBRATION (none/platt/isotonic)
- Trains the model, predicts on validation set
- Prints `METRIC: <AUC-ROC value>`
- Also logs (but does NOT optimise against):
  - Precision@10%
  - Brier Score
  - Feature importance top 10
- **Minimum data gate**: if <200 positive labels, print `METRIC: INSUFFICIENT_DATA` and exit
- **Leakage detection**: if AUC > 0.92, print `WARNING: AUC suspiciously high — possible data leakage` to stderr
- Must complete in <60 seconds on CPU
- Saves: trained model pickle, feature importance dict, threshold value, calibration model (if used)

### serve.py — Scoring API
- FastAPI endpoint: `POST /v1/propensity/score`
- Input: `{ user_ids: string[], goal_name: string }`
- Output: `{ scores: [{ user_id, score: float, bucket: "High"|"Medium"|"Low", top_features: [{name, contribution, direction}] }] }`
- Loads trained model from `models/propensity/<goal_name>/latest/`
- Computes feature values in real-time for requested users OR reads from feature cache
- Bucket thresholds: High = top 20%, Medium = middle 50%, Low = bottom 30% (configurable per goal)
- Explainability: uses XGBoost `predict(pred_contribs=True)` or SHAP TreeExplainer for top 5 per-user feature contributions
- Batch scoring endpoint: `POST /v1/propensity/score-all` — scores all users for a goal, writes to `user_properties` table

### Prediction Goal Integration
- The tenant creates Prediction Goals through the UI (or wizard pre-fills them)
- Each goal is stored in the DB with: name, target_event, observation_window_days, prediction_window_days, min_positive_labels
- Your `train_propensity.py` reads the goal config via `shared.config.load_tenant_config()`
- The training pipeline is goal-agnostic: it works identically for "propensity to convert", "propensity to churn", "propensity to cross-sell", etc. The goal config tells it what event = positive label and what time window to use.

## Dependencies
```python
from shared.prepare import load_data, get_train_val_split
from shared.features import extract_features
from shared.eval import evaluate_propensity
from shared.config import load_tenant_config
```

## Autoresearch Rules
- Only `train_propensity.py` is modified by the autoresearch agent
- serve.py is FIXED
- The agent may change: model type, all hyperparameters, feature engineering steps, class balancing, calibration method, threshold optimization
- The agent may NOT change: feature extraction logic (that's in shared/features.py), data loading, evaluation function, temporal split
- Brier Score >0.25 should be flagged in the experiment log even if AUC improved

## Quality Bar
- Calibrated probabilities: output scores must be meaningful as probabilities (not just rankings). A score of 0.8 should mean ~80% chance of the event occurring.
- Explainability is not optional. Every scored user gets top 5 feature contributions.
- Handle class imbalance properly. Default rate for EMI default is ~5-10%. For cross-sell it might be ~3-5%. The model must handle this without collapsing to "predict all negative."
- Feature importance output must use feature NAMES not indices. The UI will show "8 product views in last 7 days", not "feature_12 = 3.2".
