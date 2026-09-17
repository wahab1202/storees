"""Propensity model training — AUTORESEARCH EDITABLE.

This file trains an XGBoost classifier for propensity scoring.
Autoresearch can modify hyperparameters, feature selection, and
preprocessing, but NOT the evaluation harness or data preparation.

Validation strategy: Walk-forward (out-of-time)
- Training data:   features from [obs_start_t, cutoff_t], labels from [cutoff_t, cutoff_t + pred]
- Validation data:  features from [obs_start_v, cutoff_v], labels from [cutoff_v, cutoff_v + pred]
- No overlap between training and validation prediction windows.
- Falls back to random split if validation window has insufficient data.

Usage:
    python -m propensity.train_propensity --project-id <UUID> --goal-id <UUID>
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared.config import load_config
from shared.normalise import _names
from sqlalchemy import create_engine, text


def _compute_segment_metrics(
    database_url: str,
    project_id: str,
    val_customer_ids: list[str],
    y_val: np.ndarray,
    y_prob: np.ndarray,
    overall_auc: float,
) -> list[dict]:
    """Slice the val set by customer attributes (returning/new, region, dealer)
    and compute AUC per segment so the UI can surface 'this model is great
    overall but useless on new customers' situations.

    Each segment needs ≥30 rows AND ≥5 positive labels to report — AUC on
    smaller slices is too noisy to be meaningful.
    """
    if len(val_customer_ids) == 0:
        return []

    engine = create_engine(database_url)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
              c.id::text          AS customer_id,
              c.total_orders      AS total_orders,
              c.region            AS region,
              c.agent_id::text    AS agent_id,
              COALESCE(a.name, '') AS agent_name
            FROM customers c
            LEFT JOIN agents a ON a.id = c.agent_id
            WHERE c.project_id = :project_id
              AND c.id = ANY(CAST(:ids AS uuid[]))
        """), {"project_id": project_id, "ids": val_customer_ids}).fetchall()

    if not rows:
        return []

    attrs = pd.DataFrame(rows, columns=["customer_id", "total_orders", "region", "agent_id", "agent_name"])
    attrs = attrs.set_index("customer_id")
    # Align with val DataFrame ordering
    aligned = attrs.reindex([str(cid) for cid in val_customer_ids])

    def _seg_auc(mask: np.ndarray, label: str, segment_type: str, segment_value: str | None) -> dict | None:
        n = int(mask.sum())
        if n < 30:
            return None
        y_t = y_val[mask]
        y_p = y_prob[mask]
        n_pos = int(y_t.sum())
        if n_pos < 5 or n_pos == n:
            return None  # AUC undefined when all labels are one class
        try:
            seg_auc = float(roc_auc_score(y_t, y_p))
        except ValueError:
            return None
        return {
            "segment_type": segment_type,
            "segment_value": segment_value,
            "segment_label": label,
            "n": n,
            "n_positive": n_pos,
            "auc": seg_auc,
            "delta_vs_overall": seg_auc - overall_auc,
        }

    segments: list[dict] = []

    # Returning vs new — most universal cut
    is_returning = (aligned["total_orders"].fillna(0).astype(float) >= 2).values
    for seg in [
        _seg_auc(is_returning, "Returning customers", "behaviour", "returning"),
        _seg_auc(~is_returning, "New customers", "behaviour", "new"),
    ]:
        if seg: segments.append(seg)

    # Top 5 regions by population in val
    region_counts = aligned["region"].value_counts().dropna().head(5)
    for region, _count in region_counts.items():
        if not region:
            continue
        mask = (aligned["region"] == region).values
        seg = _seg_auc(mask, str(region), "region", str(region))
        if seg: segments.append(seg)

    # Top 5 dealers by population in val (B2B projects only)
    dealer_counts = aligned[aligned["agent_id"].notna() & (aligned["agent_id"] != "None")]["agent_id"].value_counts().head(5)
    for agent_id, _count in dealer_counts.items():
        if not agent_id:
            continue
        mask = (aligned["agent_id"] == agent_id).values
        # Pull the human name once
        label = aligned[mask]["agent_name"].iloc[0] if mask.any() else str(agent_id)
        seg = _seg_auc(mask, str(label) or str(agent_id), "dealer", str(agent_id))
        if seg: segments.append(seg)

    return segments


def _compute_naive_baseline(val_features: pd.DataFrame, target_event: str) -> np.ndarray | None:
    """Compute naive baseline probability using simple recency rule.

    For conversion targets: inverse of days_since_last_purchase (recently ordered → will order again)
    For churn/dormancy targets: days_since_last_event (inactive → will churn)

    Returns None if the required feature is not available.
    """
    target_lower = target_event.lower()
    is_churn_like = any(k in target_lower for k in (
        "churn", "dormancy", "dormant", "cancel", "default", "missed", "expired",
    ))

    if is_churn_like:
        col_name = "days_since_last_event"
        if col_name not in val_features.columns:
            return None
        col = val_features[col_name].values.astype(float)
        max_val = col.max()
        if max_val <= 0:
            return None
        return col / max_val  # Higher days since → more likely to churn
    else:
        col_name = "days_since_last_purchase"
        if col_name not in val_features.columns:
            return None
        col = val_features[col_name].values.astype(float)
        max_val = col.max()
        if max_val <= 0:
            return None
        return 1.0 - (col / max_val)  # Lower days since → more likely to convert


