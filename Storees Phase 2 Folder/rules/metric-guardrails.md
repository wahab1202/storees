# Rule: Metric Guardrails

## Applies To
All `train_*.py` files and the autoresearch runner

## Guardrails

### Propensity Models
- AUC-ROC > 0.92 → RED FLAG. Log `WARNING: suspiciously high AUC`. Investigate for data leakage before accepting.
- Brier Score > 0.25 → FLAG. Model has good ranking but poor calibration. Scores are unreliable as absolute probabilities.
- Precision@10% < 2× base rate → the model is barely useful. A model that can't at least double the base rate in the top decile isn't adding enough value.

### Recommendation Models
- Coverage < 20% → AUTO-REJECT. The model is recommending the same few popular items to everyone. This is worse than random for user experience.
- NDCG@K > 0.50 for sparse catalogues → suspicious. Check for leakage or evaluation bugs.

### Affinity Clusters
- Silhouette < 0.20 → clusters are too overlapping to be useful. Do not surface to users.
- Stability (ARI) < 0.70 → clusters change on different random seeds. Not reliable enough for production targeting.
- 0 interpretable clusters (no feature with |z-score| > 1.0) → clustering found no meaningful patterns. Report honestly.

### BTS
- Improvement over fixed-time < 5% open rate uplift → BTS adds insufficient value. Recommend fixed-time sending instead.

### General
- METRIC: INSUFFICIENT_DATA → SKIP, not fail. Log and continue.
- METRIC: ERROR → FAIL. Revert the change. Log the error.
- Training timeout → FAIL. Revert. The agent made the model too complex.
