"""Self-adapting observation / prediction window derivation.

Every number here is MEASURED from a project's own data. Nothing is per-client and
nothing is hardcoded: the B2B/B2C difference, a fast storefront vs a slow dealer
network, a company with nine months of history vs one with two — all of it flows in
through the measured rhythm, not through baked-in constants.

Per (project, goal):

  1. onset      when this SIGNAL TYPE actually started (orders, activity and carts
                each get their own answer — a company can sell for months before it
                starts recording browsing, and one date cannot be true for both)
  2. cadence    the typical gap between actions. ORDER rhythm for buying goals,
                ACTIVITY rhythm for going-quiet goals
  3. predict    cadence x the goal's own multiplier. This is the QUESTION being
                asked, so it is set by rule and NEVER tuned for a better score
  4. observe    how far back to look, shrunk to fit the history that exists
  5. scaffold   how many training snapshots, how far apart, and how many held-out
                rounds the available calendar can afford
  6. readiness  if it does not fit, say so and say how much more history is needed
                — never train on a window the data cannot support

DATA ACCESS is deliberately behind `SignalSource` so this module never knows where
the rows come from. Today a project's data is read from prepared files; when it moves
into the database, only a new SignalSource is written and nothing in here changes.
"""

from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass, field, replace
from typing import Protocol, Sequence

import numpy as np

# ---------------------------------------------------------------------------
# Goal semantics — universal, identical for every project.
# These describe what each QUESTION means, not what any company looks like.
# ---------------------------------------------------------------------------

GOALS = ("purchase", "repeat_purchase", "dormancy", "churn", "cart_abandoned")

#: how many cadences ahead each goal looks. Churn asks about a longer silence than
#: dormancy because dropping 3 buying cycles is a real loss; going quiet for 2
#: activity cycles is an early warning.
PREDICT_MULTIPLE = {"purchase": 1, "repeat_purchase": 2, "dormancy": 2, "churn": 3}

#: which rhythm each goal is measured against. Buying goals move at order pace;
#: dormancy is about going silent on ANY activity, so it moves at activity pace.
CADENCE_SIGNAL = {"purchase": "order", "repeat_purchase": "order",
                  "churn": "order", "dormancy": "activity"}

#: which signal's start date bounds each goal's usable history. A cart model cannot
#: reach back into months where no cart was ever recorded.
ONSET_SIGNAL = {"purchase": "order", "repeat_purchase": "order", "churn": "order",
                "dormancy": "activity", "cart_abandoned": "cart"}

#: A SIXTH KIND OF GOAL, named `event:<event_name>`.
#:
#: The five above are the only questions a shop needs, and between them they cover
#: exactly two shapes: "will they buy" and "will they go quiet". Every other industry's
#: main question is neither. A lender asks about `emi_missed`, a SaaS company about
#: `subscription_cancelled`, a course platform about `course_dropped` — a specific
#: event that is not the purchase and is not silence. Ten of the twenty-one goals the
#: product's own industry packs define are this shape, including the most important one
#: in each of the three non-retail verticals.
#:
#: These are not listed in GOALS because there is no list: the event is whatever that
#: project calls it, and enumerating them here would put a client's vocabulary back
#: into code — the exact mistake the per-vertical feature packs made.
#:
#: An event goal is measured against ITSELF: its own onset bounds its history and its
#: own rhythm sets its horizon, with a fallback to general activity when too few
#: customers have it more than once to measure a rhythm from.
EVENT_GOAL_PREFIX = "event:"

#: how many of its own cycles ahead an event goal looks. One: the question is "is this
#: about to happen", not "has this stopped happening", so it is the same shape as
#: `purchase` rather than the multi-cycle silences of churn and dormancy.
EVENT_PREDICT_MULTIPLE = 1


def event_goal_target(goal: str) -> str | None:
    """The event name inside `event:<name>`, or None for the five built-in goals."""
    g = str(goal)
    return g[len(EVENT_GOAL_PREFIX):] or None if g.startswith(EVENT_GOAL_PREFIX) else None


