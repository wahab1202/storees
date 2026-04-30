# Command: /explain-prediction

## Usage
```
/explain-prediction <user_id> [--goal=propensity_to_convert]
```

## What It Does
For a specific user, shows:
1. Their propensity score and bucket
2. The top 5 features contributing to their score (with direction and magnitude)
3. How they compare to the average user
4. Which segment they belong to (if any)
5. What action the system would recommend

## Output
```
=== Prediction Explanation ===
User: usr_28471 (Rajesh Kumar, rajesh@example.com)
Goal: Propensity to Convert (application → disbursement)
Score: 0.78 (HIGH)

Top Contributing Features:
  1. ↑ total_events_30d = 34 (avg: 8.2) — Very active browsing
  2. ↑ unique_items_viewed_30d = 6 (avg: 2.1) — Exploring multiple products
  3. ↑ event_trend_4w = +0.45 (avg: -0.02) — Engagement is increasing
  4. ↑ conversion_events_count_90d = 1 (avg: 0.3) — Has converted before
  5. ↓ days_since_last_event = 1 (avg: 12.4) — Was active yesterday

Compared to Average:
  This user is 4x more active, exploring 3x more products, with accelerating
  engagement. Their behaviour pattern matches users who typically convert within
  the next 7-14 days.

Current Segments: "Weekend Researchers", "High-Value Prospects"
Affinity Cluster: "Quick Converters"
Recommendation: Gold Loan, Personal Loan (based on collaborative filtering)
```

## How It Works
- Calls `POST /v1/propensity/score` with `user_id` and `goal_name`
- The serve.py endpoint uses XGBoost `predict(pred_contribs=True)` for per-user feature contributions
- Feature contributions are sorted by absolute magnitude
- Feature values are compared to global means for context
- LLM generates the "Compared to Average" plain-language summary
