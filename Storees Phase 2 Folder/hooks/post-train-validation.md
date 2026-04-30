# Hook: Post-Train Validation

## Trigger
After each `train_*.py` completes — called by the autoresearch runner after parsing METRIC.

## Checks (based on model type)

### Universal Checks
```python
def post_train_validate(model_type: str, metric_value: float, stdout: str, stderr: str) -> dict:
    """
    Returns: {
        "accept": bool,          # Should this experiment be accepted?
        "warnings": list[str],   # Non-blocking warnings to log
        "violations": list[str]  # Blocking violations (accept=False if any)
    }
    """
    warnings = []
    violations = []
    
    # 1. Check for NaN or Inf metric
    if math.isnan(metric_value) or math.isinf(metric_value):
        violations.append(f"METRIC is {metric_value} — invalid value")
        return {"accept": False, "warnings": warnings, "violations": violations}
    
    # 2. Check for INSUFFICIENT_DATA (skip, don't reject)
    if "INSUFFICIENT_DATA" in stdout:
        return {"accept": False, "warnings": ["Insufficient data — skipping"], "violations": []}
```

### Propensity-Specific Checks
```python
    if model_type == "propensity":
        # Leakage detection
        if metric_value > 0.92:
            warnings.append(f"AUC {metric_value:.4f} > 0.92 — possible data leakage")
        
        # Calibration check
        brier = parse_secondary_metric(stderr, "brier_score")
        if brier and brier > 0.25:
            warnings.append(f"Brier Score {brier:.4f} > 0.25 — poor calibration")
        
        # Precision check
        p10 = parse_secondary_metric(stderr, "precision_at_10pct")
        if p10:
            # Estimate base rate from training data
            base_rate = parse_secondary_metric(stderr, "base_rate")
            if base_rate and p10 < base_rate * 2:
                warnings.append(f"Precision@10% ({p10:.4f}) < 2x base rate ({base_rate:.4f}) — model barely useful")
```

### Recommendation-Specific Checks
```python
    if model_type in ["cooccurrence", "collaborative", "attribute", "trending"]:
        # Coverage check
        coverage = parse_secondary_metric(stderr, "coverage")
        if coverage and coverage < 0.20:
            violations.append(f"Coverage {coverage:.2%} < 20% — model recommends too few unique items")
        
        # Suspiciously high NDCG
        if metric_value > 0.50:
            warnings.append(f"NDCG {metric_value:.4f} > 0.50 — verify this is not a leakage artifact")
```

### Affinity-Specific Checks
```python
    if model_type == "affinity":
        # Too-low silhouette
        if metric_value < 0.20:
            warnings.append(f"Silhouette {metric_value:.4f} < 0.20 — clusters may be meaningless")
        
        # Stability check (if ARI was logged)
        ari = parse_secondary_metric(stderr, "stability_ari")
        if ari and ari < 0.70:
            warnings.append(f"ARI {ari:.4f} < 0.70 — clusters are unstable across seeds")
        
        # Interpretability check
        interpretable = parse_secondary_metric(stderr, "interpretable_clusters")
        total_k = parse_secondary_metric(stderr, "total_clusters")
        if interpretable and total_k and interpretable / total_k < 0.5:
            warnings.append(f"Only {interpretable}/{total_k} clusters are interpretable")
```

### BTS-Specific Checks
```python
    if model_type == "bts":
        # Improvement over baseline
        baseline_uplift = parse_secondary_metric(stderr, "uplift_vs_fixed_time")
        if baseline_uplift and baseline_uplift < 0.05:
            warnings.append(f"BTS uplift {baseline_uplift:.2%} < 5% — may not be worth the complexity")
```

### Infrastructure Integrity (All Models)
```python
    # Verify infrastructure files weren't modified
    hash_file = Path("packages/ml/.infrastructure_hashes.json")
    if hash_file.exists():
        stored = json.loads(hash_file.read_text())
        for filepath, expected_hash in stored.items():
            with open(filepath, "rb") as f:
                actual_hash = hashlib.sha256(f.read()).hexdigest()
            if actual_hash != expected_hash:
                violations.append(f"INFRASTRUCTURE VIOLATION: {filepath} was modified during experiment")
    
    accept = len(violations) == 0
    return {"accept": accept, "warnings": warnings, "violations": violations}
```

## Logging Format
After validation, log to experiment JSONL:
```json
{
  "experiment": 47,
  "metric_value": 0.834,
  "accepted": true,
  "warnings": ["Brier Score 0.22 approaching threshold"],
  "violations": [],
  "secondary_metrics": {
    "precision_at_10pct": 0.42,
    "brier_score": 0.22,
    "base_rate": 0.08,
    "coverage": 0.65
  }
}
```