@dataclass(frozen=True)
class WindowPolicy:
    """Universal knobs. The same for every project — they encode what the goals mean
    and what counts as a sound experiment, not anything about a particular company."""

    observe_cycles: int = 3          # buying cycles of recent signal to look at...
    observe_horizons: int = 3        # ...but at least this many forecast horizons

    # ---- floors, ceilings and spacing, AS MULTIPLES OF THE PROJECT'S RHYTHM -------
    #
    # These were absolute day counts (14 / 90 / 7 / 14) in a pipeline that measures
    # everything else, and they quietly encoded a retail cadence. The ceiling was
    # already binding: GoWelmart's churn asked for a 147-day look-back and was cut to
    # 90 — not by a measurement, by a constant. A slower business fares worse. A lender
    # on monthly EMIs sits exactly at the ceiling with no room; a mortgage book on a
    # 90-day cycle wants 270 days and gets 90, reading a third of the history it asked
    # for, with nothing in the output to say so.
    #
    # Expressed as cycles they mean the same thing for a shop and travel correctly to
    # a business with any pace. At GoWelmart's ~15-day rhythm they reproduce today's
    # numbers almost exactly (the ceiling lands on 91 rather than 90).
    #
    # `scale_to_rhythm` turns these into the day counts the rest of the module uses.
    min_observe_cycles: float = 1.0   # look back at least one full cycle...
    max_observe_cycles: float = 6.0   # ...and at most six
    min_predict_cycles: float = 0.5   # never forecast less than half a cycle ahead
    #
    # `snapshot_gap` is deliberately NOT scaled, though the argument for it is the same
    # shape: two snapshots a cycle apart plainly show more new behaviour than two a
    # fortnight apart. It is left absolute because it was measured to cost more than it
    # buys. Widening it to a cycle on a 27-day-rhythm project took dormancy from three
    # held-out rounds to one, and shortened its siblings' forecast horizons — the gap
    # is spent out of the same calendar the rehearsals come from, and rehearsals are
    # what make the chosen window trustworthy. Nothing showed the wider spacing
    # improving anything to pay for that.

    # Outer rails, deliberately wide. Not a view about how businesses behave -- just
    # the range outside which a measured rhythm is more likely to be a data problem
    # than a real one.
    abs_min_observe: int = 14
    abs_max_observe: int = 730
    abs_min_predict: int = 7

    # Resolved from the multiples above once the rhythm is known. The defaults are the
    # values a ~15-day retail rhythm produces, so a caller that builds windows without
    # scaling behaves exactly as this pipeline did before.
    min_observe: int = 14
    min_predict: int = 7
    max_observe: int = 90

    #: Bounds on a CART horizon, in days, and deliberately not shared with the floors
    #: above — those are scaled to a purchase rhythm measured in weeks, and applying
    #: them to carts is what forced every cart goal to a 7-day minimum.
    #:
    #: Floor one hour: below that a prediction cannot be acted on — the message would
    #: arrive after the decision. Cap five hours: measured on GoWelmart, half of all
    #: adds have resolved by 4.19h and waiting longer buys almost nothing (list purity
    #: moves 35.6% -> 39.3% across the whole range) while the cart goes cold. Past 5h
    #: this stops being cart recovery and becomes re-marketing, which is a different
    #: product decision and should be a different goal.
    min_recovery_days: float = 1.0 / 24.0
    max_recovery_days: float = 5.0 / 24.0

    #: Which percentile of add-to-resolution time becomes the cart horizon, measured
    #: over EVERY add rather than only the ones that converted.
    #:
    #: The median, not a high percentile. A 90th percentile over converters answers
    #: "how long does a recovery take" and lands at 19.6 days on GoWelmart — a tail
    #: statistic dragged out by people who came back a fortnight later for unrelated
    #: reasons. The median over everyone answers "how long until half of all carts have
    #: resolved", which is the moment a reminder still changes something: 4.19h here,
    #: against 0.41h for the same data measured converters-only.
    resolution_percentile: float = 0.50

    dense_fraction: float = 0.20     # a month counts as "started" at 20% of the peak
    min_signal_rows: int = 30        # below this a signal is too sparse to locate
    min_repeat_customers: int = 30   # below this a rhythm is unmeasurable
    fallback_cadence: int = 14

    #: WHICH SIGNAL IS THIS PROJECT'S CLOCK.
    #:
    #: The pace of the relationship was read off `order` everywhere, which is right for
    #: a shop and unmeasurable for a lender: a rhythm is the gap between two of the same
    #: act, and a borrower takes ONE loan. With no gaps to measure, `cadence` returns
    #: `fallback_cadence` — 14 days, a number nobody chose for lending — and the two
    #: goals that resolve to built-ins (`purchase`, `churn`) size their windows off it.
    #: Churn then asks "will this borrower go quiet for 42 days?" of customers whose
    #: normal behaviour, on auto-debit, is months of silence.
    #:
    #: Lending is not short of a rhythm; it keeps a better one than retail. It is the
    #: EMI — monthly, and every borrower has a dozen. The same is true of a SaaS renewal
    #: and an EdTech lesson. What differs per industry is only WHICH event is the clock,
    #: so that one fact is declared in the vertical pack and travels here as
    #: configuration. No branch downstream knows what business it is.
    cadence_signal: str = "order"

    # SNAPSHOTS AND ROUNDS WERE 2 AND 3. Measured on GoWelmart across purchase, repeat
    # purchase, dormancy and churn: dropping to 1 and 2 left three of the four models
    # level or better on the sealed test (churn +0.0124, dormancy +0.0050, purchase
    # +0.0010) and the fourth down 0.0029, which is inside that model's own noise. The
    # models also came out simpler — 5, 12 and 5 features where the old settings gave
    # 20, 16 and 8.
    #
    # The gain is not from doing less work. It is that BOTH NUMBERS SPEND HISTORY:
    # `horizon_cap` subtracts snapshots x gap before deciding how far ahead a goal may
    # forecast, and `needed()` adds it back before deciding which look-backs fit. Fewer
    # snapshots return that history to the question. Dormancy's grid went from two
    # candidates to four, and the newly affordable 42d won.
    #
    # A second snapshot is a second photograph of the same customers two weeks apart,
    # not new customers; on these datasets it bought less than the history it cost.
    # Set ML_SCAFFOLD_LEGACY=1 to restore 2 and 3 without a code change.
    snapshots: int = 1               # preferred training snapshots besides val+test
    snapshot_gap: int = 14           # preferred days between them
    min_snapshot_gap: int = 7        # closer than a week and two snapshots are the
                                     # same picture, so the extra one buys nothing
    rounds: int = 2                  # preferred held-out rounds for the window search
    min_search_room: int = 7         # a search needs a week of slack beyond the floor
                                     # or the grid collapses to a single option

    # cart's horizon is the point by which this share of real recoveries have already
    # happened; the ladder steps down when the ideal does not fit the calendar
    #: The top of the ladder — what a project gets when its history can afford it.
    #: Kept in step with `recovery_ladder[0]`: the "narrowed to the N% mark" note is only
    #: true when the ladder actually stepped DOWN, and leaving this at 0.95 while the
    #: ladder topped out at 0.90 made every project report a narrowing that never happened.
    recovery_percentile: float = 0.90
    #: THE LADDER TOPS OUT AT 0.90, NOT 0.95.
    #:
    #: Each rung is a share of real cart->order recoveries to capture, and the highest
    #: one the calendar can afford wins. Measured on GoWelmart's 277,809 recoveries:
    #:
    #:     0.95 -> 32 days      0.90 -> 20 days      0.85 -> 14 days
    #:
    #: Capturing more recoveries means waiting longer, and a cart has a short commercial
    #: life. Half of all conversions happen the SAME DAY and 58% within one; by day 20
    #: the cart is already dead in any practical sense, and at 32 days the model would be
    #: ranking people nobody would contact. Letting the ladder climb to 0.95 as history
    #: accumulates would move this goal further from the moment it can be acted on — a
    #: downgrade that would look like an improvement, because the rarer label reads as a
    #: better AUC.
    #:
    #: 0.90 is not a fix for this goal's real weakness. At any horizon somebody can act
    #: on, nearly every pending cart is abandoned (95% within two days), so the useful
    #: response is a flow that fires on the cart event, not a ranking. This ceiling only
    #: stops the window drifting further out over time.
    recovery_ladder: Sequence[float] = (0.90, 0.85, 0.80, 0.75)
    min_recoveries: int = 30


