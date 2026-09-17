"""Who is eligible for each goal, and what actually happened to them.

PORTED from the platform reference implementation. Populations and label definitions
are unchanged; what changed is that windows are now PASSED IN (derived per project by
windows.py) instead of being read from a global table of hand-typed values, and the
tenant key is the project rather than a business type.

SPLIT DISCIPLINE, unchanged: eligibility looks only at `< cutoff`; the label looks
only at `[cutoff, cutoff + prediction_window)`. Selection uses the past; the answer
comes from the future; they never touch.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd

import sys

from shared.dataset import ProjectDataset
from shared.windows import event_goal_target

# Per business_type, per goal: how far BACK features look (obs) and how far
# FORWARD the label looks (pred). Not one-size-fits-all -- B2B cycles run
# much slower than B2C's, and each goal needs a different amount of lookback
# to establish a baseline (churn needs more history to know what "normal"
# looks like; cart_abandoned only cares about very recent behavior).
# These are generic per-business-type-archetype defaults, not tied to any
# specific client -- a future project can override them once it has enough
# history to justify different values.
# GOAL_WINDOWS now lives in shared/config.py (imported above).




def build_labels(
    dataset: ProjectDataset,
    goal: str,
    cutoff_ts: str,
    obs_window_days: int,
    prediction_window_days: int,
    con: duckdb.DuckDBPyConnection | None = None,
) -> pd.Series:
    window = prediction_window_days
    # event names for THIS project, resolved once (see dataset.EventMap)
    ev_view = dataset.events.sql_in('view')
    ev_cart = dataset.events.sql_in('cart_add')
    ev_abandon = dataset.events.sql_in('cart_abandon')

    own_con = con is None
    con = con or duckdb.connect()
    con.execute("PRAGMA disable_progress_bar")
    dataset.prepare(con)

    customers_src = dataset.source("customers")
    orders_src = dataset.source("orders")
    events_src = dataset.source("events")
    # normalised: our own outbound messages dropped, cart snapshots
    # turned into real adds when this project sends snapshots
    events_src = f"({dataset.events_source()})"

    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW _customers AS
        SELECT * FROM ({customers_src}) WHERE first_seen < TIMESTAMP '{cutoff_ts}'
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW _obs_events AS
        SELECT * FROM {events_src}
        WHERE timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{obs_window_days} days'
          AND timestamp < TIMESTAMP '{cutoff_ts}'
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW _obs_orders AS
        SELECT * FROM ({orders_src})
        WHERE timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{obs_window_days} days'
          AND timestamp < TIMESTAMP '{cutoff_ts}'
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW _label_events AS
        SELECT * FROM {events_src}
        WHERE timestamp >= TIMESTAMP '{cutoff_ts}'
          AND timestamp < TIMESTAMP '{cutoff_ts}' + INTERVAL '{window} days'
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW _label_orders AS
        SELECT * FROM ({orders_src})
        WHERE timestamp >= TIMESTAMP '{cutoff_ts}'
          AND timestamp < TIMESTAMP '{cutoff_ts}' + INTERVAL '{window} days'
    """)

    if goal == "purchase":
        # Population: any customer seen before cutoff. Label: did they order in the window?
        df = con.execute("""
            SELECT c.customer_id,
                   (o.customer_id IS NOT NULL)::INT AS label
            FROM _customers c
            LEFT JOIN (SELECT DISTINCT customer_id FROM _label_orders) o
                   ON o.customer_id = c.customer_id
        """).df()

    elif goal == "repeat_purchase":
        # Population: customers with >=1 order BEFORE cutoff (existing buyers).
        # Label: did they order AGAIN in the window?
        df = con.execute("""
            WITH existing_buyers AS (
                SELECT DISTINCT customer_id FROM (
                    SELECT customer_id, timestamp FROM ({orders_src})
                ) WHERE timestamp < TIMESTAMP '{cutoff}'
            )
            SELECT b.customer_id,
                   (lo.customer_id IS NOT NULL)::INT AS label
            FROM existing_buyers b
            LEFT JOIN (SELECT DISTINCT customer_id FROM _label_orders) lo
                   ON lo.customer_id = b.customer_id
        """.format(orders_src=orders_src, cutoff=cutoff_ts)).df()

    elif goal == "churn":
        # ORDER-BASED: a BUYER who stops ordering (real revenue loss). Population:
        # customers who ORDERED in the observation window. Label: 1 if they did NOT
        # order again in the prediction window (stopped buying).
        df = con.execute("""
            WITH buyers AS (SELECT DISTINCT customer_id FROM _obs_orders),
                 future_orders AS (SELECT DISTINCT customer_id FROM _label_orders)
            SELECT b.customer_id,
                   (fo.customer_id IS NULL)::INT AS label
            FROM buyers b
            LEFT JOIN future_orders fo ON fo.customer_id = b.customer_id
        """).df()

    elif goal == "dormancy":
        # ACTIVITY-BASED (early-warning tier): an engaged customer who goes quiet on
        # ANY activity. Population: active (event or order) in the observation window
        # (covers browsers too). Label: 1 if NO activity at all in the prediction window.
        df = con.execute("""
            WITH active AS (
                SELECT customer_id FROM _obs_events
                UNION
                SELECT customer_id FROM _obs_orders
            ),
            future_activity AS (
                SELECT customer_id FROM _label_events
                UNION
                SELECT customer_id FROM _label_orders
            )
            SELECT a.customer_id,
                   (f.customer_id IS NULL)::INT AS label
            FROM (SELECT DISTINCT customer_id FROM active) a
            LEFT JOIN (SELECT DISTINCT customer_id FROM future_activity) f
                   ON f.customer_id = a.customer_id
        """).df()

    elif goal == "cart_abandoned":
        # Population: customers who added to cart during the observation window
        # AND had not completed an order after that cart add by cutoff (i.e.
        # they're sitting in an "abandoned" state as of cutoff).
        # Label: 1 if they STILL haven't ordered by the end of the window
        # (true abandonment); 0 if they convert (recovered).
        #
        # (2026-07-16: briefly tried flipping this to a RECOVERY label --
        # measurably better lift, 3.2x/2.6x vs 1.06x/1.39x here -- but reverted
        # per explicit instruction: the product wants abandonment itself
        # predicted, not recovery. Known trade-off, accepted: this framing's
        # base rate is high (~94% b2c / ~69% b2b abandoners stay abandoned in
        # the short window), which caps how much lift is achievable -- most of
        # the population trivially resolves to "yes, abandoned," so there's
        # less room for the model to beat that baseline.)
        df = con.execute(f"""
            WITH last_cart AS (
                SELECT customer_id, max(timestamp) AS last_cart_ts
                FROM _obs_events WHERE event_name IN ({ev_cart})
                GROUP BY customer_id
            ),
            orders_after_cart AS (
                SELECT lc.customer_id
                FROM last_cart lc
                JOIN _obs_orders o
                  ON o.customer_id = lc.customer_id AND o.timestamp > lc.last_cart_ts
            ),
            at_risk AS (
                SELECT lc.customer_id
                FROM last_cart lc
                LEFT JOIN orders_after_cart oac ON oac.customer_id = lc.customer_id
                WHERE oac.customer_id IS NULL
            )
            SELECT ar.customer_id,
                   (lo.customer_id IS NULL)::INT AS label
            FROM at_risk ar
            LEFT JOIN (SELECT DISTINCT customer_id FROM _label_orders) lo
                   ON lo.customer_id = ar.customer_id
        """).df()

    elif (target_event := event_goal_target(goal)):
        # WILL THIS EVENT HAPPEN? — the shape every non-retail vertical's main question
        # takes, and the one the five goals above cannot express: `emi_missed`,
        # `subscription_cancelled`, `course_dropped`, `trial_expired`. Each is a
        # specific event that is neither the purchase nor silence.
        #
        # POPULATION — who was plausibly at risk. Scoring everybody would be the
        # cheapest possible mistake here: a lender's customers who never took a loan
        # cannot miss a payment, so they resolve to "no" for a reason the model does
        # not have to learn, the base rate collapses, and the AUC looks excellent while
        # the model has learned "did they borrow".
        #
        # At risk is taken as: has bought before the cutoff (they are in the
        # relationship the event belongs to) OR has had this event before the cutoff
        # (whatever their route in, it demonstrably applies to them). Both look only
        # backwards, so neither leaks. A project needing a narrower rule -- open loans
        # only, rather than anyone who ever borrowed -- states it per goal; this is the
        # generic floor, not a claim to be right for every product.
        #
        # LABEL — did it happen in the window. Repeats are allowed to recur: someone
        # who missed a payment last month can miss another, and excluding them would
        # quietly redefine the question as "first occurrence only".
        ev_target = dataset.events.sql_in_names([target_event])
        df = con.execute(f"""
            WITH prior_buyers AS (
                SELECT DISTINCT customer_id FROM ({orders_src})
                WHERE timestamp < TIMESTAMP '{cutoff_ts}'
            ),
            prior_event AS (
                SELECT DISTINCT customer_id FROM {events_src}
                WHERE event_name IN ({ev_target})
                  AND timestamp < TIMESTAMP '{cutoff_ts}'
            ),
            at_risk AS (
                SELECT customer_id FROM prior_buyers
                UNION
                SELECT customer_id FROM prior_event
            ),
            happened AS (
                SELECT DISTINCT customer_id FROM _label_events
                WHERE event_name IN ({ev_target})
            )
            SELECT a.customer_id,
                   (h.customer_id IS NOT NULL)::INT AS label
            FROM at_risk a
            LEFT JOIN happened h ON h.customer_id = a.customer_id
        """).df()

    else:
        raise ValueError(goal)

    if own_con:
        con.close()

    return df.set_index("customer_id")["label"]


if __name__ == "__main__":
    # smoke check: population + positive rate for one project at one cutoff
    import sys, datetime as dt
    from shared.dataset import ProjectDataset, EventMap
    from shared.windows import derive, GOALS

    root, cutoff = sys.argv[1], sys.argv[2]
    ds = ProjectDataset.from_path("smoke", root, EventMap())
    for goal in GOALS:
        try:
            y = build_labels(ds, goal, cutoff, 14, 14)
            pos = int(y.sum())
            print(f"{goal:<16} population={len(y):>8,}  positives={pos:>7,} "
                  f"({pos / max(len(y), 1) * 100:.2f}%)")
        except Exception as exc:                      # a goal this project cannot support
            print(f"{goal:<16} n/a — {exc}")
