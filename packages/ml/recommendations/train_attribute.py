"""Attribute-based recommendation model — AUTORESEARCH EDITABLE.

Computes cosine similarity between items based on catalogue attributes.
Works from Day 0 with zero interaction data.

Usage:
    python -m recommendations.train_attribute --project-id <UUID>
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

import numpy as np
from sqlalchemy import create_engine, text

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from shared.config import load_config

# ---- AUTORESEARCH EDITABLE SECTION ----
TOP_K_PER_ITEM = 20
CATEGORY_WEIGHT = 2.0
PRICE_WEIGHT = 1.0
NAME_WEIGHT = 0.5
# ---- END AUTORESEARCH EDITABLE SECTION ----


def train(project_id: str) -> dict:
    config = load_config()
    engine = create_engine(config.database_url)
    start_time = time.time()

    # Load items from catalogue
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, name, properties
            FROM items
            WHERE project_id = :pid
        """), {"pid": project_id}).fetchall()

    if len(rows) < 5:
        print("METRIC: INSUFFICIENT_DATA")
        return {"status": "insufficient_data", "items": len(rows)}

    # Extract features
    items = []
    for row in rows:
        props = row.properties if isinstance(row.properties, dict) else {}
        items.append({
            "id": str(row.id),
            "name": row.name or "",
            "category": props.get("category", "unknown"),
            "price": float(props.get("price", 0)),
        })

    # Build feature vectors
    # Category: one-hot encoding
    categories = sorted(set(i["category"] for i in items))
    cat_to_idx = {c: idx for idx, c in enumerate(categories)}

    # Price: normalized to 0-1
    prices = [i["price"] for i in items]
    price_min = min(prices) if prices else 0
    price_range = max(prices) - price_min if prices else 1
    if price_range == 0:
        price_range = 1

    n_items = len(items)
    n_features = len(categories) + 1  # categories + price

    feature_matrix = np.zeros((n_items, n_features))
    for i, item in enumerate(items):
        # Category features (weighted)
        cat_idx = cat_to_idx.get(item["category"], 0)
        feature_matrix[i, cat_idx] = CATEGORY_WEIGHT
        # Price feature (normalized, weighted)
        feature_matrix[i, -1] = ((item["price"] - price_min) / price_range) * PRICE_WEIGHT

    # Compute cosine similarity
    norms = np.linalg.norm(feature_matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1
    normalized = feature_matrix / norms
    similarity_matrix = normalized @ normalized.T

    # Build model: top-K per item
    model: dict[str, list[dict]] = {}
    for i, item in enumerate(items):
        scores = similarity_matrix[i]
        # Exclude self
        scores[i] = -1
        top_indices = np.argsort(-scores)[:TOP_K_PER_ITEM]
        model[item["id"]] = [
            {"item_id": items[j]["id"], "score": round(float(scores[j]), 4)}
            for j in top_indices if scores[j] > 0
        ]

    # Coverage
    recommended_items = set()
    for recs in model.values():
        for r in recs:
            recommended_items.add(r["item_id"])
    coverage = len(recommended_items) / max(n_items, 1)

    # Save
    version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    model_dir = Path(config.model_dir) / "recommendations" / "attribute"
    model_dir.mkdir(parents=True, exist_ok=True)

    with open(model_dir / "model.json", "w") as f:
        json.dump(model, f)

    metadata = {
        "model": "attribute",
        "version": version,
        "items": n_items,
        "categories": len(categories),
        "coverage": round(coverage, 4),
        "training_time": round(time.time() - start_time, 1),
        "trained_at": datetime.utcnow().isoformat(),
    }
    with open(model_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    ndcg_proxy = coverage
    print(f"METRIC: {ndcg_proxy:.4f}")
    return {"status": "success", "metric": ndcg_proxy, **metadata}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", required=True)
    args = parser.parse_args()
    result = train(args.project_id)
    print(json.dumps(result, indent=2))
