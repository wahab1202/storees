"""Assemble (X, y) for the cart goal, where a row is a CART rather than a customer.

Kept in one place because `select_features._build_xy` and `trainer._build_xy` are
separate copies of the same three lines, and a per-cart assembly that drifted between
them would show up as a selection chosen on one population and a model fitted on
another — with nothing in the output to say so.
"""

from __future__ import annotations

import os
import sys

import pandas as pd

from shared.cart_rows import build_cart_rows

#: Row-level features, carried on the cart rather than the customer. Prefixed so they
#: cannot collide with anything the customer feature builder produces.
CART_FEATURES = ("cart_value", "mins_since_their_last_cart")

# ---------------------------------------------------------------------------
# THE SAME DAY, REBUILT SEVEN TIMES.
#
# One cart retrain asks for 5,313 feature matrices and only 776 of them are
# different — measured on a real project, 85 folds, a six-candidate grid. The rest
# are re-answers to a question already answered.
#
# The duplication is structural, not accidental. A look-back candidate is scored on
# three held-out rounds, and those rounds sit two weeks apart while each reads
# months back, so their windows almost entirely coincide. Feature selection and the
# fit that follows it then ask for the same snapshot cutoffs again.
#
# WHY A CACHE IS SAFE HERE, when caching is the thing this codebase distrusts most.
# A row says "this shopper, as of midnight on 12 June, from their previous N days".
# Nothing in that sentence mentions which fold asked. Same day, same look-back, same
# answer — so reuse is not an approximation of the second build, it IS the second
# build.
#
# WHAT IS CACHED IS THE DAY'S CARTS, NOT THE POPULATION. The matrix is built for
# every customer and then cut down to the ~160 who opened a cart; keeping the cut
# version costs about 0.2 MB a day instead of 5 MB, so a whole run's 776 entries fit
# in memory. It does not reduce the number of customers BUILT — that is a separate
# change with its own risk, and deliberately not in here.
#
# LIFETIME IS ONE RUN. `reset()` is called at the top of every goal, so a reseed, a
# mapping change or a different project can never be served yesterday's rows — the
# stale-cache failure this codebase has been bitten by before.
#
# BOUNDED, BECAUSE THE SIZE IS THE SHOP'S TO DECIDE, NOT OURS. What is held is
# (days in the collection window) x (that day's carts) x (~190 columns). The days are
# bounded by the look-back; the carts per day are not — they are however busy the shop
# is. One project measured 190 MB; a shop with four times the carts would hold four
# times that, and a laptop that starts swapping is slower than the slow path this is
# meant to replace. So the budget is in BYTES, not entries: entry counts assume every
# shop's day weighs the same, and they do not.
#
# ON REACHING THE BUDGET IT STOPS STORING RATHER THAN EVICTING. Eviction would be
# right for a long-lived cache with locality; here the access pattern is a full sweep
# per candidate, so an evicting cache under pressure discards each day just before it
# is asked for again — all of the memory, none of the reuse. Declining to store keeps
# what is already paying for itself and lets everything else take the old path. The
# failure mode is "as slow as before", which is the one worth having.
#
# ON BY DEFAULT, once the before/after said so. Two projects, same sealed test each
# time: Bazario 50.2 min -> 10.1 min and GoWelmart 57.5 -> 52.9, with AUC, lift, the
# carts learned from, the chosen windows and the selected feature list identical in
# both -- including at every intermediate stage of the look-back search, six of them,
# which is not a coincidence that survives by luck. `ML_CART_DAY_CACHE=0` turns it off.
#
# The saving is uneven and that is the memory budget, not the idea: Bazario reused 86%
# of its asks, GoWelmart 10%, because GoWelmart's days are roughly 25x heavier and the
# budget fills after ~87 of them. Holding all of GoWelmart's would want 4-5 GB, which
# is not a trade worth making on a laptop -- so it keeps what fits and builds the rest
# the old way.
# ---------------------------------------------------------------------------

_DAY_CACHE: dict = {}
_HITS = _MISSES = 0
_BYTES = 0
_CAPPED = False

#: Default budget. Comfortably above the 190 MB a real project measured, and far
#: enough below a developer laptop's free memory that filling it cannot start swap.
_DEFAULT_BUDGET_MB = 512


def cache_enabled() -> bool:
    return os.environ.get("ML_CART_DAY_CACHE", "1") != "0"


def _budget_bytes() -> int:
    try:
        mb = float(os.environ.get("ML_CART_DAY_CACHE_MB", _DEFAULT_BUDGET_MB))
    except ValueError:
        mb = _DEFAULT_BUDGET_MB
    return int(max(mb, 0) * 1024 * 1024)


