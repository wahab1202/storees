"""One row per CART, scored at the moment it opens.

WHY THIS EXISTS SEPARATELY FROM `labeling.py`.

Every other goal asks about a PERSON at a calendar cutoff: one row per customer, one
verdict. Cart abandonment cannot be asked that way, and the failure is quantitative, not
aesthetic. Eligibility for the per-customer cart label excludes anyone who ordered after
their last add — so by the time the question is put, everybody who was going to convert
quickly already has, and the survivors are pre-selected abandoners. Measured on
GoWelmart at a 4.19h horizon: 99.7% positive, 13 negatives in 336 rows. Nothing can
learn from that.

Asked per cart at the instant it opens, the same data gives a 43.6% base rate — a real
coin flip — because nobody has decided yet.

  per customer, 21d horizon   base rate 0.644   AUC 0.842   lift 1.55x*
  per cart, 4.19h horizon     base rate 0.436   AUC 0.740   lift 1.82x

  * on a question worth little: two in three abandon regardless, so near-perfect
    precision there is close to free.

WHAT A CART IS, WITHOUT A CART ID.

An `add_to_cart` event carries no grouping key, so "which adds are the same basket" has
to be decided. The rule here: a cart OPENS on an add that follows a quiet period — no
add from that customer within the eligibility window. A burst of adds is one cart; the
same customer adding again the next day is a new one.

Deliberately not `cart_id`. Most storefronts do not send one, and a rule that only works
for the ones that do is not a platform rule. Where a client does send it, this is the
place to prefer it — the shape below does not change.

The cost is small here: measured on GoWelmart, 93.4% of carts hold exactly ONE product
at the moment they open, so "the first add" and "the cart opened" are the same instant
either way.

WHAT THE ROWS CARRY.

Two row-level features, and they were ranked first and second in the winning model:

  cart_value                  price x quantity of the product just added
  mins_since_their_last_cart  gap since this customer's previous cart

Both come straight from the event stream. `cart_items` / `cart_units` /
`cart_products` are deliberately absent: with one product per cart they are constant,
feature selection dropped all three in every trial, and a constant column costs a
correlation cluster for nothing.

THE INDEX IS THE CUSTOMER ID, AND IT REPEATS.

One entry per cart, so a customer with five carts appears five times. That is what
`GroupKFold(groups=X.index)` in `trainer.py` and `select_features.py` already expects —
it exists because a customer appears at several stacked cutoffs — so every cart
belonging to one person stays inside a single fold and none of them can be studied in
training and graded in test.
"""

from __future__ import annotations

import duckdb
import pandas as pd

#: `cart_value` is `properties.price` and nothing cleverer.
#:
#: An earlier version guessed at `unit_price` / `price` / `amount` and coalesced them.
#: That was wrong twice over. DuckDB raises rather than returning NULL for a struct key
#: that does not exist, so the guess is a crash on any project whose events are shaped
#: differently — and more importantly it duplicated a decision that already has an
#: owner: `normalise.PROPERTIES` projects every project's events into ONE canonical
#: canonical struct (product_id, category, brand, price, quantity, session_id),
#: reading each key
#: from that project's own config. Resolving vocabulary a second time here is how the
#: two drift apart.
#:
#: QUANTITY is now part of that struct too, so this is price x quantity rather than
#: price alone. It read price only while `quantity` was missing from the canonical five,
#: which was harmless here — a cart holds one product 93.4% of the time at the moment it
#: opens, almost always one unit — and wrong for any shop whose customers add in bulk: a
#: 3 x 500 add was recorded as 500, understating the model's strongest feature by two
#: thirds. Defaults to 1 where a storefront sends no quantity at all.
_CART_VALUE = ("TRY_CAST(properties.price AS DOUBLE) "
               "* COALESCE(TRY_CAST(properties.quantity AS DOUBLE), 1)")


