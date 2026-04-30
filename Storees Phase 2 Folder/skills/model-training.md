# Skill: Model Training

## When to Use
Invoke this skill when building or modifying any `train_*.py` file.

## train_*.py File Structure (Mandatory)

Every training script MUST follow this exact structure:

```python
"""
Storees ML — [Model Name]
[One-line description]

This file is modified by the autoresearch agent.
DO NOT modify shared infrastructure (prepare.py, features.py, eval.py, config.py).
"""

import sys
import time
import json
from pathlib import Path

# === CONFIGURATION (autoresearch agent modifies ONLY this section) ===
MODEL_TYPE = "xgboost"
PARAM_1 = 200
PARAM_2 = 0.1
# ... all hyperparameters as top-level named constants ...

# === FIXED INFRASTRUCTURE (DO NOT MODIFY) ===
from shared.prepare import load_data
from shared.features import extract_features
from shared.eval import evaluate_<type>
from shared.config import load_tenant_config

TENANT_ID = os.environ.get("STOREES_TENANT_ID", "default")
MODEL_DIR = Path("models/<model_name>")

def main():
    start_time = time.time()
    
    # 1. Load data
    config = load_tenant_config(TENANT_ID)
    data = load_data(TENANT_ID)
    
    # 2. Minimum data gate
    if len(data.positive_labels) < MIN_REQUIRED:
        print("METRIC: INSUFFICIENT_DATA")
        return
    
    # 3. Feature engineering (using CONFIGURATION values)
    # ... model-specific preprocessing ...
    
    # 4. Train model
    # ... training code ...
    
    # 5. Predict on validation set
    # ... prediction code ...
    
    # 6. Evaluate
    metric = evaluate_<type>(y_true, y_pred)
    
    # 7. Save artifacts (only if running standalone, not during autoresearch)
    if "--save" in sys.argv:
        save_dir = MODEL_DIR / time.strftime("%Y%m%d_%H%M%S")
        save_dir.mkdir(parents=True, exist_ok=True)
        # ... save model, config, metadata ...
    
    # 8. Log secondary metrics
    elapsed = time.time() - start_time
    print(f"TRAINING_TIME: {elapsed:.1f}s", file=sys.stderr)
    # print(f"SECONDARY: precision_at_10pct={p10:.4f}", file=sys.stderr)
    
    # 9. Print primary metric (MUST be the LAST stdout line)
    print(f"METRIC: {metric:.6f}")

if __name__ == "__main__":
    main()
```

## Mandatory Rules

### Configuration Section
- ALL tunable values at the TOP of the file as named UPPER_CASE constants
- NO magic numbers buried in the training logic
- Every constant has a comment explaining what it controls
- The autoresearch agent modifies ONLY this section

### Output Contract
- `METRIC: <float>` MUST be the LAST line printed to stdout
- Secondary metrics go to stderr with prefix `SECONDARY:`
- Warnings go to stderr with prefix `WARNING:`
- Training time goes to stderr with prefix `TRAINING_TIME:`
- If insufficient data: `METRIC: INSUFFICIENT_DATA` (the autoresearch runner treats this as skip)

### Time Budget
- Recommendation models: 60 seconds (120 for collaborative filtering)
- Propensity: 60 seconds
- Affinity: 60 seconds
- BTS: 30 seconds
- NBA: 60 seconds
- The script itself should NOT enforce the timeout — the autoresearch runner handles it externally

### Reproducibility
- Set random seeds: `np.random.seed(42)`, `random.seed(42)`
- But the autoresearch agent MAY change the seed as part of experimentation
- Log the seed used in stderr

### Error Handling
- If training crashes, print the traceback to stderr and `METRIC: ERROR` to stdout
- The autoresearch runner treats ERROR as a failed experiment and reverts

## What the Autoresearch Agent Can Change
- Any value in the CONFIGURATION section
- The algorithm/model class (e.g., swap XGBoost for LightGBM)
- Feature preprocessing steps (scaling, selection, transformation)
- Class balancing strategy
- Regularisation parameters
- Ensemble methods

## What the Autoresearch Agent CANNOT Change
- Import statements for shared modules
- The data loading logic
- The evaluation function call
- The `METRIC:` output format
- The temporal split (it's in prepare.py, not here)
- The feature extraction logic (it's in features.py, not here)
