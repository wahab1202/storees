"""Where a project's rows come from.

`windows.py`, feature building and labelling never touch a table name or a file path —
they ask a SignalSource four questions, and this module holds the answers.

There is ONE implementation. `DatasetSignalSource` asks the project's dataset for its
cleaned sources and never learns what is behind them, which is the whole point of the
seam: the data layer can change without touching the thinking on top of it.

A second implementation read prepared parquet files directly. It was how data arrived
before ingestion moved into the database, and it was removed once nothing called it —
a dead path that made this file look like it supported two data sources when it
supports one. Everything now reads the database; the parquet that `dataset.materialise`
writes is a per-run CACHE of database rows, not a source.
"""

from __future__ import annotations

import datetime as dt
from typing import Sequence

#: abstract signal -> what counts as that signal. Which literal event names map onto
#: `activity` and `cart` is a per-project decision and belongs in the project's event
#: mapping, not here.
SIGNALS = ("order", "activity", "cart", "all")

#: a fifth form, `event:<name>`, asks about ONE named event rather than an abstract
#: category. It exists because a goal can be about an event that is none of the four —
#: a lender's `emi_missed`, a SaaS `subscription_cancelled` — and such a goal has to be
#: measured against its OWN history and its OWN rhythm. Measuring `emi_missed` against
#: general activity would report months of usable history in which no payment was ever
#: missed, and rehearsals landing there would train on labels that are all zero.
EVENT_SIGNAL_PREFIX = "event:"


def signal_event(signal: str) -> str | None:
    """The event name inside `event:<name>`, or None for the four abstract signals."""
    s = str(signal)
    return s[len(EVENT_SIGNAL_PREFIX):] or None if s.startswith(EVENT_SIGNAL_PREFIX) else None