def _legacy_scaffold() -> bool:
    """The way out, without an edit. A scaffold change moves every derived window, so
    the fastest honest rollback is one the person diagnosing a bad model can apply
    from a shell rather than a deploy."""
    import os
    return os.environ.get("ML_SCAFFOLD_LEGACY") == "1"


DEFAULT_POLICY = WindowPolicy(snapshots=2, rounds=3) if _legacy_scaffold() else WindowPolicy()


def scale_to_rhythm(policy: WindowPolicy, rhythm_days: float) -> WindowPolicy:
    """Turn the cycle multiples into day counts for a project with this rhythm.

    One rhythm per project, not per goal: the floor, the ceiling and the spacing
    between snapshots describe how fast the BUSINESS moves, and it would make no sense
    for churn and cart to disagree about that.

    Week-rounded like every other window, so they stay readable and do not slice a
    weekly pattern in half.
    """
    def weeks(days: float, floor: int) -> int:
        return max(floor, int(round(days / 7)) * 7)

    min_observe = weeks(policy.min_observe_cycles * rhythm_days, policy.abs_min_observe)
    max_observe = min(weeks(policy.max_observe_cycles * rhythm_days, min_observe),
                      policy.abs_max_observe)
    return replace(
        policy,
        min_observe=min_observe,
        max_observe=max(max_observe, min_observe),
        min_predict=weeks(policy.min_predict_cycles * rhythm_days, policy.abs_min_predict),
    )


def clock(signal: str, policy: WindowPolicy = DEFAULT_POLICY) -> str:
    """The project's own clock wherever the goal tables say `order`.

    `CADENCE_SIGNAL` and `project_rhythm` both mean "the committed act, at the pace the
    relationship really moves" and both spell it `order`, which is only the right word
    in retail. Substituted in one place so a project can name its own without either
    table growing an industry column.
    """
    return policy.cadence_signal if signal == "order" else signal


def project_rhythm(source: SignalSource, policy: WindowPolicy = DEFAULT_POLICY) -> float:
    """The pace of the RELATIONSHIP, used to scale the policy.

    Deliberately the committed act rather than the activity rhythm. Activity is far
    faster than commitment — GoWelmart's customers do something every ~3.5 days and buy
    every ~15 — and scaling a six-cycle ceiling by 3.5 days would cap every look-back
    at three weeks. Falls back to activity only where a project has too few repeat
    buyers to measure its own rhythm at all.
    """
    rhythm, fallback = cadence(source, clock("order", policy), policy)
    if fallback:
        rhythm, _ = cadence(source, "activity", policy)
    return rhythm


