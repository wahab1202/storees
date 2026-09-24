"""Candidate feature construction for one project, as of a cutoff.

PORTED from the platform reference implementation. The computation is unchanged --
same features, same leak-safe boundaries -- but the two things that made it
single-tenant are gone:

  * the tenant key was a business type ("b2b"/"b2c"), which meant two B2B companies
    shared one folder and silently overwrote each other. It is now a ProjectDataset.
  * event names were literals in the SQL. They now come from the project's own
    EventMap, so a company that calls it `cart_updated` needs no code change.

LEAK RULE, unchanged and load-bearing: every feature reads strictly
`WHERE timestamp < cutoff`. Nothing here may see the period it will be judged on.
"""

from __future__ import annotations

from pathlib import Path

from typing import Sequence

import duckdb
import pandas as pd

import sys
from shared.dataset import ProjectDataset

# Sub-windows are fractions of obs_window_days, not fixed day counts. The
# "full window" fraction (1.0) is deliberately omitted -- it would just
# duplicate total_events/total_orders/total_spent, which already cover it.
WINDOW_FRACTIONS = [0.125, 0.25, 0.5]
# Recency-decay halflife for the momentum score, also a fraction of
# obs_window_days rather than a fixed day count.
DECAY_HALFLIFE_FRACTION = 0.25
# Second, longer-memory decay halflife -- same idea, slower forgetting, so
# selection can tell "fast momentum" and "slow momentum" apart as distinct
# signals instead of collapsing them into one timescale.
DECAY_HALFLIFE_FRACTION_SLOW = 0.5


def _slug(name: str) -> str:
    """A project's own meaning name -> a safe column prefix.

    The name comes from a client's configuration, so it reaches SQL as an identifier
    and cannot be trusted to be one. Anything outside [a-z0-9_] becomes an underscore.
    """
    import re
    cleaned = re.sub(r"[^a-z0-9_]+", "_", str(name).strip().lower()).strip("_")
    return cleaned or "signal"


def _sub_windows(obs_window_days: int) -> list[int]:
    """Derive deduplicated day-windows from obs_window_days via WINDOW_FRACTIONS."""
    days = sorted({max(1, round(obs_window_days * f)) for f in WINDOW_FRACTIONS})
    return [d for d in days if d < obs_window_days]  # drop any that collapsed onto the full window


# tenant key is the PROJECT, not a business type -- see dataset.ProjectDataset


class PopulationSnapshotMissing(RuntimeError):
    """Raised when a narrowed build cannot honestly produce the population ranks.

    Deliberately an exception rather than a default. A zero, a 0.5 or a rank taken
    over the handful of customers in hand all LOOK like answers, and the model would
    score on them without complaint — the silent-wrong-number failure this codebase
    has been bitten by repeatedly. Refusing sends the caller back to a full build.
    """


#: THE FEATURES THAT COMPARE A CUSTOMER AGAINST EVERYONE ELSE.
#:
#: Every other feature describes one customer in isolation — their orders, their gaps,
#: their basket. These eight are the exception: each is a customer's RANK within the
#: whole population, so computing one customer's value requires knowing everybody's.
#:
#: That is why scoring a single shopper currently measures the entire customer base:
#: eight features out of ~190 drag the other 3,400 customers in with them. Naming them
#: here is what lets that be avoided — the population's shape can be recorded once and
#: looked up, instead of rebuilt on every event.
#:
#: feature name -> (source column, invert)
#: `invert` flips the direction: fewer days since last event means MORE recent, so the
#: rank is taken over the negated column.
POPULATION_RANKS: dict[str, tuple[str, bool]] = {
    "spend_percentile_rank":             ("total_spent",           False),
    "order_count_percentile_rank":       ("total_orders",          False),
    "engagement_percentile_rank":        ("total_events",          False),
    "recency_percentile_rank":           ("days_since_last_event", True),
    "avg_order_value_percentile_rank":   ("avg_order_value",       False),
    "tenure_percentile_rank":            ("days_since_first_seen", False),
    # ranked on the session COUNT rather than the per-week rate: the rate was the
    # count over a constant, so the two rank identically and only one needs to exist
    "session_frequency_percentile_rank": ("distinct_sessions",     False),
    "active_days_percentile_rank":       ("distinct_active_days",  False),
}


def build_feature_matrix(
    dataset: ProjectDataset,
    cutoff_ts: str,
    obs_window_days: int = 90,
    con: duckdb.DuckDBPyConnection | None = None,
    only: "Sequence[str] | None" = None,
) -> pd.DataFrame:
    """Build the feature matrix, releasing the connection on every path.

    `only` NARROWS THE BUILD TO NAMED CUSTOMERS, and is the whole reason this
    parameter exists. Scoring one shopper measured the entire customer base — 3,413
    customers to use one — because eight of the ~190 features are ranks against the
    population and the builder had no way to be told otherwise. Passing `only` builds
    just those customers and reconstructs the eight from a recorded snapshot instead.

    OMITTING IT IS EXACTLY TODAY'S BEHAVIOUR. Training, feature selection and the daily
    sweep genuinely want the whole population and pass nothing, so nothing about them
    changes. Only the per-event scoring path asks.

    The body below closes its own connection on the way out, which covers the happy path
    only. A build that raises left the duckdb handle open, and with it the Postgres
    connection its ATTACH holds — so one failure cost one connection permanently.

    That is normally invisible. It stopped being invisible when scoring started making
    one request per batch: the failures compounded until Postgres refused everyone with
    `sorry, too many clients already`, at which point the ML service, the backend and
    psql were all locked out of the database by leaked handles.
    """
    if con is not None:
        return _build_feature_matrix(dataset, cutoff_ts, obs_window_days, con, only)
    own = duckdb.connect()
    try:
        return _build_feature_matrix(dataset, cutoff_ts, obs_window_days, own, only)
    finally:
        own.close()


