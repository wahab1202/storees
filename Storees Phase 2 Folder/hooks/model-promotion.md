# Hook: Model Promotion

## Trigger
Before promoting any model artifacts to the `latest/` directory or writing scores to the production database.

## Checks

### 1. Model Must Beat Current Production
```python
def validate_promotion(model_type: str, new_metric: float, model_dir: Path) -> bool:
    current_latest = model_dir / "latest" / "metadata.json"
    
    if current_latest.exists():
        current = json.loads(current_latest.read_text())
        current_metric = current["primary_metric"]
        
        if new_metric <= current_metric:
            print(f"PROMOTION BLOCKED: new metric {new_metric:.4f} <= current {current_metric:.4f}")
            return False
        
        improvement = new_metric - current_metric
        print(f"PROMOTION OK: {current_metric:.4f} → {new_metric:.4f} (+{improvement:.4f})")
    else:
        print(f"PROMOTION OK: first model — no previous baseline")
    
    return True
```

### 2. Metadata Must Be Complete
Every promoted model MUST have a `metadata.json` with:
```json
{
  "model_type": "propensity",
  "goal_name": "propensity_to_convert",
  "primary_metric_name": "auc_roc",
  "primary_metric": 0.834,
  "secondary_metrics": {
    "precision_at_10pct": 0.42,
    "brier_score": 0.18
  },
  "training_timestamp": "2026-03-25T06:30:00+05:30",
  "training_data_range": "2025-12-25 to 2026-03-24",
  "split_date": "2026-03-10",
  "total_users_scored": 48521,
  "positive_labels": 1247,
  "negative_labels": 47274,
  "feature_count": 42,
  "top_features": ["total_events_30d", "unique_items_viewed_30d", "event_trend_4w", "days_since_last_conversion", "sessions_per_week_30d"],
  "autoresearch_experiments": 347,
  "autoresearch_improvements": 23,
  "config_snapshot": { ... }
}
```

### 3. Score Distribution Sanity
Before writing propensity scores to the database:
```python
scores = model.predict_proba(all_user_features)

# Scores should have reasonable distribution
assert 0.0 <= scores.min() <= scores.max() <= 1.0, "Scores out of 0-1 range"
assert scores.std() > 0.05, "All scores nearly identical — model is not differentiating users"
assert np.isnan(scores).sum() / len(scores) < 0.1, "More than 10% NaN scores"

# Bucket distribution should be reasonable
high = (scores > np.percentile(scores, 80)).sum()
low = (scores < np.percentile(scores, 30)).sum()
print(f"Distribution: High={high}, Medium={len(scores)-high-low}, Low={low}")
```

### 4. Backward Compatibility
The promoted model must produce output in the same format as the previous model:
- Same feature names expected
- Same output shape (score per user)
- Same bucket labels (High/Medium/Low)

If the model architecture changed (e.g., XGBoost → LightGBM), verify that the serve.py loader can handle both.