# ---------------------------------------------------------------------------
# Data access seam
# ---------------------------------------------------------------------------

class SignalSource(Protocol):
    """Everything this module needs to know about a project's data.

    Four questions, no schema knowledge. Implement it over files, over the database,
    over anything — the derivation logic does not change.
    """

    def monthly_volume(self, signal: str) -> list[tuple[dt.date, int, dt.datetime]]:
        """(month_start, row_count, first_timestamp_in_month) for a signal type,
        oldest first. `signal` is one of: order | activity | cart | all."""

    def per_customer_gaps(self, signal: str) -> Sequence[float]:
        """Each customer's own median gap in days between active days."""

    def recovery_latencies(self) -> Sequence[float]:
        """Days from each add-to-cart to that customer's next order."""

    def has_signal(self, signal: str) -> bool:
        """Whether this project records the signal at all."""


# ---------------------------------------------------------------------------
# Measurements
# ---------------------------------------------------------------------------

def _to_weeks(days: float, floor: int) -> int:
    """Round to whole weeks. Windows land on week boundaries so they don't slice a
    customer's weekly pattern in half, and so they read sensibly to a human."""
    return max(floor, int(round(days / 7)) * 7)


def onset(source: SignalSource, signal: str, policy: WindowPolicy = DEFAULT_POLICY) -> dt.date:
    """When this signal type actually started carrying real volume.

    Finds the first month holding at least `dense_fraction` of the busiest month, then
    returns the FIRST ACTUAL EVENT in that month — not the 1st. A signal switched on
    mid-month would otherwise report up to a month of history that does not exist, and
    every fit check downstream would be measured against an empty stretch.

    Falls back to the combined curve when a signal is absent or too sparse to locate,
    so a project with only one kind of data behaves exactly as before.
    """
    rows = source.monthly_volume(signal)
    total = sum(n for _, n, _ in rows)
    if not rows or total < policy.min_signal_rows:
        if signal == "all":
            raise ValueError("no data at all — cannot locate a start date")
        return onset(source, "all", policy)

    peak = max(n for _, n, _ in rows)
    qualifying = [r for r in rows if r[1] >= policy.dense_fraction * peak]
    if not qualifying:
        return onset(source, "all", policy)

    first_month, _, first_ts = min(qualifying, key=lambda r: r[0])
    return first_ts.date() if hasattr(first_ts, "date") else first_ts


def cadence(source: SignalSource, signal: str,
            policy: WindowPolicy = DEFAULT_POLICY) -> tuple[float, bool]:
    """The project's typical gap, in days, between one action and the next.

    Median of each customer's OWN median gap — a median of medians, so a handful of
    very heavy customers cannot drag the answer down, and one customer's burst of
    activity counts once rather than a hundred times.

    Returns (days, used_fallback).
    """
    gaps = [g for g in source.per_customer_gaps(signal) if g is not None]
    if len(gaps) < policy.min_repeat_customers:
        return float(policy.fallback_cadence), True
    return float(np.median(gaps)), False


# ---------------------------------------------------------------------------
# SILENCE MEASURED AS A PERCENTILE, NOT A MULTIPLE OF CADENCE.
#
# `predict = cadence x multiple` assumed every business loses customers after the same
# number of missed cycles. Measured on GoWelmart (16d cadence, 2,934 repeat buyers):
#
#   churn    x3 gave 49 days, by which 82% of buyers have ALREADY reordered. One buyer
#            in five was labelled churned for being normal-but-slow, the base rate came
#            out at 34.7%, and the model reached 2.00x lift on the sealed test.
#   dormancy x2 gave 7 days, by which only 80% of people are active again. A quiet
#            fortnight read as dormant. 1.92x lift.
#
# Taking a percentile of the SAME gaps instead — the point past which customers rarely
# return — measured on the same project, same pipeline, sealed test read once:
#
#   churn    49d -> 98d   AUC 0.726 -> 0.823   lift 2.00x -> 2.86x   coverage 51% -> 74%
#   dormancy  7d -> 21d   AUC 0.803 -> 0.881   lift 1.92x -> 4.33x
#
# WHY THESE TWO NUMBERS. Churn sits further out than dormancy because they trigger
# different actions: dormancy is a nudge, churn is a win-back worth real money, so it
# needs the higher bar. Corroborated on this project — of buyers silent 99-180 days only
# 34% return unaided, against ~60% under 90 days, so the point where fewer than half come
# back on their own is ~100 days. The 95th percentile of order gaps is 121. They agree.
#
# STILL A PROXY. The honest rule is "the threshold beyond which most customers do not
# return by themselves", because that is where a campaign changes an outcome instead of
# taking credit for one that was already going to happen. A percentile lands near it here
# and might not on a different client. Worth revisiting with more projects to measure.
#
# NOT APPLIED TO cart_abandoned: it already derives its horizon from observed recovery
# times, and lowering its ladder was tried and made it worse.
# ---------------------------------------------------------------------------