# ---------------------------------------------------------------------------
# ENTRY POINT — replaced 2026-07-31.
#
# The old flow took `observation_days` and `prediction_days` as arguments: a person
# typed them into a form, and the same fixed feature set was used for every goal and
# every project. Both are now derived from the project's own data:
#
#   * the forecast horizon comes from what the goal MEANS against the measured rhythm
#   * the look-back is searched on held-out rounds the calendar can afford
#   * each model selects its own features from the full candidate pool
#
# The signature keeps `observation_days` / `prediction_days` so existing callers do
# not break, but they are now an OVERRIDE, not a requirement. Left unset — which is
# what the service does — everything is measured.
#
# The previous implementation is preserved verbatim in train_propensity_legacy.py.
# ---------------------------------------------------------------------------

# how a goal is named in the pipeline, from the MEANING a project's goal targets.
#
# Every key here is a meaning, never an event name. `order_completed` used to sit at
# the top of this table and was the one exception — a retail event name asserting that
# any project sending it means a sale by it. It was redundant where it was right: a
# retail project carries `order_completed` in its own purchase_events, so the check
# above this table already catches it. And it was wrong where it actually fired —
# only reachable for a project whose purchase is something ELSE, where it relabelled a
# foreign event as that project's purchase. No goal in any pack or project targets it.
GOAL_BY_TARGET_EVENT = {
    "purchase": "purchase",
    "repeat_purchase": "repeat_purchase",
    "churn": "churn",
    "dormancy": "dormancy",
    "cart_abandoned": "cart_abandoned",
}

#: the product's goal NAMES -> what the pipeline calls them. Matched loosely because
#: the wording drifts between deployments ("Predict Dormancy" vs "Dormancy").
#:
#: Resolved by name rather than by target event because two goals legitimately share
#: one: "Propensity to Purchase" and "Repeat Purchase Propensity" both target the
#: purchase event, and they differ in population and label, not in event. Keying on the
#: event would run one of them twice and never run the other.
GOAL_OF_NAME = {
    "propensity to purchase": "purchase",
    "purchase propensity": "purchase",
    "repeat purchase propensity": "repeat_purchase",
    "repeat purchase": "repeat_purchase",
    "predict dormancy": "dormancy",
    "dormancy": "dormancy",
    "churn risk": "churn",
    "churn": "churn",
    "predict cart abandonment": "cart_abandoned",
    "cart abandonment": "cart_abandoned",
}


def resolve_goal(name: str, target_event: str | None,
                 purchase_events: tuple[str, ...] = (),
                 abandon_events: tuple[str, ...] = ()) -> str | None:
    """One of the project's configured goals -> what the pipeline should run.

    Names are tried first and are authoritative, which keeps every existing project
    resolving exactly as it did. Only a goal the name table has never heard of reaches
    the rest of this, and that is the normal case outside retail: the industry packs
    define twenty-one goals and eleven of them are named things like "EMI Default Risk"
    and "Completion Risk".

    Falling back on the target event lets those run without anyone adding their wording
    to the table above — which would not scale anyway, since the next vertical invents
    new names again:

        the project's own purchase event   -> the purchase goal
        a pseudo-event the product uses    -> that built-in goal
        anything else                      -> `event:<name>`, asked as itself

    Returns None only when there is nothing to go on at all, so the caller can skip the
    goal and say why rather than guessing at one.
    """
    from shared.windows import EVENT_GOAL_PREFIX

    if built_in := GOAL_OF_NAME.get(str(name or "").strip().lower()):
        return built_in

    target = str(target_event or "").strip()
    if not target:
        return None
    if target in purchase_events:
        # named something this table has not seen, but aimed at the event that IS this
        # project's purchase. "Loan Conversion Propensity" is the purchase goal.
        return "purchase"
    if target in abandon_events:
        # ...and the same courtesy for the other meaning that HAS a purpose-built goal.
        # Without this, a shop calling abandonment `basket_dropped` reached the goal only
        # by naming it in English on our screen; rename the goal and it silently dropped
        # to the generic `event:` model, which asks "will this happen" with none of the
        # cart-specific horizon work. Two spellings of the same meaning, two different
        # models, no error either way.
        #
        # Only these two meanings appear here because only these two have a built-in goal.
        # Cancellation, return, refund and view have none, so `event:<name>` is already
        # the right answer for them — not a gap.
        return "cart_abandoned"
    if built_in := GOAL_BY_TARGET_EVENT.get(target):
        return built_in
    return f"{EVENT_GOAL_PREFIX}{target}"


def _pipeline_goal(goal_id: str, target_event: str, dataset) -> str:
    """What to actually train, for a goal reached through the SERVICE.

    Two callers arrive here with different things in `target_event`, and the difference
    is the bug this exists to close:

      * the offline runner resolves the goal itself and passes `purchase` / `churn` /
        `event:foo` — already a pipeline goal, nothing to do;
      * the Re-train button passes `prediction_goals.target_event` verbatim, which is
        an EVENT NAME belonging to that company — `order_placed` here.

    The old line looked that raw event up in `GOAL_BY_TARGET_EVENT`, whose keys are the
    five pipeline goals, missed, and passed the event name through as though it were a
    goal — so window derivation rejected `order_placed` and every click failed. It could
    only ever have worked for a company that happened to name its events after our
    internal goals, which is precisely the assumption the slots idea removes.

    `resolve_goal` is the function that already answers this, name first and the
    project's own purchase events second. It was written for exactly this and wired into
    both offline scripts; the service was the one path that never called it.
    """
    from shared.windows import GOALS, event_goal_target

    if target_event in GOALS or event_goal_target(target_event):
        return target_event  # already resolved (offline runner)

    name = ""
    try:
        engine = create_engine(load_config().database_url)
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT name FROM prediction_goals WHERE id = :id"),
                {"id": goal_id},
            ).fetchone()
        name = row[0] if row else ""
    except Exception as err:  # noqa: BLE001 — the event fallback below still works
        print(f"[train] could not read goal name for {goal_id}: {err}")

    # The NAME is what separates two goals aimed at the same event: "Propensity to
    # Purchase" and "Repeat Purchase Propensity" both target this project's purchase,
    # and differ in population and label, not in event.
    resolved = resolve_goal(name, target_event, tuple(dataset.events.purchase),
                            tuple(dataset.events.cart_abandon))
    print(f"[train] goal {name or goal_id!r}: target_event={target_event!r} -> {resolved!r}")
    return resolved or target_event


