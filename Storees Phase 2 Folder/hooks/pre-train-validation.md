# Hook: Pre-Train Validation

## Trigger
Before running ANY `train_*.py` file — called by the autoresearch runner before each experiment.

## Checks

### 1. Data Freshness
```python
import json
from pathlib import Path
from datetime import datetime, timedelta

metadata_path = Path("packages/ml/data/split_metadata.json")

if not metadata_path.exists():
    print("ERROR: No data prepared. Run prepare.py first.", file=sys.stderr)
    print("METRIC: ERROR")
    sys.exit(1)

metadata = json.loads(metadata_path.read_text())
extracted_at = datetime.fromisoformat(metadata["extracted_at"])

if datetime.now() - extracted_at > timedelta(hours=24):
    print("WARNING: Data is older than 24 hours. Consider re-running prepare.py.", file=sys.stderr)
```

### 2. Temporal Split Integrity
```python
import pandas as pd

events_train = pd.read_parquet("data/events_train.parquet")
events_val = pd.read_parquet("data/events_val.parquet")

train_max = events_train["created_at"].max()
val_min = events_val["created_at"].min()

assert train_max < val_min, (
    f"TEMPORAL SPLIT VIOLATION: train max {train_max} >= val min {val_min}. "
    f"This means train data contains events from after the validation period started. "
    f"All metrics are unreliable. Fix prepare.py split logic."
)
```

### 3. Minimum Data Check
```python
# Each model defines its own minimum — this is the universal pre-check
if len(events_train) < 100:
    print("WARNING: Very small training set (<100 events). Results may be unreliable.", file=sys.stderr)

if len(events_val) < 50:
    print("WARNING: Very small validation set (<50 events). Metrics will be noisy.", file=sys.stderr)
```

### 4. Feature Cutoff Verification
```python
# Verify that features were computed with the correct cutoff
split_date = datetime.fromisoformat(metadata["split_date"])

user_features = pd.read_parquet("data/user_features.parquet")
if "computed_with_cutoff" in user_features.attrs:
    feature_cutoff = datetime.fromisoformat(user_features.attrs["computed_with_cutoff"])
    assert feature_cutoff <= split_date, (
        f"FEATURE LEAKAGE: features computed with cutoff {feature_cutoff} "
        f"but split_date is {split_date}. Features may contain future information."
    )
```

### 5. Infrastructure File Integrity
```python
import hashlib

PROTECTED = {
    "packages/ml/shared/prepare.py": None,
    "packages/ml/shared/features.py": None,
    "packages/ml/shared/eval.py": None,
    "packages/ml/shared/config.py": None,
}

# On first run, store hashes. On subsequent runs, verify they haven't changed.
hash_file = Path("packages/ml/.infrastructure_hashes.json")

current_hashes = {}
for filepath in PROTECTED:
    with open(filepath, "rb") as f:
        current_hashes[filepath] = hashlib.sha256(f.read()).hexdigest()

if hash_file.exists():
    stored_hashes = json.loads(hash_file.read_text())
    for filepath, stored_hash in stored_hashes.items():
        if current_hashes.get(filepath) != stored_hash:
            print(f"VIOLATION: Infrastructure file modified: {filepath}", file=sys.stderr)
            print("METRIC: ERROR")
            sys.exit(1)
else:
    hash_file.write_text(json.dumps(current_hashes, indent=2))
```