#: Which point of a project's own gap distribution counts as silence, per goal.
#:
#: These two numbers are a JUDGEMENT, not a measurement, and the trial should be able to
#: move them without a code edit. Churn sits further out than dormancy because it is the
#: more serious claim — but see the note below, which is the real argument.
#:
#: WHY CHURN SITS AT 0.90 AND NOT 0.95. Trained head-to-head on GoWelmart, same data,
#: same held-out period, one run each:
#:
#:     0.95 percentile   asks for a 126d horizon — longer than the ~352d of signal can
#:                       carry, so `horizon_cap` truncates it and the window is a
#:                       compromise rather than a choice
#:     0.90 percentile   84d, fits the history          test AUC 0.7923  Brier 0.1520
#:     return curve      77d, the measured crossing     test AUC 0.7688  Brier 0.1829
#:
#: The 0.90 window also calibrated best of the three, which is the part that matters for
#: anything quoting a probability rather than a rank.
#:
#: HONEST LIMIT: that is ONE project, one held-out period, ~520 churners in the test.
#: 0.90 is not established as the right default for every shop — it is the best-evidenced
#: choice available today, and the second project to train a churn model should be checked
#: against 0.95 before this is treated as settled. It is still a proxy for the honest rule,
#: "the threshold beyond which most customers do not return by themselves".
GAP_PERCENTILE = {"churn": 0.90, "dormancy": 0.90}


def silence_horizon(source: SignalSource, signal: str, pct: float,
                    policy: WindowPolicy = DEFAULT_POLICY) -> tuple[int | None, int]:
    """The gap beyond which this project's customers rarely return.

    Reads the same per-customer gaps `cadence` reads, and takes a percentile of them
    instead of a median times a constant. Returns (days, sample) — None when there is
    not enough repeat behaviour to measure, so the caller keeps the existing rule
    rather than inventing a number.
    """
    gaps = [g for g in source.per_customer_gaps(signal) if g is not None]
    if len(gaps) < policy.min_repeat_customers:
        return None, len(gaps)
    return _to_weeks(float(np.quantile(gaps, pct)), policy.min_predict), len(gaps)


def recovery_horizon(source: SignalSource, percentile: float,
                     policy: WindowPolicy = DEFAULT_POLICY,
                     include_never: bool = False,
                     ) -> tuple[float | None, float | None, int]:
    """How long a pending cart deserves before it is realistically dead.

    Measured, not assumed: the given percentile of days from add-to-cart to that
    customer's next order. A fast storefront lands at hours; a slow dealer network
    auto-extends. Returns (days, share_of_adds_resolved_by_then, sample_size).

    `include_never` decides which population the percentile runs over, and the two
    answers are an order of magnitude apart on the same data (GoWelmart: 4.19h vs
    0.41h). With it, adds that never converted stay in and sort last, so a percentile
    past the conversion rate lands on "never" — reported as the cap rather than as a
    number, because a horizon nobody resolves inside is not a horizon.
    """
    lat = [x for x in source.recovery_latencies(include_never=include_never)]
    if include_never:
        # never-converted adds sort last so they occupy their place in the ordering
        lat = [np.inf if x is None or not np.isfinite(x) else float(x) for x in lat]
    measurable = int(np.sum(np.isfinite(lat)))
    if measurable < policy.min_recoveries:
        return None, None, measurable
    # NOT rounded to whole weeks, and not floored at `min_predict`.
    #
    # `_to_weeks` is right for every goal whose answer plays out over weeks — it stops a
    # 13-day window slicing a customer's weekly pattern in half. A cart has no weekly
    # pattern to protect: the whole horizon fits inside an afternoon, and rounding it
    # returns the one number the measurement exists to avoid. Floored at an hour so a
    # storefront with instant checkout cannot derive a window nobody could act inside,
    # and capped at `max_recovery_days` so a slow dealer network still gets a horizon
    # somebody can send against rather than one measured in weeks.
    raw = float(np.quantile(lat, percentile))
    if not np.isfinite(raw):
        # the percentile sits past this project's conversion rate: more than that share
        # of carts never resolve at all, so the widest allowed horizon is the answer
        raw = policy.max_recovery_days
    days = min(max(raw, policy.min_recovery_days), policy.max_recovery_days)
    covered = float(np.mean([1.0 if x <= days else 0.0 for x in lat]))
    return days, covered, measurable


# ---------------------------------------------------------------------------
# Scaffold — how much validation the calendar can afford
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Scaffold:
    """The validation arrangement: training snapshots, their spacing, and how many
    held-out rounds the window search gets."""
    snapshots: int
    gap: int
    rounds: int
    reduced: bool
    #: how far back each held-out round sits. NOT the same as `gap`: a round shifted
    #: by less than the forecast still has its OWN answer window running past the real
    #: test's start, so the window search would be choosing a look-back partly on
    #: outcomes the sealed test is about to grade. Shifting by the forecast makes the
    #: nearest round stop exactly where the test begins.
    #:
    #: Only bites when forecast > gap, which is why a fast-cadence goal looked clean
    #: and a slow one did not — the same code, and the difference was luck.
    round_step: int = 0

    def describe(self) -> str:
        step = "" if self.round_step in (0, self.gap) else f" stepped {self.round_step}d"
        return (f"{self.snapshots} snapshot(s) @ {self.gap}d, "
                f"{self.rounds} round(s){step}")