def resolve_dataset(project_id: str, domain: str = "ecommerce"):
    """Where this project's rows are, and what its event names mean.

    The pipeline is generic: it never assumes an event is called `order_completed` or
    `add_to_cart`. It has to be TOLD, per project, which of that company's event names
    carries which meaning.

    Three places are consulted, in order:

      1. the connector's own `config.mapping`, if it has one
      2. ML_EVENT_* in the environment
      3. what onboarding recorded in `interaction_configs`

    and if none answers, this RAISES. That refusal is the important part. Guessing a
    default here does not fail — it trains happily on the wrong events and returns a
    plausible AUC. On GoWelmart the default `order_completed` would have found 6,266
    purchases instead of the 81,265 that `order_placed` carries, and no carts at all,
    with nothing in the output to suggest anything was wrong.

    THE ORDER IS THE SAFETY PROPERTY, and it is stated-before-assumed rather than
    nearest-first. (1) and (2) are somebody declaring what this project sends. (3) is
    what its INDUSTRY typically sends, copied from a pack when the project was created
    — a good default, and demonstrably not always right: GoWelmart's rows there say
    `order_completed` and `added_to_cart`, while it actually sends `order_placed` and
    cart snapshots. Consulting it last is what keeps that wrong entry away from a
    project whose real mapping is already known.
    """
    import os
    from shared.dataset import ProjectDataset

    dsn = os.environ.get("ML_DATABASE_DSN") or _dsn_from_url(os.environ.get("DATABASE_URL", ""))
    if not dsn:
        raise RuntimeError("no DATABASE_URL — the pipeline reads projects from the database")

    # ONE MEANING AT A TIME, NOT ONE LAYER AT A TIME.
    #
    # This used to stop at the first layer that said anything: a mapping with ANY event
    # in it ended the search, and every meaning that mapping happened to leave out came
    # out blank. The mapping screen has seven boxes and a shop fills the ones it sends,
    # so a partly-filled screen — the normal case — silently blanked the rest.
    #
    # The backend has always filled these box by box. So the two halves of the product
    # answered the same question differently: measured on GoWelmart, whose screen names
    # six meanings and leaves the cart empty, the dashboard read `added_to_cart` from
    # onboarding while the model read nothing at all. No error on either side.
    cfg = _saved_config(dsn, project_id) or {}
    events = dict(((cfg.get("mapping") or {}).get("events")) or {})
    _settle_reversals(events)

    if _unanswered(events):
        # Layer 2. The environment stands in for onboarding when it names this project.
        if _env_mapping_applies(project_id):
            env_cfg = _config_from_env(project_id, {})
            _fill_from(events, ((env_cfg.get("mapping")) or {}).get("events"),
                       "the environment")
            # The env block also carries amount unit and order field names. Filling only
            # the event names from it would drop those — and `ML_AMOUNT_UNIT=major` going
            # missing turns every rupee into a paisa without anything failing. Taken only
            # where the saved config is silent, so a real connector still outranks a file
            # on somebody's laptop.
            for block in ("transforms", "identity"):
                if not cfg.get(block) and env_cfg.get(block):
                    cfg = dict(cfg); cfg[block] = env_cfg[block]
            env_fields = ((env_cfg.get("mapping")) or {}).get("fields")
            if env_fields and not ((cfg.get("mapping") or {}).get("fields")):
                mapping = dict(cfg.get("mapping") or {})
                mapping["fields"] = env_fields
                cfg = dict(cfg); cfg["mapping"] = mapping
        else:
            _fill_from(events, _events_from_interactions(dsn, project_id), "onboarding")

    if _unanswered(events):
        # Layer 3. Nothing recorded for this meaning — but the project declared its
        # INDUSTRY, and the pack for it says what that industry calls this thing. Not a
        # guess: it is the same file onboarding would have copied its rows from.
        _fill_from(events, _events_from_pack(dsn, project_id), "the industry pack")

    if events:
        mapping = dict(cfg.get("mapping") or {})
        mapping["events"] = events
        cfg = dict(cfg); cfg["mapping"] = mapping
    if not (cfg.get("mapping") or {}).get("events"):
        # Nothing stated, nothing recorded, and no pack for this project's industry. The
        # environment must NOT be used as a last resort here: it holds one mapping and
        # would hand whichever project asked last the event names of whichever project
        # the file was written for.
        raise RuntimeError(
            f"project {project_id} has no event mapping.\n"
            f"  Its connector config carries no `mapping.events`, onboarding recorded\n"
            f"  no interaction events for it, its `domain_type` matches no industry\n"
            f"  pack, and ML_EVENT_PROJECT_ID names a different project — refusing to\n"
            f"  guess, because guessing here trains a wrong model that looks right."
        )

    # THE ONE CHECK THAT HAS TO SURVIVE ALL THE LAYERING.
    #
    # Every goal is labelled against the purchase, so a mapping without one cannot train
    # anything — it can only produce a model of an event nobody sends and an AUC that
    # looks like an answer. This used to sit inside the onboarding reader, where it also
    # decided whether that layer answered the OTHER meanings; now it is asked once, of
    # the finished mapping, which is the only place it is really about.
    if not _names(events.get("purchase")):
        raise RuntimeError(
            f"project {project_id} has an event mapping with no purchase in it.\n"
            f"  Resolved meanings: {', '.join(k for k, v in events.items() if v) or '(none)'}\n"
            f"  Every goal is labelled against the purchase, so there is nothing to\n"
            f"  train — name the event that means a sale on the Event Mapping screen."
        )

    return ProjectDataset.from_database(project_id, cfg, dsn=dsn,
                                        customer_columns=_customer_columns(dsn))


