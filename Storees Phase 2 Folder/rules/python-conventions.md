# Rule: Python Conventions

## Applies To
All `.py` files in `packages/ml/`

## Style
- PEP 8 strictly
- snake_case for everything (functions, variables, files)
- Type hints on ALL function signatures
- Docstrings on ALL public functions (Google style)
- Max line length: 100 characters
- Imports: stdlib → third-party → local, separated by blank lines

## Type Hints
```python
# ✅ Required
def extract_features(events_df: pd.DataFrame, cutoff_date: datetime) -> pd.DataFrame:
    ...

def evaluate_propensity(y_true: np.ndarray, y_pred_proba: np.ndarray) -> float:
    ...

# ❌ Unacceptable
def extract_features(events_df, cutoff_date):
    ...
```

## Docstrings
```python
def evaluate_recommendation(predictions: dict, ground_truth: dict, k: int = 10) -> float:
    """Compute NDCG@K for recommendation predictions.
    
    Args:
        predictions: {user_id: [ranked item_ids]} — model output
        ground_truth: {user_id: [relevant item_ids]} — actual interactions in val set
        k: cutoff for top-K evaluation
    
    Returns:
        Mean NDCG@K across all users with ground truth items. Range 0.0 to 1.0.
    
    Raises:
        ValueError: if predictions is empty
    """
```

## Dependencies
- Use `requirements.txt` per sub-package, not a monolithic one
- Pin major versions: `xgboost>=2.0,<3.0`, `scikit-learn>=1.4,<2.0`
- Never use `pip install` without `--break-system-packages` flag in the container

## Logging
- Use `print()` to stderr for logs: `print("Training started...", file=sys.stderr)`
- ONLY `METRIC: <value>` goes to stdout (the autoresearch runner parses this)
- Use `WARNING:`, `ERROR:`, `INFO:` prefixes in stderr messages

## Data Handling
- pandas for DataFrames
- numpy for numerical operations
- pyarrow for parquet I/O
- NEVER load entire datasets into memory if they exceed 1GB — use chunked reading
- Always specify dtypes when reading parquet to prevent silent type coercion
