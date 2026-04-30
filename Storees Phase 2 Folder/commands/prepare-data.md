# Command: /prepare-data

## Usage
```
/prepare-data [--tenant_id=X] [--days_back=90] [--force]
```

## What It Does
1. Runs `packages/ml/shared/prepare.py` with the specified parameters
2. Extracts events, interactions, user profiles, and item catalogue from Storees DB
3. Computes temporal train/val split
4. Runs `packages/ml/shared/features.py` to compute user features with correct cutoff
5. Saves everything to `packages/ml/data/<tenant_id>/` as parquet files
6. Saves `split_metadata.json` with extraction timestamp, split date, and record counts

## Default Behavior
```bash
cd packages/ml
python shared/prepare.py --tenant_id=${STOREES_TENANT_ID:-default} --days_back=90
python shared/features.py --tenant_id=${STOREES_TENANT_ID:-default}
```

## When to Use
- Before the first autoresearch run
- When data is older than 24 hours
- After a schema change in the Storees DB
- When switching tenants

## Output
```
Data extraction complete:
  Tenant: pinnacle_nbfc
  Time range: 2025-12-25 to 2026-03-25
  Split date: 2026-03-10
  Events: 47,821 train / 11,432 val
  Interactions: 23,410 train / 5,891 val
  Users: 48,521
  Items: 27
  Features computed: 42 per user
  Saved to: packages/ml/data/pinnacle_nbfc/
```