def _customer_columns(dsn: str) -> frozenset:
    """Which columns the customers table has, so optional ones can be read safely.

    `birth_year` and `acquisition_channel` are being added to the schema. Selecting a
    column that does not exist is an error rather than a NULL, so the features that
    read them have to know which side of the migration they are on. Asked once per run.
    """
    import duckdb
    con = duckdb.connect()
    try:
        con.execute("INSTALL postgres; LOAD postgres;")
        con.execute(f"ATTACH '{dsn}' AS _sch (TYPE postgres, READ_ONLY)")
        rows = con.execute(
            "SELECT column_name FROM _sch.information_schema.columns "
            "WHERE table_name = 'customers'").fetchall()
        return frozenset(r[0] for r in rows)
    except Exception as exc:
        print(f"[train] could not read the customers schema ({exc}) — "
              f"treating optional columns as absent")
        return frozenset()
    finally:
        con.close()


#: what onboarding's interaction types mean to the pipeline.
#:
#: Onboarding records each event with the ROLE it plays in the customer's journey.
#: Three of those roles are meanings the cleaning rules act on; the rest describe the
#: relationship rather than the funnel, and are carried through untranslated.
#:
#: `strong_intent` is deliberately not treated as a purchase. It is the step BEFORE
#: committing — `checkout_started`, `documents_uploaded` — and a model asked to predict
#: purchases that was handed checkout-started as the answer would score beautifully and
#: mean nothing.
_MEANING_OF_INTERACTION = {
    "conversion": "purchase",
    "intent": "add_to_cart",
    "view": "product_viewed",
    # An event that UNDOES a conversion. Without this the packs had no way to say so,
    # every project's cancellation fell through to a hardcoded `order_cancelled`, and
    # cancelled revenue was stripped only from clients who happened to spell it that
    # way. It is not merely a signal: this meaning DELETES the matching order, which is
    # why it has to be understood rather than featurised.
    "cancellation": "cancellation",
    # A pack that separates the reversals -- ecommerce now does, so a returned order
    # can reach `returned` rather than `cancelled` -- still means one thing to
    # cleaning: the sale is undone. Without these two, an ecommerce project onboarded
    # after that split would have stripped its cancellations and kept every return and
    # refund in the training labels, with `order_returned` featurised as an ordinary
    # signal beside them.
    "return": "cancellation",
    "refund": "cancellation",
    # TAKEN BACK OUT OF THE BASKET.
    #
    # Missing, and silently so. A role this table does not recognise is not an error —
    # it becomes an "own signal", one more thing to featurise. So `removed_from_cart`
    # arrived, was filed as miscellaneous, and every cart calculation in the pipeline
    # carried on as though nothing had been taken out.
    #
    # The cost is visible in a basket: a shopper who added Rs67,488 of goods and then
    # deleted most of it was still scored as holding Rs67,488, and a cart emptied to
    # nothing still counted as an open cart worth chasing. `cart_rows` has the
    # arithmetic to handle it — `sum(CASE WHEN is_remove THEN -qty ...)` — and was
    # never given a removal to act on, because `is_remove` tested against an empty
    # list and was false for every event.
    #
    # THIS TABLE IS A SECOND COPY. `ROLE_TO_MEANING` in the backend's event-mapping
    # route does the identical job for the mapping SCREEN, and gained `cart_remove`
    # earlier today. The screen then showed the slot filled while the pipeline read it
    # as blank — the same rule in two places, disagreeing, with nothing to say which
    # one a number came from. Both are now correct; that they are two at all is the
    # standing risk.
    "cart_remove": "cart_remove",
    "cart_removal": "cart_remove",
    "remove_from_cart": "cart_remove",
}


def _mapping_from_roles(rows) -> dict | None:
    """`(interaction_type, event_name)` pairs -> the `mapping.events` the pipeline reads.

    Shared by the two readers that answer the same question from different places: the
    project's own `interaction_configs` rows, and its industry pack's `interaction_config`
    block. They carry identical shapes because the rows ARE written from the pack — so
    translating them twice would be two chances to drift apart, and a project whose rows
    were missing would resolve its meanings by different rules than one whose rows exist.

    Returns None only when there is nothing recognisable at all. It used to also refuse a
    set of rows carrying no conversion, back when a layer answered all-or-nothing and a
    partial answer would have ended the search. Now that meanings are filled one at a
    time, that refusal would make this layer answer the CART differently depending on
    whether a completely unrelated row existed — while the backend, which has no such
    check, filled it. The "never train without a purchase" rule it was protecting is
    enforced once, at the end of `resolve_dataset`, where it belongs.
    """
    events: dict[str, list[str]] = {}
    signals: dict[str, str] = {}
    for interaction_type, event_name in rows:
        if not event_name:
            continue
        name = str(event_name).strip()
        key = _MEANING_OF_INTERACTION.get(str(interaction_type).strip().lower())
        if key:
            events.setdefault(key, []).append(name)
        else:
            # Not one of the meanings cleaning acts on -- but a lender's `emi_missed`
            # and a course platform's `lesson_completed` arrive here, and they are the
            # most predictive things those projects send. Each is carried under its own
            # name rather than lumped together by interaction type, because "missed a
            # payment" and "used the EMI calculator" are both `engage` and are not
            # remotely the same signal.
            signals[name] = name

    if not events and not signals:
        return None

    flat = {k: (v[0] if len(v) == 1 else v) for k, v in events.items()}
    if signals:
        flat["signals"] = signals
    return flat


