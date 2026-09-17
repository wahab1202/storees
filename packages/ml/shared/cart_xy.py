"""Assemble (X, y) for the cart goal, where a row is a CART rather than a customer.

Kept in one place because `select_features._build_xy` and `trainer._build_xy` are
separate copies of the same three lines, and a per-cart assembly that drifted between
them would show up as a selection chosen on one population and a model fitted on
another — with nothing in the output to say so.
"""

from __future__ import annotations

import pandas as pd

from shared.cart_rows import build_cart_rows

#: Row-level features, carried on the cart rather than the customer. Prefixed so they
#: cannot collide with anything the customer feature builder produces.
CART_FEATURES = ("cart_value", "mins_since_their_last_cart")

#: The key a score carries to say WHEN ITS OCCASION BEGAN, written into `factors` and
#: read by the countdown on the goal page.
#:
#: Deliberately not `cart_opened_at`. The concept is "the row is an event with a clock
#: running, not a person" — a two-hour checkout-abandonment goal built next year needs
#: exactly this and would otherwise arrive to find the mechanism spelled `cart`, and
#: either rename it everywhere or add a second key beside it.
OCCASION_STARTED_AT = "occasion_started_at"

#: WHAT ACTUALLY HAPPENED, on the rows where it is already known.
#:
#: Only an evaluation run can carry this: it scores a sealed period whose outcomes have
#: since played out, which is exactly why it can report an AUC. A live score cannot have
#: it — the whole point is that the answer has not happened yet — and a page must not
#: invent one. Present means "this row is history"; absent means "this row is a
#: prediction", and that single fact is what lets one screen be honest about both.
OUTCOME = "outcome"


def build_cart_xy(dataset, cutoff: str, win, build_feature_matrix, with_opened_at: bool = False):
    """One row per cart: the customer as they were WHEN THAT CART OPENED, plus the
    cart's own two features.

    EVERY ROW GETS ITS OWN AS-OF DATE, and that is not a refinement — it is the
    difference between a model and a leak.

    Building the customer matrix once at the fold cutoff is the obvious implementation,
    and it is what ran first. It describes a cart opened on the 1st using everything
    known on the 15th, so `lifetime_cart_conversion_rate` and
    `lifetime_cart_to_order_latency` already account for whether THIS cart converted.
    Measured on GoWelmart it returned a top-decile precision of exactly 1.000, with the
    leaking features ranked first, third and sixth. A perfect decile is not a good
    model, it is a symptom.

    So the matrix is rebuilt once per DAY present in the rows, as of that day's
    midnight, and each cart takes the one for its own day. Midnight is strictly earlier
    than every cart opened that day, so nothing a row sees postdates it. The cost is one
    build per day in the collection window rather than one per fold.

    Alignment is a lookup, not an intersection: `.loc` with a repeating index replicates
    a customer's features once per cart, which is the intent. Intersecting first and
    then indexing the labels would fan them out combinatorially and invent rows.

    `with_opened_at` RETURNS THE OPEN TIME ALONGSIDE, IT DOES NOT ADD A COLUMN. Scoring
    needs to know when each cart opened — a five-hour window counted from anything else
    is fiction — but `select_features` treats every column of X as a candidate, so an
    `opened_at` column would be offered to the model as a feature. Returned separately,
    it can reach the score row without ever reaching the fit.
    """
    # `feature_days` is the collection span: gather as many carts as the look-back is
    # deep, so every row's history is as long as its features assume. `eligibility_days`
    # stays what it is — the quiet gap that separates one cart from the next.
    rows = build_cart_rows(dataset, cutoff, win.eligibility_days, win.predict_days,
                           collect_days=win.feature_days)
    if rows.empty:
        empty = (pd.DataFrame(), pd.Series(dtype=int))
        return (*empty, pd.Series(dtype="datetime64[ns]")) if with_opened_at else empty

    parts_x, parts_y, parts_t = [], [], []
    for day, chunk in rows.groupby(pd.to_datetime(rows["opened_at"]).dt.date):
        feats = build_feature_matrix(dataset, f"{day} 00:00:00", win.feature_days)
        keep = chunk[chunk.index.isin(feats.index)]
        if keep.empty:
            continue
        X = feats.loc[keep.index].copy()
        for col in CART_FEATURES:
            X[col] = keep[col].to_numpy()
        parts_x.append(X)
        parts_y.append(pd.Series(keep["label"].to_numpy(), index=X.index, name="label"))
        parts_t.append(pd.Series(pd.to_datetime(keep["opened_at"]).to_numpy(),
                                 index=X.index, name="opened_at"))

    if not parts_x:
        empty = (pd.DataFrame(), pd.Series(dtype=int))
        return (*empty, pd.Series(dtype="datetime64[ns]")) if with_opened_at else empty
    X, y = pd.concat(parts_x), pd.concat(parts_y)
    if with_opened_at:
        return X, y, pd.concat(parts_t)
    return X, y
