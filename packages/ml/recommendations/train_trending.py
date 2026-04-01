"""Trending items model — AUTORESEARCH EDITABLE.

Computes time-decayed popularity scores from recent interactions.
Score(item) = sum(weight * e^(-lambda * age_in_hours))

Usage:
    python -m recommendations.train_trending --project-id <UUID>
"""
from __future__ import annotations

import argparse
import json
import math
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, text

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from shared.config import load_config

# ---- AUTORESEARCH EDITABLE SECTION ----
TIME_DECAY_LAMBDA = 0.005  # per hour decay rate
LOOKBACK_DAYS = 30
EVENT_WEIGHTS = {
    "product_viewed": 1.0,
    "add_to_cart": 3.0,
    "checkout_completed": 5.0,
    "order_completed": 8.0,
}
TOP_K = 100
# ---- END AUTORESEARCH EDITABLE SECTION ----


def train(project_id: str) -> dict:
    config = load_config()
    engine = create_engine(config.database_url)
    start_time = time.time()
    now = datetime.now(timezone.utc)

    event_names = list(EVENT_WEIGHTS.keys())

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT properties->>'product_id' AS item_id,
                   event_name,
                   timestamp
            FROM events
            WHERE project_id = :pid
              AND event_name = ANY(:events)
              AND properties->>'product_id' IS NOT NULL
              AND timestamp >= NOW() - INTERVAL ':days days'
            ORDER BY timestamp DESC
        """.replace(":days", str(LOOKBACK_DAYS))), {
            "pid": project_id,
            "events": event_names,
        }).fetchall()

    if len(rows) < 10:
        print("METRIC: INSUFFICIENT_DATA")
        return {"status": "insufficient_data", "interactions": len(rows)}

    # Compute time-decayed scores
    item_scores: dict[str, float] = defaultdict(float)
    item_interaction_count: dict[str, int] = defaultdict(int)

    for row in rows:
        item_id = row.item_id
        event_name = row.event_name
        ts = row.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        age_hours = (now - ts).total_seconds() / 3600
        weight = EVENT_WEIGHTS.get(event_name, 1.0)
        decay = math.exp(-TIME_DECAY_LAMBDA * age_hours)

        item_scores[item_id] += weight * decay
        item_interaction_count[item_id] += 1

    # Sort by score, take top-K
    ranked = sorted(item_scores.items(), key=lambda x: x[1], reverse=True)[:TOP_K]

    # Normalize scores to 0-1
    max_score = ranked[0][1] if ranked else 1
    model = [
        {"item_id": item_id, "score": round(score / max_score, 4), "interactions": item_interaction_count[item_id]}
        for item_id, score in ranked
    ]

    # Coverage
    total_items_with_interactions = len(item_scores)
    coverage = len(model) / max(total_items_with_interactions, 1)

    # Save
    version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    model_dir = Path(config.model_dir) / "recommendations" / "trending"
    model_dir.mkdir(parents=True, exist_ok=True)

    with open(model_dir / "model.json", "w") as f:
        json.dump(model, f)

    metadata = {
        "model": "trending",
        "version": version,
        "items_ranked": len(model),
        "total_interactions": len(rows),
        "coverage": round(coverage, 4),
        "decay_lambda": TIME_DECAY_LAMBDA,
        "lookback_days": LOOKBACK_DAYS,
        "training_time": round(time.time() - start_time, 1),
        "trained_at": datetime.utcnow().isoformat(),
    }
    with open(model_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"METRIC: {coverage:.4f}")
    return {"status": "success", "metric": coverage, **metadata}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", required=True)
    args = parser.parse_args()
    result = train(args.project_id)
    print(json.dumps(result, indent=2))