def _announce_mapping(source: str, flat: dict) -> None:
    """Say which meanings were resolved and from where — the mapping decides what the
    model is even trained on, so a run that never states it cannot be audited later."""
    signals = flat.get("signals") or {}
    print(f"[train] event mapping from {source}: "
          + ", ".join(f"{k}={v}" for k, v in flat.items() if k != "signals")
          + (f", {len(signals)} own signal(s): {', '.join(sorted(signals))}" if signals else ""))


#: A project states its industry as `domain_type`; the packs are named for the business
#: they serve. `fintech` is served by the NBFC pack — the only pair where the two words
#: differ. Kept identical to the backend's map of the same name; if one gains an industry
#: the other must too, or a project would resolve its own events differently depending on
#: which side of the product asked.
_PACK_FOR_DOMAIN = {
    "ecommerce": "ecommerce",
    "fintech": "nbfc",
    "saas": "saas",
    "edtech": "edtech",
}

#: THE SAME FILES THE BACKEND READS, not a copy of them.
#:
#: A duplicate here would be a second place to edit when a client's vocabulary changes,
#: and the whole point of the pack is that there is one. Overridable for a deployment
#: that ships the two services separately.
_PACKS_DIR = Path(os.environ.get(
    "STOREES_PACKS_DIR",
    Path(__file__).resolve().parents[2] / "backend" / "src" / "packs"))


#: the meanings resolved box by box. `signals` and `ignore_events` are not here: they
#: are not one of the boxes, they accumulate rather than being answered once, and the
#: layer that supplied them keeps them.
#: Meanings that exist as their own slot but are not produced by any ROLE — a pack
#: names them directly rather than through an interaction type.
_SLOTS_WITHOUT_A_ROLE = ("cart_abandon", "return", "refund")

#: EVERY meaning the pipeline acts on.
#:
#: DERIVED, NOT LISTED. A slot missing from this tuple is not carried through
#: `_fill_from`, so it stays unset however correctly the mapping names it — and a
#: missing entry raises nothing. That is exactly how `cart_remove` came to be read as
#: blank while the line logged directly above it said `cart_remove=removed_from_cart`:
#: the role was understood, the meaning it produced was not carried, and the cart
#: arithmetic ignored every removal a shop ever sent.
#:
#: Building it from `_MEANING_OF_INTERACTION` makes that impossible. Teach the table a
#: new role and the meaning it yields is carried automatically — the two cannot fall
#: out of step, because one is the other's source.
_SLOT_MEANINGS = tuple(dict.fromkeys(
    tuple(_MEANING_OF_INTERACTION.values()) + _SLOTS_WITHOUT_A_ROLE))


def _unanswered(events: dict) -> bool:
    """Whether any meaning is still unspoken for. A key present but EMPTY is an answer —
    "we don't send one" — and no later layer may overwrite it with a borrowed word."""
    return any(k not in events for k in _SLOT_MEANINGS)


def _settle_reversals(events: dict) -> None:
    """The three reversal boxes are one decision, so they are answered together.

    Somebody who named their cancellations and left `return` blank means "we don't
    distinguish one" — NOT "fall back to the retail word". Without this they would
    inherit `order_returned` from a later layer and quietly file an event they never
    send. Same rule the backend applies, for the same reason.
    """
    reversals = ("cancellation", "return", "refund")
    if any(_names(events.get(k)) for k in reversals):
        for k in reversals:
            events.setdefault(k, [])


def _fill_from(events: dict, source: dict | None, where: str) -> None:
    """Answer every still-unspoken meaning from `source`, and mark them answered.

    A meaning this source does not carry is set EMPTY rather than left open. That is the
    backend's rule: a source that answered at all has answered for all of them, so an
    industry recording no cancellation — lending has none — ends up with none, instead
    of falling through to a shop's three cancellation words.
    """
    if not source:
        return
    filled = []
    for key in _SLOT_MEANINGS:
        if key in events:
            continue
        names = _names(source.get(key))
        events[key] = names
        if names:
            filled.append(f"{key}={names if len(names) > 1 else names[0]}")
    for key in ("signals", "ignore_events"):
        if key not in events and source.get(key):
            events[key] = source[key]
    if filled:
        print(f"[train] filled from {where}: " + ", ".join(filled))


