"""Autoresearch Runner — Karpathy Loop Orchestrator.

Implements the three primitives:
1. Editable asset (train_propensity.py)
2. Scalar metric (AUC from eval harness)
3. Time-boxed cycle (configurable, default 120s)

Usage:
    python autoresearch_runner.py --project-id <UUID> --goal-id <UUID> --target-event <event> --cycles 10

Each cycle:
1. Run training
2. Capture scalar metric
3. Log to experiments/JSONL
4. If metric improved, keep the model; otherwise revert
5. Generate markdown report at the end
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

from propensity.train_propensity import train


def generate_report(
    goal_id: str,
    target_event: str,
    observation_days: int,
    prediction_days: int,
    cycles_data: list[dict],
    total_elapsed: float,
    best_auc: float,
    best_version: str | None,
    report_path: Path,
):
    """Generate a Karpathy-style markdown report from all cycle results."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    successful = [c for c in cycles_data if c["status"] == "success"]
    failed = [c for c in cycles_data if c["status"] == "failed"]
    errors = [c for c in cycles_data if c["status"] == "error"]
    insufficient = [c for c in cycles_data if c["status"] == "insufficient_data"]

    # AUC progression for successful cycles
    auc_values = [c["auc"] for c in successful]
    brier_values = [c.get("brier", 0) for c in successful]

    lines = [
        f"# Autoresearch Report — `{goal_id[:8]}`",
        "",
        f"> Generated: {now}",
        "",
        "## Configuration",
        "",
        "| Parameter | Value |",
        "| --- | --- |",
        f"| Goal ID | `{goal_id}` |",
        f"| Target Event | `{target_event}` |",
        f"| Observation Window | {observation_days} days |",
        f"| Prediction Window | {prediction_days} days |",
        f"| Total Cycles | {len(cycles_data)} |",
        f"| Total Runtime | {total_elapsed:.1f}s ({total_elapsed/60:.1f}m) |",
        "",
        "## Summary",
        "",
        f"| Outcome | Count |",
        f"| --- | --- |",
        f"| Successful | {len(successful)} |",
        f"| Failed (guardrail) | {len(failed)} |",
        f"| Errors | {len(errors)} |",
        f"| Insufficient Data | {len(insufficient)} |",
        "",
    ]

    if best_version:
        lines += [
            "### Best Model",
            "",
            f"- **AUC**: {best_auc:.4f}",
            f"- **Version**: `{best_version}`",
        ]
        if brier_values:
            best_idx = auc_values.index(best_auc) if best_auc in auc_values else -1
            if best_idx >= 0 and best_idx < len(brier_values):
                lines.append(f"- **Brier Score**: {brier_values[best_idx]:.4f}")
        lines.append("")
    else:
        lines += [
            "### No successful model produced",
            "",
        ]

    # Cycle-by-cycle table
    lines += [
        "## Cycle Results",
        "",
        "| Cycle | Status | AUC | Brier | Lift@10% | Time (s) | Notes |",
        "| ---: | --- | ---: | ---: | ---: | ---: | --- |",
    ]

    running_best = 0.0
    for c in cycles_data:
        cycle_num = c["cycle"]
        status = c["status"]
        elapsed = c["elapsed_seconds"]

        if status == "success":
            auc = c["auc"]
            brier = c.get("brier", 0)
            lift = c.get("lift_at_10pct", 0)
            is_best = auc > running_best
            if is_best:
                running_best = auc
            note = "**NEW BEST**" if is_best else ""
            lines.append(f"| {cycle_num} | {status} | {auc:.4f} | {brier:.4f} | {lift:.2f}x | {elapsed} | {note} |")
        elif status == "failed":
            reason = c.get("reason", "unknown")
            auc = c.get("auc", 0)
            lines.append(f"| {cycle_num} | {status} | {auc:.4f} | — | — | {elapsed} | {reason} |")
        elif status == "insufficient_data":
            n_pos = c.get("n_positive", 0)
            min_req = c.get("min_required", 200)
            lines.append(f"| {cycle_num} | {status} | — | — | — | {elapsed} | {n_pos}/{min_req} positive labels |")
        else:
            err = c.get("error", "unknown")[:50]
            lines.append(f"| {cycle_num} | error | — | — | — | {elapsed} | {err} |")

    lines.append("")

    # AUC progression chart (ASCII sparkline)
    if len(auc_values) >= 2:
        lines += [
            "## AUC Progression",
            "",
            "```",
        ]
        min_auc = min(auc_values)
        max_auc_val = max(auc_values)
        auc_range = max_auc_val - min_auc if max_auc_val > min_auc else 0.01
        chart_width = 40

        for i, auc in enumerate(auc_values):
            bar_len = int(((auc - min_auc) / auc_range) * chart_width)
            bar = "█" * max(bar_len, 1)
            marker = " ◄ best" if auc == best_auc else ""
            lines.append(f"  Cycle {i+1:2d} │ {bar} {auc:.4f}{marker}")

        lines += [
            "```",
            "",
        ]

    # Top features from best model
    best_cycle = next((c for c in successful if c.get("auc") == best_auc), None)
    if best_cycle and best_cycle.get("feature_ranking"):
        lines += [
            "## Top Features (Best Model)",
            "",
            "| Rank | Feature | SHAP Importance |",
            "| ---: | --- | ---: |",
        ]
        for rank, (feat, imp) in enumerate(best_cycle["feature_ranking"][:10], 1):
            lines.append(f"| {rank} | `{feat}` | {imp:.4f} |")
        lines.append("")

    # Guardrail failures
    if failed:
        lines += [
            "## Guardrail Failures",
            "",
        ]
        for c in failed:
            lines.append(f"- **Cycle {c['cycle']}**: {c.get('reason', 'unknown')}")
        lines.append("")

    # Footer
    lines += [
        "---",
        "",
        f"*JSONL log: `experiments/autoresearch_{goal_id}.jsonl`*",
        f"*Model artifacts: `models/propensity_{goal_id}/`*",
    ]

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines))