def _build_feature_matrix(
    dataset: ProjectDataset,
    cutoff_ts: str,
    obs_window_days: int = 90,
    con: duckdb.DuckDBPyConnection | None = None,
    only: "Sequence[str] | None" = None,
) -> pd.DataFrame:
    """Build the universal candidate feature matrix as of cutoff_ts.

    Same computation for b2b and b2c -- see module docstring. Column names
    for the windowed features depend on obs_window_days (e.g. events_11d
    for obs=21 vs events_19d for obs=150); this is stable within a single
    (business_type, goal) since obs_window_days doesn't vary across folds/
    validation/test for one goal, only across goals.
    """
    own_con = con is None
    con = con or duckdb.connect()
    con.execute("PRAGMA memory_limit='11GB'")
    con.execute("PRAGMA disable_progress_bar")
    dataset.prepare(con)
    # event names for THIS project, resolved once (see dataset.EventMap)
    ev_view = dataset.events.sql_in('view')
    ev_cart = dataset.events.sql_in('cart_add')
    ev_abandon = dataset.events.sql_in('cart_abandon')
    # This project's OWN meanings, beyond the ones cleaning acts on. Sorted so column
    # order is stable run to run -- see the determinism note at the end of this file.
    own_signals = sorted((dataset.events.signals or {}).items())

    customers_src = dataset.source("customers")
    orders_src = dataset.source("orders")
    events_src = dataset.source("events")
    # normalised: our own outbound messages dropped, cart snapshots
    # turned into real adds when this project sends snapshots
    events_src = f"({dataset.events_source()})"
    products_src = dataset.source("products")
    # NARROWING HAPPENS AT THE SOURCE, not after the fact. Everything downstream joins
    # `_customers`, so restricting it here means the events, orders and every CTE built
    # on top read only these customers' rows — which is where the saving is. Filtering
    # the finished matrix instead (what scoring did) computes all of it first and then
    # throws it away.
    # Applied to EVERY per-customer view, not just `_customers`. Narrowing the customer
    # list alone changed nothing measurable — the event and order scans dominate, and
    # they were still reading the whole project before being joined down to a handful.
    _only_sql = ""
    if only:
        _ids = ",".join("'" + str(c).replace("'", "''") + "'" for c in only)
        _only_sql = f" AND customer_id IN ({_ids})" if _ids else " AND false"
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW _customers AS
        SELECT * FROM ({customers_src}) WHERE first_seen < TIMESTAMP '{cutoff_ts}'{_only_sql}
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW _events AS
        SELECT * FROM {events_src}
        WHERE timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{obs_window_days} days'
          AND timestamp < TIMESTAMP '{cutoff_ts}'{_only_sql}
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW _orders AS
        SELECT * FROM ({orders_src})
        WHERE timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{obs_window_days} days'
          AND timestamp < TIMESTAMP '{cutoff_ts}'{_only_sql}
    """)
    con.execute(f"CREATE OR REPLACE TEMP VIEW _products AS SELECT * FROM ({products_src})")

    sub_windows = _sub_windows(obs_window_days)  # e.g. [3, 5, 11] for obs=21
    smallest_w = sub_windows[0]
    decay_halflife = max(obs_window_days * DECAY_HALFLIFE_FRACTION, 1)
    decay_halflife_slow = max(obs_window_days * DECAY_HALFLIFE_FRACTION_SLOW, 1)
    half_w = max(obs_window_days // 2, 1)  # obs-window midpoint, shared by session_stats + collaborative CTEs below

    # ---- one feature family per meaning THIS project named ------------------------
    #
    # The three event slots above are the ones cleaning understands. Everything else a
    # company sends reaches the model only inside `total_events` -- so a lender's
    # `emi_missed` is worth exactly as much as a page view, which is the single biggest
    # reason a non-retail project scores badly.
    #
    # Each named meaning gets the same four measures, and no more: how much, how
    # recently, which direction, and how large a share of what they do. Four rather
    # than forty because they are auditioned against ~179 existing candidates and
    # selection drops what does not earn its place -- a wide family per signal would
    # crowd the ranking with near-duplicates of itself.
    #
    # Nothing here knows what any of them mean. `emi_missed` and `lesson_completed`
    # produce identical SQL.
    signal_aggs, signal_cols, signal_candidate_cols = [], [], []
    for slug, names in own_signals:
        col = _slug(slug)
        in_list = ",".join("'" + str(n).replace("'", "''") + "'" for n in names) or "''"
        member = f"event_name IN ({in_list})"
        signal_aggs.append(f"""
            count(*) FILTER ({member}) AS sig_{col}_n,
            max(timestamp) FILTER ({member}) AS sig_{col}_last,
            count(*) FILTER ({member}
                AND timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{smallest_w} days') AS sig_{col}_recent,
            count(*) FILTER ({member}
                AND timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{2*smallest_w} days'
                AND timestamp <  TIMESTAMP '{cutoff_ts}' - INTERVAL '{smallest_w} days') AS sig_{col}_prev,
        """)
        signal_cols.append(f"""
            COALESCE(e.sig_{col}_n, 0) AS {col}_count,
            -- no occurrence falls back to tenure, the same convention the view and
            -- cart recencies use, so "never" reads as "a very long time ago"
            date_diff('day', COALESCE(e.sig_{col}_last, b.first_seen),
                      TIMESTAMP '{cutoff_ts}') AS days_since_{col},
            COALESCE(e.sig_{col}_recent, 0)::DOUBLE
                / GREATEST(e.sig_{col}_prev, 1) AS {col}_trend,
            COALESCE(e.sig_{col}_n, 0)::DOUBLE
                / GREATEST(e.total_events, 1) AS {col}_share,
        """)
        signal_candidate_cols += [f"{col}_count", f"days_since_{col}",
                                  f"{col}_trend", f"{col}_share"]

    # ---- build the windowed SQL fragments dynamically (variable, not hardcoded) ----
    events_window_exprs = []
    orders_window_exprs = []
    spent_window_exprs = []
    windowed_candidate_cols = []
    for w in sub_windows:
        events_window_exprs.append(f"""
            count(*) FILTER (timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{w} days') AS events_{w}d,
            count(*) FILTER (timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{2*w} days'
                              AND timestamp < TIMESTAMP '{cutoff_ts}' - INTERVAL '{w} days') AS events_prev_{w}d,
        """)
        orders_window_exprs.append(f"""
            count(*) FILTER (timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{w} days') AS orders_{w}d,
            count(*) FILTER (timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{2*w} days'
                              AND timestamp < TIMESTAMP '{cutoff_ts}' - INTERVAL '{w} days') AS orders_prev_{w}d,
        """)
        spent_window_exprs.append(f"""
            sum(total) FILTER (timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{w} days') AS spent_{w}d,
            sum(total) FILTER (timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{2*w} days'
                                AND timestamp < TIMESTAMP '{cutoff_ts}' - INTERVAL '{w} days') AS spent_prev_{w}d,
        """)
        windowed_candidate_cols += [
            f"events_{w}d", f"event_trend_{w}d",
            f"orders_{w}d", f"order_trend_{w}d",
            f"spent_{w}d", f"spend_trend_{w}d",
        ]

    core = con.execute(f"""
        WITH base AS (SELECT customer_id, first_seen FROM _customers),

        ev_agg AS (
            SELECT
                customer_id,
                count(*) AS total_events,
                {' '.join(signal_aggs)}
                count(*) FILTER (event_name IN ({ev_view})) AS total_views,
                count(*) FILTER (event_name IN ({ev_cart}))    AS total_carts,
                max(timestamp)                                   AS last_event_ts,
                max(timestamp) FILTER (event_name IN ({ev_view}))  AS last_view_ts,
                max(timestamp) FILTER (event_name IN ({ev_cart}))     AS last_cart_ts,
                count(DISTINCT date_trunc('day', timestamp))     AS distinct_active_days,
                count(DISTINCT date_trunc('week', timestamp))    AS distinct_active_weeks,
                count(DISTINCT date_trunc('day', timestamp))
                    FILTER (timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{smallest_w} days') AS active_days_recent,
                {' '.join(events_window_exprs)}
                sum(exp(-date_diff('day', timestamp, TIMESTAMP '{cutoff_ts}')::DOUBLE / {decay_halflife})) AS recency_weighted_activity,
                sum(exp(-date_diff('day', timestamp, TIMESTAMP '{cutoff_ts}')::DOUBLE / {decay_halflife_slow})) AS recency_weighted_activity_slow,
                count(DISTINCT hour(timestamp)) AS distinct_active_hours,
                count(DISTINCT date_trunc('day', timestamp))
                    FILTER (timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{2*smallest_w} days'
                             AND timestamp < TIMESTAMP '{cutoff_ts}' - INTERVAL '{smallest_w} days') AS active_days_prev,
                avg(CASE WHEN dayofweek(timestamp) IN (0,6) THEN 1.0 ELSE 0.0 END) AS weekend_ratio,
                avg(CASE WHEN hour(timestamp) BETWEEN 9 AND 18 THEN 1.0 ELSE 0.0 END) AS business_hours_ratio,
                -- DETERMINISTIC most-common day. Plain mode() breaks a tie by
                -- whichever row the engine happened to read first, and it reads in
                -- parallel -- so a customer equally active on two days gets a
                -- different answer run to run. That is not a rounding wobble: it
                -- reorders feature groups, which reorders the ranking, which changes
                -- how many features the sweep keeps, which changes the model. Ties
                -- now resolve to the lowest day number, always.
                (SELECT dow FROM (
                     SELECT dayofweek(e2.timestamp) AS dow, count(*) AS n
                     FROM _events e2
                     WHERE e2.customer_id = _events.customer_id
                     GROUP BY 1 ORDER BY n DESC, dow ASC LIMIT 1
                 )) AS preferred_day_of_week
            FROM _events
            GROUP BY customer_id
        ),

        ranked_events AS (
            SELECT customer_id, timestamp,
                   row_number() OVER (PARTITION BY customer_id ORDER BY timestamp DESC) AS rn_desc
            FROM _events
        ),
        second_last_event AS (
            SELECT customer_id, timestamp AS second_last_event_ts FROM ranked_events WHERE rn_desc = 2
        ),
        ranked_orders AS (
            SELECT customer_id, timestamp,
                   row_number() OVER (PARTITION BY customer_id ORDER BY timestamp DESC) AS rn_desc
            FROM _orders
        ),
        second_last_order AS (
            SELECT customer_id, timestamp AS second_last_purchase_ts FROM ranked_orders WHERE rn_desc = 2
        ),
        order_value_shares AS (
            SELECT customer_id,
                   total / GREATEST(sum(total) OVER (PARTITION BY customer_id), 0.01) AS share
            FROM _orders
        ),
        order_value_conc AS (
            SELECT customer_id, sum(power(share, 2)) AS order_value_concentration
            FROM order_value_shares GROUP BY customer_id
        ),

        ev_gaps AS (
            SELECT customer_id,
                   date_diff('day', lag(timestamp) OVER (PARTITION BY customer_id ORDER BY timestamp), timestamp) AS gap_days
            FROM _events
        ),
        ev_gap_stats AS (
            SELECT customer_id,
                   avg(gap_days) AS avg_event_gap,
                   stddev_samp(gap_days) AS event_gap_stddev,
                   max(gap_days) AS longest_inactive_streak
            FROM ev_gaps WHERE gap_days IS NOT NULL
            GROUP BY customer_id
        ),

        ord_agg AS (
            SELECT
                customer_id,
                count(*)          AS total_orders,
                sum(total)        AS total_spent,
                avg(total)        AS avg_order_value,
                max(total)        AS max_order_value,
                min(total)        AS min_order_value,
                stddev_samp(total) AS order_value_stddev,
                min(timestamp)    AS first_purchase_ts,
                max(timestamp)    AS last_purchase_ts,
                avg(len(line_items)) AS avg_items_per_order,
                last(total ORDER BY timestamp) AS last_order_value,
                median(total) AS median_order_value,
                quantile_cont(total, 0.75) - quantile_cont(total, 0.25) AS order_value_iqr,
                sum(exp(-date_diff('day', timestamp, TIMESTAMP '{cutoff_ts}')::DOUBLE / {decay_halflife})) AS recency_weighted_purchases,
                sum(total * exp(-date_diff('day', timestamp, TIMESTAMP '{cutoff_ts}')::DOUBLE / {decay_halflife})) AS recency_weighted_spend,
                avg(CASE WHEN dayofweek(timestamp) IN (0,6) THEN 1.0 ELSE 0.0 END) AS weekend_purchase_ratio,
                avg(CASE WHEN hour(timestamp) BETWEEN 9 AND 18 THEN 1.0 ELSE 0.0 END) AS business_hours_purchase_ratio,
                count(*) FILTER (len(line_items) > 1)::DOUBLE / GREATEST(count(*), 1) AS multi_item_order_rate,
                sum(len(line_items)) AS total_line_items,
                avg(len(line_items)) FILTER (timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{half_w} days') AS recent_items_per_order,
                avg(len(line_items)) FILTER (timestamp < TIMESTAMP '{cutoff_ts}' - INTERVAL '{half_w} days') AS prior_items_per_order,
                {' '.join(orders_window_exprs)}
                {' '.join(spent_window_exprs)}
                1 AS _dummy
            FROM _orders
            GROUP BY customer_id
        ),

        prod_qty AS (
            SELECT customer_id, li.product_id AS product_id,
                   sum(li.quantity) AS qty, count(*) AS n_orders_with_product
            FROM _orders, UNNEST(line_items) AS t(li)
            GROUP BY customer_id, li.product_id
        ),
        basket AS (
            SELECT customer_id,
                   sum(qty)::DOUBLE / GREATEST(sum(n_orders_with_product), 1) AS avg_quantity_per_item,
                   max(qty)::DOUBLE / GREATEST(sum(qty), 1)     AS top_product_share,
                   count(*) FILTER (n_orders_with_product >= 2)::DOUBLE / GREATEST(count(*), 1) AS reorder_rate
            FROM prod_qty
            GROUP BY customer_id
        ),

        distinct_products AS (
            SELECT customer_id, count(DISTINCT li.product_id) AS distinct_products_purchased
            FROM _orders, UNNEST(line_items) AS t(li)
            GROUP BY customer_id
        ),

        distinct_cat_brand AS (
            SELECT o.customer_id,
                   count(DISTINCT p.category) AS distinct_categories_purchased,
                   count(DISTINCT p.brand)    AS distinct_brands_purchased
            FROM _orders o, UNNEST(o.line_items) AS t(li)
            LEFT JOIN _products p ON p.external_id::VARCHAR = li.product_id::VARCHAR
            GROUP BY o.customer_id
        ),

        ord_gaps AS (
            SELECT customer_id, timestamp,
                   date_diff('day', lag(timestamp) OVER (PARTITION BY customer_id ORDER BY timestamp), timestamp) AS gap_days,
                   row_number() OVER (PARTITION BY customer_id ORDER BY timestamp) AS rn
            FROM _orders
        ),
        gap_stats AS (
            SELECT customer_id,
                   avg(gap_days) AS avg_days_between_purchases,
                   min(gap_days) AS min_days_between_purchases,
                   max(gap_days) AS max_days_between_purchases,
                   stddev_samp(gap_days) AS purchase_regularity,
                   last(gap_days ORDER BY timestamp) AS last_gap,
                   min(gap_days) FILTER (rn = 2) AS first_to_second_purchase_gap_days
            FROM ord_gaps WHERE gap_days IS NOT NULL
            GROUP BY customer_id
        ),

        -- universal engagement signal: ANY event carrying a price (product_viewed
        -- for a project that tracks browsing, add_to_cart/cart_abandoned for one
        -- that doesn't) -- not gated to a specific event_name, so it's populated
        -- for whichever business actually has price data on its engagement events
        -- The price of what they engaged with -- from the event, else the catalog.
        -- Same reasoning as tagged_ev: a client sending only a product id should not
        -- lose its price when the catalog holds it on 98% of products. The event is
        -- preferred because it captures the price the customer actually saw; the
        -- catalog only knows the current one, so a June sale is invisible to it.
        priced_ev AS (
            SELECT e.customer_id,
                   COALESCE(e.properties.price, p.price) AS price
            FROM _events e
            LEFT JOIN _products p ON p.external_id::VARCHAR = e.properties.product_id::VARCHAR
            WHERE COALESCE(e.properties.price, p.price) > 0
        ),
        priced_stats AS (
            SELECT customer_id, avg(price) AS avg_engaged_price,
                   max(price) - min(price) AS price_range_engaged
            FROM priced_ev GROUP BY customer_id
        ),
        purchase_price AS (
            SELECT customer_id, avg(li.price) AS avg_purchase_price
            FROM _orders, UNNEST(line_items) AS t(li)
            GROUP BY customer_id
        ),

        -- universal category/brand/session signal: ANY event carrying that
        -- property, not gated to product_viewed specifically
        -- What they engaged with, filled in from the catalog where the event does not
        -- say. An order line carries only a product id and the category and brand are
        -- looked up (see distinct_cat_brand); a browse event was held to a different
        -- standard and expected to carry them itself. One real client sends nothing
        -- but a product id on 378,340 views, so eight taste features were empty for a
        -- reason that had nothing to do with the customer -- while every one of those
        -- 2,924 products sat in the catalog with its type and vendor.
        --
        -- The event still wins where it has an answer: it records what was true AT THE
        -- TIME, whereas the catalog only knows today. A product recategorised last
        -- month should not rewrite what the customer actually browsed.
        tagged_ev AS (
            SELECT e.customer_id,
                   COALESCE(e.properties.category, p.category) AS category,
                   COALESCE(e.properties.brand, p.brand)       AS brand,
                   e.properties.product_id AS product_id,
                   e.properties.session_id AS session_id,
                   e.timestamp
            FROM _events e
            LEFT JOIN _products p ON p.external_id::VARCHAR = e.properties.product_id::VARCHAR
        ),
        cat_counts AS (
            SELECT customer_id, category, count(*) AS n FROM tagged_ev WHERE category IS NOT NULL GROUP BY 1, 2
        ),
        cat_totals AS (SELECT customer_id, sum(n) AS total FROM cat_counts GROUP BY customer_id),
        cat_share AS (
            SELECT cc.customer_id,
                   sum(power(cc.n::DOUBLE / ct.total, 2)) AS category_concentration,
                   max(cc.n::DOUBLE / ct.total) AS top_category_share,
                   -sum((cc.n::DOUBLE / ct.total) * ln(cc.n::DOUBLE / ct.total)) AS category_entropy
            FROM cat_counts cc JOIN cat_totals ct ON ct.customer_id = cc.customer_id
            GROUP BY cc.customer_id
        ),
        brand_counts AS (
            SELECT customer_id, brand, count(*) AS n FROM tagged_ev WHERE brand IS NOT NULL GROUP BY 1, 2
        ),
        brand_totals AS (SELECT customer_id, sum(n) AS total FROM brand_counts GROUP BY customer_id),
        brand_share AS (
            SELECT bc.customer_id, sum(power(bc.n::DOUBLE / bt.total, 2)) AS brand_concentration,
                   -sum((bc.n::DOUBLE / bt.total) * ln(bc.n::DOUBLE / bt.total)) AS brand_entropy
            FROM brand_counts bc JOIN brand_totals bt ON bt.customer_id = bc.customer_id
            GROUP BY bc.customer_id
        ),
        dow_counts AS (
            SELECT customer_id, dayofweek(timestamp) AS dow, count(*) AS n FROM _events GROUP BY 1, 2
        ),
        dow_totals AS (SELECT customer_id, sum(n) AS total FROM dow_counts GROUP BY customer_id),
        dow_share AS (
            SELECT dc.customer_id, sum(power(dc.n::DOUBLE / dt.total, 2)) AS weekday_concentration
            FROM dow_counts dc JOIN dow_totals dt ON dt.customer_id = dc.customer_id
            GROUP BY dc.customer_id
        ),
        hour_counts AS (
            SELECT customer_id, hour(timestamp) AS hr, count(*) AS n FROM _events GROUP BY 1, 2
        ),
        hour_totals AS (SELECT customer_id, sum(n) AS total FROM hour_counts GROUP BY customer_id),
        hour_ent AS (
            SELECT hc.customer_id, -sum((hc.n::DOUBLE / ht.total) * ln(hc.n::DOUBLE / ht.total)) AS hour_of_day_entropy
            FROM hour_counts hc JOIN hour_totals ht ON ht.customer_id = hc.customer_id
            GROUP BY hc.customer_id
        ),
        -- category exploration recently vs earlier in the obs window -- is this
        -- customer browsing the same categories as always, or branching out/in?
        cat_recent AS (
            SELECT customer_id, count(DISTINCT category) AS n
            FROM tagged_ev WHERE category IS NOT NULL AND timestamp >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{half_w} days'
            GROUP BY customer_id
        ),
        cat_prior AS (
            SELECT customer_id, count(DISTINCT category) AS n
            FROM tagged_ev WHERE category IS NOT NULL AND timestamp < TIMESTAMP '{cutoff_ts}' - INTERVAL '{half_w} days'
            GROUP BY customer_id
        ),
        engaged_products AS (
            SELECT customer_id, count(DISTINCT product_id) AS distinct_products_engaged,
                   count(DISTINCT category) AS distinct_categories_engaged,
                   count(DISTINCT brand) AS distinct_brands_engaged
            FROM tagged_ev GROUP BY customer_id
        ),
        session_sizes AS (
            SELECT customer_id, session_id, count(*) AS n, min(timestamp) AS s_start
            FROM tagged_ev WHERE session_id IS NOT NULL
            GROUP BY customer_id, session_id
        ),
        session_stats AS (
            SELECT customer_id,
                   count(DISTINCT session_id) AS distinct_sessions,
                   count(*)::DOUBLE / GREATEST(count(DISTINCT session_id), 1) AS avg_events_per_session,
                   avg(n) FILTER (s_start >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{half_w} days') AS recent_avg_size,
                   avg(n) FILTER (s_start <  TIMESTAMP '{cutoff_ts}' - INTERVAL '{half_w} days') AS prior_avg_size,
                   count(DISTINCT session_id) FILTER (s_start >= TIMESTAMP '{cutoff_ts}' - INTERVAL '{smallest_w} days') AS distinct_sessions_recent,
                   stddev_samp(n) / GREATEST(avg(n), 0.1) AS session_size_cv,
                   last(n ORDER BY s_start) AS last_session_size
            FROM session_sizes GROUP BY customer_id
        ),
        -- visit-cadence regularity, independent of purchases (a customer can be
        -- a very regular browser without buying regularly, or vice versa)
        session_gaps AS (
            SELECT customer_id,
                   date_diff('hour', lag(s_start) OVER (PARTITION BY customer_id ORDER BY s_start), s_start) AS gap_hours
            FROM session_sizes
        ),
        session_gap_stats AS (
            SELECT customer_id, avg(gap_hours) AS session_gap_avg, stddev_samp(gap_hours) AS session_gap_stddev
            FROM session_gaps WHERE gap_hours IS NOT NULL
            GROUP BY customer_id
        ),

        -- static/cohort signal: this customer's very first-ever order value,
        -- unbounded by obs_window_days (a fixed fact about them, not a
        -- moving-window stat) -- safe because it only ever reads timestamp <
        -- cutoff_ts, same no-leakage rule as everything else here
        first_order AS (
            SELECT customer_id, arg_min(total, timestamp) AS first_order_value
            FROM ({orders_src})
            WHERE timestamp < TIMESTAMP '{cutoff_ts}'{_only_sql}
            GROUP BY customer_id
        ),

        -- LIFETIME order history: same unbounded-lookback pattern as first_order
        -- above (raw parquet, timestamp < cutoff_ts only), so the no-leakage rule
        -- holds by construction -- look back as far as you like, never forward.
        --
        -- Why these exist: every other order feature here is scoped to
        -- [cutoff-obs, cutoff), so a customer whose history predates that window
        -- reads as all-zeros and becomes invisible. Measured on b2b
        -- repeat_purchase (obs=90d): of 523 customers with no in-window order,
        -- 493 had ZERO in-window events, 24 of the 40 selected features were
        -- constant across them, and inactive-segment AUC was 0.4995 -- a literal
        -- coin flip. Those are lapsed buyers with real history the model could
        -- not see. Relevant precisely because repeat_purchase's eligible
        -- population is defined on ALL-TIME orders (labels.py), while its
        -- features were not.
        lifetime_orders_raw AS (
            SELECT customer_id, timestamp, total,
                   date_diff('day', lag(timestamp) OVER (PARTITION BY customer_id ORDER BY timestamp), timestamp) AS gap_days
            FROM ({orders_src})
            WHERE timestamp < TIMESTAMP '{cutoff_ts}'{_only_sql}
        ),
        lifetime_stats AS (
            SELECT customer_id,
                   count(*)   AS lifetime_orders,
                   sum(total) AS lifetime_spent,
                   avg(total) AS lifetime_avg_order_value,
                   max(total) AS lifetime_max_order_value,
                   max(timestamp) AS lifetime_last_order_ts,
                   min(timestamp) AS lifetime_first_order_ts,
                   avg(gap_days) AS lifetime_avg_days_between_orders,
                   stddev_samp(gap_days) AS lifetime_order_gap_stddev
            FROM lifetime_orders_raw
            GROUP BY customer_id
        ),

        -- LIFETIME event history: the event-side twin of lifetime_stats above,
        -- same unbounded-lookback pattern (raw parquet, timestamp < cutoff_ts).
        --
        -- Why: the order block only rescues customers who BOUGHT before the
        -- window. Measured on b2c purchase (obs=21d): 280,658 of 420,065
        -- customers (2 in 3) have ZERO in-window events, 100% of them have
        -- events BEFORE the window, and only ~10% ever ordered -- so for
        -- ~252,000 people the order-lifetime features are all zero and their
        -- entire visible history is "how long they've existed". These give the
        -- model their browsing past instead of a blank page.
        --
        -- Cost note: unlike the order block (190K rows), this scans the FULL
        -- events table (12.1M rows for b2c) rather than the windowed slice.
        lifetime_events_raw AS (
            SELECT customer_id, timestamp, event_name, properties.session_id AS session_id
            FROM {events_src}
            WHERE timestamp < TIMESTAMP '{cutoff_ts}'{_only_sql}
        ),
        lifetime_event_stats AS (
            SELECT customer_id,
                   count(*) AS lifetime_events,
                   count(*) FILTER (event_name IN ({ev_view})) AS lifetime_views,
                   count(*) FILTER (event_name IN ({ev_cart}))    AS lifetime_carts,
                   max(timestamp) AS lifetime_last_event_ts,
                   min(timestamp) AS lifetime_first_event_ts,
                   max(timestamp) FILTER (event_name IN ({ev_view})) AS lifetime_last_view_ts,
                   max(timestamp) FILTER (event_name IN ({ev_cart}))    AS lifetime_last_cart_ts,
                   count(DISTINCT date_trunc('day', timestamp)) AS lifetime_active_days,
                   count(DISTINCT session_id) AS lifetime_sessions
            FROM lifetime_events_raw
            GROUP BY customer_id
        ),

        -- BLIND-SPOT FEATURES (2026-07-18): current browsing cross-referenced
        -- with the customer's OWN purchase history. Diagnosed on b2c
        -- repeat_purchase: the "events but no order in window" segment is 27%
        -- of the population, holds 23% of the true repeat-buyers, and scored
        -- AUC 0.6465 -- the worst-ranked headroom segment in the system. For
        -- those customers order-recency features all read zero and browse
        -- features only measure volume; nothing connected what they browse NOW
        -- to what they historically BUY. Same unbounded-lookback rule as
        -- lifetime_stats: raw parquet, timestamp < cutoff_ts only.
        -- (category-overlap CTEs -- current-window viewed/carted categories vs
        -- lifetime purchased categories -- tried 2026-07-18, REMOVED same day:
        -- never selected by any model; category properties too sparse on both
        -- current datasets to build per-customer overlap from.)
        -- each lifetime cart-add paired with the customer's NEXT order (if any):
        -- one merged time-stream per customer, min-over-following-rows window
        -- finds the next order timestamp without a quadratic self-join. Orders
        -- at the exact cart timestamp sort BEFORE the cart (is_cart tiebreak),
        -- so a cart never counts its own checkout as its "next" order.
        cart_order_stream AS (
            SELECT customer_id, timestamp, is_cart,
                   min(ord_ts) OVER (PARTITION BY customer_id ORDER BY timestamp, is_cart
                                     ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS next_ord_ts
            FROM (
                SELECT customer_id, timestamp, 1 AS is_cart, NULL::TIMESTAMP AS ord_ts
                FROM lifetime_events_raw WHERE event_name IN ({ev_cart})
                UNION ALL
                SELECT customer_id, timestamp, 0 AS is_cart, timestamp AS ord_ts
                FROM lifetime_orders_raw
            )
        ),
        cart_rhythm AS (
            SELECT customer_id,
                   -- avg days cart -> next order; capped at 60d so one ancient
                   -- reactivation doesn't swamp the customer's real rhythm
                   avg(date_diff('day', timestamp, next_ord_ts))
                       FILTER (next_ord_ts IS NOT NULL
                               AND date_diff('day', timestamp, next_ord_ts) <= 60)
                       AS lifetime_cart_to_order_latency,
                   count(*) FILTER (next_ord_ts IS NOT NULL
                                    AND date_diff('day', timestamp, next_ord_ts) <= 14)::DOUBLE
                       / count(*) AS lifetime_cart_conversion_rate
            FROM cart_order_stream WHERE is_cart = 1
            GROUP BY customer_id
        ),

        -- (dealer_stats / region_stats CTEs removed 2026-07-17 with their features)
        -- (country_stats / channel_stats cohort CTEs removed 2026-07-18: same
        -- group-average species as dealer/region -- one number stamped on a
        -- whole cohort teaches the model the crowd, not the customer; averages
        -- drift with campaign/market mix and are noise for small cohorts. If a
        -- future client demonstrably needs channel/country signal, build it
        -- deliberately: normalize values, per-fold target encoding, walk-forward
        -- proof. The individual-level has_known_* flags remain below.)
        order_qty AS (
            SELECT o.customer_id, avg(qty_sum) AS avg_order_quantity, max(qty_sum) AS max_order_quantity,
                   stddev_samp(qty_sum) AS qty_stddev, avg(qty_sum) AS qty_mean
            FROM (
                SELECT customer_id, order_id, sum(li.quantity) AS qty_sum
                FROM _orders o, UNNEST(line_items) AS t(li)
                GROUP BY customer_id, order_id
            ) o
            GROUP BY o.customer_id
        ),

        -- cart_abandoned: universal presence/frequency/recency signal (see
        -- feature list below for why value-based features on this event are
        -- deliberately excluded -- 74% of cart_abandoned events carry no
        -- verified value, checked empirically, not assumed)
        cart_abandon_stats AS (
            SELECT customer_id, count(*) AS total_cart_abandoned, max(timestamp) AS last_abandon_ts
            FROM _events WHERE event_name IN ({ev_abandon})
            GROUP BY customer_id
        )

        SELECT
            b.customer_id,
            date_diff('day', COALESCE(e.last_event_ts, b.first_seen), TIMESTAMP '{cutoff_ts}')     AS days_since_last_event,
            date_diff('day', COALESCE(o.last_purchase_ts, b.first_seen), TIMESTAMP '{cutoff_ts}')   AS days_since_last_purchase,
            date_diff('day', COALESCE(e.last_view_ts, b.first_seen), TIMESTAMP '{cutoff_ts}')       AS days_since_last_view,
            date_diff('day', COALESCE(e.last_cart_ts, b.first_seen), TIMESTAMP '{cutoff_ts}')       AS days_since_last_cart,
            (e.last_view_ts IS NOT NULL)::INT AS has_any_view,
            (e.last_cart_ts IS NOT NULL)::INT AS has_any_cart,
            COALESCE(e.total_events, 0)  AS total_events,
            COALESCE(e.total_views, 0)   AS total_views,
            COALESCE(e.total_carts, 0)   AS total_carts,
            {' '.join(signal_cols)}
            COALESCE(o.total_orders, 0)  AS total_orders,
            COALESCE(e.distinct_active_days, 0) AS distinct_active_days,
            COALESCE(e.distinct_active_weeks, 0) AS distinct_active_weeks,
            COALESCE(e.active_days_recent, 0) AS active_days_recent,
            COALESCE(e.total_events, 0) / GREATEST(e.distinct_active_days, 1)  AS avg_events_per_active_day,
            COALESCE(e.total_events, 0)::DOUBLE / GREATEST(o.total_orders, 1) AS events_per_order,
            COALESCE(o.total_orders, 0)::DOUBLE / GREATEST(e.distinct_active_weeks, 1) AS orders_per_active_week,
            COALESCE(e.recency_weighted_activity, 0) AS recency_weighted_activity,
            COALESCE(e.recency_weighted_activity_slow, 0) AS recency_weighted_activity_slow,
            COALESCE(e.distinct_active_hours, 0) AS distinct_active_hours,
            COALESCE(e.active_days_recent, 0) - COALESCE(e.active_days_prev, 0) AS active_days_trend,
            COALESCE(e.total_carts, 0)::DOUBLE / GREATEST(e.distinct_active_days, 1) AS cart_add_frequency,
            COALESCE(hn.hour_of_day_entropy, 0) AS hour_of_day_entropy,
            COALESCE(cr.n, 0) - COALESCE(cp.n, 0) AS category_diversity_trend,
            COALESCE(ovc.order_value_concentration, 0) AS order_value_concentration,
            date_diff('day', COALESCE(sle.second_last_event_ts, b.first_seen), TIMESTAMP '{cutoff_ts}') AS days_since_second_last_event,
            date_diff('day', COALESCE(slo.second_last_purchase_ts, b.first_seen), TIMESTAMP '{cutoff_ts}') AS days_since_second_last_purchase,
            COALESCE(o.total_spent, 0)      AS total_spent,
            COALESCE(o.avg_order_value, 0)  AS avg_order_value,
            COALESCE(o.max_order_value, 0)  AS max_order_value,
            COALESCE(o.min_order_value, 0)  AS min_order_value,
            COALESCE(o.last_order_value, 0) AS last_order_value,
            COALESCE(o.median_order_value, 0) AS median_order_value,
            COALESCE(o.order_value_iqr, 0) AS order_value_iqr,
            COALESCE(o.order_value_stddev, 0) AS order_value_stddev,
            COALESCE(o.order_value_stddev, 0) / GREATEST(o.avg_order_value, 1) AS order_value_cv,
            COALESCE(o.last_order_value, 0) / GREATEST(o.avg_order_value, 1) AS order_value_trend,
            COALESCE(o.recency_weighted_purchases, 0) AS recency_weighted_purchases,
            COALESCE(o.recency_weighted_spend, 0) AS recency_weighted_spend,
            COALESCE(o.weekend_purchase_ratio, 0) AS weekend_purchase_ratio,
            COALESCE(o.business_hours_purchase_ratio, 0) AS business_hours_purchase_ratio,
            COALESCE(o.multi_item_order_rate, 0) AS multi_item_order_rate,
            COALESCE(o.total_line_items, 0) AS total_line_items,
            COALESCE(o.recent_items_per_order, 0) - COALESCE(o.prior_items_per_order, 0) AS order_size_trend,
            COALESCE(o.total_spent, 0) / GREATEST(date_diff('day', b.first_seen, TIMESTAMP '{cutoff_ts}') / 7.0, 0.1) AS spend_per_tenure_week,
            COALESCE(e.total_events, 0) / GREATEST(date_diff('day', b.first_seen, TIMESTAMP '{cutoff_ts}') / 7.0, 0.1) AS events_per_tenure_week,
            COALESCE(o.total_orders, 0) / GREATEST(date_diff('day', b.first_seen, TIMESTAMP '{cutoff_ts}') / 30.4375, 0.1) AS orders_per_tenure_month,
            date_diff('day', b.first_seen, COALESCE(o.first_purchase_ts, TIMESTAMP '{cutoff_ts}')) AS days_to_first_purchase,
            (COALESCE(o.total_orders, 0) > 0)::INT AS has_purchased,
            COALESCE(o.total_orders, 0)::DOUBLE / GREATEST(e.total_events, 1) AS purchase_ratio,
            -- FUNNEL RATIOS: a zero denominator is not a 1.
            --
            -- `GREATEST(denominator, 1)` keeps the division safe, and for a customer
            -- who did nothing it lands on 0, which reads correctly as "no conversion
            -- behaviour". But where the NUMERATOR is positive and the denominator is
            -- zero the substituted 1 turns the ratio into the numerator itself: a
            -- GoWelmart customer with 3 orders and no `product_viewed` scores 3.0 in a
            -- column whose normal range is around 0.14, landing at the very top of the
            -- distribution as an extraordinary converter. Eighteen customers do exactly
            -- that -- they buy through a path that emits no view event -- and the value
            -- is not a conversion rate at all.
            --
            -- Buying without browsing is impossible in the funnel, so the ratio is
            -- genuinely UNKNOWN there, not high. NULL says so and the feature drops
            -- itself for those rows, which is what every other absent input does here.
            -- Both-zero still returns 0, so the 77% of customers with no activity keep
            -- the reading they have today and the column is not gutted.
            CASE WHEN COALESCE(e.total_carts, 0) > 0
                      THEN COALESCE(o.total_orders, 0)::DOUBLE / e.total_carts
                 WHEN COALESCE(o.total_orders, 0) = 0 THEN 0.0
            END AS cart_to_purchase_ratio,
            CASE WHEN COALESCE(e.total_views, 0) > 0
                      THEN COALESCE(e.total_carts, 0)::DOUBLE / e.total_views
                 WHEN COALESCE(e.total_carts, 0) = 0 THEN 0.0
            END AS view_to_cart_ratio,
            CASE WHEN COALESCE(e.total_views, 0) > 0
                      THEN COALESCE(o.total_orders, 0)::DOUBLE / e.total_views
                 WHEN COALESCE(o.total_orders, 0) = 0 THEN 0.0
            END AS view_to_purchase_ratio,
            date_diff('day', b.first_seen, TIMESTAMP '{cutoff_ts}') AS days_since_first_seen,
            {''.join(f'''
            COALESCE(e.events_{w}d, 0) AS events_{w}d,
            COALESCE(e.events_{w}d, 0) - COALESCE(e.events_prev_{w}d, 0) AS event_trend_{w}d,
            COALESCE(o.orders_{w}d, 0) AS orders_{w}d,
            COALESCE(o.orders_{w}d, 0) - COALESCE(o.orders_prev_{w}d, 0) AS order_trend_{w}d,
            COALESCE(o.spent_{w}d, 0) AS spent_{w}d,
            COALESCE(o.spent_{w}d, 0) - COALESCE(o.spent_prev_{w}d, 0) AS spend_trend_{w}d,
            ''' for w in sub_windows)}
            COALESCE(e.events_{smallest_w}d, 0)::DOUBLE / GREATEST(e.total_events, 1) AS pct_events_recent,
            gs.avg_days_between_purchases,
            gs.min_days_between_purchases,
            gs.max_days_between_purchases,
            gs.purchase_regularity,
            gs.purchase_regularity / GREATEST(gs.avg_days_between_purchases, 0.1) AS purchase_gap_cv,
            GREATEST(0, date_diff('day', COALESCE(o.last_purchase_ts, b.first_seen), TIMESTAMP '{cutoff_ts}') - COALESCE(gs.avg_days_between_purchases, 0)) AS days_since_expected_order,
            gs.last_gap / GREATEST(gs.avg_days_between_purchases, 0.1) AS purchase_acceleration,
            (COALESCE(o.total_orders, 0) >= 2)::INT AS is_repeat_buyer,
            gs.first_to_second_purchase_gap_days,
            eg.event_gap_stddev / GREATEST(eg.avg_event_gap, 0.1) AS inter_event_gap_cv,
            COALESCE(eg.longest_inactive_streak, 0) AS longest_inactive_streak,
            COALESCE(e.weekend_ratio, 0) AS weekend_ratio,
            COALESCE(e.business_hours_ratio, 0) AS business_hours_ratio,
            COALESCE(e.preferred_day_of_week, -1) AS preferred_day_of_week,
            COALESCE(o.avg_items_per_order, 0) AS avg_items_per_order,
            COALESCE(bk.avg_quantity_per_item, 0) AS avg_quantity_per_item,
            COALESCE(bk.reorder_rate, 0) AS reorder_rate,
            COALESCE(dp.distinct_products_purchased, 0) AS distinct_products_purchased,
            COALESCE(dp.distinct_products_purchased, 0)::DOUBLE / GREATEST(o.total_orders, 1) AS products_per_order,
            COALESCE(bk.top_product_share, 0) AS top_product_share,
            COALESCE(dcb.distinct_categories_purchased, 0) AS distinct_categories_purchased,
            COALESCE(dcb.distinct_brands_purchased, 0) AS distinct_brands_purchased,
            COALESCE(dcb.distinct_categories_purchased, 0)::DOUBLE / GREATEST(o.total_orders, 1) AS distinct_categories_purchased_per_order,

            COALESCE(ps.avg_engaged_price, 0) AS avg_engaged_price,
            COALESCE(ps.price_range_engaged, 0) AS price_range_engaged,
            COALESCE(pp.avg_purchase_price, 0) AS avg_purchase_price,
            COALESCE(ep.distinct_products_engaged, 0) AS distinct_products_engaged,
            COALESCE(ep.distinct_categories_engaged, 0) AS distinct_categories_engaged,
            COALESCE(ep.distinct_brands_engaged, 0) AS distinct_brands_engaged,
            COALESCE(cs.category_concentration, 0) AS category_concentration,
            COALESCE(cs.top_category_share, 0) AS top_category_share,
            COALESCE(cs.category_entropy, 0) AS category_entropy,
            COALESCE(bs.brand_concentration, 0) AS brand_concentration,
            COALESCE(bs.brand_entropy, 0) AS brand_entropy,
            COALESCE(dw.weekday_concentration, 0) AS weekday_concentration,
            COALESCE(ss.distinct_sessions, 0) AS distinct_sessions,
            COALESCE(ss.avg_events_per_session, 0) AS avg_events_per_session,
            COALESCE(ss.distinct_sessions_recent, 0) AS distinct_sessions_recent,
            COALESCE(ss.recent_avg_size, 0) - COALESCE(ss.prior_avg_size, 0) AS session_size_trend,
            COALESCE(ss.session_size_cv, 0) AS session_size_cv,
            COALESCE(ss.last_session_size, 0) AS last_session_size,
            COALESCE(sg.session_gap_stddev, 0) / GREATEST(COALESCE(sg.session_gap_avg, 0), 0.1) AS session_gap_cv,
            COALESCE(fo.first_order_value, 0) AS first_order_value,

            COALESCE(lt.lifetime_orders, 0) AS lifetime_orders,
            COALESCE(lt.lifetime_spent, 0) AS lifetime_spent,
            COALESCE(lt.lifetime_avg_order_value, 0) AS lifetime_avg_order_value,
            COALESCE(lt.lifetime_max_order_value, 0) AS lifetime_max_order_value,
            date_diff('day', COALESCE(lt.lifetime_last_order_ts, b.first_seen), TIMESTAMP '{cutoff_ts}') AS days_since_last_ever_order,
            date_diff('day', COALESCE(lt.lifetime_first_order_ts, b.first_seen), TIMESTAMP '{cutoff_ts}') AS days_since_first_ever_order,
            COALESCE(lt.lifetime_avg_days_between_orders, 0) AS lifetime_avg_days_between_orders,
            COALESCE(lt.lifetime_order_gap_stddev, 0) / GREATEST(lt.lifetime_avg_days_between_orders, 0.1) AS lifetime_order_gap_cv,
            COALESCE(lt.lifetime_orders, 0) / GREATEST(date_diff('day', b.first_seen, TIMESTAMP '{cutoff_ts}') / 30.4375, 0.1) AS lifetime_orders_per_month,
            COALESCE(lt.lifetime_spent, 0) / GREATEST(date_diff('day', b.first_seen, TIMESTAMP '{cutoff_ts}') / 30.4375, 0.1) AS lifetime_spend_per_month,
            -- what share of their lifetime history falls inside the obs window:
            -- ~1 = everything they've ever done is recent, ~0 = lapsed long-timer
            COALESCE(o.total_orders, 0)::DOUBLE / GREATEST(lt.lifetime_orders, 1) AS orders_in_window_share,
            COALESCE(o.total_spent, 0)::DOUBLE / GREATEST(lt.lifetime_spent, 0.01) AS spend_in_window_share,
            GREATEST(COALESCE(lt.lifetime_orders, 0) - COALESCE(o.total_orders, 0), 0) AS lifetime_orders_before_window,
            -- overdue-ness against LIFETIME cadence. The in-window twin
            -- (days_since_expected_order) reads 0-vs-0 for a lapsed buyer and
            -- goes blind exactly when this question matters most.
            GREATEST(0, date_diff('day', COALESCE(lt.lifetime_last_order_ts, b.first_seen), TIMESTAMP '{cutoff_ts}')
                        - COALESCE(lt.lifetime_avg_days_between_orders, 0)) AS days_since_expected_order_lifetime,

            -- DEALER/REGION COHORT FEATURES REMOVED 2026-07-17. They were group
            -- averages: every customer in a group got the same number, so the model
            -- memorised the group rather than learning the customer -- signal that
            -- cannot transfer to a new client. Two concrete reasons, not opinion:
            --   (1) region_customer_count was b2b purchase's #2 SHAP driver, yet
            --       `region` is uncleaned free text: "Tamil Nadu" exists in 19
            --       spellings, so the same real region hands customers values of
            --       4723 / 348 / 93 depending on TYPING. It was a data-entry-batch
            --       detector wearing a geography costume. (116 stored regions ->
            --       81 real ones.) Region is also 44% populated on b2b and 0% on
            --       b2c, and its missingness tracks onboarding process, not place.
            --   (2) once the lifetime features above gave the model real long-memory
            --       behaviour, selection DROPPED region from b2b purchase on its own
            --       (top-5 SHAP became all-lifetime). It was only ever a crutch for
            --       "this customer has history", which we now measure directly.
            -- Behaviour is the genuinely generic signal: every buyer/seller relation
            -- has it, whereas dealers/regions/demography are source-specific.
            -- (avg/max_order_quantity + order_quantity_cv are KEPT -- they come from
            -- order_qty, are the customer's own basket sizes, not a cohort average.)
            oq.avg_order_quantity, oq.max_order_quantity,
            COALESCE(oq.qty_stddev, 0) / GREATEST(oq.qty_mean, 1) AS order_quantity_cv,

            (c.birth_year IS NOT NULL)::INT AS has_known_age,
            COALESCE(date_part('year', TIMESTAMP '{cutoff_ts}') - c.birth_year, 0) AS age_years,
            COALESCE(floor((date_part('year', TIMESTAMP '{cutoff_ts}') - c.birth_year) / 10.0) * 10, 0) AS age_decade_bucket,
            (c.acquisition_channel IS NOT NULL)::INT AS has_known_acquisition_channel,

            COALESCE(le.lifetime_events, 0) AS lifetime_events,
            COALESCE(le.lifetime_views, 0) AS lifetime_views,
            COALESCE(le.lifetime_carts, 0) AS lifetime_carts,
            COALESCE(le.lifetime_active_days, 0) AS lifetime_active_days,
            COALESCE(le.lifetime_sessions, 0) AS lifetime_sessions,
            date_diff('day', COALESCE(le.lifetime_last_event_ts, b.first_seen), TIMESTAMP '{cutoff_ts}') AS days_since_last_ever_event,
            date_diff('day', COALESCE(le.lifetime_first_event_ts, b.first_seen), TIMESTAMP '{cutoff_ts}') AS days_since_first_ever_event,
            date_diff('day', COALESCE(le.lifetime_last_view_ts, b.first_seen), TIMESTAMP '{cutoff_ts}') AS days_since_last_ever_view,
            date_diff('day', COALESCE(le.lifetime_last_cart_ts, b.first_seen), TIMESTAMP '{cutoff_ts}') AS days_since_last_ever_cart,
            COALESCE(le.lifetime_events, 0) / GREATEST(date_diff('day', b.first_seen, TIMESTAMP '{cutoff_ts}') / 30.4375, 0.1) AS lifetime_events_per_month,
            COALESCE(le.lifetime_active_days, 0)::DOUBLE / GREATEST(date_diff('day', b.first_seen, TIMESTAMP '{cutoff_ts}'), 1) AS lifetime_active_day_ratio,
            -- same rule as the windowed funnel ratios above
            CASE WHEN COALESCE(le.lifetime_views, 0) > 0
                      THEN COALESCE(le.lifetime_carts, 0)::DOUBLE / le.lifetime_views
                 WHEN COALESCE(le.lifetime_carts, 0) = 0 THEN 0.0
            END AS lifetime_view_to_cart_ratio,
            -- share of their lifetime browsing that falls inside the obs window:
            -- ~1 = everything they've ever done is recent, ~0 = long-dormant browser
            COALESCE(e.total_events, 0)::DOUBLE / GREATEST(le.lifetime_events, 1) AS events_in_window_share,
            GREATEST(COALESCE(le.lifetime_events, 0) - COALESCE(e.total_events, 0), 0) AS lifetime_events_before_window,

            -- blind-spot batch survivors (2026-07-18): 5 of 8 candidates kept --
            -- each chosen by at least one model's selection in the full-fleet
            -- audit (cart rhythm -> b2b cart/churn, own-pace -> b2b repeat,
            -- price-vs-own-AOV -> b2c purchase/cart). The other 3 (category
            -- overlaps, cart_overdue_ratio) were chosen by none and removed.
            COALESCE(crh.lifetime_cart_to_order_latency, 0) AS lifetime_cart_to_order_latency,
            COALESCE(crh.lifetime_cart_conversion_rate, 0) AS lifetime_cart_conversion_rate,
            (COALESCE(e.total_events, 0)::DOUBLE / {obs_window_days} * 30.4375)
                / GREATEST(COALESCE(le.lifetime_events, 0)
                           / GREATEST(date_diff('day', COALESCE(le.lifetime_first_event_ts, b.first_seen),
                                                TIMESTAMP '{cutoff_ts}') / 30.4375, 0.1), 0.1)
                AS events_vs_own_lifetime_pace,
            (COALESCE(e.total_carts, 0)::DOUBLE / {obs_window_days} * 30.4375)
                / GREATEST(COALESCE(le.lifetime_carts, 0)
                           / GREATEST(date_diff('day', COALESCE(le.lifetime_first_event_ts, b.first_seen),
                                                TIMESTAMP '{cutoff_ts}') / 30.4375, 0.1), 0.1)
                AS carts_vs_own_lifetime_pace,
            CASE WHEN ps.avg_engaged_price > 0 AND lt.lifetime_avg_order_value > 0
                 THEN ps.avg_engaged_price / lt.lifetime_avg_order_value
                 ELSE 0 END AS engaged_price_vs_own_aov,

            COALESCE(cas.total_cart_abandoned, 0) AS total_cart_abandoned,
            (cas.total_cart_abandoned IS NOT NULL)::INT AS has_any_cart_abandoned,
            -- NULL when this project has NO abandonment events at all, rather than
            -- falling back to the join date.
            --
            -- The fallback is right for a project that tracks abandonment and has a
            -- customer who never abandoned: "never" reading as "a very long time ago"
            -- is the convention the other recency features use. It is wrong when the
            -- event does not exist for the project, because then EVERY row falls back
            -- and the column becomes an exact copy of `days_since_first_seen` under a
            -- name that says something else -- 481 distinct values, so the constant
            -- filter cannot drop it, and it reaches the model as a duplicate.
            --
            -- No vertical pack maps an abandonment event, and most shops cannot emit
            -- one: abandonment is the ABSENCE of a purchase, not something a storefront
            -- fires. A platform that does report it (Shopify's abandoned checkout) still
            -- gets the feature, which is why this is a conditional rather than a
            -- deletion.
            CASE WHEN (SELECT count(*) FROM cart_abandon_stats) > 0
                 THEN date_diff('day', COALESCE(cas.last_abandon_ts, b.first_seen), TIMESTAMP '{cutoff_ts}')
            END AS days_since_last_cart_abandoned,
            COALESCE(cas.total_cart_abandoned, 0)::DOUBLE / GREATEST(o.total_orders, 1) AS cart_abandoned_to_order_ratio

        FROM base b
        LEFT JOIN _customers c ON c.customer_id = b.customer_id
        LEFT JOIN ev_agg e ON e.customer_id = b.customer_id
        LEFT JOIN ev_gap_stats eg ON eg.customer_id = b.customer_id
        LEFT JOIN ord_agg o ON o.customer_id = b.customer_id
        LEFT JOIN basket bk ON bk.customer_id = b.customer_id
        LEFT JOIN distinct_products dp ON dp.customer_id = b.customer_id
        LEFT JOIN distinct_cat_brand dcb ON dcb.customer_id = b.customer_id
        LEFT JOIN gap_stats gs ON gs.customer_id = b.customer_id
        LEFT JOIN priced_stats ps ON ps.customer_id = b.customer_id
        LEFT JOIN purchase_price pp ON pp.customer_id = b.customer_id
        LEFT JOIN engaged_products ep ON ep.customer_id = b.customer_id
        LEFT JOIN hour_ent hn ON hn.customer_id = b.customer_id
        LEFT JOIN cat_recent cr ON cr.customer_id = b.customer_id
        LEFT JOIN cat_prior cp ON cp.customer_id = b.customer_id
        LEFT JOIN order_value_conc ovc ON ovc.customer_id = b.customer_id
        LEFT JOIN second_last_event sle ON sle.customer_id = b.customer_id
        LEFT JOIN second_last_order slo ON slo.customer_id = b.customer_id
        LEFT JOIN cat_share cs ON cs.customer_id = b.customer_id
        LEFT JOIN brand_share bs ON bs.customer_id = b.customer_id
        LEFT JOIN dow_share dw ON dw.customer_id = b.customer_id
        LEFT JOIN session_stats ss ON ss.customer_id = b.customer_id
        LEFT JOIN session_gap_stats sg ON sg.customer_id = b.customer_id
        LEFT JOIN first_order fo ON fo.customer_id = b.customer_id
        LEFT JOIN lifetime_stats lt ON lt.customer_id = b.customer_id
        LEFT JOIN lifetime_event_stats le ON le.customer_id = b.customer_id
        LEFT JOIN order_qty oq ON oq.customer_id = b.customer_id
        LEFT JOIN cart_abandon_stats cas ON cas.customer_id = b.customer_id
        LEFT JOIN cart_rhythm crh ON crh.customer_id = b.customer_id
    """).df()

    df = core.set_index("customer_id")

    # ---- ratio-of-engaged-price features computed in pandas (need both sides present) ----
    df["browse_without_buy_ratio"] = 1 - (df["total_orders"] / df["total_views"].clip(lower=1)).clip(upper=1)
    df["repeat_view_ratio"] = df["total_views"] / df["distinct_products_engaged"].clip(lower=1)
    df["price_sensitivity"] = (
        df["avg_purchase_price"] / df["avg_engaged_price"].clip(lower=0.01)
    ).where((df["avg_purchase_price"] > 0) & (df["avg_engaged_price"] > 0), 0)

    # ---- cross-customer percentile ranks ----
    #
    # DECLARED ONCE, IN `POPULATION_RANKS` (top of this file), because three separate
    # places need to agree on exactly which features these are: the loop below that
    # computes them, the snapshot that records the population's shape, and the lookup
    # that reconstructs them when only a few customers are being scored. Written out
    # by hand in each, a ninth rank added later would be picked up by one and missed by
    # the others — and a percentile computed against the wrong population is a wrong
    # number that still looks perfectly reasonable.
    # A NARROWED BUILD CANNOT RANK. `rank(pct=True)` over five customers says where
    # those five sit among themselves, which is not what the feature means and is not
    # what the model was fitted on — five rows would come out as 0.2, 0.4, 0.6, 0.8,
    # 1.0 regardless of the business. Read the population's recorded shape instead.
    #
    # No snapshot, or one too old to trust, and the build is refused rather than
    # returned with eight plausible-looking wrong columns. The caller falls back to a
    # full build, which is slower and right.
    _pop = None
    if only:
        from shared import population
        _pop = population.load(dataset.project_id)
        if _pop is None:
            raise PopulationSnapshotMissing(
                f"no usable population snapshot for {dataset.project_id}; "
                "a full build is required to rank customers against the population")
        missing = population.apply_ranks(df, _pop)
        if missing:
            raise PopulationSnapshotMissing(
                f"population snapshot for {dataset.project_id} is missing "
                f"{len(missing)} rank column(s): {', '.join(missing[:3])}")
    else:
        for feat, (src, invert) in POPULATION_RANKS.items():
            col = -df[src] if invert else df[src]
            df[feat] = col.rank(pct=True)

    static_candidate_cols = [
        # Recency
        "days_since_last_event", "days_since_last_purchase", "days_since_last_view", "days_since_last_cart",
        "has_any_view", "has_any_cart",
        # Frequency
        "total_events", "total_views", "total_carts", "total_orders",
        "distinct_active_days", "distinct_active_weeks", "active_days_recent",
        "avg_events_per_active_day", "events_per_order",
        "orders_per_active_week", "recency_weighted_activity", "recency_weighted_activity_slow",
        "distinct_active_hours", "active_days_trend", "cart_add_frequency", "hour_of_day_entropy", "days_since_second_last_event",
        # Monetary
        "total_spent", "avg_order_value", "max_order_value", "min_order_value", "last_order_value",
        "order_value_stddev", "order_value_cv", "order_value_trend", "first_order_value",
        "median_order_value", "order_value_iqr", "order_value_concentration",
        "recency_weighted_purchases", "recency_weighted_spend",
        "spend_per_tenure_week", "orders_per_tenure_month", "events_per_tenure_week",
        # Lifetime (all-time, unbounded by obs_window) -- see lifetime_stats CTE
        "lifetime_orders", "lifetime_spent", "lifetime_avg_order_value", "lifetime_max_order_value",
        "days_since_last_ever_order", "days_since_first_ever_order",
        "lifetime_avg_days_between_orders", "lifetime_order_gap_cv",
        "lifetime_orders_per_month", "lifetime_spend_per_month",
        "orders_in_window_share", "spend_in_window_share", "lifetime_orders_before_window",
        "days_since_expected_order_lifetime",
        # Lifetime EVENT history (all-time) -- see lifetime_event_stats CTE
        "lifetime_events", "lifetime_views", "lifetime_carts", "lifetime_active_days",
        "lifetime_sessions", "days_since_last_ever_event", "days_since_first_ever_event",
        "days_since_last_ever_view", "days_since_last_ever_cart",
        "lifetime_events_per_month", "lifetime_active_day_ratio", "lifetime_view_to_cart_ratio",
        "events_in_window_share", "lifetime_events_before_window",
        "spend_percentile_rank", "order_count_percentile_rank",
        "engagement_percentile_rank", "recency_percentile_rank", "avg_order_value_percentile_rank",
        "tenure_percentile_rank", "session_frequency_percentile_rank", "active_days_percentile_rank",
        # Conversion / funnel
        "has_purchased", "purchase_ratio", "cart_to_purchase_ratio", "view_to_cart_ratio", "view_to_purchase_ratio",
        "browse_without_buy_ratio", "repeat_view_ratio",
        # Lifecycle
        "days_since_first_seen", "days_to_first_purchase",
        "pct_events_recent",
        # Velocity / purchase cadence
        "avg_days_between_purchases", "min_days_between_purchases", "max_days_between_purchases",
        "purchase_regularity", "purchase_gap_cv", "days_since_expected_order",
        "purchase_acceleration", "is_repeat_buyer", "first_to_second_purchase_gap_days",
        "days_since_second_last_purchase",
        # Consistency
        "inter_event_gap_cv", "longest_inactive_streak",
        # Temporal
        "weekend_ratio", "business_hours_ratio", "preferred_day_of_week", "weekday_concentration",
        "weekend_purchase_ratio", "business_hours_purchase_ratio",
        # Basket / catalog breadth
        "avg_items_per_order", "avg_quantity_per_item", "reorder_rate", "distinct_products_purchased",
        "products_per_order", "top_product_share",
        "distinct_categories_purchased", "distinct_brands_purchased",
        "distinct_categories_purchased_per_order", "multi_item_order_rate", "total_line_items", "order_size_trend",
        # Engagement / price -- universal, sourced from ANY event with the property
        "avg_engaged_price", "price_range_engaged", "avg_purchase_price", "price_sensitivity",
        "distinct_products_engaged", "distinct_categories_engaged", "distinct_brands_engaged",
        "category_concentration", "top_category_share", "category_entropy", "category_diversity_trend",
        "brand_concentration", "brand_entropy",
        "distinct_sessions", "avg_events_per_session", "distinct_sessions_recent", "session_size_trend", "session_gap_cv",
        "session_size_cv", "last_session_size",
        # Dealer / region -- universal, naturally empty for a project with no dealer_id
        # dealer_*/region_* cohort features removed 2026-07-17 -- see SELECT comment.
        # These three are the customer's OWN basket sizes, not a cohort average -- kept.
        "avg_order_quantity", "max_order_quantity", "order_quantity_cv",
        # Demographic -- universal, naturally empty for a project with no profile data
        "has_known_age", "age_years", "age_decade_bucket", "has_known_acquisition_channel",
        # cart_abandoned -- presence/frequency/recency only, deliberately not
        # value-based (see cart_abandon_stats CTE comment)
        "total_cart_abandoned", "has_any_cart_abandoned", "days_since_last_cart_abandoned",
        "cart_abandoned_to_order_ratio",
        # Blind-spot: current browsing x own purchase history (see CTE comment)
        "lifetime_cart_to_order_latency", "lifetime_cart_conversion_rate",
        "events_vs_own_lifetime_pace", "carts_vs_own_lifetime_pace", "engaged_price_vs_own_aov",
    ]
    candidate_cols = static_candidate_cols + windowed_candidate_cols + signal_candidate_cols

    #: columns where a NULL means UNKNOWN and must survive to the model.
    #:
    #: The blanket `fillna(0)` below is right for a count -- nothing recorded means
    #: none happened. It is wrong for a funnel ratio whose denominator was never
    #: observed: filling 0 there states "converts nothing" about a customer we simply
    #: cannot measure, which is a different customer from one who browsed and did not
    #: buy. Both readings are false; the honest answer is no answer. XGBoost takes NaN
    #: natively and learns its own direction for it, so leaving these unfilled costs
    #: nothing and stops the ratio from claiming a fact it does not have.
    unknown_ok = {"view_to_purchase_ratio", "view_to_cart_ratio",
                  "cart_to_purchase_ratio", "lifetime_view_to_cart_ratio",
                  # NULL here means "this project does not track abandonment", which is
                  # not the same as "abandoned today" -- filling 0 would say the latter.
                  "days_since_last_cart_abandoned"}

    for c in candidate_cols:
        if c not in df.columns:
            df[c] = 0.0
    fill_cols = [c for c in candidate_cols if c not in unknown_ok]
    keep_cols = [c for c in candidate_cols if c in unknown_ok]
    df[fill_cols] = df[fill_cols].fillna(0).replace([float("inf"), float("-inf")], 0)
    # infinities are still a division artefact, not an unknown -- clear those either way
    df[keep_cols] = df[keep_cols].replace([float("inf"), float("-inf")], float("nan"))

    # (SEASONALITY pop_rel features -- value / population mean at the same
    # cutoff -- tried 2026-07-18 and REMOVED same day: auditioned by all 10
    # models' selections, chosen by none. Cross-cutoff normalization does not
    # add signal over the existing recency/trend/lifetime block on either
    # current dataset. Don't re-add without new evidence.)

    if own_con:
        con.close()

    # [#3 DETERMINISM] return in a stable customer_id order so downstream
    # GroupKFold splits (and therefore the tuned params / chosen window) are
    # reproducible run-to-run. DuckDB has no implicit row order guarantee.
    out = df[candidate_cols].sort_index()

    # RECORD THE POPULATION'S SHAPE — but only when this really was the population.
    #
    # `only` narrows the build, so its ranks describe those few customers, not the
    # business. Saving from a narrowed build would poison every later lookup with the
    # wrong yardstick, and the resulting percentiles would look perfectly plausible.
    # Hence the guard, and hence saving here rather than in a scheduler: any full build
    # keeps the snapshot current, including a brand-new project's first one.
    if not only:
        try:
            from shared import population
            population.save(out, dataset.project_id)
        except Exception as e:      # never fail a build over housekeeping
            print(f"  [population] snapshot not saved: {e}", file=sys.stderr, flush=True)

    return out


if __name__ == "__main__":
    import sys
    biz = sys.argv[1] if len(sys.argv) > 1 else "b2c"
    cutoff = sys.argv[2] if len(sys.argv) > 2 else "2020-01-01"
    obs = int(sys.argv[3]) if len(sys.argv) > 3 else 90
    fm = build_feature_matrix(biz, cutoff, obs)
    print(f"shape: {fm.shape}")
    print(f"n_candidate_features: {fm.shape[1]}")
    print(f"sub_windows for obs={obs}: {_sub_windows(obs)}")
