"""A project's data, and what its event names mean.

Two things every stage below this needs, and neither of them may be assumed:

  ProjectDataset   where this project's rows live. The tenant key is the PROJECT,
                   not a business type — two B2B companies are two companies, and
                   keying storage on "b2b" is how one silently overwrites the other.

  EventMap         which of this project's event names carry which meaning. One
                   company sends `add_to_cart`, another sends cart snapshots that
                   have to be read as adds, a third sends nothing at all. That is
                   configuration, not a constant in a feature file.

Both come from the project's own configuration, which is what the onboarding form
writes. Nothing downstream hardcodes a company, a folder, or an event name.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class EventMap:
    """This project's event names, by meaning.

    Mirrors the abstract-concept idea already used for domain packs, but resolved per
    PROJECT rather than per vertical — two e-commerce companies rarely name things the
    same way. A meaning left empty is not an error: the features that need it come out
    blank and drop themselves during selection.
    """

    purchase: tuple[str, ...] = ("order_completed",)
    view: tuple[str, ...] = ("product_viewed",)
    cart_add: tuple[str, ...] = ("add_to_cart",)
    cart_abandon: tuple[str, ...] = ("cart_abandoned",)
    #: "took it back out of the basket". Needed to total a basket honestly; empty for a
    #: shop that does not send one, in which case the total is the sum of the adds.
    cart_remove: tuple[str, ...] = ()
    cancellation: tuple[str, ...] = ("order_cancelled",)
    #: events that are OUR OWN outbound messaging. Predicting a customer's behaviour
    #: from messages we chose to send them leaks our own targeting into the model.
    ignored: tuple[str, ...] = ()

    #: THIS PROJECT'S OWN MEANINGS, beyond the five above.
    #:
    #: The five are what the CLEANING rules act on, and they are enough to clean any
    #: company's data. They are not enough to describe one. A lender's strongest
    #: predictor is `emi_missed`, a course platform's is `course_dropped`, and neither
    #: is a purchase, a view, a cart or a cancellation — under the five they arrive as
    #: undifferentiated activity, worth exactly as much as a page view.
    #:
    #: Named per PROJECT rather than per industry: a fixed per-vertical list is wrong
    #: for the second client in that vertical, and wrong again for the first client of
    #: a vertical nobody planned for.
    #:
    #:     {"emi_missed": ("emi_missed",), "repayment": ("emi_paid", "emi_overdue")}
    signals: dict[str, tuple[str, ...]] = field(default_factory=dict)

    # ---- how "added to cart" is obtained ---------------------------------
    #: "event"           the company sends a real add-to-cart click
    #: "snapshot_growth" the company sends the CART'S CURRENT STATE on every change.
    #:                   A snapshot is not an add: one basket of three items produces
    #:                   three snapshots and also produces one every time something is
    #:                   removed. Counting snapshots as adds overstates cart activity
    #:                   several-fold (263,028 snapshots vs 55,610 real adds on one
    #:                   real dataset). An add is a snapshot whose basket GREW.
    cart_add_mode: str = "event"
    #: which event carries the snapshot, and the property names holding the basket's
    #: identity and size. All configuration -- no company's field names in code.
    snapshot_event: str = "cart_updated"
    snapshot_cart_key: str = "cart_id"
    snapshot_size_key: str = "item_count"
    #: the property holding the basket's VALUE, already totalled by the shop.
    snapshot_total_key: str = "total"

    #: THE DECLARED BASKET-SNAPSHOT SLOT, as against `snapshot_event` above.
    #:
    #: The two are not the same thing and must not be merged. `snapshot_event` serves
    #: `cart_add_mode="snapshot_growth"`, where a shop sends ONLY basket states and adds
    #: have to be reconstructed from growth. This is the ordinary case: a shop sends
    #: adds, removes AND a snapshot, each doing the job it is good at -- the actions
    #: carry behaviour, this carries value.
    #:
    #: Empty for a shop that sends no snapshot, in which case the basket is summed from
    #: adds minus removes exactly as before. Declared per project like every other slot;
    #: the default lives in the backend's vocabulary, not here.
    cart_snapshot: tuple[str, ...] = ()

    #: which signal measures how fast this project's relationship moves — `order` for a
    #: shop, `event:emi_paid` for a lender whose customers take one loan and repay it
    #: monthly. Carried on the event map because it names an EVENT, like everything else
    #: here, and because `windows` needs it without reaching back to the connector.
    cadence_signal: str = "order"

    def sql_in(self, meaning: str) -> str:
        """A SQL list for one meaning, e.g. "'add_to_cart','cart_updated'".
        Returns a never-matching literal when the project has no such event, so
        callers can interpolate it without branching."""
        names = getattr(self, meaning)
        if not names:
            return "''"
        return ",".join("'" + n.replace("'", "''") + "'" for n in names)

    @staticmethod
    def sql_in_names(names) -> str:
        """A SQL list from explicit event names, for a caller holding names rather than
        a meaning — a goal built on one named event, say. Same never-matching literal
        for an empty list, so it interpolates without branching."""
        names = [n for n in (names or []) if n]
        if not names:
            return "''"
        return ",".join("'" + str(n).replace("'", "''") + "'" for n in names)

    def has(self, meaning: str) -> bool:
        return bool(getattr(self, meaning))


@dataclass(frozen=True)
class ProjectDataset:
    """Where one project's prepared rows are, and what its events mean.

    `root` is per project. When ingestion moves into the database this becomes a
    connection plus a project_id, and every SQL string below reads from tables with a
    `WHERE project_id = …` instead of from files — the callers do not change.
    """

    project_id: str
    root: Path
    events: EventMap = field(default_factory=EventMap)

    #: set when this project's rows live in the database rather than in files.
    #: Everything above this line is unchanged either way -- the pipeline asks for a
    #: source and gets a SELECT; it never learns which backend answered.
    tables: object | None = None
    #: connection string when the rows live in a database
    dsn: str | None = None

    @classmethod
    def from_path(cls, project_id: str, root: str | Path, events: EventMap | None = None):
        return cls(project_id=project_id, root=Path(root), events=events or EventMap())

    @classmethod
    def from_database(cls, project_id: str, saved_config: dict, dsn: str,
                      schema: str = "pg", customer_columns=None):
        """A project whose rows are read straight from the database, cleaned on the
        way out according to its own saved configuration.

        `customer_columns` is which columns that table actually has, so a feature
        reading an optional one behaves on both sides of a migration rather than
        failing on the column simply not being there yet.
        """
        from dataclasses import replace as _replace
        from shared.normalise import ProjectConfig, DatabaseTables
        cfg = ProjectConfig.from_saved(project_id, saved_config)
        if customer_columns is not None:
            cfg = _replace(cfg, customer_columns=frozenset(customer_columns))
        ev = EventMap(
            purchase=tuple(cfg.purchase_events), view=tuple(cfg.view_events),
            cart_add=tuple(cfg.cart_add_events), cancellation=tuple(cfg.cancellation_events),
            # Was omitted, so this slot never left its default no matter what a project
            # declared — the one meaning the config could state and the pipeline could
            # not hear.
            cart_abandon=tuple(cfg.cart_abandon_events),
            cart_remove=tuple(cfg.cart_remove_events),
            # Carried, not defaulted. `cart_abandon` above is the standing reminder of
            # what omitting one line here costs: a meaning a project can state, validate
            # and save, which the pipeline then never hears.
            cart_snapshot=tuple(cfg.cart_snapshot_events),
            ignored=tuple(cfg.ignored_events), cart_add_mode=cfg.cart_add_mode,
            snapshot_event=cfg.snapshot_event,
            snapshot_total_key=cfg.snapshot_total_key,
            signals={k: tuple(v) for k, v in (cfg.signals or {}).items()},
            cadence_signal=cfg.cadence_signal,
        )
        return cls(project_id=project_id, root=Path("."), events=ev,
                   tables=DatabaseTables(cfg, schema=schema), dsn=dsn)

    def table(self, name: str) -> str:
        """The readable source for one table: customers | orders | events | products."""
        return str(self.root / f"{name}.parquet")

    def prepare(self, con) -> None:
        """Make a fresh connection able to read this project's rows.

        For files this does nothing. For a database it loads the reader and attaches
        read-only. Called wherever a connection is opened, because each stage opens
        its own and an unattached one would fail with a confusing missing-table error
        rather than an obvious one.
        """
        if self.tables is None or not self.dsn:
            return
        con.execute("INSTALL postgres; LOAD postgres;")
        schema = getattr(self.tables, "s", "pg")
        attached = con.execute(
            "SELECT count(*) FROM duckdb_databases() WHERE database_name = ?", [schema]
        ).fetchone()[0]
        if not attached:
            con.execute(f"ATTACH '{self.dsn}' AS {schema} (TYPE postgres, READ_ONLY)")

    def materialise(self, into: str | Path):
        """Read this project's cleaned rows out of the database ONCE, then work locally.

        A training run rebuilds features at many cutoffs and scores many candidate
        windows, so the event table is read dozens of times. Streaming that from the
        database on every pass is slow and leaves a long-running connection to drop
        mid-run. Reading once and computing locally is both faster and steadier.

        The rows written here are already cleaned — deduplicated, cancellations
        removed, carts reconstructed — so what lands on disk is exactly what the
        pipeline would have seen, and cart mode is switched to plain because the
        reconstruction has already happened.

        BUILT TO THE SIDE, THEN SWAPPED IN. A copy is only worth reusing if it is
        complete, and the only moment that is known is after the last file is written.
        Writing straight into the destination published each file the instant it
        appeared, so a run that died partway — measured here: the database dropped the
        connection while the Event Mapping rebuild was replaying 5,984 events — left a
        zero-byte `events.parquet` under the real name. Every later run found it,
        reported "using rows already read from the database", and failed on a file too
        small to be a Parquet file. It never recovered on its own; the directory had to
        be deleted by hand.

        NEVER HALF-WRITTEN, BRIEFLY ABSENT. `os.replace` on a directory needs the target
        gone first — POSIX rename refuses a non-empty one — so the old copy is removed
        and then the new one takes its name. Between those two steps a reader finds no
        directory at all and rebuilds: a wasted read, never a wrong one. That is the
        whole guarantee this needs, and it is the one the old code could not make — a
        reader could open a file that was still being written, or one that never
        finished.

        Two runs racing do the read twice and the last one wins. Both wrote the same
        rows, so the loser costs time, never correctness. This mirrors what
        `serve._cached_dataset` already does around its own call to this method.
        """
        import duckdb, os, shutil
        from dataclasses import replace
        out = Path(into)
        staging = out.with_name(out.name + f".building-{os.getpid()}")
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)
        try:
            con = duckdb.connect()
            con.execute("PRAGMA disable_progress_bar")
            self.prepare(con)
            for name in ("customers", "orders", "events", "products"):
                con.execute(
                    f"COPY ({self.source(name)}) TO "
                    f"'{staging / (name + '.parquet')}' (FORMAT PARQUET)")
            con.close()
            # Only now is the copy complete enough to wear the name others look for.
            shutil.rmtree(out, ignore_errors=True)
            os.replace(staging, out)
        except BaseException:
            # Leave nothing half-written behind, under either name.
            shutil.rmtree(staging, ignore_errors=True)
            raise
        return ProjectDataset(project_id=self.project_id, root=out,
                              events=replace(self.events, cart_add_mode="event"),
                              tables=None, dsn=None)

    def source(self, name: str) -> str:
        """A SELECT for one table, cleaned. This is what every stage should read.

        Files today, database when configured -- the caller cannot tell, which is the
        point: swapping where data lives must not change what the pipeline computes.
        """
        if self.tables is not None:
            return getattr(self.tables, name)()
        if name == "events":
            return self.events_source()
        return f"SELECT * FROM read_parquet('{self.table(name)}')"

    def events_source(self) -> str:
        """The NORMALISED event stream every stage should read.

        One place decides what an event stream means for this project, so feature
        building, labelling and window derivation can never disagree about it.

        Two things happen here and nowhere else:
          * our own outbound messages are dropped (predicting a customer from
            messages we chose to send them leaks our targeting into the model)
          * when a company sends cart SNAPSHOTS rather than clicks, real adds are
            reconstructed from basket growth -- and the raw snapshots are dropped,
            because keeping both would count the same behaviour twice.
        """
        if self.tables is not None:
            return self.tables.events()
        src = f"read_parquet('{self.table('events')}')"
        drop = list(self.events.ignored)

        # always a complete statement, so callers can wrap it as a subquery
        if self.events.cart_add_mode != "snapshot_growth":
            if not drop:
                return f"SELECT * FROM {src}"
            excl = ",".join("'" + n.replace("'", "''") + "'" for n in drop)
            return f"SELECT * FROM {src} WHERE event_name NOT IN ({excl})"

        # SNAPSHOT RECONSTRUCTION DOES NOT HAPPEN HERE. It happens once, at the
        # database boundary, in `normalise.Tables.events()`.
        #
        # A second copy lived here and compared item COUNTS while the live one compares
        # product LISTS — so the two answered differently, and which one a project got
        # depended on whether its rows had been materialised yet. Nothing surfaced the
        # difference.
        #
        # It was also unreachable and could not have run: `materialise` writes
        # `cart_add_mode="event"` into the dataset it returns, precisely because the
        # rows it wrote are already reconstructed, and the parquet it produces carries
        # the canonical properties struct with no `cart_id` or `item_count`
        # for a basket-growth rule to read.
        #
        # One implementation, at the one place raw payloads still exist.
        raise ValueError(
            "snapshot_growth is reconstructed at the database boundary "
            "(normalise.Tables.events); a file-backed dataset receives adds already "
            "derived and must be built with cart_add_mode='event'")

    # convenience — the four tables every stage uses
    @property
    def customers(self) -> str: return self.table("customers")
    @property
    def orders(self) -> str: return self.table("orders")
    @property
    def events_table(self) -> str: return self.table("events")
    @property
    def products(self) -> str: return self.table("products")


def history_stamp(dataset, before) -> str:
    """What the cached copy must describe: the events features are built from, AND
    which customers exist at all.

    Returns a stamp, not a count, because two different things can go stale.

    EVENTS BEFORE `before` — a backfill changes them and must force a rebuild, while
    ordinary live events timestamped now do not and must not, or every request would
    rebuild and this cache would have no purpose.

    THE CUSTOMER ROSTER — and this half was missing. A customer created TODAY has no
    events before midnight, so the event count did not move, so the copy was judged
    fresh and simply had no row for them. `score_customers` intersects the requested
    ids with that copy's index, finds nothing, and returns `{"scores": []}` with a
    200: no error, no log line, no score. Measured here — a shopper signed up at
    13:35 and put an item in their basket; the copy had been built at 13:12 and had
    never heard of them, so the cart model reported nothing wrong and scored no one.
    A brand-new shopper with a live basket is the single most valuable case a cart
    model has, and it was the one case that could not work.

    Both counts are indexed and cheap next to the build they guard (measured: the
    rebuild they trigger is 0.46s / 2.8MB on a 178k-event project). Raw rows, not
    cleaned ones: cleaning is the expensive step this is deciding whether to run.
    """
    import duckdb
    con = duckdb.connect()
    try:
        con.execute("PRAGMA disable_progress_bar")
        dataset.prepare(con)
        cutoff = before.strftime("%Y-%m-%d %H:%M:%S")
        tbl = getattr(dataset.tables, "s", "pg")
        events = int(con.execute(
            f"SELECT count(*) FROM {tbl}.events WHERE project_id = ? AND timestamp < TIMESTAMP '{cutoff}'",
            [dataset.project_id]).fetchone()[0])
        people = int(con.execute(
            f"SELECT count(*) FROM {tbl}.customers WHERE project_id = ?",
            [dataset.project_id]).fetchone()[0])
        return f"{events}:{people}"
    finally:
        con.close()


def stamp_path(cache, who: str):
    """Where a reader's note about `cache` lives — BESIDE it, never inside.

    Training and scoring each keep their own note of what the copy describes, and both
    used to write it into the copy's own directory. `materialise` swaps that directory in
    whole, so whichever side rebuilt last destroyed the other's note, and the other then
    rebuilt a copy that was already current — one wasted read per side, every time, for
    ever. Seen on this machine: one project's directory held only `history.count`,
    another's only `history.train`.

    A sibling file survives the swap. It can also outlive the directory — a temp sweep
    takes the copy and leaves the note — which is harmless: the reuse test requires
    `events.parquet` to exist as well, so a note with no copy behind it decides nothing.
    """
    return cache.with_name(f"{cache.name}.{who}")