def plan_scaffold(history_days: int, predict_days: int, observe_floor: int,
                  policy: WindowPolicy = DEFAULT_POLICY) -> Scaffold:
    """Pick the largest validation arrangement this project's history can afford.

    TRAINING DATA FIRST, SEARCH SECOND — learned the hard way. An arrangement that
    gave up a training snapshot to make room for a window comparison halved the
    training rows of a young model and measurably cost accuracy, to buy a choice
    between two options that scored the same. A snapshot is real data; a comparison
    between statistically tied options is not. Never trade the first for the second.

    Stage 1 keeps the most snapshots (and widest spacing) that fit at all.
    Stage 2 spends whatever calendar is left over on held-out rounds.

    A project with plenty of history gets the full arrangement — identical to what a
    large client has always had. Only a project that cannot afford it degrades, and it
    reports `reduced` so the thin evidence is visible rather than silent.
    """
    ladder = [
        (policy.snapshots, policy.snapshot_gap),
        (policy.snapshots, policy.min_snapshot_gap),
        (1, policy.min_snapshot_gap),
    ]

    # Each held-out round must sit at least a full forecast earlier than the one
    # after it, or its answer window overlaps the real test's. Budgeting rounds at
    # `gap` while shifting them by `round_step` would plan rounds the calendar
    # cannot actually afford, so the same number is used in both places.
    round_step = max(policy.snapshot_gap, predict_days)

    def leftover(snaps: int, gap: int, rounds: int) -> int:
        # calendar consumed before any look-back: the furthest-back round's anchor,
        # its leak-safe gap, its snapshots, and the test's own forecast window
        return history_days - (rounds * round_step + 2 * predict_days + snaps * gap)

    chosen = None
    for snaps, gap in ladder:
        if leftover(snaps, gap, 0) >= observe_floor:
            chosen = (snaps, gap)
            break
    if chosen is None:
        chosen = ladder[-1]
    snaps, gap = chosen

    rounds = 1
    for r in range(policy.rounds, 0, -1):
        if leftover(snaps, gap, r) >= observe_floor + policy.min_search_room:
            rounds = r
            break

    full = (snaps, gap, rounds) == (policy.snapshots, policy.snapshot_gap, policy.rounds)
    return Scaffold(snapshots=snaps, gap=gap, rounds=rounds, reduced=not full,
                    round_step=round_step)


# ---------------------------------------------------------------------------
# Derivation
# ---------------------------------------------------------------------------

@dataclass
class DerivedWindows:
    """What the platform worked out for one (project, goal). Everything here is
    measured or derived — none of it is typed in by a person."""
    goal: str
    ready: bool
    observe_days: int                 # how far back the model may look
    predict_days: int                 # how far ahead it is asked to see
    eligibility_days: int             # which customers count (differs from observe
                                      # only where the window defines the population)
    onset: dt.date
    history_days: int
    cadence_days: float | None
    cadence_fallback: bool
    scaffold: Scaffold
    checkpoints: dict | None          # snapshot / validation / test dates
    #: the look-back floor and ceiling this project's rhythm produced. Carried so the
    #: window search bounds its candidates by the same numbers the derivation used,
    #: rather than re-deciding with a constant of its own.
    min_observe: int = 14
    max_observe: int = 90
    shortfall_days: int = 0           # how much more history a NOT-READY goal needs
    recovery_percentile: float | None = None
    recovery_coverage: float | None = None
    notes: list[str] = field(default_factory=list)

    def as_row(self) -> dict:
        """Flat shape for persisting onto the goal record."""
        return {
            "observation_window_days": self.observe_days,
            "prediction_window_days": self.predict_days,
            "eligibility_window_days": self.eligibility_days,
            "signal_onset": self.onset.isoformat(),
            "history_days": self.history_days,
            "cadence_days": None if self.cadence_days is None else round(self.cadence_days, 1),
            "scaffold": {"snapshots": self.scaffold.snapshots, "gap_days": self.scaffold.gap,
                         "rounds": self.scaffold.rounds, "reduced": self.scaffold.reduced},
            "checkpoints": self.checkpoints,
            "ready": self.ready,
            "shortfall_days": self.shortfall_days,
            "recovery_percentile": self.recovery_percentile,
            "recovery_coverage": self.recovery_coverage,
            "notes": self.notes,
        }


