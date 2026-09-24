"""Train every configured goal for one project, and say what happened.

Why the goal is resolved from the NAME and not from `target_event`: two of this
project's goals carry the same target_event (`order_placed`) because both are about
purchasing — one asks "will they buy?" and the other "will they buy AGAIN?". The
target event is identical; the population and the label are not. Keying on it would
silently train the same model twice.

Usage:
    python3 run_all_goals.py [project_id]
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from shared.config import load_config  # noqa: E402
# resolve_goal owns the name table -- see train_propensity. Imported rather than
# copied so this and publish_results cannot drift into disagreeing about which model
# a goal row means.
from propensity.train_propensity import train, resolve_goal, resolve_dataset  # noqa: E402


def main(project_id: str, only: set[str] | None = None) -> None:
    cfg = load_config()
    conn = psycopg2.connect(cfg.database_url)
    cur = conn.cursor()
    # `windows_pinned` and the two window columns come along so a goal whose owner
    # chose its windows can have them honoured. Every other goal ignores all three and
    # derives its own, exactly as before.
    cur.execute(
        "SELECT id, name, target_event, windows_pinned, "
        "       observation_window_days, prediction_window_days "
        "FROM prediction_goals WHERE project_id = %s ORDER BY name",
        (project_id,),
    )
    goals = cur.fetchall()
    cur.close()
    conn.close()

    if not goals:
        print(f"no goals configured for {project_id}")
        return

    _events = resolve_dataset(project_id).events
    purchase_events = tuple(_events.purchase)
    abandon_events = tuple(_events.cart_abandon)

    results = []
    for goal_id, name, target_event, pinned, obs_days, pred_days in goals:
        goal = resolve_goal(name, target_event, purchase_events, abandon_events)
        if not goal:
            print(f"\n=== {name}: no pipeline goal and no target event — skipped")
            continue
        if only and goal not in only:
            continue

        print(f"\n{'=' * 78}\n=== {name}  ->  {goal}\n{'=' * 78}", flush=True)
        started = time.time()
        try:
            r = train(project_id, str(goal_id), goal,
                      observation_days=obs_days if pinned else None,
                      prediction_days=pred_days if pinned else None)
        except Exception as exc:  # a failed goal must not stop the rest
            print(f"[run] {goal} FAILED: {exc}")
            results.append((name, goal, "FAILED", None, None, None, str(exc)[:60]))
            continue

        results.append((
            name, goal, r.get("status"),
            r.get("test_auc_global"), r.get("test_auc_active_segment"),
            (r.get("selection") or {}).get("chosen_k"),
            f"{int(time.time() - started)}s",
        ))

    print(f"\n\n{'=' * 78}\n=== SUMMARY\n{'=' * 78}")
    print(f"{'goal':<28} {'status':<10} {'global':>8} {'active':>8} {'k':>4}  time")
    for name, goal, status, g, a, k, t in results:
        gs = "-" if g is None else f"{g:.4f}"
        as_ = "-" if a is None else f"{a:.4f}"
        print(f"{name:<28} {str(status):<10} {gs:>8} {as_:>8} {str(k or '-'):>4}  {t}")


if __name__ == "__main__":
    # The project id is REQUIRED. It used to default to one client's uuid, which is a
    # single tenant's identity sitting inside code that claims to serve any of them --
    # run it without an argument in production and it silently trains someone else's
    # project. Better to refuse than to guess whose data this is.
    if len(sys.argv) < 2:
        sys.exit("usage: python3 run_all_goals.py <project_id> [goal,goal,...]\n"
                 "  goals: purchase, repeat_purchase, dormancy, churn, cart_abandoned")
    # optional 2nd arg: comma-separated pipeline goals to run, e.g. "churn,repeat_purchase"
    main(sys.argv[1], set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None)
