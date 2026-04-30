# Rule: Temporal Split

## Applies To
All files in `packages/ml/`

## The Rule
Data splits MUST be temporal. Train on past, validate on future. NEVER split randomly.

## Why
Random splits cause data leakage — the model sees future user behaviour during training and produces artificially inflated metrics. A model with AUC 0.95 on random split might be AUC 0.72 in production.

## How to Verify
```python
assert events_train['created_at'].max() < events_val['created_at'].min()
```
This assertion must run in EVERY evaluation. No exceptions.

## Feature Cutoff
When computing features for validation users, use ONLY data before the split date:
```python
features = extract_features(events, interactions, cutoff_date=split_date)
```
NEVER compute a feature like "days_since_last_event" using the user's most recent event if that event is in the validation window.

## Violation Indicators
- AUC-ROC > 0.92 on propensity models → almost certainly leakage
- NDCG > 0.50 on recommendation models → suspicious
- Model performance in production is significantly worse than offline metrics → leakage confirmed