def _checkpoints(data_end: dt.date, predict_days: int, scaffold: Scaffold) -> dict:
    """Leak-safe layout, working backwards from the last day of data.

    The test sits one forecast window from the end, so its answer period is fully
    inside the data. Validation sits one forecast window before the test, so its
    answer period ENDS exactly where the test begins — training can never see the
    period it will be judged on. Snapshots are packed before validation; they may
    overlap each other in answer time, which is fine because they are all training.
    """
    # Separated by whole days even when the forecast is shorter than one.
    #
    # `data_end - timedelta(days=0.1746)` is still `data_end`, because subtracting a
    # sub-day interval from a DATE changes nothing — so a cart's test and validation
    # checkpoints would land on the same day and validation's answer period would sit
    # inside the sealed test's. One day is the smallest separation this date-based
    # layout can express, and a four-hour answer window never reaches the next day, so
    # the leak-safety this function exists for is preserved either way.
    step = max(1, math.ceil(predict_days))
    test = data_end - dt.timedelta(days=step)
    validation = test - dt.timedelta(days=step)
    snaps = [validation - dt.timedelta(days=scaffold.gap * (scaffold.snapshots - i))
             for i in range(scaffold.snapshots)]
    return {"snapshots": [d.isoformat() for d in snaps],
            "validation": validation.isoformat(), "test": test.isoformat()}


