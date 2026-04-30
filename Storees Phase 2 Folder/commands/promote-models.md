# Command: /promote-models

## Usage
```
/promote-models [--model=propensity] [--all] [--dry-run]
```

## What It Does
1. For each model (or specified model):
   - Finds the best artifact from the latest autoresearch run
   - Runs model promotion validation hooks
   - If validation passes: copies to `models/<model>/latest/`
   - Writes `metadata.json` with full training details
2. Triggers downstream updates:
   - **Propensity**: Batch-scores all users, writes `propensity_<goal>` and `propensity_<goal>_bucket` to `user_properties` table
   - **Affinity**: Re-assigns all users to clusters, writes `affinity_cluster` to `user_properties` table
   - **Recommendations**: Refreshes pre-computed recommendation lists in Redis
   - **BTS**: Updates per-user best-time histograms in Redis
   - **NBA**: Resets bandit priors with new model parameters
3. Notifies the ML API to reload models (`POST /v1/<model>/reload`)

## Dry Run
```
/promote-models --all --dry-run
```
Shows what WOULD be promoted without actually doing it. Useful for reviewing overnight results before committing.

## Output
```
=== Model Promotion ===
propensity (propensity_to_convert):
  Current: AUC 0.812 (trained 2026-03-18)
  New:     AUC 0.834 (trained 2026-03-25)
  ✅ PROMOTED (+0.022)
  → Scored 48,521 users
  → High: 9,704 | Medium: 24,260 | Low: 14,557

affinity:
  Current: Silhouette 0.31 (trained 2026-03-18)
  New:     Silhouette 0.38 (trained 2026-03-25)
  ✅ PROMOTED (+0.07)
  → 6 clusters assigned
  → Undifferentiated: 1 cluster excluded

recommendations (collaborative):
  Current: NDCG@5 0.11 (trained 2026-03-18)
  New:     NDCG@5 0.08 (trained 2026-03-25)
  ❌ NOT PROMOTED (regression)

bts:
  Current: MAE 3.2h (trained 2026-03-18)
  New:     MAE 2.8h (trained 2026-03-25)
  ✅ PROMOTED (improved by 0.4h)
  → Updated BTS for 32,104 users in Redis
```
