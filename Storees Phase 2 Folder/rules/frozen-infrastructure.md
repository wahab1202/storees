# Rule: Frozen Infrastructure

## Applies To
The autoresearch agent and any automated modification of `packages/ml/`

## Protected Files (NEVER modify during autoresearch)
```
packages/ml/shared/prepare.py    ← Data extraction and splitting
packages/ml/shared/features.py   ← Feature engineering pipeline
packages/ml/shared/eval.py       ← Evaluation harness
packages/ml/shared/config.py     ← Tenant configuration loader
```

## Why
If the autoresearch agent could modify the evaluation function, it could trivially achieve perfect scores by changing how success is measured. If it could modify feature extraction, it could introduce temporal data leakage. If it could modify data preparation, it could change the train/val split to cherry-pick easy validation sets.

These four files are the "rules of the game." The agent plays within these rules.

## Editable Files (autoresearch CAN modify)
```
packages/ml/recommendations/train_cooccurrence.py
packages/ml/recommendations/train_collaborative.py
packages/ml/recommendations/train_attribute.py
packages/ml/recommendations/train_trending.py
packages/ml/propensity/train_propensity.py
packages/ml/affinity/train_affinity.py
packages/ml/bts/train_bts.py
packages/ml/nba/train_nba.py
```

## Enforcement
The autoresearch runner must:
1. Before each experiment: compute SHA-256 hash of all 4 protected files
2. After each experiment: recompute hashes
3. If ANY hash changed: revert ALL changes (not just train file), log `VIOLATION: infrastructure file modified`, and continue

## Human Modification
Humans CAN modify these files between autoresearch runs. After modifying, re-run the baseline to establish a new starting metric.