def run_autoresearch(
    project_id: str,
    goal_id: str,
    target_event: str,
    cycles: int = 10,
    max_cycle_seconds: int = 120,
    observation_days: int = 90,
    prediction_days: int = 14,
):
    """Run autoresearch loop for propensity model."""
    log_path = Path("experiments") / f"autoresearch_{goal_id}.jsonl"
    report_path = Path("experiments") / f"report_{goal_id}.md"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    best_auc = 0.0
    best_version = None
    cycles_data: list[dict] = []
    total_start = time.time()

    print(f"[autoresearch] Starting {cycles} cycles for goal={goal_id}")
    print(f"[autoresearch] Target: {target_event}, obs={observation_days}d, pred={prediction_days}d")

    for cycle in range(1, cycles + 1):
        cycle_start = time.time()
        print(f"\n{'='*60}")
        print(f"[autoresearch] Cycle {cycle}/{cycles}")
        print(f"{'='*60}")

        try:
            result = train(
                project_id=project_id,
                goal_id=goal_id,
                target_event=target_event,
                observation_days=observation_days,
                prediction_days=prediction_days,
            )
        except Exception as e:
            result = {"status": "error", "error": str(e)}

        elapsed = round(time.time() - cycle_start, 1)

        # Build log entry
        entry = {
            "cycle": cycle,
            "timestamp": datetime.utcnow().isoformat(),
            "elapsed_seconds": elapsed,
            "goal_id": goal_id,
            **result,
        }
        cycles_data.append(entry)

        # Append to JSONL
        with open(log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")

        # Track best
        if result.get("status") == "success":
            auc = result.get("auc", 0)
            if auc > best_auc:
                best_auc = auc
                best_version = result.get("model_version")
                print(f"[autoresearch] NEW BEST: AUC={auc:.4f} (version={best_version})")
            else:
                print(f"[autoresearch] No improvement: AUC={auc:.4f} <= {best_auc:.4f}")
        elif result.get("status") == "insufficient_data":
            print(f"[autoresearch] INSUFFICIENT DATA — stopping early")
            break
        elif result.get("status") == "failed":
            print(f"[autoresearch] FAILED: {result.get('reason')}")
        else:
            print(f"[autoresearch] ERROR: {result.get('error', 'unknown')}")

        # Time budget check
        if elapsed > max_cycle_seconds:
            print(f"[autoresearch] Cycle exceeded time budget ({elapsed}s > {max_cycle_seconds}s)")

    total_elapsed = round(time.time() - total_start, 1)

    # Generate markdown report
    generate_report(
        goal_id=goal_id,
        target_event=target_event,
        observation_days=observation_days,
        prediction_days=prediction_days,
        cycles_data=cycles_data,
        total_elapsed=total_elapsed,
        best_auc=best_auc,
        best_version=best_version,
        report_path=report_path,
    )

    print(f"\n{'='*60}")
    print(f"[autoresearch] Complete. Best AUC={best_auc:.4f}, version={best_version}")
    print(f"[autoresearch] JSONL log: {log_path}")
    print(f"[autoresearch] Report:    {report_path}")
    return {"best_auc": best_auc, "best_version": best_version, "report_path": str(report_path)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Autoresearch Runner")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--goal-id", required=True)
    parser.add_argument("--target-event", required=True)
    parser.add_argument("--cycles", type=int, default=10)
    parser.add_argument("--max-cycle-seconds", type=int, default=120)
    parser.add_argument("--observation-days", type=int, default=90)
    parser.add_argument("--prediction-days", type=int, default=14)
    args = parser.parse_args()

    run_autoresearch(
        project_id=args.project_id,
        goal_id=args.goal_id,
        target_event=args.target_event,
        cycles=args.cycles,
        max_cycle_seconds=args.max_cycle_seconds,
        observation_days=args.observation_days,
        prediction_days=args.prediction_days,
    )