def reset_day_cache() -> None:
    """Drop everything. Called per goal so nothing survives a data change."""
    global _HITS, _MISSES, _BYTES, _CAPPED
    _DAY_CACHE.clear()
    _HITS = _MISSES = 0
    _BYTES = 0
    _CAPPED = False


def day_cache_stats() -> dict:
    return {"hits": _HITS, "misses": _MISSES, "distinct": len(_DAY_CACHE),
            "mb": round(_BYTES / 1024 / 1024, 1), "capped": _CAPPED}


def _entry_bytes(X: pd.DataFrame, y: pd.Series, t: pd.Series) -> int:
    """What this day costs to keep. `deep` so the object-dtype index is counted
    rather than assumed to be pointers — customer ids are strings, and on a large
    shop they are a real share of the total."""
    return int(X.memory_usage(index=True, deep=True).sum()
               + y.memory_usage(index=False, deep=True)
               + t.memory_usage(index=False, deep=True))


def _store(key, fp, X, y, t) -> None:
    """Keep this day if there is room; otherwise leave it out and say so once."""
    global _BYTES, _CAPPED
    if X is None:                       # empty day — a marker, not a matrix
        _DAY_CACHE[key] = (fp, None, None, None)
        return
    cost = _entry_bytes(X, y, t)
    if _BYTES + cost > _budget_bytes():
        if not _CAPPED:
            _CAPPED = True
            print(f"  [cart cache] budget {_budget_bytes()//1024//1024} MB reached "
                  f"after {len(_DAY_CACHE):,} days — the rest build fresh "
                  f"(raise ML_CART_DAY_CACHE_MB to hold more)",
                  file=sys.stderr, flush=True)
        return
    _DAY_CACHE[key] = (fp, X, y, t)
    _BYTES += cost


def _chunk_fingerprint(chunk: pd.DataFrame):
    """Identity of one day's carts — which customers, and what each cart holds.

    Covers the values a cached row is built from, not just the row count: two
    different baskets of the same size must not read as the same day.
    """
    cols = ["label", "opened_at", *CART_FEATURES]
    vals = pd.util.hash_pandas_object(
        chunk[cols].astype({c: "float64" for c in CART_FEATURES}).fillna(-1.0),
        index=True)
    return (len(chunk), int(vals.sum() % (1 << 61)))

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

    global _HITS, _MISSES
    use_cache = cache_enabled()

    parts_x, parts_y, parts_t = [], [], []
    for day, chunk in rows.groupby(pd.to_datetime(rows["opened_at"]).dt.date):
        key = (dataset.project_id, day, int(win.feature_days))
        # The guard, not a formality. A cached day is only reused when the carts that
        # day are byte-for-byte the ones being asked about now; anything else rebuilds.
        # Two cutoffs whose windows both contain 12 June should see the same carts —
        # the window edges land on midnight, so no day is ever half-collected — and
        # this is what makes that a checked fact rather than an assumption.
        fp = _chunk_fingerprint(chunk) if use_cache else None
        hit = _DAY_CACHE.get(key) if use_cache else None

        if hit is not None and hit[0] == fp:
            _HITS += 1
            if hit[1] is None:          # this day contributed nothing; it still won't
                continue
            X, y_day, t_day = hit[1].copy(), hit[2], hit[3]
        else:
            if use_cache:
                _MISSES += 1
            feats = build_feature_matrix(dataset, f"{day} 00:00:00", win.feature_days)
            keep = chunk[chunk.index.isin(feats.index)]
            if keep.empty:
                if use_cache:
                    _store(key, fp, None, None, None)
                continue
            X = feats.loc[keep.index].copy()
            for col in CART_FEATURES:
                X[col] = keep[col].to_numpy()
            y_day = pd.Series(keep["label"].to_numpy(), index=X.index, name="label")
            t_day = pd.Series(pd.to_datetime(keep["opened_at"]).to_numpy(),
                              index=X.index, name="opened_at")
            if use_cache:
                _store(key, fp, X.copy(), y_day, t_day)

        parts_x.append(X)
        parts_y.append(y_day)
        parts_t.append(t_day)

    if not parts_x:
        empty = (pd.DataFrame(), pd.Series(dtype=int))
        return (*empty, pd.Series(dtype="datetime64[ns]")) if with_opened_at else empty
    X, y = pd.concat(parts_x), pd.concat(parts_y)
    if with_opened_at:
        return X, y, pd.concat(parts_t)
    return X, y