def build_cart_rows(
    dataset,
    cutoff_ts: str | None,
    eligibility_days: float,
    prediction_days: float,
    collect_days: float,
    con: duckdb.DuckDBPyConnection | None = None,
    basket_as_of_now: bool = False,
) -> pd.DataFrame:
    """Every cart that OPENED in the eligibility window ending at `cutoff_ts`.

    Returns a frame indexed by customer_id (repeating), with:

        label                       1 = no order within the horizon, 0 = converted
        cart_value                  price x quantity of the opening add
        mins_since_their_last_cart  NULL for a customer's first ever cart

    `prediction_days` may be fractional — a cart horizon is hours (4.19h = 0.1746d) —
    which is why `prediction_window_days` is a double rather than an integer.
    """
    # `cutoff_ts=None` MEANS NOW, ANSWERED BY THE DATABASE.
    #
    # Event timestamps are timezone-aware. A caller that formatted `utcnow()` into a
    # naive string had it read as LOCAL time, putting the whole window hours out and
    # returning nothing — the same empty answer, from the same cause, that the
    # eligibility query hit. `now()` compares aware against aware and cannot be moved by
    # the machine's timezone. Training still passes an explicit cutoff, which is a date
    # boundary and unambiguous.
    bound = "now()" if cutoff_ts is None else f"TIMESTAMP '{cutoff_ts}'"

    # THE BASKET, AS OF WHEN?
    #
    # For a TRAINING row: as of the moment itself. A row must never see an item added
    # after the instant it describes, or the model learns from the future.
    #
    # For a LIVE row: as of now. Everything that has happened is legitimately known at
    # scoring time, and pinning the basket to the last event instead leaves it one event
    # behind whenever two land in the same second — measured on a real basket, two
    # removals at 18:56:15, the earlier one chosen as the moment, and the item removed by
    # the later one still counted: Rs8,696 against a shop showing Rs6,897.
    basket_bound = bound if basket_as_of_now else "o.t"

    own_con = con is None
    con = con or duckdb.connect()
    con.execute("PRAGMA disable_progress_bar")
    dataset.prepare(con)

    ev_cart = dataset.events.sql_in("cart_add")
    ev_drop = dataset.events.sql_in("cart_remove")
    events_src = f"({dataset.events_source()})"
    orders_src = dataset.source("orders")

    try:
        df = con.execute(f"""
            -- EVERY CART ACTION IS ACTIVITY, INCLUDING TAKING SOMETHING OUT.
            --
            -- Only adds counted here, and an emptied basket showed the consequence: the
            -- shopper cleared their cart, nothing became a newer moment, and the last
            -- add went on anchoring a "live" cart worth whatever had been in it. The
            -- screen held Rs5,397 against an empty basket.
            --
            -- Which events those are comes from the project's own slots — `cart_add`
            -- and `cart_remove` — so a shop calling them anything else needs no change
            -- here. A shop that declares no removal event contributes none, and this is
            -- exactly the adds again.
            WITH raw AS (
                SELECT customer_id, timestamp AS t, {_CART_VALUE} AS cart_value,
                       properties.product_id AS product_id
                FROM {events_src}
                WHERE event_name IN ({ev_cart}) AND customer_id IS NOT NULL
                UNION ALL
                SELECT customer_id, timestamp AS t, NULL AS cart_value,
                       properties.product_id AS product_id
                FROM {events_src}
                WHERE event_name IN ({ev_drop}) AND customer_id IS NOT NULL
            ),
            -- `cart_value` is the model's feature — the value of the item last put IN.
            -- A removal has no value of its own, so it carries the previous add's
            -- forward rather than arriving as a hole the model reads as zero.
            adds AS (
                SELECT customer_id, t, product_id,
                       last_value(cart_value IGNORE NULLS) OVER (
                           PARTITION BY customer_id ORDER BY t
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cart_value
                FROM raw
            ),
            marked AS (
                SELECT *, lag(t) OVER (PARTITION BY customer_id ORDER BY t) AS prev_add
                FROM adds
            ),
            -- A ROLLING WINDOW: EVERY ADD IS A DECISION POINT.
            --
            -- This used to keep only the add that OPENED a cart, and everything after
            -- it was invisible — so a shopper who kept adding for three hours was
            -- judged, and timed out, from the moment they started. On a worklist that
            -- is backwards: the person still adding is the least abandoned one there,
            -- and they were the first to drop off.
            --
            -- Abandonment is silence, so the clock has to run from the LAST thing they
            -- did. Making every add a row is what lets it: each one asks "from here,
            -- will they buy inside the horizon", the same question serving asks at the
            -- shopper's most recent add. The row a live cart produces is now the same
            -- shape as the rows the model was fitted on.
            --
            -- `session_id` marks runs of activity separated by a gap wider than the
            -- window. It is not used to filter rows any more — only to bound the basket
            -- below, so a basket does not inherit items from a session two days ago.
            sessioned AS (
                SELECT *,
                       sum(CASE WHEN prev_add IS NULL
                                  OR t >= prev_add + INTERVAL '{eligibility_days} days'
                                THEN 1 ELSE 0 END)
                         OVER (PARTITION BY customer_id ORDER BY t
                               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS session_id
                FROM marked
            ),
            opens AS (SELECT * FROM sessioned),
            -- the gap to whatever this customer did LAST, which under a rolling window
            -- is the signal that matters: a long gap means a fresh session, a short one
            -- means they are still going.
            scoped AS (
                SELECT *, prev_add AS prev_cart FROM opens
            ),
            -- THE BASKET AS IT STOOD AT THIS MOMENT, not at the end of the window.
            --
            -- Bounded to the moment's own session so it cannot pick up a basket the
            -- shopper abandoned days earlier, and to events at or before `t` so a row
            -- never sees an item added after the instant it describes.
            -- THE BASKET, BUILT THE WAY THE EVENT CONTRACT DEFINES IT.
            --
            -- `added_to_cart` is an ACTION — the spec is explicit: "one event per add.
            -- If your platform can only report the cart's current contents, use
            -- `cart_updated` instead." So `quantity` is HOW MANY WERE ADDED, a delta,
            -- and a basket is the sum of them.
            --
            -- This read the last event's quantity as the line's total instead, which is
            -- the `cart_updated` convention applied to the wrong event. A shopper who
            -- pressed Add three times on a Rs2,499 item had a basket of five and a
            -- screen showing one.
            --
            -- A removal carrying a quantity is a delta too. One carrying NONE means the
            -- line is gone, so it resets the running total rather than subtracting from
            -- it: `zeroed` finds the last such moment per product and only the deltas
            -- after it count.
            cart_ev AS (
                SELECT o.customer_id, o.t AS open_t, e.timestamp AS ts,
                       e.properties.product_id AS pid,
                       (e.event_name IN ({ev_drop})) AS is_remove,
                       TRY_CAST(e.properties.quantity AS DOUBLE) AS qty,
                       TRY_CAST(e.properties.price AS DOUBLE) AS price
                FROM opens o
                JOIN {events_src} e
                  ON e.customer_id = o.customer_id
                 AND e.timestamp <= {basket_bound}
                 AND e.timestamp >  o.t - INTERVAL '{eligibility_days} days'
                 AND (e.event_name IN ({ev_cart}) OR e.event_name IN ({ev_drop}))
                WHERE e.properties.product_id IS NOT NULL
            ),
            zeroed AS (
                SELECT customer_id, open_t, pid, max(ts) AS cleared_at
                FROM cart_ev WHERE is_remove AND qty IS NULL
                GROUP BY 1, 2, 3
            ),
            -- BUYING REMOVES WHAT WAS BOUGHT, and no shop says so out loud.
            --
            -- A removal is reported because the shopper did something. Checkout is
            -- different: the ordered lines are consumed by the order, and every
            -- storefront simply stops showing them. There is no `removed_from_cart`
            -- for a thing somebody bought, and there never will be.
            --
            -- Without this, purchased lines were still counted as sitting in the cart
            -- for as long as the look-back reached. Measured: a shopper bought Rs3,598
            -- at 11:39, filled a second basket, emptied it by 11:41 — and the live
            -- worklist showed a Rs3,598 cart that was exactly the pair of items they
            -- had already paid for.
            --
            -- PER PRODUCT, NOT THE WHOLE BASKET. The first version of this cleared
            -- everything at the order's timestamp, which is right only when checkout
            -- takes the entire basket. It does not: a cart page with per-line
            -- checkboxes buys the ticked lines and LEAVES THE REST, which is how
            -- Amazon and Flipkart both behave. Clearing wholesale then deleted a
            -- genuinely live cart — measured: two lines added, one unticked, order
            -- placed, and the Rs999 line still sitting in the shop's own basket
            -- vanished from the worklist.
            --
            -- An order that names no line_items cannot say what it took, so it falls
            -- back to clearing the basket — the conservative reading, and the same
            -- fallback the conversion label above uses when a product cannot be matched.
            ord_scope AS (
                SELECT o.customer_id, o.t AS open_t, ord.timestamp AS ts, ord.line_items
                FROM opens o
                JOIN ({orders_src}) ord
                  ON ord.customer_id = o.customer_id
                 AND ord.timestamp <= {basket_bound}
                 AND ord.timestamp >  o.t - INTERVAL '{eligibility_days} days'
            ),
            bought_line AS (
                SELECT customer_id, open_t, pid, max(ts) AS bought_at FROM (
                    SELECT customer_id, open_t, ts,
                           unnest(COALESCE(line_items, [])).product_id AS pid
                    FROM ord_scope
                ) WHERE pid IS NOT NULL GROUP BY 1, 2, 3
            ),
            bought_all AS (
                SELECT customer_id, open_t, max(ts) AS bought_at
                FROM ord_scope
                WHERE line_items IS NULL OR length(line_items) = 0
                GROUP BY 1, 2
            ),
            line_qty AS (
                SELECT c.customer_id, c.open_t, c.pid,
                       sum(CASE WHEN c.is_remove THEN -COALESCE(c.qty, 0)
                                ELSE COALESCE(c.qty, 1) END) AS units
                FROM cart_ev c
                LEFT JOIN zeroed z
                       ON z.customer_id = c.customer_id AND z.open_t = c.open_t AND z.pid = c.pid
                LEFT JOIN bought_line bo
                       ON bo.customer_id = c.customer_id AND bo.open_t = c.open_t AND bo.pid = c.pid
                LEFT JOIN bought_all ba
                       ON ba.customer_id = c.customer_id AND ba.open_t = c.open_t
                WHERE (z.cleared_at IS NULL OR c.ts > z.cleared_at)
                  AND (bo.bought_at IS NULL OR c.ts > bo.bought_at)
                  AND (ba.bought_at IS NULL OR c.ts > ba.bought_at)
                GROUP BY 1, 2, 3
            ),
            line_price AS (
                SELECT customer_id, open_t, pid, arg_max(price, ts) AS price
                FROM cart_ev WHERE price IS NOT NULL GROUP BY 1, 2, 3
            ),
            basket AS (
                SELECT q.customer_id, q.open_t AS t,
                       COALESCE(sum(q.units * COALESCE(p.price, 0)), 0) AS basket_value
                FROM line_qty q
                LEFT JOIN line_price p
                       ON p.customer_id = q.customer_id AND p.open_t = q.open_t AND p.pid = q.pid
                WHERE q.units > 0
                GROUP BY 1, 2
            )
            SELECT s.customer_id,
                   s.t AS opened_at,
                   b.basket_value,
                   (o.customer_id IS NULL)::INT AS label,
                   s.cart_value,
                   date_diff('second', s.prev_cart, s.t) / 60.0
                       AS mins_since_their_last_cart
            FROM scoped s
            LEFT JOIN basket b ON b.customer_id = s.customer_id AND b.t = s.t
            LEFT JOIN ({orders_src}) o
                   ON o.customer_id = s.customer_id
                  AND o.timestamp > s.t
                  AND o.timestamp <= s.t + INTERVAL '{prediction_days} days'
                  -- CONVERTED MEANS THEY BOUGHT WHAT THEY ADDED.
                  --
                  -- Matching on "any order in the window" was the first version and it
                  -- is far too loose: a dealer adds a phone at 2pm and buys rice at
                  -- 2:20pm, and the phone reads as converted. Every such coincidence is
                  -- a false negative in the label AND a spurious fast conversion in the
                  -- horizon derivation, which is why that came out at 1.83h instead of
                  -- the 4.19h the same data gives under product matching.
                  --
                  -- Not a cart_id join — orders do not carry one. This is the closest
                  -- honest check available, and it is still inference: a customer who
                  -- rebuys the same SKU for an unrelated reason counts, and one who
                  -- buys a different variant does not. Adding `cart_id` to the order
                  -- payload is the only thing that makes it exact.
                  --
                  -- Falls back to any-order when the add carries no product_id, rather
                  -- than labelling every such cart abandoned for want of a field.
                  AND (s.product_id IS NULL
                       OR list_contains(
                            list_transform(COALESCE(o.line_items, []), x -> x.product_id),
                            s.product_id))
            -- COLLECTED over `collect_days`, not over the eligibility window.
            --
            -- Those are two different jobs and conflating them cost a fold: with the
            -- eligibility window doing both, one cutoff gathered the 51 carts opened in
            -- the previous five hours, which is not a training set. Eligibility decides
            -- WHEN A NEW CART STARTS (the quiet-gap rule above) and, at serving time,
            -- which carts are still live. How far back to gather examples is a separate
            -- question with a separate answer: the feature window, so every row's
            -- history is as deep as its features assume.
            WHERE s.t >= {bound} - INTERVAL '{collect_days} days'
              AND s.t < {bound}
        """).df()
    finally:
        if own_con:
            con.close()

    if df.empty:
        return pd.DataFrame(
            columns=["label", "cart_value", "basket_value", "mins_since_their_last_cart"]
        ).rename_axis("customer_id")

    # One row per cart even where an order matched more than once. The LEFT JOIN fans
    # out when a customer places two orders inside the horizon, and both mean the same
    # thing — the cart converted — so `min` collapses them to label 0.
    #
    # Grouped on (customer, opened_at), which is the cart's identity. Grouping on the
    # feature values instead would silently merge two genuinely different carts that
    # happened to hold the same item at the same gap.
    df = df.groupby(["customer_id", "opened_at"], dropna=False, as_index=False).agg(
        label=("label", "min"),
        cart_value=("cart_value", "first"),
        basket_value=("basket_value", "first"),
        mins_since_their_last_cart=("mins_since_their_last_cart", "first"),
    )
    # `opened_at` is returned, not dropped: the caller needs it to describe each
    # customer AS OF THE DAY THEIR CART OPENED rather than as of the fold cutoff.
    # See the leak note in cart_xy.build_cart_xy — this column is what prevents it.
    return df.set_index("customer_id")[
        ["opened_at", "label", "cart_value", "basket_value", "mins_since_their_last_cart"]
    ]


