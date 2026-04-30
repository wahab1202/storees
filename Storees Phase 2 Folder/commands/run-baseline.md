# Command: /run-baseline

## Usage
```
/run-baseline [--model=propensity] [--all]
```

## What It Does
Runs each `train_*.py` ONCE with current configuration to establish baseline metrics. This is the starting point before autoresearch optimization begins.

## When to Use
- After building a new model for the first time
- After modifying `prepare.py`, `features.py`, or `eval.py`
- After switching tenants
- Before an overnight autoresearch run (to know the starting point)

## Output
```
=== Baseline Results ===

Recommendations:
  Co-occurrence:        NDCG@5 = 0.087  (32s)
  Collaborative:        METRIC: INSUFFICIENT_DATA (skipped — need 10K interactions)
  Attribute-based:      NDCG@5 = 0.062  (8s)
  Trending:             NDCG@5 = 0.041  (3s)

Propensity:
  propensity_to_convert: AUC = 0.752  (Precision@10%: 0.28, Brier: 0.21)  (41s)
  propensity_to_crosssell: METRIC: INSUFFICIENT_DATA (skipped — 87/150 labels)

Affinity:
  K-Means (K=auto):     Silhouette = 0.262  (K=7 selected)  (22s)

BTS:
  Histogram (168-bin):  Neg MAE = -3.41  (uplift vs fixed: +8.2%)  (11s)

NBA:
  Thompson Sampling:    Cumulative Reward = 847.3  (baseline: 712.0, +19.0%)  (38s)

Total time: 2m 35s
Ready for autoresearch optimization.
```

## What Happens Next
After running baseline, you can:
1. `/run-autoresearch all --experiments=100` — optimise all models
2. `/run-autoresearch propensity --experiments=500` — deep optimise one model
3. Review results in `experiments/<model>.jsonl`
4. `/promote-models --all` — push best models to production