class DatasetSignalSource:
    """Answers the four questions from a project's dataset, whatever backs it.

    Files or database — this asks the dataset for its cleaned sources and never
    touches a file path or a table name itself. That is what lets the same window
    derivation run unchanged when a project's data moves from one to the other.
    """

    def __init__(self, dataset, con=None):
        import duckdb
        self.ds = dataset
        self.con = con or duckdb.connect()
        self.con.execute("PRAGMA disable_progress_bar")
        self.ds.prepare(self.con)
        # every name that means a cart add, not just the first -- one meaning can
        # cover several events and the cart signal should see all of them.
        #
        # NO FALLBACK. This read `or ("add_to_cart",)`: a project that had not mapped a
        # cart event was quietly assumed to call it `add_to_cart`, and the guess does
        # not fail loudly. The name matches nothing, every cart query returns zero rows,
        # the onset detector falls back to general activity, windows derive from a
        # signal unrelated to carts, and a plausible-looking model appears on the screen
        # with nothing anywhere reporting that the goal was built on an event the client
        # has never sent.
        #
        # `resolve_dataset` already refuses rather than guess, for exactly this reason:
        # "Guessing a default here does not fail -- it trains happily on the wrong
        # events and returns a plausible AUC." This line was the one place still doing
        # it. Empty now, so `has_signal` reports False and the goal is declined the same
        # way an unmapped project is declined everywhere else.
        self.cart_events = tuple(dataset.events.cart_add)

    @staticmethod
    def _names(names) -> str:
        return ",".join("'" + str(n).replace("'", "''") + "'" for n in names) or "''"

    def _rows_sql(self, signal: str) -> str:
        ev, od = f"({self.ds.source('events')})", f"({self.ds.source('orders')})"
        if named := signal_event(signal):
            return (f"SELECT timestamp AS ts FROM {ev} "
                    f"WHERE event_name = '{named.replace(chr(39), chr(39) * 2)}'")
        if signal == "order":
            return f"SELECT timestamp AS ts FROM {od}"
        if signal == "activity":
            return f"SELECT timestamp AS ts FROM {ev}"
        if signal == "cart":
            return (f"SELECT timestamp AS ts FROM {ev} "
                    f"WHERE event_name IN ({self._names(self.cart_events)})")
        return (f"SELECT timestamp AS ts FROM {od} "
                f"UNION ALL SELECT timestamp AS ts FROM {ev}")

    def monthly_volume(self, signal: str):
        rows = self.con.execute(
            f"SELECT date_trunc('month', ts) AS mo, count(*) AS n, min(ts) AS first_ts "
            f"FROM ({self._rows_sql(signal)}) GROUP BY 1 ORDER BY 1").fetchall()
        return [(m.date() if hasattr(m, "date") else m, int(n), f) for m, n, f in rows]

    def per_customer_gaps(self, signal: str):
        src = f"({self.ds.source('orders')})" if signal == "order" else f"({self.ds.source('events')})"
        if named := signal_event(signal):
            src = (f"(SELECT * FROM ({self.ds.source('events')}) "
                   f"WHERE event_name = '{named.replace(chr(39), chr(39) * 2)}')")
        return self.con.execute(f"""
            WITH d AS (SELECT DISTINCT customer_id, CAST(timestamp AS DATE) AS day FROM {src}),
                 g AS (SELECT customer_id,
                              date_diff('day', lag(day) OVER (PARTITION BY customer_id
                                                              ORDER BY day), day) AS gap
                       FROM d)
            SELECT median(gap) FROM g WHERE gap IS NOT NULL GROUP BY customer_id
        """).df().iloc[:, 0].tolist()

    def recovery_latencies(self, include_never: bool = False):
        """Days from an add-to-cart to that customer's next order. May be FRACTIONAL.

        This measured in whole days (`date_diff('day', ...)`), which silently floors
        every sub-day recovery to 0. Measured on GoWelmart: half of all adds that ever
        convert do so within 4.19 HOURS and 56% within the first hour, so the majority
        of this project's real recoveries were being reported as "zero days" — a
        distribution with no resolution left in exactly the region carts live in.
        Seconds divided out gives the same number for slow shops and keeps the detail
        for fast ones.

        `include_never` decides WHICH question is being asked, and the two answers are
        far apart:

          False — latency among adds that DID convert. Survivor-biased by construction:
                  the p50 is 0.41h because it only ever sees the people who came back.
                  Right for "how long does a recovery take", which is what the cart
                  ladder's coverage figure reports.

          True  — the same, but adds that never converted are kept and returned as NaN.
                  A percentile over that lands on "never" once it passes the conversion
                  rate, which is what "how long until X% of carts have resolved" needs.
                  GoWelmart: p50 4.19h against 0.41h for the same data.

        Left as an INNER JOIN by default so no existing caller changes meaning.
        """
        join = "LEFT JOIN" if include_never else "JOIN"
        # Matched on the PRODUCT, not on "any order that followed".
        #
        # The same rule `cart_rows` labels with, and it has to be the same rule: the
        # horizon derived here becomes the window that labelling is judged over, so a
        # looser match on one side than the other means the question asked is not the
        # question measured. Any-order matching counts a dealer who adds a phone and
        # buys rice twenty minutes later as a twenty-minute recovery — enough of those
        # and the median collapses. On GoWelmart it moved the derived horizon from
        # 4.19h to 1.83h.
        return self.con.execute(f"""
            WITH adds AS (SELECT customer_id, timestamp AS t,
                                 properties.product_id AS product_id
                          FROM ({self.ds.source('events')})
                          WHERE event_name IN ({self._names(self.cart_events)})),
                 conv AS (SELECT a.customer_id, a.t, min(o.timestamp) AS next_order
                          FROM adds a {join} ({self.ds.source('orders')}) o
                            ON o.customer_id = a.customer_id AND o.timestamp > a.t
                           AND (a.product_id IS NULL
                                OR list_contains(
                                     list_transform(COALESCE(o.line_items, []),
                                                    x -> x.product_id),
                                     a.product_id))
                          GROUP BY a.customer_id, a.t)
            SELECT date_diff('second', t, next_order) / 86400.0 FROM conv
        """).df().iloc[:, 0].tolist()

    def has_signal(self, signal: str) -> bool:
        n = self.con.execute(f"SELECT count(*) FROM ({self._rows_sql(signal)})").fetchone()[0]
        return int(n) > 0
