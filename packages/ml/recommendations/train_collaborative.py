"""Collaborative filtering model — AUTORESEARCH EDITABLE.

Builds user-item interaction matrix and computes latent factor
decomposition using SVD. Falls back to attribute-based for cold-start users.

Usage:
    python -m recommendations.train_collaborative --project-id <UUID>
"""
from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import svds
from sqlalchemy import create_engine, text

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from shared.config import load_config

# ---- AUTORESEARCH EDITABLE SECTION ----
NUM_FACTORS = 50
MIN_USER_INTERACTIONS = 5
MIN_ITEM_INTERACTIONS = 3
MIN_TOTAL_INTERACTIONS = 10000
MIN_USERS = 500
TOP_K_PER_USER = 20
INTERACTION_WEIGHTS = {
    "product_viewed": 1.0,
    "add_to_cart": 3.0,
    "checkout_completed": 5.0,
    "order_completed": 8.0,
}
# ---- END AUTORESEARCH EDITABLE SECTION ----


def train(project_id: str) -> dict:
    config = load_config()
    engine = create_engine(config.database_url)
    start_time = time.time()

    event_names = list(INTERACTION_WEIGHTS.keys())

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT customer_id,
                   properties->>'product_id' AS item_id,
                   event_name
            FROM events
            WHERE project_id = :pid
              AND event_name = ANY(:events)
              AND properties->>'product_id' IS NOT NULL
              AND customer_id IS NOT NULL
        """), {"pid": project_id, "events": event_names}).fetchall()

    if len(rows) < MIN_TOTAL_INTERACTIONS:
        print("METRIC: INSUFFICIENT_DATA")
        return {"status": "insufficient_data", "interactions": len(rows), "min_required": MIN_TOTAL_INTERACTIONS}

    # Build interaction counts
    user_item_scores: dict[tuple[str, str], float] = defaultdict(float)
    user_counts: dict[str, int] = defaultdict(int)
    item_counts: dict[str, int] = defaultdict(int)

    for row in rows:
        uid = str(row.customer_id)
        iid = row.item_id
        weight = INTERACTION_WEIGHTS.get(row.event_name, 1.0)
        user_item_scores[(uid, iid)] += weight
        user_counts[uid] += 1
        item_counts[iid] += 1

    # Filter users and items with enough interactions
    valid_users = {u for u, c in user_counts.items() if c >= MIN_USER_INTERACTIONS}
    valid_items = {i for i, c in item_counts.items() if c >= MIN_ITEM_INTERACTIONS}

    if len(valid_users) < MIN_USERS:
        print("METRIC: INSUFFICIENT_DATA")
        return {"status": "insufficient_data", "valid_users": len(valid_users), "min_required": MIN_USERS}

    # Create index mappings
    user_list = sorted(valid_users)
    item_list = sorted(valid_items)
    user_to_idx = {u: i for i, u in enumerate(user_list)}
    item_to_idx = {i: j for j, i in enumerate(item_list)}

    # Build sparse matrix
    data = []
    row_indices = []
    col_indices = []

    for (uid, iid), score in user_item_scores.items():
        if uid in user_to_idx and iid in item_to_idx:
            row_indices.append(user_to_idx[uid])
            col_indices.append(item_to_idx[iid])
            data.append(score)

    n_users = len(user_list)
    n_items = len(item_list)
    matrix = csr_matrix(
        (data, (row_indices, col_indices)),
        shape=(n_users, n_items),
    )

    # SVD decomposition
    k = min(NUM_FACTORS, min(n_users, n_items) - 1)
    U, sigma, Vt = svds(matrix.astype(float), k=k)
    sigma_diag = np.diag(sigma)

    # Predicted scores = U * sigma * Vt
    predicted = U @ sigma_diag @ Vt

    # Build recommendations per user
    model: dict[str, list[dict]] = {}
    for uid_idx, uid in enumerate(user_list):
        scores = predicted[uid_idx]
        # Zero out already-interacted items
        interacted = set()
        for (u, i), _ in user_item_scores.items():
            if u == uid and i in item_to_idx:
                interacted.add(item_to_idx[i])
        for idx in interacted:
            scores[idx] = -np.inf

        top_indices = np.argsort(-scores)[:TOP_K_PER_USER]
        model[uid] = [
            {"item_id": item_list[j], "score": round(float(scores[j]), 4)}
            for j in top_indices if scores[j] > -np.inf
        ]

    # Coverage
    recommended_items = set()
    for recs in model.values():
        for r in recs:
            recommended_items.add(r["item_id"])
    coverage = len(recommended_items) / max(n_items, 1)

    # Save
    version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    model_dir = Path(config.model_dir) / "recommendations" / "collaborative"
    model_dir.mkdir(parents=True, exist_ok=True)

    with open(model_dir / "model.json", "w") as f:
        json.dump(model, f)

    # Save item index for serving
    with open(model_dir / "item_index.json", "w") as f:
        json.dump(item_list, f)

    metadata = {
        "model": "collaborative",
        "version": version,
        "users": n_users,
        "items": n_items,
        "factors": k,
        "interactions": len(data),
        "coverage": round(coverage, 4),
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
