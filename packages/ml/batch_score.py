"""Batch scorer — scores all customers for all active prediction goals and writes to DB.

Usage:
  python batch_score.py --project-id <UUID>
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
import numpy as np
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shared.config import load_config
from shared.features import compute_features


def batch_score(project_id: str):
    config = load_config()
    engine = create_engine(config.database_url)

    # Fetch domain type from project
    with engine.connect() as conn:
        domain_row = conn.execute(text("""
            SELECT domain_type FROM projects WHERE id = CAST(:pid AS uuid)
        """), {"pid": project_id}).fetchone()
    domain = (domain_row[0] if domain_row and domain_row[0] else "ecommerce").lower()
    # Normalize domain aliases
    if domain in ("nbfc", "lending", "banking"):
        domain = "fintech"
    elif domain in ("education", "edtech", "e-learning"):
        domain = "edtech"
    elif domain not in ("ecommerce", "fintech", "saas", "edtech"):
        domain = "ecommerce"

    # Get active goals
    with engine.connect() as conn:
        goals = conn.execute(text("""
            SELECT id, name, target_event, observation_window_days, prediction_window_days
            FROM prediction_goals
            WHERE project_id = :pid AND status = 'active'
        """), {"pid": project_id}).fetchall()

        if not goals:
            print("No active prediction goals found.")
            return

    print(f"Found {len(goals)} active goals, domain={domain} (customers qualified per-goal by observation window)\n")

    BATCH_SIZE = 1000
    now = datetime.now(timezone.utc)

    for goal in goals:
        goal_id = str(goal[0])
        goal_name = goal[1]
        target_event = goal[2]
        obs_days = goal[3] or 90
        pred_days = goal[4] or 30

        model_dir = Path(config.model_dir) / f"propensity_{goal_id}"
        if not model_dir.exists():
            print(f"[{goal_name}] No trained model found, skipping")
            continue

        model = joblib.load(model_dir / "model.joblib")
        scaler = joblib.load(model_dir / "scaler.joblib")
        with open(model_dir / "metadata.json") as f:
            metadata = json.load(f)

        cutoff = now
        obs_start = cutoff - timedelta(days=obs_days)
        expected_cols = metadata["feature_names"]

        # Only score customers active in the observation window (matches training population)
        with engine.connect() as conn:
            customer_rows = conn.execute(text("""
                SELECT DISTINCT c.id
                FROM customers c
                JOIN events e ON e.customer_id = c.id
                WHERE c.project_id = :pid
                  AND e.timestamp >= :obs_start
                  AND e.timestamp < :cutoff
                  AND e.event_name != 'customer_created'
            """), {"pid": project_id, "obs_start": obs_start, "cutoff": cutoff}).fetchall()

        customer_ids = [str(r[0]) for r in customer_rows]
        print(f"[{goal_name}] Scoring {len(customer_ids)} customers (active in {obs_days}d window) "
              f"with model {metadata['model_version']} (AUC={metadata['auc']:.4f})")

        all_scores = []
        is_reorder_goal = any(k in goal_name.lower() for k in ("repeat", "reorder"))

        for i in range(0, len(customer_ids), BATCH_SIZE):
            batch_ids = customer_ids[i:i + BATCH_SIZE]
            features = compute_features(config, project_id, batch_ids, obs_start, cutoff, domain=domain)

            if features.empty:
                continue

            # Preserve velocity columns for reorder timing before subsetting
            velocity_cols = {}
            if is_reorder_goal:
                for col_name in ("avg_days_between_purchases", "days_since_last_purchase",
                                 "days_since_expected_order", "is_repeat_buyer", "purchase_regularity"):
                    if col_name in features.columns:
                        velocity_cols[col_name] = features[col_name].to_dict()

            for col in expected_cols:
                if col not in features.columns:
                    features[col] = 0
            features = features[expected_cols]

            X = scaler.transform(features.values)
            probs = model.predict_proba(X)[:, 1]

            for cid, prob in zip(features.index, probs):
                score_100 = round(float(prob) * 100, 1)
                bucket = "high" if score_100 >= 66 else ("medium" if score_100 >= 33 else "low")
                confidence = round(min(float(prob), 1 - float(prob)) * 2, 3)

                entry = {
                    "customer_id": str(cid),
                    "score": score_100,
                    "bucket": bucket,
                    "confidence": confidence,
                }

                # Compute reorder timing intelligence
                if is_reorder_goal and velocity_cols:
                    avg_interval = float(velocity_cols.get("avg_days_between_purchases", {}).get(cid, 0))
                    days_since_last = float(velocity_cols.get("days_since_last_purchase", {}).get(cid, 0))
                    days_overdue = float(velocity_cols.get("days_since_expected_order", {}).get(cid, 0))
                    is_repeat = int(velocity_cols.get("is_repeat_buyer", {}).get(cid, 0))
                    regularity = float(velocity_cols.get("purchase_regularity", {}).get(cid, 0))

                    if days_overdue > 0:
                        expected_reorder_days = 0.0
                    else:
                        expected_reorder_days = max(avg_interval - days_since_last, 0.0)

                    if not is_repeat:
                        timing_bucket = None
                    elif expected_reorder_days <= 3:
                        timing_bucket = "0-3d"
                    elif expected_reorder_days <= 7:
                        timing_bucket = "3-7d"
                    elif expected_reorder_days <= 14:
                        timing_bucket = "7-14d"
                    else:
                        timing_bucket = "14d+"

                    entry["timing"] = {
                        "timing_bucket": timing_bucket,
                        "expected_reorder_days": round(expected_reorder_days, 1),
                        "days_overdue": round(days_overdue, 1),
                        "avg_cycle_days": round(avg_interval, 1),
                        "is_repeat_buyer": bool(is_repeat),
                        "regularity": round(regularity, 1),
                    }

                all_scores.append(entry)

            done = min(i + BATCH_SIZE, len(customer_ids))
            if done % 5000 == 0 or done == len(customer_ids):
                print(f"  Scored: {done}/{len(customer_ids)}")

        print(f"  Total scored: {len(all_scores)}")

        # Write scores to prediction_scores table
        with engine.begin() as conn:
            # Clear old scores
            conn.execute(text("""
                DELETE FROM prediction_scores
                WHERE project_id = :pid AND goal_id = :gid
            """), {"pid": project_id, "gid": goal_id})

            # Insert new scores
            for s in all_scores:
                factors_data = s.get("timing", {})
                conn.execute(text("""
                    INSERT INTO prediction_scores (id, project_id, customer_id, goal_id, score, confidence, bucket, factors, model_version, computed_at)
                    VALUES (:id, :pid, :cid, :gid, :score, :confidence, :bucket, :factors, :mv, :computed_at)
                """), {
                    "id": str(uuid.uuid4()),
                    "pid": project_id,
                    "cid": s["customer_id"],
                    "gid": goal_id,
                    "score": s["score"],
                    "confidence": s["confidence"],
                    "bucket": s["bucket"],
                    "factors": json.dumps(factors_data),
                    "mv": metadata["model_version"],
                    "computed_at": now,
                })

            # Also update customers.metrics with the score for segment builder
            metric_key = _goal_to_metric_key(goal_name)
            if metric_key:
                for s in all_scores:
                    conn.execute(text(f"""
                        UPDATE customers
                        SET metrics = jsonb_set(
                            COALESCE(metrics, '{{}}'::jsonb),
                            :path,
                            CAST(:val AS jsonb)
                        )
                        WHERE id = CAST(:cid AS uuid) AND project_id = :pid
                    """), {
                        "path": "{" + metric_key + "}",
                        "val": str(s["score"]),
                        "cid": s["customer_id"],
                        "pid": project_id,
                    })

            # Write reorder timing metrics to customers.metrics for segment evaluation
            if is_reorder_goal:
                timing_keys = ["days_overdue", "expected_reorder_days", "avg_cycle_days", "reorder_timing"]
                for s in all_scores:
                    timing = s.get("timing")
                    if not timing:
                        continue
                    conn.execute(text(f"""
                        UPDATE customers
                        SET metrics = metrics
                            || jsonb_build_object(
                                'days_overdue', CAST(:days_overdue AS numeric),
                                'expected_reorder_days', CAST(:expected_reorder_days AS numeric),
                                'avg_cycle_days', CAST(:avg_cycle_days AS numeric),
                                'reorder_timing', CAST(:timing_bucket AS text)
                            )
                        WHERE id = CAST(:cid AS uuid) AND project_id = :pid
                    """), {
                        "days_overdue": timing["days_overdue"],
                        "expected_reorder_days": timing["expected_reorder_days"],
                        "avg_cycle_days": timing["avg_cycle_days"],
                        "timing_bucket": timing["timing_bucket"] or "",
                        "cid": s["customer_id"],
                        "pid": project_id,
                    })

        print(f"  Written to DB ({len(all_scores)} scores, metric_key={metric_key})\n")

    print("Batch scoring complete.")


def _goal_to_metric_key(goal_name: str) -> str:
    name = goal_name.lower()
    if "dormancy" in name or "dormant" in name:
        return "dormancy_risk"
    elif "churn" in name or "uninstall" in name:
        return "churn_risk"
    elif "conversion" in name or "purchase" in name or "order" in name:
        return "conversion_score"
    elif "abandon" in name or "cart" in name:
        return "churn_risk"
    return "prediction_score"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", required=True)
    args = parser.parse_args()
    batch_score(args.project_id)