def _events_from_pack(dsn: str, project_id: str) -> dict | None:
    """This project's INDUSTRY vocabulary, read from the pack its domain names.

    The layer that was missing. The three readers above all depend on somebody having
    written this project's events down somewhere — a connector mapping, the environment,
    or `interaction_configs` rows. Ordinary situations leave a project with none of them:
    created through a door that skips the pack, onboarding failing between creating the
    project and activating its pack, the industry changed afterwards, a dumped database
    restored without those rows.

    In every one of those the project still KNOWS its industry, and the pack file still
    says what that industry calls a sale. Refusing to train a project that is perfectly
    well described, because one table is empty, is a worse answer than reading the file.

    This mirrors layer 2b of the backend's `projectVocabulary`, deliberately: both sides
    now resolve a project's words from the same four places in the same order, so the
    number on the dashboard and the event the model trains on cannot disagree.
    """
    import duckdb, json

    con = duckdb.connect()
    try:
        con.execute("INSTALL postgres; LOAD postgres;")
        con.execute(f"ATTACH '{dsn}' AS _pk (TYPE postgres, READ_ONLY)")
        row = con.execute("SELECT domain_type FROM _pk.projects WHERE id = ?",
                          [project_id]).fetchone()
    except Exception as exc:
        print(f"[train] could not read the project's industry: {exc}")
        return None
    finally:
        con.close()

    # Read from the DATABASE rather than the `domain` argument callers pass. That
    # argument defaults to "ecommerce", so a lender reached through any caller that does
    # not set it would be handed a shop's pack — the exact mistake this layer exists to
    # stop.
    domain = str((row or [None])[0] or "").strip().lower()
    pack_id = _PACK_FOR_DOMAIN.get(domain)
    if not pack_id:
        print(f"[train] project {project_id} has domain_type {domain!r} — no pack for it")
        return None

    try:
        with open(Path(_PACKS_DIR) / f"{pack_id}.json") as fh:
            pack = json.load(fh)
    except Exception as exc:
        print(f"[train] could not read the {pack_id} pack at {_PACKS_DIR}: {exc}")
        return None

    flat = _mapping_from_roles(
        [(e.get("interaction_type"), e.get("event_name"))
         for e in (pack.get("interaction_config") or [])])
    if not flat:
        print(f"[train] the {pack_id} pack names no conversion event — falling through")
        return None
    _announce_mapping(f"the {pack_id} industry pack", flat)
    return flat


def _events_from_interactions(dsn: str, project_id: str) -> dict | None:
    """The event mapping onboarding already recorded, in the shape the pipeline reads.

    Picking an industry during onboarding writes that vertical's events into
    `interaction_configs`, one row per event, each tagged with the role it plays. That
    is the same question this function needs answered — which of this company's event
    names carries which meaning — recorded at the only moment anybody actually knows
    it, and stored per project so two clients in one industry can differ.

    Nothing here is industry-aware. It reads roles, not verticals: a lender's
    `loan_disbursed` and a shop's `order_completed` both arrive tagged `conversion` and
    are treated identically. Adding an industry is a new pack file, not a code change.

    Returns None when the project has no rows, so the caller falls through rather than
    building a mapping with no purchase event in it.
    """
    import duckdb

    con = duckdb.connect()
    try:
        con.execute("INSTALL postgres; LOAD postgres;")
        con.execute(f"ATTACH '{dsn}' AS _ic (TYPE postgres, READ_ONLY)")
        rows = con.execute(
            "SELECT interaction_type, event_name FROM _ic.interaction_configs "
            "WHERE project_id = ? ORDER BY interaction_type, event_name",
            [project_id]).fetchall()
    except Exception as exc:
        print(f"[train] could not read the onboarding event mapping: {exc}")
        return None
    finally:
        con.close()

    if not rows:
        return None

    flat = _mapping_from_roles(rows)
    if not flat:
        print(f"[train] onboarding recorded nothing recognisable for {project_id} — "
              f"falling through")
        return None
    _announce_mapping("onboarding", flat)
    # (Nothing is asserted here about cart SHAPE. This briefly declared every
    # onboarding-derived mapping to be actions rather than cart state, to keep a
    # name-based snapshot guess away from events like `course_added_to_list`. The
    # guess itself is gone -- see ProjectConfig.from_saved -- so the workaround is
    # both redundant and a claim about data nobody has looked at. A project that
    # sends cart state declares it on its own config.)
    return flat


def _env_mapping_applies(project_id: str) -> bool:
    """Whether the ML_EVENT_* mapping in the environment is meant for THIS project.

    The environment holds one mapping and the database holds many projects, so an
    unscoped ML_EVENT_PURCHASE quietly answers for all of them: before this check, a
    lender and a course platform both resolved to `order_placed` because a shop's
    values happened to be in the file. Nothing failed — they would simply have trained
    on an event they never send.

    `ML_EVENT_PROJECT_ID` names the project the values belong to. Left unset the values
    apply to any project, which is the older single-project behaviour and is only safe
    on a machine with one.
    """
    import os

    if not os.environ.get("ML_EVENT_PURCHASE", "").strip():
        return False
    owner = os.environ.get("ML_EVENT_PROJECT_ID", "").strip()
    return not owner or owner == str(project_id)


def _config_from_env(project_id: str, base: dict) -> dict:
    """The event mapping supplied through the environment.

    A stand-in for wherever this ends up living. It is deliberately explicit: an unset
    ML_EVENT_PURCHASE is an error, not a default, because the purchase event is what
    every label is built from and a wrong one is undetectable downstream.
    """
    import os

    purchase = os.environ.get("ML_EVENT_PURCHASE", "").strip()
    if not purchase:
        raise RuntimeError(
            f"project {project_id} has no event mapping.\n"
            f"  The connector's config carries no `mapping.events`, and ML_EVENT_PURCHASE\n"
            f"  is unset. Set the ML_EVENT_* values in packages/ml/.env — refusing to\n"
            f"  guess, because guessing here trains a wrong model that looks right."
        )

    def listed(name: str) -> list[str]:
        return [v.strip() for v in os.environ.get(name, "").split(",") if v.strip()]

    events = {"purchase": purchase}
    for key, var in (("product_viewed", "ML_EVENT_VIEW"),
                     ("add_to_cart", "ML_EVENT_CART"),
                     ("cancellation", "ML_EVENT_CANCEL"),
                     ("ignore_events", "ML_EVENT_IGNORE")):
        vals = listed(var)
        if vals:
            events[key] = vals if len(vals) > 1 else vals[0]
    # This project's OWN meanings, each featurised under its own name. A project
    # onboarded through the wizard gets these from its industry pack; one configured by
    # hand had no way to declare them at all, which is why the two oldest projects were
    # the only ones in the system with no signals.
    if signals := listed("ML_EVENT_SIGNALS"):
        events["signals"] = {s: s for s in signals}

    merged = dict(base or {})
    merged["mapping"] = {"events": events, "fields": {"order": {
        "amount": os.environ.get("ML_ORDER_AMOUNT_KEY", "total"),
        "order_id": os.environ.get("ML_ORDER_ID_KEY", "order_id"),
    }}}
    merged["transforms"] = {
        "amount_unit": os.environ.get("ML_AMOUNT_UNIT", "major"),
        "dedupe_orders": os.environ.get("ML_DEDUPE_ORDERS", "on"),
        "strip_cancellations": os.environ.get("ML_STRIP_CANCELLATIONS", "on"),
    }
    merged.setdefault("identity", {})
    return merged


