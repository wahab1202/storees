# Agent: BTS & NBA

## Identity
You build the Best Time to Send model and the Next Best Action bandit. These two models are paired because they both optimise the HOW and WHEN of message delivery, and they integrate into the same flow builder components.

## Ownership
```
packages/ml/bts/
├── train_bts.py          ← You build this (autoresearch editable)
├── program_bts.md        ← Human writes, you reference
├── serve.py              ← You build the BTS lookup API
└── __init__.py

packages/ml/nba/
├── train_nba.py          ← You build this (autoresearch editable)
├── program_nba.md        ← Human writes, you reference
├── serve.py              ← You build the action selection API
└── __init__.py
```

## What You Build

### train_bts.py — Best Time to Send
- Loads engagement events (opens, clicks) from event store via `shared.prepare`
- Configuration block:
  - BIN_GRANULARITY: hour (168 bins), 2hour (84), 4hour (42)
  - SMOOTHING_METHOD: gaussian, moving_average, none
  - SMOOTHING_BANDWIDTH: float
  - PEAK_DETECTION: argmax, top3_weighted, threshold_based
  - COLD_START_METHOD: cohort, global, segment
  - MIN_EVENTS_FOR_PERSONAL: 15 (minimum engagement events for personal BTS)
  - WEIGHT_BY_RECENCY: bool
  - RECENCY_HALF_LIFE_DAYS: 30
  - DAY_OF_WEEK_AWARE: bool (separate weekday vs weekend — should generally be True)
- For each user with >= MIN_EVENTS_FOR_PERSONAL:
  - Build 168-bin histogram (24h × 7d) weighted by recency
  - Apply smoothing
  - Detect peak(s)
  - Output: best_day_of_week (0-6), best_hour (0-23), confidence (0-1)
- For users below threshold: use cohort/global/segment fallback
- Evaluates against held-out engagement events via `shared.eval.evaluate_bts()`
- Prints `METRIC: <Negative MAE>`
- Also logs: improvement over fixed-time baseline. If <5% open rate uplift, log `WARNING: BTS adds insufficient value`
- Must complete in <30 seconds on CPU

### train_nba.py — Next Best Action
- Loads historical campaign outcome data from event store
- Configuration block:
  - BANDIT_ALGORITHM: thompson, ucb1, epsilon_greedy, exp3
  - EPSILON: 0.1 (for epsilon_greedy)
  - UCB_EXPLORATION: 2.0
  - PRIOR_ALPHA: 1.0, PRIOR_BETA: 1.0 (Thompson priors)
  - CONTEXT_AWARE: bool
  - CONTEXT_MODEL: logistic, random_forest, linear
  - DECAY_FACTOR: 0.99
  - ACTION_SPACE: ["push", "sms", "whatsapp", "email", "inapp", "wait"]
  - SEGMENT_LEVEL: bool (separate bandits per segment vs global)
  - IPS_CORRECTION: bool (Inverse Propensity Scoring for logging bias — should be True)
- Simulates the bandit on historical campaign data:
  - For each historical send: what action would the bandit have chosen?
  - Compare bandit's hypothetical action against actual outcome
  - Track cumulative reward
- Evaluates via `shared.eval.evaluate_nba()`
- Prints `METRIC: <Cumulative Reward>`
- Must complete in <60 seconds on CPU
- **CRITICAL**: Must use IPS correction. Without it, the bandit will always recommend the historically most-used channel (usually email/SMS) because that's where data exists.

### serve.py (BTS) — Best Time Lookup
- FastAPI endpoint: `GET /v1/bts/best-time?user_id=X`
- Output: `{ user_id, best_day: int, best_hour: int, confidence: float, method: "personal"|"cohort"|"global" }`
- Batch endpoint: `POST /v1/bts/best-times` with `{ user_ids: string[] }`
- Reads from Redis cache: `bts:user:<user_id>` → `{ day, hour, confidence, method }`
- Cache refreshed by weekly cron
- Integration point: the flow builder's "Send at Best Time" delay node calls this API for each user to determine the scheduled send time

### serve.py (NBA) — Action Selection
- FastAPI endpoint: `POST /v1/nba/select-action`
- Input: `{ user_id, flow_node_id, available_actions: string[], goal_event: string }`
- Output: `{ selected_action: string, confidence: float, exploration: bool }`
- Loads bandit state from Redis: `nba:state:<flow_node_id>:<segment_id>`
- Samples from Beta distributions (Thompson) or computes UCB scores
- Returns selected action with metadata
- Update endpoint: `POST /v1/nba/update` — called when outcome is observed (conversion or no conversion). Updates the Beta distribution parameters.
- Integration point: flow builder nodes with "AI Optimise" toggle call this API instead of using a fixed channel/variant

## Dependencies
```python
from shared.prepare import load_data
from shared.eval import evaluate_bts, evaluate_nba
from shared.config import load_tenant_config
```

## Quality Bar
- BTS must handle single-timezone deployments (India/IST) — value comes from day×hour patterns by user segment, not timezone differences
- NBA must use IPS correction by default — without it, results are meaningless
- Both serve.py endpoints must respond in <50ms (pure cache lookups)
- NBA state updates must be atomic (Redis transactions) to handle concurrent flow executions
