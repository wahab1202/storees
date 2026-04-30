# Command: /model-status

## Usage
```
/model-status [--model=propensity] [--verbose]
```

## What It Does
Checks the current state of all (or specified) ML models and reports:
- Is the model trained?
- What's the current metric?
- When was it last trained?
- Is there enough data to train?
- What's the next action needed?

## Output
```
=== Storees ML Model Status ===
Tenant: pinnacle_nbfc
Data last extracted: 2026-03-25 02:15 IST (3 hours ago)

┌─────────────────────────┬──────────┬──────────┬─────────────────┬───────────────────┐
│ Model                   │ Status   │ Metric   │ Last Trained    │ Next Action       │
├─────────────────────────┼──────────┼──────────┼─────────────────┼───────────────────┤
│ Reco: Co-occurrence     │ ✅ ACTIVE │ NDCG 0.14│ 3h ago          │ None              │
│ Reco: Collaborative     │ ⏸ PAUSED │ —        │ Never           │ Need 10K+ interactions (have 6,230) │
│ Reco: Attribute-based   │ ✅ ACTIVE │ NDCG 0.09│ 3h ago          │ None              │
│ Reco: Trending          │ ✅ ACTIVE │ NDCG 0.06│ 3h ago          │ None              │
│ Propensity: Convert     │ ✅ ACTIVE │ AUC 0.834│ 3h ago          │ None              │
│ Propensity: Cross-sell  │ ⚠ WAITING│ —        │ Never           │ Need 150+ labels (have 87) │
│ Affinity Segments       │ ✅ ACTIVE │ Sil 0.38 │ 3h ago          │ None (6 clusters) │
│ Best Time to Send       │ ✅ ACTIVE │ MAE 2.8h │ 3h ago          │ None              │
│ Next Best Action        │ ✅ ACTIVE │ +22% rwd │ 3h ago          │ None              │
└─────────────────────────┴──────────┴──────────┴─────────────────┴───────────────────┘

Autoresearch last run: 2026-03-25 02:30-06:30 IST
  Experiments: 847 total across 6 models
  Improvements: 31 (3.7%)
  Next scheduled: 2026-03-31 02:00 IST (Monday)
```

## Verbose Mode
```
/model-status --model=propensity --verbose
```
Shows: full config, feature importance top 10, score distribution histogram, last 5 autoresearch experiments with changes.