def _dsn_from_url(url: str) -> str | None:
    """postgresql://user:pass@host:port/db  ->  the key=value form the reader wants."""
    import re
    m = re.match(r"postgres(?:ql)?://([^:]+):([^@]*)@([^:/]+):?(\d+)?/([^?]+)", url or "")
    if not m:
        return None
    user, pw, host, port, db = m.groups()
    return f"host={host} port={port or 5432} dbname={db} user={user} password={pw}"


def _saved_config(dsn: str, project_id: str) -> dict | None:
    """The configuration this project was onboarded with.

    THE CONNECTOR THAT ACTUALLY CARRIES A MAPPING WINS, most recently updated first.
    This was `LIMIT 1` with no ORDER BY — an arbitrary row — which is fine for a project
    with one connector and wrong the moment it has two. Activating an industry pack
    creates one, and installing Shopify or saving the mapping screen creates another.
    Whichever the database happened to return decided which event names the model trained
    on, and the backend was picking by the same coin toss, so the two halves could
    disagree about the same project. Ordered here to match `projectVocabulary`.
    """
    import duckdb, json
    con = duckdb.connect()
    try:
        con.execute("INSTALL postgres; LOAD postgres;")
        con.execute(f"ATTACH '{dsn}' AS _cfg (TYPE postgres, READ_ONLY)")
        rows = con.execute(
            "SELECT config FROM _cfg.data_source_connectors WHERE project_id = ? "
            "ORDER BY updated_at DESC NULLS LAST", [project_id]).fetchall()
        configs = []
        for r in rows:
            if not r or not r[0]:
                continue
            configs.append(r[0] if isinstance(r[0], dict) else json.loads(r[0]))
        if not configs:
            return None
        with_events = [c for c in configs
                       if ((c.get("mapping") or {}).get("events") or {})]
        return (with_events or configs)[0]
    except Exception as exc:
        print(f"[train] could not read the saved configuration: {exc}")
        return None
    finally:
        con.close()


def project_data_end(dataset) -> "datetime.date":
    """The last day this project has complete data for."""
    import datetime as _dt
    cfg_end = getattr(getattr(dataset, "tables", None), "cfg", None)
    if cfg_end is not None and getattr(cfg_end, "data_end", None):
        return _dt.date.fromisoformat(str(cfg_end.data_end)[:10])
    return _scan_data_end(dataset)


def _scan_data_end(dataset) -> "datetime.date":
    """The last day this project has data for. Everything after it is treated as not
    yet happened, which is what keeps the test honest."""
    import duckdb, datetime as _dt
    con = duckdb.connect(); con.execute("PRAGMA disable_progress_bar")
    dataset.prepare(con)
    row = con.execute(
        f"SELECT max(ts)::DATE FROM ("
        f"  SELECT timestamp AS ts FROM ({dataset.source('orders')})"
        f"  UNION ALL SELECT timestamp AS ts FROM ({dataset.source('events')}))"
    ).fetchone()[0]
    con.close()
    return (row + _dt.timedelta(days=1)) if row else _dt.date.today()


def _dataset_fingerprint(dataset) -> str:
    """A short hash of everything that shapes this project's CLEANED rows.

    The on-disk cache below holds rows that are already cleaned — deduplicated,
    cancellations removed, carts reconstructed, the purchase event picked out. All of
    that is done according to the project's mapping, so the mapping is baked into the
    file. Keyed on `project_id` alone, the cache survived a mapping change: someone
    corrected their purchase event on the Event Mapping screen, pressed retrain, and
    the run reported "using rows already read from the database" and fitted the OLD
    shape. Fresh event map, stale rows, and a perfectly plausible AUC — the failure
    mode this pipeline refuses everywhere else.

    Including the mapping in the cache key means a change simply misses the cache and
    re-reads. Wrong only ever costs a re-read; it never returns the wrong rows.

    Anything unhashable falls back to a value that cannot match, which forces the
    re-read. Erring toward slow is the whole point.
    """
    import hashlib, json, uuid
    from dataclasses import asdict, is_dataclass

    def stringify(o):
        if isinstance(o, (set, frozenset)):
            return sorted(map(str, o))
        return str(o)

    def dump(obj):
        try:
            return asdict(obj) if is_dataclass(obj) else str(obj)
        except Exception:
            return str(obj)

    try:
        parts = {"events": dump(dataset.events)}
        cfg = getattr(dataset.tables, "cfg", None)
        if cfg is not None:
            parts["cfg"] = dump(cfg)
        blob = json.dumps(parts, sort_keys=True, default=stringify)
        return hashlib.sha1(blob.encode()).hexdigest()[:12]
    except Exception:
        # Never reuse a cache we could not prove matches.
        return "nofp" + uuid.uuid4().hex[:8]


