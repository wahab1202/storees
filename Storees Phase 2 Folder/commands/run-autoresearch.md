# Command: /run-autoresearch

## Usage
```
/run-autoresearch <model> [--experiments=500] [--timeout=60]
/run-autoresearch all [--experiments=100]
/run-autoresearch propensity --experiments=5  # quick test
```

## Models
- `cooccurrence` — Co-view recommendation model
- `collaborative` — Collaborative filtering (ALS/LightFM)
- `attribute` — Attribute-based similarity
- `trending` — Trending/popular items
- `propensity` — Propensity scoring (XGBoost/LightGBM)
- `affinity` — Affinity segment clustering (K-Means)
- `bts` — Best Time to Send
- `nba` — Next Best Action (Thompson Sampling)
- `all` — Run all models sequentially

## What It Does
1. Verifies data is prepared (runs `/prepare-data` if needed)
2. Creates a git branch: `autoresearch/<model>/<date>`
3. Runs the baseline: `python train_<model>.py` → records starting metric
4. Enters the autoresearch loop:
   - Read `program_<model>.md` for experiment directions
   - Modify `train_<model>.py` (configuration section only)
   - Run with timeout enforcement
   - Parse METRIC from stdout
   - Run post-train validation hooks
   - If improved AND passes validation: git commit
   - If not improved OR fails validation: revert
   - Log to `experiments/<model>.jsonl`
   - Sleep 2 seconds (laptop CPU cooling)
   - Repeat
5. After completion: print summary (experiments run, improvements found, best metric)

## Quick Test
```
/run-autoresearch propensity --experiments=5
```
Runs 5 experiments to verify the loop works. Use this before overnight runs.

## Overnight Run
```
/run-autoresearch propensity --experiments=500
```
Takes ~8-10 hours on laptop CPU. Run before sleeping.

## All Models Sequential
```
/run-autoresearch all --experiments=100
```
Runs 100 experiments per model × 8 models = ~800 total experiments.
Takes ~10-12 hours. Each model gets ~1-1.5 hours.

## Output
```
=== Autoresearch Summary: propensity ===
Experiments: 347 / 500
Improvements: 23 (6.6%)
Starting metric: 0.752 (AUC-ROC)
Best metric: 0.834 (AUC-ROC)
Improvement: +0.082 (+10.9%)
Best config: LightGBM, n_estimators=150, max_depth=5, SMOTE, isotonic calibration
Duration: 8h 23m
Branch: autoresearch/propensity/20260325
Experiment log: experiments/propensity.jsonl
```
