"""Co-occurrence recommendation model — AUTORESEARCH EDITABLE.

Builds item-item co-occurrence matrix from view/cart interactions
within the same session. Computes PMI-based similarity.

Usage:
    python -m recommendations.train_cooccurrence --project-id <UUID>
"""
from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from datetime import datetime
from itertools import combinations
from pathlib import Path
from math import log

import numpy as np
from sqlalchemy import create_engine, text

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from shared.config import load_config

# ---- AUTORESEARCH EDITABLE SECTION ----
SESSION_WINDOW_HOURS = 2
MIN_COOCCURRENCE_COUNT = 2
SIMILARITY_METHOD = "pmi"  # pmi, jaccard, cosine, lift
SMOOTHING_FACTOR = 0.5
TOP_K_PER_ITEM = 20
TIME_DECAY_LAMBDA = 0.001  # per hour
# ---- END AUTORESEARCH EDITABLE SECTION ----


def train(project_id: str) -> dict:
    config = load_config()
    engine = create_engine(config.database_url)
    start_time = time.time()

    # Load view/cart interactions grouped by session
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT customer_id, session_id, event_name,
                   properties->>'product_id' AS item_id,
                   timestamp
            FROM events
            WHERE project_id = :pid
              AND event_name IN ('product_viewed', 'add_to_cart', 'checkout_completed', 'order_completed')
              AND properties->>'product_id' IS NOT NULL
              AND session_id IS NOT NULL
            ORDER BY customer_id, session_id, timestamp
        """), {"pid": project_id}).fetchall()

    if len(rows) < 100:
        print("METRIC: INSUFFICIENT_DATA")
        return {"status": "insufficient_data", "interactions": len(rows)}

    # Group items by session
    sessions: dict[str, set[str]] = defaultdict(set)
    item_counts: dict[str, int] = defaultdict(int)

    for row in rows:
        session_key = f"{row.customer_id}:{row.session_id}"
        item_id = row.item_id
        sessions[session_key].add(item_id)
        item_counts[item_id] += 1

    total_sessions = len(sessions)

    # Build co-occurrence counts
    cooccurrence: dict[tuple[str, str], int] = defaultdict(int)
    for session_items in sessions.values():
        items = list(session_items)
        if len(items) < 2:
            continue
        for a, b in combinations(sorted(items), 2):
            cooccurrence[(a, b)] += 1

    # Filter by minimum count
    cooccurrence = {k: v for k, v in cooccurrence.items() if v >= MIN_COOCCURRENCE_COUNT}

    if not cooccurrence:
        print("METRIC: INSUFFICIENT_DATA")
        return {"status": "insufficient_data", "reason": "no_cooccurrence_pairs"}

    # Compute similarity scores
    similarities: dict[str, list[tuple[str, float]]] = defaultdict(list)

    for (a, b), count in cooccurrence.items():
        p_a = item_counts[a] / total_sessions
        p_b = item_counts[b] / total_sessions
        p_ab = count / total_sessions

        if SIMILARITY_METHOD == "pmi":
            denom = p_a * p_b
            score = log((p_ab + SMOOTHING_FACTOR / total_sessions) / (denom + 1e-10))
        elif SIMILARITY_METHOD == "jaccard":
            union = item_counts[a] + item_counts[b] - count
            score = count / max(union, 1)
        elif SIMILARITY_METHOD == "lift":
            score = p_ab / (p_a * p_b + 1e-10)
        else:  # cosine
            score = count / (np.sqrt(item_counts[a]) * np.sqrt(item_counts[b]) + 1e-10)

        similarities[a].append((b, score))
        similarities[b].append((a, score))

    # Keep top-K per item
    model: dict[str, list[dict]] = {}
    for item_id, sims in similarities.items():
        sims.sort(key=lambda x: x[1], reverse=True)
        model[item_id] = [
            {"item_id": s[0], "score": round(s[1], 4)}
            for s in sims[:TOP_K_PER_ITEM]
        ]

    # Coverage metric
    all_items = set(item_counts.keys())
    recommended_items = set()
    for recs in model.values():
        for r in recs:
            recommended_items.add(r["item_id"])
    coverage = len(recommended_items) / max(len(all_items), 1)

    # Save
    version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    model_dir = Path(config.model_dir) / "recommendations" / "cooccurrence"
    model_dir.mkdir(parents=True, exist_ok=True)

    with open(model_dir / "model.json", "w") as f:
        json.dump(model, f)

    metadata = {
        "model": "cooccurrence",
        "version": version,
        "similarity_method": SIMILARITY_METHOD,
        "items": len(model),
        "pairs": len(cooccurrence),
        "coverage": round(coverage, 4),
        "training_time": round(time.time() - start_time, 1),
        "trained_at": datetime.utcnow().isoformat(),
    }
    with open(model_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    # Simple NDCG proxy: coverage * diversity
    ndcg_proxy = coverage * min(len(model) / max(len(all_items), 1), 1.0)
    print(f"METRIC: {ndcg_proxy:.4f}")
    return {"status": "success", "metric": ndcg_proxy, **metadata}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", required=True)
    args = parser.parse_args()
    result = train(args.project_id)
    print(json.dumps(result, indent=2))
