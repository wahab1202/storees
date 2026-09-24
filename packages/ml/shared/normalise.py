"""Raw rows in, clean rows out — driven entirely by a project's configuration.

The database holds what a company actually sent us. That is not what a model can
learn from, and the gap is not small:

  * an order event can arrive several times — one real order, several rows
  * some orders are later cancelled and were never revenue
  * the `orders` table is often a partial summary; the event ledger is the truth
  * a `created_at` column is frequently the day the data was imported, not the day
    the customer appeared, so it says nothing about tenure
  * cart events may be state snapshots rather than actions

Every one of those is corrected here, from values in the project's config — never
from a company name in code. A different company with different habits sets
different values and the same code cleans their data too.

This module produces SELECT statements, not tables. Nothing is materialised, so
there is no copy to go stale and no second place for the truth to live.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def _lit(v: str) -> str:
    """Single-quoted SQL literal."""
    return "'" + str(v).replace("'", "''") + "'"


def _names(v: Any) -> list[str]:
    """A mapping value that may be one name or a comma-separated list."""
    if not v:
        return []
    if isinstance(v, (list, tuple)):
        return [str(x).strip() for x in v if str(x).strip()]
    return [x.strip() for x in str(v).split(",") if x.strip()]


#: meanings the CLEANING rules act on. Everything else in a project's mapping is a
#: signal it named for itself — see ProjectConfig.signals.
_CLEANING_MEANINGS = {"purchase", "product_viewed", "add_to_cart", "cart_abandon",
                      "cart_remove", "cancellation", "return", "refund", "ignore_events"}

#: The mapping screen asks WHICH KIND of reversal separately -- cancelled, returned,
#: refunded -- so a project's own words can reach the right order status. Cleaning does
#: not care which kind: all three undo a sale and all three come out of the training
#: data together. Reading only `cancellation` here is how the split would have quietly
#: halved it, leaving `purchase_sent_back` and `money_returned` in as ordinary signals
#: while the orders they reversed stayed in the labels.
#:
#: `fulfilment` is deliberately NOT here. It reverses nothing, and leaving it out keeps
#: it where it has always been -- carried through as one of the project's own signals.
_REVERSAL_MEANINGS = ("cancellation", "return", "refund")


def _reversals(ev: dict) -> list[str]:
    """Every event that undoes a sale, whichever of the three boxes named it.

    Order is preserved and duplicates dropped, so a name sitting in two boxes -- which
    the mapping screen refuses, but an older config or a hand-edited one may carry --
    is stripped once rather than twice.
    """
    out: list[str] = []
    for key in _REVERSAL_MEANINGS:
        for name in _names((ev or {}).get(key)):
            if name not in out:
                out.append(name)
    return out


def _signals(ev: dict) -> dict[str, list[str]]:
    """Every meaning in the mapping that the cleaning rules do not act on.

    The six above are the ones cleaning has to UNDERSTAND: a purchase carries money, a
    cancellation removes one, a cart is an unfinished one, a view is interest, an
    ignored event is our own outbound message. That list is enough to clean any
    company's data and nowhere near enough to describe one.

    A lender's `emi_missed` predicts default better than any of the six can express; a
    course platform's `course_dropped` likewise; and the industry after those will need
    a word nobody has thought of yet. So the rest of the mapping is carried through
    under whatever names the project used, and featurised generically.

    Read as "everything else" rather than from a list of known extras, deliberately —
    a fixed list is wrong the moment an industry nobody planned for signs up.
    """
    out: dict[str, list[str]] = {}
    for key, value in (ev or {}).items():
        if key in _CLEANING_MEANINGS or key == "signals":
            continue
        if names := _names(value):
            out[str(key).strip()] = names
    # an explicit block, for a project that would rather group several events under
    # one name than let each stand alone
    for key, value in ((ev or {}).get("signals") or {}).items():
        if names := _names(value):
            out[str(key).strip()] = names
    return out


#: THE SHAPE THIS FILE PRODUCES, NOT WHAT THE PROJECT CONFIGURED.
#:
#: The on-disk parquet cache is keyed on the project's MAPPING (see
#: `_dataset_fingerprint`), which is right for "the rows would differ" and blind to
#: "the COLUMNS would differ". Adding `cart_id` to the orders projection changed the
#: columns without changing any mapping, so every project with a warm cache kept its
#: old parquet and the cart query died binding a column that file has never had:
#:
#:   BinderException: Values list "o" does not have a column named "cart_id"
#:
#: It is not a stale-data bug the pipeline can detect by reading the rows — the rows
#: are fine, the schema is a version behind. So the version is stated here and folded
#: into the cache key: bump it whenever a projection below gains, loses or renames a
#: column, and every warm cache misses once and rebuilds. A rebuild costs minutes; the
#: alternative is a crash on the first retrain after deploy, on every project at once.
CLEANING_SCHEMA_VERSION = 2


def _json(col: str, key: str) -> str:
    """Read one key out of a JSON column.

    The database's JSON arrives here as text, so it is addressed with an explicit
    JSON accessor rather than an operator that assumes a native JSON type.
    """
    return f"json_extract_string({col}, '$.{key}')"


def _prop(path: str) -> str:
    """A configured property path -> the JSON key it refers to.

    A company writes `order_placed.properties.total`; what we need from that is
    `total`. Keeping the full path in the config is deliberate — it documents where
    the value came from — but only the last part addresses the JSON.
    """
    return path.rsplit(".", 1)[-1] if path else ""


def _json_any(col: str, keys) -> str:
    """First of several JSON keys that carries a value.

    One key is the normal case and stays a one-element list. Several exist because a
    company's own payloads can disagree with each other — see `line_item_price_keys`.
    """
    names = [k for k in (keys or []) if k]
    if not names:
        return "NULL"
    if len(names) == 1:
        return _json(col, names[0])
    return f"COALESCE({', '.join(_json(col, k) for k in names)})"


@dataclass
class ProjectConfig:
    """The saved configuration, in the shape the cleaning rules need.

    Built from what the onboarding form writes, so a change on the page changes what
    the pipeline does — with no code edit in between.
    """
    project_id: str
    # event meanings
    purchase_events: list[str] = field(default_factory=lambda: ["order_completed"])
    view_events: list[str] = field(default_factory=lambda: ["product_viewed"])
    cancellation_events: list[str] = field(default_factory=lambda: ["order_cancelled"])
    ignored_events: list[str] = field(default_factory=list)
    #: every OTHER meaning this project named, and the events carrying it. Empty for a
    #: project that named only the six cleaning meanings, which is why an existing
    #: project's model is unaffected by this existing. See `_signals`.
    signals: dict[str, list[str]] = field(default_factory=dict)
    # how add-to-cart is obtained
    cart_add_mode: str = "event"            # "event" | "snapshot_growth"
    #: every event that means "started but did not finish". A LIST, like purchase and
    #: view, because one meaning routinely covers several events: a lender's
    #: `loan_application_started` and `top_up_inquiry` are both unfinished intent, and
    #: this held only the first — the second was dropped silently, taking with it the
    #: goal that targeted it.
    cart_add_events: list[str] = field(default_factory=lambda: ["add_to_cart"])
    #: every event that means "gave up on a started basket", for the shops that send one
    #: rather than leaving it to be inferred from a cart with no purchase after it.
    #:
    #: `cart_abandon` was accepted as a declarable meaning and then never carried past
    #: this class — labelling and the feature builder both read it, so it silently stayed
    #: the literal word `cart_abandoned` for every project on earth. A shop declaring
    #: `basket_dropped` in its mapping had that declaration read, validated, and dropped.
    cart_abandon_events: list[str] = field(default_factory=lambda: ["cart_abandoned"])
    #: every event that means "took it back OUT of the basket".
    #:
    #: A first-class meaning rather than one of the project's own signals, because the
    #: basket total cannot be computed without it. Carried as a signal it was just a
    #: word the pipeline knew the name of: measured on Girinacart, 770 removals against
    #: 10,418 adds, so summing adds alone overstates roughly one basket in fourteen and
    #: says nothing about which.
    #:
    #: Empty for a project that does not send one — the total is then the sum of adds,
    #: which is exactly right for a shop where nothing is ever removed and is the best
    #: available answer for one that removes without telling us.
    cart_remove_events: list[str] = field(default_factory=list)
    #: the ONE name emitted after snapshot reconstruction, so every stage downstream
    #: sees a single word for "added to cart" whatever the company called the snapshot.
    #: An output name, never an input one.
    cart_add_event: str = "add_to_cart"
    snapshot_event: str = "cart_updated"
    snapshot_cart_key: str = "cart_id"
    snapshot_size_key: str = "item_count"
    #: the property holding the basket's own total, per EVENT_SPEC.md.
    snapshot_total_key: str = "total"
    #: every event that means "here is the WHOLE basket". Distinct from
    #: `cart_add_events`, which mean "a thing went in". Empty for a shop that sends
    #: only actions -- the basket is then summed from adds minus removes, unchanged.
    cart_snapshot_events: list[str] = field(default_factory=list)
    # order fields, as property names on the purchase event
    order_id_key: str = "order_id"
    amount_key: str = "total"
    currency_key: str = "currency"
    line_items_key: str = "line_items"
    #: keys inside each basket line. Configurable because one company writes `price`
    #: and another writes `unit_price` for the same thing.
    line_item_product_key: str = "product_id"
    line_item_name_key: str = "product_name"
    line_item_qty_key: str = "quantity"
    #: A LIST, because one company can use two words for the same thing in two
    #: payloads. GoWelmart's cart lines carry `unit_price` and its order lines carry
    #: `price` — a single key set to either one blanks the other, and it did: pointing
    #: it at `unit_price` fixed cart value and left 204,860 order line items with no
    #: price at all. Tried in order, first non-null wins; still declared by the project,
    #: never guessed here.
    line_item_price_keys: list[str] = field(default_factory=lambda: ["price"])

    # ---- what a NON-order event carries --------------------------------------
    #
    # These were literals in the SQL, and they were the WRONG WORDS. The pipeline was
    # built elsewhere, against files whose columns were `category`, `brand`, `price`;
    # wiring it to this database needed a translation, and the translation was never
    # checked against `eventSchemas.ts`, which had already published Storees' own
    # vocabulary — `product_type`, `vendor`, `price`, matching the products table.
    #
    # Two were merely the wrong word. Two were substitutions: with no field called
    # `price` in sight, the bridge reached for `total`, which on a browse event is a
    # BASKET total — 8,391 where the item cost 1,124 — and for a session it reached
    # for `cart_id`, so eight "visit" features counted carts and a customer active on
    # 50 days read as 7 visits. Neither failed; both produced confident wrong numbers.
    #
    # Defaults are now Storees' published names. A project that genuinely uses
    # different words says so, and one that sends nothing gets an empty feature —
    # which is the honest answer, and the one selection can act on.
    event_product_key: str = "product_id"
    event_category_key: str = "product_type"
    event_brand_key: str = "vendor"
    event_price_key: str = "price"
    #: how many units the add was for. Not every storefront sends it — one event
    #: per click is common — so it defaults to 1 rather than to nothing, and a
    #: shop that does send it stops having its bulk adds read as single units.
    event_qty_key: str = "quantity"

    #: which signal is this project's CLOCK — the act whose gaps measure how fast the
    #: relationship moves. `order` for a shop, whose customers buy repeatedly. A lender
    #: needs its own answer: a borrower takes one loan, so loan gaps are unmeasurable
    #: and the window derivation silently falls back to a fixed 14 days. The EMI is the
    #: real clock there. Declared per industry in the vertical pack and carried here as
    #: `mapping.cadence_signal`; see `WindowPolicy.cadence_signal`.
    cadence_signal: str = "order"
    # transforms
    #: last day this project has COMPLETE data for, exclusive. A dump taken mid-morning
    #: leaves a partial final day; counting it makes that day look like a collapse in
    #: activity, and every recency feature measured against it is wrong. Trimming is
    #: the honest default and the date comes from the onboarding form.
    #: which columns the customers table actually has. Empty means "not looked up",
    #: and every optional column is then treated as absent.
    #:
    #: Needed because `birth_year` and `acquisition_channel` are being added to the
    #: schema and the code has to work on both sides of that migration — selecting a
    #: column that does not exist is an error, not a NULL, so the choice has to be made
    #: when the SQL is built rather than assumed either way.
    customer_columns: frozenset[str] = frozenset()

    data_end: str | None = None
    dedupe_orders: bool = True
    strip_cancellations: bool = True
    derive_first_seen: bool = True
    amount_is_minor_unit: bool = False

    @classmethod
    def from_saved(cls, project_id: str, config: dict) -> "ProjectConfig":
        """Read the JSON the onboarding page saved on the connector."""
        mapping = (config or {}).get("mapping", {}) or {}
        ev = mapping.get("events", {}) or {}
        fields = mapping.get("fields", {}) or {}
        tr = (config or {}).get("transforms", {}) or {}
        order = fields.get("order", {}) or {}
        evt = fields.get("event", {}) or {}
        #: keys INSIDE each basket line. The four `line_item_*` values below were
        #: documented as configurable ("one company writes `price` and another writes
        #: `unit_price` for the same thing") but were never read here, so every project
        #: silently got the defaults. GoWelmart writes `unit_price`, so the price on
        #: every reconstructed add came out NULL and `cart_value` — the strongest
        #: feature in the cart model — was empty.
        line = fields.get("line_item", {}) or {}

        cart_names = _names(ev.get("add_to_cart"))
        # "Derived" on the form means the named event is a SNAPSHOT of cart state,
        # not an action. Treating each snapshot as an add overstates cart activity
        # several-fold and counts removals as adds.
        #
        # STATED WINS OVER INFERRED. The fallback below reads "a cart event not called
        # `add_to_cart` must be a snapshot", which was true of the two shops it was
        # written against and is false in general: an EdTech project's
        # `course_added_to_list` is a plain action, and inferring otherwise sent it
        # through basket-growth reconstruction and left it with almost no cart events
        # at all. Anything that knows the answer should say so and skip the guess.
        # STATED, NEVER INFERRED.
        #
        # This used to read "a cart event not called `add_to_cart` must be a snapshot",
        # which is a guess about a company's vocabulary rather than about its data. It
        # was right for the two shops it was written against and wrong in general: an
        # EdTech project's `course_added_to_list` is a plain action, and inferring
        # otherwise sent it through basket-growth reconstruction. That failure is
        # expensive — snapshot mode DISCARDS the named event and replaces it with adds
        # derived from a basket size that isn't there, so a client keeps neither the
        # real events nor any derived ones, and nothing reports it.
        #
        # A project that sends cart state says so. Everyone else gets the common case,
        # which also fails safely: counting real adds as adds.
        snapshot = str(tr.get("cart_add_mode", "")).strip().lower() in ("snapshot", "snapshot_growth")

        unit = str(tr.get("amount_unit", "")).lower()
        ident = (config or {}).get("identity", {}) or {}
        return cls(
            project_id=project_id,
            data_end=(ident.get("data_end") or None),
            # A MEANING THIS PROJECT DID NOT MAP IS EMPTY, NOT A SHOP'S DEFAULT.
            #
            # These used to fall back to `product_viewed` / `order_cancelled` whenever
            # a project left the key out, which put two literal shop event names into a
            # pipeline that claims never to hardcode one. It is not harmless: a lender
            # and a course platform both resolved their cancellation to
            # `order_cancelled`, an event neither will ever send, and SaaS — whose pack
            # has no view-type event at all — resolved its views to `product_viewed`
            # and had every view-derived feature come out empty for a reason nothing
            # reported. An empty meaning is already handled everywhere: the features
            # that need it come out blank and drop themselves during selection, which
            # is honest, whereas a wrong name is silent.
            #
            # The defaults still apply when no mapping was supplied at all, which is
            # the legacy single-project path.
            purchase_events=_names(ev.get("purchase")) or ([] if ev else ["order_completed"]),
            view_events=_names(ev.get("product_viewed")) or ([] if ev else ["product_viewed"]),
            cancellation_events=_reversals(ev) or ([] if ev else ["order_cancelled"]),
            ignored_events=_names(ev.get("ignore_events")),
            signals=_signals(ev),
            cart_add_mode="snapshot_growth" if snapshot else "event",
            # in snapshot mode the company's event is the SOURCE and the reconstruction
            # emits the canonical name; in event mode every mapped name counts
            # THE LAST SLOT THAT STILL GUESSED.
            #
            # `or ["add_to_cart"]` applied even when a mapping existed, so a project that
            # described itself and simply never mentioned a cart was handed retail's word
            # for one. Measured on GoWelmart: its mapping names purchase, fulfilment,
            # cancellation and views and no cart, so this filled in `add_to_cart` — an
            # event it has never once sent — while 362,696 real cart events sat under
            # `cart_updated`. The cart-abandonment model reported "insufficient data"
            # about a shop with a third of a million cart events.
            #
            # Same rule as purchase, view and cancellation now: declared, or EMPTY. An
            # empty meaning drops its features honestly; a borrowed one looks like data.
            cart_add_events=(["add_to_cart"] if snapshot
                             else (cart_names or ([] if ev else ["add_to_cart"]))),
            # Same rule as the meanings above: a project that supplied a mapping and did
            # not name an abandonment event has none, rather than inheriting a shop's word.
            cart_abandon_events=(_names(ev.get("cart_abandon"))
                                 or ([] if ev else ["cart_abandoned"])),
            # Declared, or EMPTY — never borrowed. Same rule as every meaning above: a
            # shop that removes items and has not said so gets an overstated basket,
            # which is visible, rather than a guessed event name that silently matches
            # nothing.
            cart_remove_events=_names(ev.get("cart_remove")),
            # Declared, or EMPTY — never borrowed, same rule as every meaning above.
            # A shop that sends no basket snapshot gets none, and the basket is summed
            # from adds minus removes exactly as it was before this slot existed.
            cart_snapshot_events=_names(ev.get("cart_snapshot")),
            cart_add_event="add_to_cart",
            snapshot_event=cart_names[0] if snapshot else "cart_updated",
            order_id_key=_prop(order.get("order_id", "order_id")),
            amount_key=_prop(order.get("amount", "total")),
            currency_key=_prop(order.get("currency", "currency")),
            event_product_key=_prop(evt.get("product_id", "product_id")),
            event_category_key=_prop(evt.get("category", "product_type")),
            event_brand_key=_prop(evt.get("brand", "vendor")),
            event_price_key=_prop(evt.get("price", "price")),
            event_qty_key=_prop(evt.get("quantity", "quantity")),
            line_item_product_key=_prop(line.get("product_id", "product_id")),
            line_item_name_key=_prop(line.get("product_name", "product_name")),
            line_item_qty_key=_prop(line.get("quantity", "quantity")),
            line_item_price_keys=[_prop(k) for k in _names(line.get("price", "price"))],
            cadence_signal=(str(mapping.get("cadence_signal") or "").strip() or "order"),
            dedupe_orders=str(tr.get("dedupe_orders", "on")).lower() != "off",
            strip_cancellations=str(tr.get("strip_cancellations", "on")).lower() != "off",
            derive_first_seen="deriv" in str(tr.get("first_seen_strategy", "derive")).lower(),
            amount_is_minor_unit="minor" in unit or "paise" in unit or "cent" in unit,
        )


class DatabaseTables:
    """Clean, model-ready views over one project's raw rows in the database.

    Each method returns a SELECT. Callers wrap them as subqueries, so the pipeline's
    existing SQL is unchanged — it simply reads from a corrected stream instead of a
    raw table.
    """

    def __init__(self, cfg: ProjectConfig, schema: str = "pg"):
        self.cfg = cfg
        self.s = schema

    # The product's own tables use its column names; the pipeline was written
    # against a canonical shape. This projection reconciles the two ONCE. It is
    # product-schema knowledge, not company knowledge -- every project's rows live
    # in these same tables, which is exactly why one pipeline can serve them all.
    #
    # `properties` is JSON in the database and was a struct in the prepared files, so
    # it is rebuilt as a struct here and every stage above can keep addressing it the
    # same way.
    @property
    def PROPERTIES(self) -> str:
        """The values every stage reads off an event, sourced per project.

        `session_id` comes from the COLUMN, not from the JSON. Storees has carried a
        first-class `session_id` on every event all along; reading `cart_id` out of
        the properties instead meant eight visit features were counting carts.
        """
        c = self.cfg
        return ("{"
                f"'product_id': {_json('properties', c.event_product_key)}, "
                f"'category': {_json('properties', c.event_category_key)}, "
                f"'brand': {_json('properties', c.event_brand_key)}, "
                f"'price': TRY_CAST({_json('properties', c.event_price_key)} AS DOUBLE), "
                # NULL IS KEPT, NOT DEFAULTED TO ONE.
                #
                # Defaulting here looks harmless — an add without a quantity is one
                # item — but it destroys a distinction the sender made deliberately.
                # A shop reports "removed, quantity 2" to REDUCE a line and "removed"
                # with no quantity to take it out entirely; once both read as 1 the
                # basket cannot tell a deletion from a reduction to one, and an item
                # the shopper deleted keeps contributing.
                #
                # Every consumer that wants one already coalesces at the point of use
                # (`cart_rows._CART_VALUE` among them), so nothing downstream changes
                # meaning — the information simply survives long enough to be read.
                f"'quantity': TRY_CAST({_json('properties', c.event_qty_key)} AS DOUBLE), "
                # THE BASKET'S OWN TOTAL, where the shop reports one.
                #
                # This struct is the ONE place that decides what an event carries
                # downstream — a key absent here is unreachable however faithfully the
                # mapping names it, which is why reading a snapshot's total failed until
                # it was added. NULL on every event that is not a basket snapshot, and
                # on snapshots from a shop that sends no total, so a consumer can tell
                # "no snapshot" from "a basket worth nothing".
                #
                # Named for what it is. `cart_value` was not available: it already means
                # the value of the single add that opened a cart, and two different
                # numbers under one name is how this pipeline loses an afternoon.
                f"'basket_total': TRY_CAST({_json('properties', c.snapshot_total_key)} AS DOUBLE), "
                # WHICH BASKET this event belongs to, where the shop says so.
                #
                # NOT a substitute for `session_id`, which is first-class on every event
                # and measures a visit. Reading a cart id as if it were a session is a
                # mistake this file has already made once — it left eight visit features
                # counting baskets. This is only ever used to tie a cart ACTION to the
                # SNAPSHOT describing the same basket, and nothing else may read it.
                #
                # NULL wherever a shop does not send one, which is the common case and
                # the reason every consumer must fall back rather than require it.
                f"'cart_id': {_json('properties', c.snapshot_cart_key)}, "
                "'session_id': session_id} AS properties")

    # -- helpers ---------------------------------------------------------
    def _scope(self, table: str, time_col: str | None = None) -> str:
        """One project's rows, cut at the last complete day.

        Applied here rather than in each caller so no stage can forget it and end up
        measuring a rhythm against a half-recorded final day.
        """
        sql = f"SELECT * FROM {self.s}.{table} WHERE project_id = {_lit(self.cfg.project_id)}"
        if time_col and self.cfg.data_end:
            sql += f" AND {time_col} < TIMESTAMP {_lit(self.cfg.data_end)}"
        return sql

    def _optional(self, column: str, sql_type: str) -> str:
        """A customers column that may not exist yet.

        The feature reading it is written once and behaves correctly on both sides of
        a migration: a real value where the column is there, NULL where it is not, and
        the feature that depends on it drops itself during selection either way.
        """
        return f"c.{column}" if column in self.cfg.customer_columns \
               else f"CAST(NULL AS {sql_type})"

    def _in(self, names: list[str]) -> str:
        return ",".join(_lit(n) for n in names) if names else "''"

    # -- events ----------------------------------------------------------
    def events(self) -> str:
        """Every real customer action, with our own outbound messages removed and
        cart snapshots turned into genuine adds."""
        c = self.cfg
        base = self._scope("events", "timestamp")
        drop = list(c.ignored_events)

        def canon(src: str, name_expr: str = "event_name") -> str:
            return (f"SELECT customer_id, 'b2b' AS business_type, {name_expr} AS event_name, "
                    f"timestamp, {self.PROPERTIES}, 'database' AS source FROM ({src})")

        if c.cart_add_mode != "snapshot_growth":
            keep = base if not drop else f"SELECT * FROM ({base}) WHERE event_name NOT IN ({self._in(drop)})"
            return canon(keep)

        # A snapshot carries the cart's CURRENT contents, so an add is a PRODUCT that
        # was not in the previous snapshot of that cart.
        #
        # This compared item_count against the previous item_count and emitted one row
        # when the basket grew. That finds the right MOMENTS — 371,903 snapshots reduce
        # to 79,777 adds, close to an independent extraction's 77,163 — but it throws
        # away the one thing that makes them add-to-cart events: WHICH product arrived.
        # The emitted row carried the snapshot's own properties, where the products live
        # inside `line_items` and nothing sits at `properties.product_id`, so every
        # derived add came out with a NULL product (measured: 0 of 79,777).
        #
        # Downstream that is not a missing column, it is a different question. Cart
        # labelling asks "did they buy WHAT THEY ADDED"; with no product to check it
        # falls back to "did they buy anything", a dealer who adds a phone and buys rice
        # twenty minutes later counts as a recovery, and the derived horizon collapsed
        # from ~5h to 1.39h on exactly this data.
        #
        # Comparing product LISTS costs one unnest and answers both questions at once:
        # the moment, and the product. It also handles what counting could not — a
        # basket that swaps one item for another keeps item_count identical, so the old
        # rule saw no add at all.
        drop = drop + [c.snapshot_event]
        li_path = f"'$.{c.line_items_key}[*]'"
        lines = f"""
            SELECT e.customer_id, e.timestamp, e.session_id,
                   {_json('properties', c.snapshot_cart_key)} AS _cart,
                   dense_rank() OVER (
                       PARTITION BY {_json('properties', c.snapshot_cart_key)}
                       ORDER BY e.timestamp) AS _rn,
                   json_extract_string(x, '$.{c.line_item_product_key}') AS _pid,
                   TRY_CAST({_json_any('x', c.line_item_price_keys)} AS DOUBLE) AS _price,
                   COALESCE(TRY_CAST(json_extract_string(x, '$.{c.line_item_qty_key}') AS DOUBLE), 1) AS _qty
            FROM ({base}) e,
                 UNNEST(COALESCE(json_extract(e.properties, {li_path}), [])) AS t(x)
            WHERE e.event_name = {_lit(c.snapshot_event)}
        """
        # ONE PASS. The obvious form of "not in the previous snapshot" is a NOT EXISTS
        # against the same unnested set, which makes DuckDB materialise 2.6M product
        # lines twice and filled the disk on the first attempt. Asking instead when this
        # product was LAST seen in this cart is the same question by window: a gap of
        # more than one snapshot means it had left and come back, and no previous row at
        # all means it has just arrived.
        adds = f"""
            SELECT customer_id, 'b2b' AS business_type,
                   {_lit(c.cart_add_event)} AS event_name, timestamp,
                   {{'product_id': _pid,
                     'category': NULL::VARCHAR,
                     'brand': NULL::VARCHAR,
                     'price': _price,
                     'quantity': _qty,
                     'session_id': session_id}} AS properties,
                   'database' AS source
            FROM (
                SELECT *, lag(_rn) OVER (PARTITION BY _cart, _pid ORDER BY _rn) AS _seen
                FROM ({lines}) WHERE _pid IS NOT NULL
            )
            WHERE _seen IS NULL OR _seen < _rn - 1
        """
        kept = f"SELECT * FROM ({base}) WHERE event_name NOT IN ({self._in(drop)})"
        return canon(kept) + " UNION ALL " + adds

    def _line_items(self) -> str:
        """The basket, as a typed list rather than raw JSON.

        Stored as JSON in the database and as a typed list in prepared files; the
        features expect the typed form, so it is rebuilt here. Extra keys a company
        happens to send are ignored rather than being an error.
        """
        c = self.cfg
        return (f"list_transform("
                f"COALESCE(json_extract(properties, '$.{c.line_items_key}[*]'), []), x -> "
                f"{{'product_id': json_extract_string(x, '$.{c.line_item_product_key}'), "
                f"'product_name': json_extract_string(x, '$.{c.line_item_name_key}'), "
                f"'quantity': TRY_CAST(json_extract_string(x, '$.{c.line_item_qty_key}') AS INTEGER), "
                f"'price': TRY_CAST({_json_any('x', c.line_item_price_keys)} AS DOUBLE)}})")

    # -- orders ----------------------------------------------------------
    def orders(self) -> str:
        """Orders rebuilt from the event ledger, deduplicated, with cancellations removed.

        Built from events rather than the orders table on purpose: the summary table
        is frequently incomplete, while the ledger records every order as it happened.
        """
        c = self.cfg
        base = self._scope("events", "timestamp")
        amount = f"TRY_CAST({_json('properties', c.amount_key)} AS DOUBLE)"
        oid = _json("properties", c.order_id_key)
        div = " / 100.0" if c.amount_is_minor_unit else ""

        placed = f"""
            SELECT customer_id, timestamp, {oid} AS order_id, ({amount}){div} AS total,
                   {_json('properties', c.currency_key)} AS currency,
                   {self._line_items()} AS line_items,
                   'b2b' AS business_type,
                   {_json('properties', 'fulfillment_status')} AS status,
                   {_json('properties', 'dealer_id')} AS dealer_id,
                   -- WHICH BASKET THIS ORDER CAME OUT OF, where the shop says so.
                   --
                   -- Read here rather than inferred later: the cart label matches an
                   -- order to an occasion by timing and overlapping products, which is
                   -- exact only while a shopper has one basket open. A shop that names
                   -- the basket removes the guess; one that does not is unaffected,
                   -- because NULL falls through to the same matching as before.
                   --
                   -- No schema change: `properties` is JSONB and already carries this
                   -- the moment a shop starts sending it.
                   {_json('properties', 'cart_id')} AS cart_id,
                   'database' AS source
            FROM ({base})
            WHERE event_name IN ({self._in(c.purchase_events)})
              AND {oid} IS NOT NULL AND {amount} IS NOT NULL
        """
        if c.dedupe_orders:
            # The same order can arrive several times; keep its first appearance.
            #
            # THE TIE-BREAK IS LOAD-BEARING. `ORDER BY timestamp` alone does not order
            # anything when the copies share a timestamp, which is the normal case for
            # a webhook replay or a sync run twice -- one real dataset has 17,586
            # order_ids arriving more than once and 371 of those disagree about the
            # amount. DuckDB reads in parallel, so an unbroken tie hands a different
            # copy to each run: the same query returned four different revenue totals
            # across four runs, moving ~50 of the 179 features and making a training
            # result impossible to reproduce or compare against.
            #
            # Which copy wins cannot be decided correctly -- the source contradicts
            # itself and neither figure is more true. It can only be decided
            # CONSISTENTLY, so ties fall to the lowest amount, then currency, then the
            # basket's contents; identical on all of those means the rows are
            # interchangeable. Same class of bug, and same remedy, as the deterministic
            # `preferred_day_of_week` in feature_builder.
            placed = f"""
                SELECT * EXCLUDE (_rn) FROM (
                    SELECT *, row_number() OVER (
                        PARTITION BY order_id
                        ORDER BY timestamp, total, currency NULLS LAST,
                                 CAST(line_items AS VARCHAR)
                    ) AS _rn
                    FROM ({placed})
                ) WHERE _rn = 1
            """
        if c.strip_cancellations:
            cancelled = f"""
                SELECT DISTINCT {_json('properties', c.order_id_key)} AS order_id
                FROM ({base}) WHERE event_name IN ({self._in(c.cancellation_events)})
            """
            placed = f"""
                SELECT o.* FROM ({placed}) o
                WHERE o.order_id NOT IN (SELECT order_id FROM ({cancelled}) WHERE order_id IS NOT NULL)
            """
        return placed

    # -- customers -------------------------------------------------------
    def customers(self) -> str:
        """Customers with a trustworthy first_seen.

        A signup column is often the day the data was imported rather than the day
        the customer appeared — which would make every tenure feature describe the
        import, not the customer. Deriving it from their first real activity is the
        honest answer, and the config decides which to use.
        """
        c = self.cfg
        base = self._scope("customers")
        first_seen = ("COALESCE(a.first_activity, c.first_seen)" if c.derive_first_seen
                      else "c.first_seen")
        join = (f"""LEFT JOIN (
                        SELECT customer_id, min(timestamp) AS first_activity
                        FROM ({self._scope('events', 'timestamp')}) GROUP BY customer_id
                    ) a ON a.customer_id = c.id"""
                if c.derive_first_seen else "")
        return f"""
            SELECT c.id AS customer_id, 'b2b' AS business_type, c.external_id,
                   c.email, c.phone, c.name, c.region, c.city,
                   c.agent_id AS dealer_id,
                   {first_seen} AS first_seen, c.last_seen,
                   {self._optional('birth_year', 'INT')} AS birth_year,
                   {self._optional('acquisition_channel', 'VARCHAR')} AS acquisition_channel,
                   'database' AS source
            FROM ({base}) c
            {join}
        """

    def products(self) -> str:
        return f"""
            SELECT id AS product_id, shopify_product_id AS external_id, title,
                   product_type AS category, vendor AS brand,
                   TRY_CAST(base_price AS DOUBLE) AS price, currency,
                   'b2b' AS business_type
            FROM ({self._scope("products")})
        """