def dataset_cache_dir(dataset) -> Path:
    """WHERE THIS PROJECT'S CLEANED ROWS ARE CACHED. One definition, every caller.

    The name carries the mapping fingerprint, so a project whose event map changed
    misses the cache and re-reads rather than fitting the old shape.

    This exists because the name was spelled out in two places and they disagreed:
    training wrote `ml_<project>_<fingerprint>` while `publish_results` looked for
    `ml_<project>`. That never matched, so publishing silently fell back to reading
    the database — the slow path, and worse, rows re-read rather than the exact ones
    the model was graded on, which is the one thing its own comment promises. Nothing
    failed; the mismatch simply cost a full rebuild every publish.

    `_prune_stale_caches` also globs `ml_<project>*`, so the old-style directory would
    have been deleted by the next training run even if it had ever been written.
    """
    import tempfile
    base = Path(os.environ.get("ML_CACHE_DIR", tempfile.gettempdir()))
    return base / f"ml_{dataset.project_id}_{_dataset_fingerprint(dataset)}"


def _prune_stale_caches(base, project_id: str, keep) -> None:
    """Drop this project's caches from older mappings.

    Without this, every mapping change leaves its parquet behind and the temp
    directory grows by a full copy of the project's events each time.
    """
    import shutil
    try:
        for d in base.glob(f"ml_{project_id}*"):
            if d.is_dir() and d != keep:
                shutil.rmtree(d, ignore_errors=True)
    except Exception:
        pass  # housekeeping only — never fail a training run over it


def train(project_id: str, goal_id: str, target_event: str,
          observation_days: int | None = None, prediction_days: int | None = None,
          domain: str = "ecommerce") -> dict:
    """Derive windows, select features, fit, and read the sealed test once.

    `observation_days` / `prediction_days` PIN the windows for this goal instead of
    deriving them, and are passed only when its `windows_pinned` flag is set. Both
    parameters sat in this signature unused for a long time — the Create Prediction
    form collected two numbers, stored them, and training never looked. Now the form
    either asks and means it, or does not ask.

    Pinning is per goal. Every other goal in the same run derives and searches exactly
    as before: the windows are worked out inside `run_goal`, from the goal it was
    handed, into a model directory of its own.
    """
    import datetime as _dt
    from pathlib import Path as _Path
    from shared.dataset import ProjectDataset, EventMap
    from propensity.pipeline import run_goal

    config = load_config()
    start_time = time.time()

    dataset = resolve_dataset(project_id, domain)
    goal = _pipeline_goal(goal_id, target_event, dataset)
    model_dir = _Path(config.model_dir) / f"propensity_{goal_id}"
    model_dir.mkdir(parents=True, exist_ok=True)

    data_end = project_data_end(dataset)
    print(f"[train] project={project_id} goal={goal} data through {data_end}")

    # Pull the cleaned rows out of the database once, then compute against them.
    # Everything the pipeline sees is identical either way -- this only decides how
    # many times the database is asked for the same data.
    if dataset.tables is not None:
        import os as _os
        # Keyed on the MAPPING as well as the project — see `dataset_cache_dir`, which
        # is also what `publish_results` calls, so the two cannot name it differently.
        cache = dataset_cache_dir(dataset)
        if not (cache / "events.parquet").exists() or _os.environ.get("ML_REFRESH") == "1":
            print(f"[train] cache {cache.name} — reading this project's "
                  f"cleaned rows from the database once -> {cache}")
            dataset = dataset.materialise(cache)
            _prune_stale_caches(cache.parent, project_id, keep=cache)
        else:
            from shared.dataset import ProjectDataset as _PD
            from dataclasses import replace as _replace
            print(f"[train] using rows already read from the database ({cache})")
            dataset = _PD(project_id=project_id, root=cache,
                          events=_replace(dataset.events, cart_add_mode="event"))

    result = run_goal(dataset, goal, data_end, model_dir,
                      pinned_observe_days=observation_days,
                      pinned_predict_days=prediction_days)
    result["goal_id"] = goal_id
    result["duration_ms"] = int((time.time() - start_time) * 1000)

    # shape the service already expects
    # ONE VOCABULARY, TRANSLATED HERE.
    #
    # The pipeline reports in its own words and in capitals — ACTIVE, INSUFFICIENT_DATA,
    # NOT_READY, REJECTED. The service and its caller speak lowercase: success,
    # insufficient_data, failed. Only ACTIVE was being translated, so every other outcome
    # travelled untouched and matched nothing on the far side, landing in the caller's
    # catch-all as `failed`.
    #
    # Costly because those states are not the same thing: `insufficient_data` is what
    # puts a goal in front of the "Re-train all" button when data finally arrives, and it
    # is the honest label for a project that simply has not been running long enough.
    # Every one of them was being filed as a failure instead.
    STATUS = {"ACTIVE": "success", "SUCCESS": "success",
              "INSUFFICIENT_DATA": "insufficient_data",
              "NOT_READY": "insufficient_data",   # not a failure — a matter of time
              "REJECTED": "failed"}
    result.setdefault("status", "success")
    raw = str(result.get("status") or "")
    result["status"] = STATUS.get(raw.upper(), raw.lower() or "failed")
    result["auc"] = result.get("test_auc_global")
    active = result.get("test_auc_active_segment")
    result["segment_metrics"] = ([] if active is None else
                                 [{"segment_label": "Active buyers", "auc": active}])
    return result