def build_open_carts(
    dataset,
    as_of_ts: str | None,
    eligibility_days: float,
    prediction_days: float,
    con: duckdb.DuckDBPyConnection | None = None,
) -> pd.DataFrame:
    """The carts still OPEN at `as_of_ts` — the only population serving can answer for.

    THIS IS THE SERVING HALF OF `build_cart_rows`, AND IT CALLS IT RATHER THAN
    RESTATING IT.

    Training fits on cart rows; serving was handing the model a customer row and
    letting `serve.py` fill the two missing columns with zero, so every basket was
    scored as empty and `cart_value` — the strongest feature in the model — was
    silently nil on every request. Nothing raised. The scores were simply wrong.

    A second copy of the open-a-cart SQL would fix the symptom and reintroduce the
    cause: the quiet-gap rule, the product-matched conversion join and the
    price-times-quantity expression would then live in two places, free to drift
    apart with nothing in the output to say which one a number came from.

    So the window is the only thing that changes:

        collect_days = prediction_days   gather exactly the carts whose horizon is
                                         still running. An older cart's answer is
                                         already in the data; scoring it predicts
                                         the past.

    And the label is re-read rather than recomputed. `label = 1` means "no matching
    order since this cart opened". At a training cutoff that reads *abandoned*; at
    `as_of` the same test reads *not converted yet*, which is precisely what makes a
    cart worth spending a message on.
    """
    rows = build_cart_rows(
        dataset,
        as_of_ts,
        eligibility_days=eligibility_days,
        prediction_days=prediction_days,
        collect_days=prediction_days,
        con=con,
        # Serving: the basket is what it is NOW, not what it was at the last event.
        basket_as_of_now=True,
    )
    if rows.empty:
        return rows.drop(columns=["label"], errors="ignore")

    live = rows[rows["label"] == 1].drop(columns=["label"])
    if live.empty:
        return live

    # ONE LIVE BASKET PER CUSTOMER. Two opens can land inside the horizon whenever
    # eligibility is shorter than prediction, and `/score` answers per customer, so
    # the newest is the one on their screen. Sorting first makes `tail(1)` that
    # choice explicitly rather than leaving it to row order.
    latest = live.sort_values("opened_at").groupby(level=0).tail(1)

    # AN EMPTY BASKET IS NOT AN OPEN CART — AND THIS HAS TO COME LAST.
    #
    # Filtering before picking the newest moment quietly resurrects an older one: the
    # shopper's final act emptied the basket, that row was dropped as empty, and the add
    # thirty seconds earlier became "latest" again. The screen then showed a live cart
    # worth the item they had just taken out.
    #
    # Newest first, then judge it. If their last action left nothing in the basket there
    # is no cart to abandon and nothing to send.
    return latest[latest["basket_value"] > 0]
