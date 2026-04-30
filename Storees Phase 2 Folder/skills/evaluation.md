# Skill: Evaluation

## When to Use
Invoke this skill when implementing evaluation functions, interpreting metrics, or setting thresholds.

## Metric Reference Table

| Model | Metric | Function | Range | Direction | Realistic Baseline | Good Target | Suspicious |
|---|---|---|---|---|---|---|---|
| Recommendations | NDCG@K | `evaluate_recommendation()` | 0.0–1.0 | Higher better | 0.03–0.05 (random) | 0.08–0.30 | >0.50 (likely leakage) |
| Propensity | AUC-ROC | `evaluate_propensity()` | 0.5–1.0 | Higher better | 0.50 (random) | 0.78–0.88 | >0.92 (likely leakage) |
| Affinity | Silhouette | `evaluate_clustering()` | -1.0–1.0 | Higher better | 0.10–0.15 (random) | 0.25–0.45 | >0.60 (overfit) |
| BTS | Negative MAE | `evaluate_bts()` | -24–0 | Higher better (less negative) | -5.0 (random) | -2.5 to -3.0 | >-1.0 (suspicious) |
| NBA | Cumulative Reward | `evaluate_nba()` | 0–∞ | Higher better | baseline (fixed action) | 15–30% above baseline | n/a |

## Secondary Metrics (Logged, Not Optimised)

| Metric | Function | When to Use | Red Flag |
|---|---|---|---|
| Precision@10% | `precision_at_k()` | Propensity models | <2x base rate (model is barely better than random for top decile) |
| Brier Score | `brier_score()` | Propensity models | >0.25 (poor calibration — scores are not reliable as probabilities) |
| Coverage | `coverage()` | Recommendation models | <20% (recommending same few items to everyone) |
| Diversity | `diversity()` | Recommendation models | Very low (all users get identical recommendations) |
| Adjusted Rand Index | `ari()` | Affinity clusters | <0.70 (clusters are unstable across random seeds) |

## NDCG@K Implementation Notes
- K should adapt to catalogue size: K=10 for large catalogues (ecommerce 1000+ items), K=5 for small (NBFC 15-40 items), K=3 for very small (SaaS 5-10 plans)
- Use binary relevance (1 if user interacted with item in val set, 0 otherwise) unless interaction weights are available
- If user has 0 interactions in val set, EXCLUDE from NDCG computation (don't count as 0)
- Ground truth = items the user ACTUALLY interacted with in the validation time window

## AUC-ROC Implementation Notes
- Use `sklearn.metrics.roc_auc_score(y_true, y_pred_proba)`
- If only one class in y_true (all positive or all negative), return 0.50 and log warning
- For class-imbalanced data, AUC-ROC is preferred over accuracy (accuracy is misleading when 95% are negative)
- Precision-Recall AUC (`average_precision_score`) is an alternative worth logging for highly imbalanced datasets

## Calibration Check
After AUC evaluation, also compute:
```python
from sklearn.metrics import brier_score_loss
brier = brier_score_loss(y_true, y_pred_proba)
# Good calibration: brier < 0.15
# Acceptable: brier < 0.25
# Poor: brier > 0.25
```

A model can have high AUC (good ranking) but poor calibration (absolute probabilities are meaningless). For Storees, calibration matters because the segment builder uses absolute thresholds ("propensity > 0.7").

## Minimum Data Gates

| Model | Minimum Requirement | What Happens Below |
|---|---|---|
| Co-occurrence | 500 sessions | `METRIC: INSUFFICIENT_DATA` |
| Collaborative Filtering | 10,000 interactions + 5,000 users | `METRIC: INSUFFICIENT_DATA` |
| Attribute-based | 1 item in catalogue | Always works |
| Trending | 100 interactions | `METRIC: INSUFFICIENT_DATA` |
| Propensity | 200 positive labels | `METRIC: INSUFFICIENT_DATA` |
| Affinity | 1,000 users with 14+ days activity | `METRIC: INSUFFICIENT_DATA` |
| BTS | 100 engagement events total | `METRIC: INSUFFICIENT_DATA` |
| NBA | 500 historical campaign outcomes | `METRIC: INSUFFICIENT_DATA` |

## Temporal Split Validation
After computing any metric, verify the split is temporal:
```python
assert data.events_train['created_at'].max() < data.events_val['created_at'].min(), \
    "TEMPORAL SPLIT VIOLATION: train data contains events after val data start"
```
This assertion must be in eval.py and run EVERY time.