def derive(source: SignalSource, goal: str, data_end: dt.date,
           policy: WindowPolicy = DEFAULT_POLICY,
           onset_override: dt.date | None = None) -> DerivedWindows:
    """Work out every window for one goal, from this project's data alone.

    `onset_override` is a manual escape hatch for a project whose history the
    detector cannot read correctly. It should stay unused; needing it is a signal
    that the detector needs fixing, not that the project is special.
    """
    target_event = event_goal_target(goal)
    if goal not in GOALS and not target_event:
        raise ValueError(f"unknown goal {goal!r} — expected one of {GOALS} "
                         f"or {EVENT_GOAL_PREFIX}<event_name>")

    # Floors, ceiling and snapshot spacing come from this project's own pace before
    # anything below reads them — otherwise a slow business is measured with a fast
    # business's ruler.
    policy = scale_to_rhythm(policy, project_rhythm(source, policy))

    notes: list[str] = []
    signal = f"event:{target_event}" if target_event else ONSET_SIGNAL[goal]
    start = onset_override or onset(source, signal, policy)
    history = (data_end - start).days
    cad: float | None = None
    fallback = False
    pctile = coverage = None

    if goal == "cart_abandoned":
        # The horizon is DERIVED from how long this project's own customers take to
        # come back. It also sets who is eligible: a cart older than the horizon is
        # realistically dead, so chasing it wastes a contact.
        #
        # PERCENTILE LADDER: the ideal horizon costs roughly three times itself in
        # calendar (look-back + leak-safe gap + the test's own answer window). A
        # project whose customers recover slowly but which has little history would
        # fit nothing at all — and cart was the one goal without the graceful shrink
        # its siblings have, so it returned NOT READY while their other models ran
        # fine. Now it steps down and REPORTS what share of real recoveries the
        # chosen horizon still captures, so a narrowed question is declared rather
        # than hidden. As history accumulates the ladder climbs back on its own.
        # THE PERCENTILE LADDER IS GONE, and so is the 0.95-over-converters statistic.
        #
        # The ladder existed because a multi-week horizon costs roughly three times
        # itself in calendar, so a project with little history could fit no horizon at
        # all and cart alone returned NOT READY while its siblings trained. Bounded to
        # five hours, that cost is nil — every rung fits, and stepping down between
        # rungs produced the same 5h four times over. It stopped being a ladder.
        #
        # The measurement changed with it. Taking the 90th percentile of CONVERTER
        # latencies asks "how long does a recovery take" and answers 19.6 days on this
        # project — a tail dragged out by people who came back a fortnight later for
        # unrelated reasons, and blind to everyone who never came back at all. The
        # median over EVERY add asks "how long until half of all carts have resolved",
        # which is the question a reminder has to beat: 4.19h here.
        #
        # (2026-08-29's finding still holds and is not contradicted: shortening the
        # answer window on the OLD per-customer framing made the label more universal
        # and lift worse. That framing scored a customer at a calendar cutoff, where
        # eligibility had already removed everyone who converted quickly. Scoring a
        # cart at the moment it opens has no such filter — measured base rate 43.6%
        # against 95.9% — so a short horizon now sharpens the question instead of
        # emptying it.)
        predict, coverage, n = recovery_horizon(
            source, policy.resolution_percentile, policy, include_never=True)
        if predict is None:
            notes.append(f"only {n} measurable recoveries — using the widest horizon")
            predict, coverage = policy.max_recovery_days, None
        pctile = policy.resolution_percentile
        if coverage is not None:
            notes.append(
                f"horizon {predict * 24:.1f}h — the point by which {coverage:.0%} of "
                f"this project's carts have resolved, measured over {n:,} adds")

        # ELIGIBILITY FOLLOWS THE HORIZON. THE LOOK-BACK DOES NOT.
        #
        # These were one number, and that was right while both were measured in weeks.
        # In hours it breaks: a five-hour look-back describes nobody — no orders, no
        # habits, not enough rows to build a sub-window from — and the feature builder
        # fails outright on it.
        #
        # They answer different questions. Eligibility asks WHICH CARTS ARE STILL LIVE,
        # which is a property of the horizon: a cart older than the window it is being
        # judged on cannot be saved. The look-back asks WHO IS THIS PERSON, which takes
        # months of orders and browsing to answer and has nothing to do with how long
        # the cart has been open.
        eligibility = predict
        cad, fallback = cadence(source, "activity", policy)
        observe = (_to_weeks(policy.observe_cycles * cad, policy.min_observe)
                   if cad else policy.min_observe)
        observe = min(observe, policy.max_observe)
    else:
        if target_event:
            # Its own rhythm first: how long a customer who does this typically waits
            # before doing it again. Most customers never will, so this can be too
            # sparse to measure — in which case the relationship's general pace is a
            # better answer than a fixed constant.
            cad, fallback = cadence(source, f"event:{target_event}", policy)
            if fallback:
                cad, fallback = cadence(source, "activity", policy)
                notes.append(f"too few customers with a repeated {target_event} to "
                             f"measure its rhythm — using the activity rhythm instead")
            multiple = EVENT_PREDICT_MULTIPLE
        else:
            cad, fallback = cadence(source, clock(CADENCE_SIGNAL[goal], policy), policy)
            multiple = PREDICT_MULTIPLE[goal]
        if fallback:
            notes.append("too few repeat customers to measure a rhythm — using the safe default")
        predict = _to_weeks(multiple * cad, policy.min_predict)

        # The percentile of the SAME gaps replaces the multiple above. Falls back to it
        # whenever there is too little repeat behaviour to measure a percentile from —
        # a project with a handful of repeat customers keeps the older, cruder rule
        # rather than reading a quantile off six points.
        if goal in GAP_PERCENTILE and not target_event:
            pct = GAP_PERCENTILE[goal]
            sig = clock(CADENCE_SIGNAL[goal], policy)

            alt, n = silence_horizon(source, sig, pct, policy)
            if alt:
                notes.append(f"horizon from the {pct:.0%} point of {n} customers' own "
                             f"gaps: {alt}d (a cadence multiple would have given "
                             f"{_to_weeks(multiple * cad, policy.min_predict)}d)")
                predict = alt
            else:
                notes.append(f"only {n} customers with repeat behaviour — too few to read a "
                             f"percentile from, so the cadence rule stands")

        # Stop a far-ahead question from starving the look-back. Asking about 3 months
        # ahead is meaningless if only 3 months exist — the horizon shrinks now and
        # rises back toward the project's true rhythm as history builds.
        horizon_cap = (history - policy.snapshots * policy.snapshot_gap) // 3
        if predict > horizon_cap:
            predict = max(policy.min_predict, (horizon_cap // 7) * 7)
            notes.append("forecast horizon shortened to fit the history available")

        observe = _to_weeks(max(policy.observe_cycles * cad,
                                policy.observe_horizons * predict), policy.min_observe)
        observe = min(observe, policy.max_observe)
        observe = max(observe, predict)          # never look back less than you look ahead
        # Every goal except carts defines its population by the same window it builds
        # features from. Left as None and resolved at the return, because `observe` is
        # still shrunk below to fit the history — reading it here would freeze the
        # pre-shrink value and silently widen the population against the look-back.
        eligibility = None

    floor = max(predict, policy.min_observe)
    scaffold = plan_scaffold(history, predict, floor, policy)
    if scaffold.reduced:
        notes.append(
            f"only {history}d of this signal, so validation runs on "
            f"{scaffold.describe()} — the window choice rests on less evidence "
            f"than a project with a longer history")

    def needed(look_back: int) -> int:
        return look_back + scaffold.snapshots * scaffold.gap + 2 * predict

    while observe > floor and needed(observe) > history:
        observe -= 7

    ready = needed(observe) <= history and observe >= predict
    checkpoints = None
    if ready:
        checkpoints = _checkpoints(data_end, predict, scaffold)
        earliest = dt.date.fromisoformat(checkpoints["snapshots"][0])
        if earliest - dt.timedelta(days=observe) < start:
            ready = False               # the oldest snapshot would look back past the
            checkpoints = None          # point where this signal begins

    shortfall = 0 if ready else max(0, needed(floor) - history)
    if not ready:
        notes.append(f"not enough history yet — needs roughly {shortfall} more days")

    return DerivedWindows(
        goal=goal, ready=ready, observe_days=observe, predict_days=predict,
        eligibility_days=(observe if eligibility is None else eligibility),
        onset=start, history_days=history,
        cadence_days=cad, cadence_fallback=fallback, scaffold=scaffold,
        checkpoints=checkpoints, shortfall_days=shortfall,
        recovery_percentile=pctile, recovery_coverage=coverage, notes=notes,
        min_observe=policy.min_observe, max_observe=policy.max_observe,
    )


def derive_all(source: SignalSource, data_end: dt.date,
               goals: Sequence[str] = GOALS,
               policy: WindowPolicy = DEFAULT_POLICY) -> dict[str, DerivedWindows]:
    """Derive windows for every goal a project has switched on."""
    return {g: derive(source, g, data_end, policy) for g in goals}
