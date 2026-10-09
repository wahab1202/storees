"""FastAPI scoring endpoint for propensity models.

Endpoints:
- POST /score         — Score a batch of customers for a goal
- GET  /health        — Health check
- GET  /models        — List available models
- POST /explain       — Get SHAP factors for a single customer
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared.config import load_config
from shared.feature_builder import build_feature_matrix
from shared.cart_rows import build_open_carts
from shared.cart_xy import CART_FEATURES, OCCASION_STARTED_AT
from propensity.train_propensity import resolve_dataset, dataset_cache_dir
# Lives in shared/ because TRAINING needs the same freshness rule and cannot import
# it from here — serve imports train_propensity, so the other direction is a cycle.
from shared.dataset import history_stamp as _history_rows, stamp_path
from propensity.pipeline import POPULATION_DEFINED_BY_WINDOW

app = FastAPI(title="Storees ML Service", version="0.1.0")

# Model cache: "<goal_id>:<version or live>" -> (model, scaler, explainer, metadata)
_model_cache: dict[str, tuple] = {}


def _forget_model(goal_id: str) -> None:
    """Drop every cached copy of this goal's model, whichever version it was."""
    for key in [k for k in _model_cache if k.split(":", 1)[0] == goal_id]:
        _model_cache.pop(key, None)


def _no_model(goal_id: str, why: str):
    # 404 with "No model found" — the wording the backend recognises as "skip this
    # goal", not as a failure. A goal without a model is a state, not a crash.
    return HTTPException(status_code=404, detail=f"No model found for goal {goal_id}: {why}")


def _load_model(goal_id: str, version: str | None = None):
    """The model to score with, and the settings it was fitted with — always a matched pair.

    BY VERSION, WHEN THE CALLER NAMES ONE. The backend records which version is active;
    the folder's `model.joblib` is only whatever was written there last. Those two drifted:
    a refused retrain's rehearsals overwrote the live files, so the screen said "29 Sep
    model" while the server scored with — or crashed on — something else. Loading the
    named version from `versions/` makes the database the single answer to "which model".

    Without a version (an older caller), the folder's live pair is used, as before.

    A missing file is "no model" (404), never an unhandled crash: the training attempt
    that created the folder may simply never have produced one.
    """
    key = f"{goal_id}:{version or 'live'}"
    if key in _model_cache:
        return _model_cache[key]

    config = load_config()
    model_dir = Path(config.model_dir) / f"propensity_{goal_id}"

    if version:
        model_file = model_dir / "versions" / f"model_{version}.joblib"
        meta_file = model_dir / "versions" / f"metadata_{version}.json"
    else:
        model_file = model_dir / "model.joblib"
        meta_file = model_dir / "metadata.json"

    if not model_file.exists() or not meta_file.exists():
        raise _no_model(goal_id, f"version {version} is not on this server" if version
                        else "no trained model in its folder")

    # One bundle: the fitted, calibrated model and the exact feature list it was
    # fitted on. There is no separate scaler — the model is a tree ensemble, which
    # does not need inputs rescaled, and a stray scaler is one more thing that can
    # silently disagree with training.
    bundle = joblib.load(model_file)
    model = bundle["model"] if isinstance(bundle, dict) else bundle

    with open(meta_file) as f:
        metadata = json.load(f)

    _model_cache[key] = (model, None, None, metadata)
    return _model_cache[key]


class ScoreRequest(BaseModel):
    project_id: str
    goal_id: str
    customer_ids: list[str]
    observation_days: int = 90
    #: The version the backend records as ACTIVE. Absent from older callers.
    model_version: str | None = None


class ScoreResult(BaseModel):
    customer_id: str
    score: float  # 0-100
    confidence: float  # 0-1
    bucket: str  # High / Medium / Low
    #: WHAT THE SCORE WAS ABOUT, for the goals where the row is an occasion rather
    #: than a person. A cart score carries the basket's value and the moment it
    #: opened, in the same shape `publish_results` writes, so a live score and a
    #: published one are indistinguishable to the page that reads them.
    #:
    #: Without this the live path wrote `factors: []`: the Cart Value column came out
    #: blank and, with no open time to count from, the countdown fell back to the row's
    #: creation date — which the upsert never refreshes — so a cart scored seconds after
    #: it opened rendered as "expired".
    factors: list[dict] = []


class ScoreResponse(BaseModel):
    scores: list[ScoreResult]
    model_version: str
    computed_at: str


class ExplainRequest(BaseModel):
    project_id: str
    goal_id: str
    customer_id: str
    observation_days: int = 90
    model_version: str | None = None


class Factor(BaseModel):
    feature: str
    value: float
    impact: float
    direction: str  # positive / negative
    label: str  # human-readable


class ExplainResponse(BaseModel):
    customer_id: str
    score: float
    confidence: float
    bucket: str
    factors: list[Factor]
    model_version: str


def _feature_label(name: str) -> str:
    """A readable name for one feature, derived from the feature itself.

    This used to read a hand-written label dictionary per vertical. That dictionary
    described the OLD fixed feature set: of the 86 features these models actually
    select it covered 12, and for those 12 its wording differed from the derived form
    only in capitalisation ('Total spent' vs 'Total Spent'). It was 1,616 lines of
    per-vertical files earning one word of difference on one feature, and it could not
    keep up with a candidate pool the pipeline is free to grow.

    Deriving the label means a new feature is readable the day it is added, with
    nothing to maintain and no vertical to pick.
    """
    return name.replace("_", " ").title()


def _score_to_bucket(score: float) -> str:
    if score >= 70:
        return "High"
    elif score >= 40:
        return "Medium"
    return "Low"


@app.get("/health")
def health():
    return {"status": "ok", "service": "storees-ml", "timestamp": datetime.utcnow().isoformat()}


@app.get("/models")
def list_models():
    config = load_config()
    model_dir = Path(config.model_dir)
    if not model_dir.exists():
        return {"models": []}

    models = []
    for d in model_dir.iterdir():
        if not (d.is_dir() and d.name.startswith("propensity_")):
            continue
        meta_path = d / "metadata.json"
        if not meta_path.exists():
            continue
        with open(meta_path) as f:
            meta = json.load(f)
        # Read defensively. The goal id is the DIRECTORY name -- metadata does not
        # repeat it -- and the accuracy figures live on the training RUN, not on the
        # model artefact, because a model has one identity and many evaluations.
        # Indexing metadata for either turned a listing into a 500.
        models.append({
            "goal_id": meta.get("goal_id") or d.name.removeprefix("propensity_"),
            "goal": meta.get("goal"),
            "model_version": meta.get("model_version", ""),
            "observation_window_days": meta.get("observation_window_days"),
            "prediction_window_days": meta.get("prediction_window_days"),
            "n_features": len(meta.get("feature_names") or []),
            "test_cutoff": meta.get("test_cutoff"),
            "trained_at": meta.get("trained_at"),
        })

    return {"models": models}


class PromoteRequest(BaseModel):
    goal_id: str
    model_version: str


@app.post("/promote")
def promote_version(req: PromoteRequest):
    """Make the named versioned snapshot the live model for this goal.
    Copies versions/model_<v>.joblib (+ its metadata) to the goal directory's live
    files. Cache is invalidated so the next score
    request loads the promoted model.
    """
    import shutil
    config = load_config()
    model_dir = Path(config.model_dir) / f"propensity_{req.goal_id}"
    versions_dir = model_dir / "versions"

    src_model = versions_dir / f"model_{req.model_version}.joblib"
    src_meta = versions_dir / f"metadata_{req.model_version}.json"

    if not src_model.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Version {req.model_version} not found for goal {req.goal_id}",
        )

    shutil.copyfile(src_model, model_dir / "model.joblib")
    if src_meta.exists():
        shutil.copyfile(src_meta, model_dir / "metadata.json")

    _forget_model(req.goal_id)
    return {"status": "promoted", "goal_id": req.goal_id, "model_version": req.model_version}


class TrainRequest(BaseModel):
    project_id: str
    goal_id: str
    target_event: str
    #: PINNED windows, sent only for a goal whose owner chose them. Absent — the normal
    #: case — means derive: the pipeline works the look-back and the forecast horizon out
    #: from this project's own measured rhythm.
    #:
    #: These were `int` with defaults of 90/14, so "not pinned" could not be expressed at
    #: all. Every request through this endpoint therefore pinned SOMETHING, the window
    #: search was skipped on every retrain, and a goal was silently judged on windows
    #: nobody had chosen — while the same goal run from the command line derived its own.
    observation_days: int | None = None
    #: FLOAT, not int. A cart's horizon is measured in hours (GoWelmart: 4.19h =
    #: 0.1746d) because carts resolve in minutes; pydantic would coerce that to 0 and
    #: the caller would never learn its window had been thrown away. Whole days for
    #: every other goal, which a float carries perfectly well.
    prediction_days: float | None = None
    domain: str = "ecommerce"


class TrainResponse(BaseModel):
    """What a training attempt produced.

    THE THREE NUMBERS ARE OPTIONAL, because a run that could not fit a model has none
    of them to report. They were plain `float` with a 0.0 default, which only covers a
    key being ABSENT — a pipeline returning `{"auc": None}`, which is what every
    stopped-early path does, failed response validation and became a bare HTTP 500. The
    caller then recorded "ML service error 500" against the goal, and the actual reason
    the run stopped, which the pipeline had already worked out and put in `reason`,
    never left this process.

    Reporting them as null rather than 0.0 also keeps "no model" distinct from "a model
    that scored zero" — the caller already treats null as absent, and 0.0 as a number.
    """
    status: str  # success / failed / insufficient_data / error
    auc: float | None = None
    baseline_auc: float | None = None
    model_lift_over_baseline: float | None = None
    model_version: str = ""
    warning: str | None = None
    reason: str | None = None

    # ── EVERYTHING BELOW WAS ALREADY COMPUTED AND THROWN AWAY HERE ──────────────
    #
    # The pipeline derives windows, grades the model on two populations, measures
    # top-decile lift and calibration, and records how the feature set was chosen. All
    # of it reached this function and none of it left, so Storees had exactly one number
    # to show and had to keep displaying the windows somebody typed into a form months
    # ago beside a model trained on windows it worked out itself.

    #: The windows the pipeline actually USED — derived unless `windows_pinned`.
    observation_window_days: int | None = None
    #: float for the same reason as `TrainRequest.prediction_days` — this is the number
    #: the backend writes back onto the goal, so an int here would round a derived
    #: hours window to zero on the way out.
    prediction_window_days: float | None = None
    windows_pinned: bool = False

    #: AUC on the two populations separately. `auc_active` is the honest one for anyone
    #: deciding who to contact: among customers still shopping, can we rank them? The
    #: global figure includes dormant customers, who are trivially easy to separate and
    #: inflate it — measured 0.966 global against 0.811 active on the same model.
    auc_active: float | None = None
    auc_inactive: float | None = None

    #: How much better than random the top 10% is, and what that is worth. This is the
    #: pipeline's real notion of a baseline: the base rate, not a rival model. There is
    #: no naive-baseline AUC any more — the function that computed one is dead code — so
    #: `baseline_auc` above stays null rather than reporting a confident 0.0000.
    top_decile_lift: float | None = None
    top_decile_precision: float | None = None
    base_rate: float | None = None
    lift_quality: str | None = None
    brier: float | None = None

    #: Test-set size, so a number can be read with its sample beside it.
    n_test: int | None = None
    n_positive_test: int | None = None

    #: How the feature set was arrived at: candidates -> clusters -> stable -> chosen k.
    selection: dict | None = None
    flags: list[str] | None = None


@app.post("/train", response_model=TrainResponse)
def train_model(req: TrainRequest):
    """Train a propensity model for a prediction goal.

    Catches exceptions explicitly so a Python-side crash becomes a
    structured TrainResponse with status='error' and the real exception
    message, instead of bubbling up as FastAPI's generic 500. The Node
    training worker logs the `reason` field, so this is the only place
    operators can see what actually went wrong.
    """
    from propensity.train_propensity import train
    import traceback

    try:
        result = train(
            project_id=req.project_id,
            goal_id=req.goal_id,
            target_event=req.target_event,
            observation_days=req.observation_days,
            prediction_days=req.prediction_days,
            domain=req.domain,
        )
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[serve.train] Exception during train for goal {req.goal_id}:\n{tb}")
        return TrainResponse(status="error", reason=_plain_failure(e))

    # Clear model cache so next score request loads the new model
    _forget_model(req.goal_id)

    windows = result.get("windows") or {}
    return TrainResponse(
        status=result.get("status", "failed"),
        auc=result.get("auc"),
        # No baseline MODEL exists to compare against, so this stays null. The lift the
        # pipeline does measure is against the base rate and is reported as such below.
        baseline_auc=result.get("baseline_auc"),
        model_lift_over_baseline=result.get("top_decile_lift"),
        model_version=result.get("model_version", ""),
        warning=result.get("warning"),
        reason=result.get("reason"),
        # Windows come from the pipeline's own record of what it used, NOT from what the
        # caller asked for — a pinned request and a derived one both answer honestly.
        observation_window_days=windows.get("observation_window_days"),
        prediction_window_days=windows.get("prediction_window_days"),
        windows_pinned=bool(result.get("windows_pinned", False)),
        auc_active=result.get("test_auc_active_segment"),
        auc_inactive=result.get("test_auc_inactive_segment"),
        top_decile_lift=result.get("top_decile_lift"),
        top_decile_precision=result.get("top_decile_precision"),
        base_rate=result.get("base_rate"),
        lift_quality=result.get("lift_quality"),
        brier=result.get("test_brier"),
        n_test=result.get("n_test"),
        n_positive_test=result.get("n_pos_test"),
        selection=result.get("selection"),
        flags=result.get("flags"),
    )


class EligibleRequest(BaseModel):
    project_id: str
    goal_id: str
    target_event: str
    domain: str = "ecommerce"
    #: The ACTIVE version, so the window read below is the scoring model's own.
    model_version: str | None = None


class EligibleResponse(BaseModel):
    goal: str
    customer_ids: list[str]
    n: int


@app.post("/eligible", response_model=EligibleResponse)
def eligible(req: EligibleRequest):
    """WHO this goal applies to, by the pipeline's own definition.

    Storees had no way to ask, so it scored every customer row in the project — a
    dormancy model whose population is 5,843 was handed 16,322 people, and the ten
    thousand with no recorded activity were scored from empty feature rows. Those
    fabricated scores then produced every count on the screen.

    Answered here rather than reimplemented in the caller, because the rule differs per
    goal and a second copy would drift from the one the model is actually graded against.
    """
    from propensity.train_propensity import resolve_dataset, _pipeline_goal
    from propensity.trainer import eligible_customers
    from shared.dataset import ProjectDataset
    import datetime as _dt

    dataset = resolve_dataset(req.project_id, req.domain)
    goal = _pipeline_goal(req.goal_id, req.target_event, dataset)

    # Eligibility for the snapshot goal is read against the newest data, which is what
    # scoring is about — unlike training, which reads it at the sealed test cutoff.
    # A FLOAT, AND AN INSTANT. Both halves of this were wrong and either alone was fatal.
    #
    # `int()` on the window turned a cart's 0.2083 days into 0, and the query below then
    # asks for `timestamp >= as_of - 0 days AND timestamp < as_of` — an empty range on
    # any data. Every cart model answered "0 eligible", so the scoring worker wrote
    # nothing and logged it as a success: 157 training runs on one project without a
    # single score, and no error anywhere.
    #
    # `date.today()` compounded it. Scoring asks who is eligible RIGHT NOW; a date is
    # midnight, so even a correct window would have looked at yesterday evening and
    # excluded everything that has happened today — which, for a five-hour window, is
    # the only thing that could ever qualify.
    meta_days = 30.0
    model_dir = Path(load_config().model_dir) / f"propensity_{req.goal_id}"
    # The same settings file scoring will use — the active version's, when named.
    meta_path = (model_dir / "versions" / f"metadata_{req.model_version}.json"
                 if req.model_version else model_dir / "metadata.json")
    if meta_path.exists():
        try:
            meta_days = float(json.loads(meta_path.read_text())
                              .get("eligibility_window_days") or meta_days)
        except Exception:
            pass

    # NOW, ANSWERED BY THE DATABASE. Formatting a Python timestamp here is how the
    # second half of this bug survived the first fix: event timestamps are aware, a
    # naive UTC string is read as local, and the window lands hours off.
    ids = eligible_customers(dataset, goal, meta_days, None)
    return EligibleResponse(goal=goal, customer_ids=ids, n=len(ids))



def _scoring_datasets(project_id: str, domain: str, as_of: datetime):
    """Two views of this project: (history, live). They are not interchangeable.

    HISTORY is the daily copy and describes shoppers as of midnight — which is exactly
    what the feature builder is asked for, and what training used.

    LIVE goes to the database. THE CART MUST COME FROM HERE. A cart opened at 2pm today
    does not exist in a copy written at midnight, so reading carts from the copy would
    find nothing all day and silently score no one — or worse, score yesterday's carts.
    The whole point of the cart model is a basket that is open right now.

    So: slow-moving facts from the copy, the basket from the database.

    Below is why the copy exists at all.

    Scoring asks the feature builder for `as_of` DATE — midnight — so the shopper half
    of every score excludes today by construction, and is identical for every request
    made on the same day. Building it live meant re-running the whole cleaning pipeline
    (dedupe, cancellations, cart reconstruction) inside each of the builder's ~45 CTEs,
    against Postgres, to recompute a number that had not changed since midnight. On
    GoWelmart — 885,817 events, a 16 MB dataset — that wanted 24 GiB of spill and
    exhausted the disk.

    So the cleaned rows are read once and reused, exactly as training does. The cache is
    the SAME directory training writes, named by `dataset_cache_dir`, so a scoring run
    straight after a training run pays nothing at all.

    REBUILT WHEN IT PREDATES THE SNAPSHOT IT IS SERVING. Reuse alone would be wrong in
    the other direction: a cache written on Monday still describes Monday, so by
    Wednesday it would answer for a shopper as they were two days ago, silently. The
    rule is the one serving already implies — anything written before the `as_of`
    midnight is stale, and one read per day replaces it.

    A file-backed project (`tables is None`) is already local; nothing to do.
    """
    dataset = resolve_dataset(project_id, domain)
    if dataset.tables is None:
        return dataset, dataset

    from shared.dataset import ProjectDataset
    from dataclasses import replace

    cache = dataset_cache_dir(dataset)
    marker = cache / "events.parquet"

    # FRESH MEANS "DESCRIBES THE SAME HISTORY", NOT "BUILT TODAY".
    #
    # This asked whether the copy was written after midnight, which sounds equivalent and
    # is not: a copy written at 18:57 is "today", so an import that landed at 19:45 was
    # invisible until tomorrow. Measured — 250 dealers with three months of history each
    # were ingested, 25 of them had a cart open, and 24 could not be scored because the
    # copy had never heard of them.
    #
    # What actually matters is the history the features are built from: everything BEFORE
    # the midnight this is serving. Counting those rows distinguishes the two cases that
    # look identical to a clock — a backfill, which changes them and must force a
    # rebuild, and ordinary live events timestamped now, which do not and must not.
    # Without that distinction the choice is between a stale copy and rebuilding on every
    # request, which is the 24 GiB query this cache exists to avoid.
    midnight = as_of.replace(hour=0, minute=0, second=0, microsecond=0)
    stamp = stamp_path(cache, "history.count")
    history_now = _history_rows(dataset, midnight)
    fresh = False
    if marker.exists() and stamp.exists():
        try:
            fresh = stamp.read_text().strip() == history_now
        except Exception:
            fresh = False

    if fresh:
        return ProjectDataset(project_id=project_id, root=cache,
                              events=replace(dataset.events, cart_add_mode="event")), dataset

    # Written to a sibling and swapped in, so a reader never sees a half-written
    # directory. Two workers racing simply do the read twice and the last one wins;
    # both wrote the same rows, so the loser costs time, never correctness.
    import os, shutil
    staging = cache.with_name(cache.name + f".building-{os.getpid()}")
    shutil.rmtree(staging, ignore_errors=True)
    built = dataset.materialise(staging)
    shutil.rmtree(cache, ignore_errors=True)
    try:
        os.replace(staging, cache)
        # Beside the directory, not inside it: this swap replaces the directory whole,
        # and a note written into it would take training's note down with it.
        stamp.write_text(str(history_now))
    except OSError:
        return built, dataset  # swap lost a race; our own copy is still correct
    return ProjectDataset(project_id=project_id, root=cache,
                          events=replace(built.events, cart_add_mode="event")), dataset


def _attach_cart_features(features, dataset, metadata, expected_cols, as_of):
    """Give a cart model the CART it was fitted on, instead of zeros.

    `dataset` MUST be the LIVE one, never the daily copy — a basket opened since
    midnight is not in the copy, and the point of this model is a basket open now.

    A model whose feature list contains `cart_value` was trained one-row-per-cart. The
    customer matrix has no such column, so before this existed the alignment loop below
    invented it as 0 and the model answered a question about an empty basket — for
    every customer, on every request, without an error.

    Returns only customers who have a cart open right now. That is a real narrowing and
    it is the correct one: "will this basket be abandoned" is unanswerable for someone
    holding no basket, and the old behaviour answered it anyway.
    """
    # WHAT THE MODEL EATS AND WHAT THE PAGE SHOWS ARE TWO DIFFERENT QUESTIONS.
    #
    # This used to return early whenever the model had not selected a cart column, which
    # silently threw away two things that have nothing to do with the feature list:
    #
    #   the narrowing   a cart goal's population IS the open carts. Skipping the lookup
    #                   scored people whose basket had already converted.
    #   the open time   when a cart opened is a fact about the CART. Without it the page
    #                   counts down from the row's write time, so twenty-four carts
    #                   opened across five hours all rendered with the same expiry —
    #                   the column stops describing anything.
    #
    # So the lookup happens for any goal whose population is an occasion; the feature
    # list decides only which columns are handed to the model.
    needed = [c for c in CART_FEATURES if c in expected_cols]
    occasion = metadata.get("goal") in POPULATION_DEFINED_BY_WINDOW
    if not needed and not occasion:
        return features, None

    # The windows the model was FITTED with, not request defaults. A cart horizon is
    # hours, so these are fractional days and must survive as floats.
    elig = float(metadata.get("eligibility_window_days") or 0)
    horizon = float(metadata.get("prediction_window_days") or 0)
    if elig <= 0 or horizon <= 0:
        raise HTTPException(
            status_code=500,
            detail=("Model %s needs %s but its metadata carries no cart windows; "
                    "retrain it." % (metadata.get("model_version"), ", ".join(needed))),
        )

    # None = now, per the database. Formatting `utcnow()` here is what made this return
    # nothing: naive UTC read as local time moves the five-hour window by the offset.
    carts = build_open_carts(dataset, None, elig, horizon)
    if carts.empty:
        return features.iloc[0:0], None

    # Same uuid-vs-string mismatch the two builders already carry separately.
    carts.index = carts.index.map(str)
    live = [c for c in features.index if c in carts.index]
    if not live:
        return features.iloc[0:0], None

    features = features.loc[live].copy()
    for col in needed:
        features[col] = carts.loc[features.index, col].to_numpy()
    return features, carts.loc[features.index]


def _align_to_training(features, expected_cols):
    """Order the columns as the model expects, defaulting only what may be defaulted.

    Zero is a fair reading of an absent COUNT — no orders, no views. It is not a fair
    reading of an absent cart: it asserts an empty basket rather than admitting an
    unknown one, and that assertion is what made every cart score wrong. So a cart
    column that reached this point unfilled is a bug in the caller, and it raises.
    """
    for col in expected_cols:
        if col in features.columns:
            continue
        if col in CART_FEATURES:
            raise HTTPException(
                status_code=500,
                detail=f"Cart feature '{col}' was never built; refusing to score it as 0.",
            )
        features[col] = 0
    return features[expected_cols]


def _features_for(dataset, cutoff_ts: str, obs_days: int, customer_ids):
    """The feature matrix for these customers, narrowed when it honestly can be."""
    from shared.feature_builder import PopulationSnapshotMissing
    if customer_ids:
        try:
            return build_feature_matrix(dataset, cutoff_ts, obs_days, only=list(customer_ids))
        except PopulationSnapshotMissing as e:
            print(f"[serve.score] {e} — building the full population instead", flush=True)
    return build_feature_matrix(dataset, cutoff_ts, obs_days)


def _serving_cutoff(at: datetime) -> str:
    """The scoring cutoff as an INSTANT, not a date.

    `strftime("%Y-%m-%d")` reads as "today" and means MIDNIGHT. The feature builder
    filters `first_seen < cutoff`, so a date excluded every customer who first
    appeared today — precisely the shopper who just signed up, filled a basket and
    is the reason a cart model is running at all.

    Training is different and correctly uses dates: its snapshots ARE midnights, and
    a fold boundary has to be a clean day. Serving asks "what is true right now", and
    truncating that to midnight throws away the whole of today.

    Same shape as the eligibility bug this codebase already carries a note about
    (`trainer.eligible_customers`): a date where an instant was needed, producing an
    empty answer rather than an error.
    """
    return at.strftime("%Y-%m-%d %H:%M:%S")


@app.post("/score", response_model=ScoreResponse)
def score_customers(req: ScoreRequest):
    model, _, _, metadata = _load_model(req.goal_id, req.model_version)
    config = load_config()

    # LOCAL WALL CLOCK, NOT UTC.
    #
    # Every cutoff below is rendered as a naive string and compared against
    # timezone-aware columns, and the database reads a naive string as LOCAL time.
    # `utcnow()` therefore shifted the whole cutoff backwards by the UTC offset —
    # 5h30m here — so `first_seen < cutoff` silently excluded every customer who
    # first appeared in the last five and a half hours. A shopper who signs up and
    # fills a basket is exactly that customer, and the request came back as a 200
    # with an empty score list.
    #
    # This file already carries the same note for `build_open_carts` (see the "None =
    # now, per the database" comment above); these two callers were missed.
    cutoff = datetime.now()
    from datetime import timedelta
    obs_start = cutoff - timedelta(days=req.observation_days)

    # The SAME builder and the SAME look-back the model was fitted on. Scoring a
    # customer over a different window would hand the model columns that share a
    # name with training but mean something else.
    history, live = _scoring_datasets(req.project_id, metadata.get("domain", "ecommerce"), cutoff)
    obs_days = metadata.get("observation_window_days", req.observation_days)
    # ONLY THE CUSTOMERS ASKED ABOUT.
    #
    # This built the whole customer base and then kept the one row it wanted — 3,413
    # customers measured to score a single shopper, on every cart event. That is where
    # the per-click delay, and the service's memory climbing to 3.5GB in an afternoon,
    # both came from.
    #
    # Falls back to the full build when the population snapshot the narrow path needs
    # is missing or stale — a brand-new project, or one that has not been swept in a
    # week. Slower and correct, and the full build writes the snapshot on its way out,
    # so the next request takes the fast path.
    features = _features_for(history, _serving_cutoff(cutoff), obs_days, req.customer_ids)
    # The matrix indexes on uuid.UUID; the caller sends ids as JSON strings. Matching
    # them directly silently found nothing -- every request returned an empty list
    # with a 200, so the backend would have recorded "scored 0 customers" as success.
    features.index = features.index.map(str)
    if req.customer_ids:
        wanted = [c for c in req.customer_ids if c in features.index]
        # SAY SO when a customer was asked for and cannot be found.
        #
        # Dropping them quietly turns "this customer has no row" into "no scores",
        # returned as a 200 with an empty list, which the backend records as a
        # successful scoring run: `scored 0, total 1`. That reads as "the model
        # considered them and declined", and it is not — the model never saw them.
        # The staleness that caused it is fixed above; this line is here so the next
        # cause of the same shape announces itself instead of looking like a verdict.
        missing = [c for c in req.customer_ids if c not in features.index]
        if missing:
            print(f"[serve.score] {len(missing)} requested customer(s) absent from the "
                  f"feature matrix — NOT SCORED: {', '.join(missing[:5])}"
                  f"{' ...' if len(missing) > 5 else ''}", flush=True)
        features = features.loc[wanted]

    expected_cols = metadata["feature_names"]
    # A cart model scores BASKETS. Narrow to the customers holding one and carry that
    # cart's own features across, before anything gets defaulted.
    features, cart_meta = _attach_cart_features(features, live, metadata, expected_cols, cutoff)

    if features.empty:
        return ScoreResponse(scores=[], model_version=metadata["model_version"], computed_at=cutoff.isoformat())

    features = _align_to_training(features, expected_cols)

    probs = model.predict_proba(features)[:, 1]

    def _cart_factors(cid):
        """The same payload `publish_results` writes, so the page needs no special case."""
        if cart_meta is None or cid not in cart_meta.index:
            return []
        row = cart_meta.loc[cid]
        out = []
        for c in CART_FEATURES:
            if c in cart_meta.columns and not pd.isna(row[c]):
                out.append({"feature": c, "value": float(row[c])})
        # WHAT IS IN THE BASKET, as against what opened it. `cart_value` is the
        # model's feature and stays the opening add; this is the figure a person
        # reading the list needs, and the two differ the moment a shopper adds a
        # second thing — measured on a real basket, Rs7,499 against Rs23,293.
        bv = row.get("basket_value")
        if bv is not None and not pd.isna(bv):
            out.append({"feature": "basket_value", "value": float(bv)})
        opened = row.get("opened_at")
        if opened is not None and not pd.isna(opened):
            out.append({"feature": OCCASION_STARTED_AT, "value": None,
                        "at": pd.Timestamp(opened).isoformat()})
        return out

    scores = []
    for cid, prob in zip(features.index, probs):
        score_100 = round(float(prob) * 100, 1)
        scores.append(ScoreResult(
            customer_id=str(cid),
            score=score_100,
            confidence=round(min(float(prob), 1 - float(prob)) * 2, 3),  # higher near 0.5 = less confident
            bucket=_score_to_bucket(score_100),
            factors=_cart_factors(str(cid)),
        ))

    return ScoreResponse(
        scores=scores,
        model_version=metadata["model_version"],
        computed_at=cutoff.isoformat(),
    )


@app.post("/explain", response_model=ExplainResponse)
def explain_customer(req: ExplainRequest):
    model, _, _, metadata = _load_model(req.goal_id, req.model_version)
    config = load_config()

    # LOCAL WALL CLOCK, NOT UTC.
    #
    # Every cutoff below is rendered as a naive string and compared against
    # timezone-aware columns, and the database reads a naive string as LOCAL time.
    # `utcnow()` therefore shifted the whole cutoff backwards by the UTC offset —
    # 5h30m here — so `first_seen < cutoff` silently excluded every customer who
    # first appeared in the last five and a half hours. A shopper who signs up and
    # fills a basket is exactly that customer, and the request came back as a 200
    # with an empty score list.
    #
    # This file already carries the same note for `build_open_carts` (see the "None =
    # now, per the database" comment above); these two callers were missed.
    cutoff = datetime.now()
    from datetime import timedelta
    obs_start = cutoff - timedelta(days=req.observation_days)

    domain = metadata.get("domain", "ecommerce")
    history, live = _scoring_datasets(req.project_id, metadata.get("domain", "ecommerce"), cutoff)
    obs_days = metadata.get("observation_window_days", req.observation_days)
    # ONLY THE CUSTOMERS ASKED ABOUT.
    #
    # This built the whole customer base and then kept the one row it wanted — 3,413
    # customers measured to score a single shopper, on every cart event. That is where
    # the per-click delay, and the service's memory climbing to 3.5GB in an afternoon,
    # both came from.
    #
    # Falls back to the full build when the population snapshot the narrow path needs
    # is missing or stale — a brand-new project, or one that has not been swept in a
    # week. Slower and correct, and the full build writes the snapshot on its way out,
    # so the next request takes the fast path.
    features = _features_for(history, _serving_cutoff(cutoff), obs_days, req.customer_ids)
    # same uuid-vs-string mismatch as /score: without this every explain 404s
    features.index = features.index.map(str)
    features = features.loc[[req.customer_id]] if req.customer_id in features.index else features.iloc[0:0]

    if features.empty:
        raise HTTPException(status_code=404, detail="No data found for customer")

    expected_cols = metadata["feature_names"]
    features, cart_meta = _attach_cart_features(features, live, metadata, expected_cols, cutoff)
    if features.empty:
        raise HTTPException(status_code=404, detail="Customer has no open cart to explain")

    features = _align_to_training(features, expected_cols)

    prob = float(model.predict_proba(features)[:, 1][0])
    score_100 = round(prob * 100, 1)

    # Explanation is computed on demand from the fitted model rather than from a
    # stored explainer object: one less artifact to keep in step with the model, and
    # it can never explain a version that is no longer live.
    import shap
    inner = getattr(model, "estimator", None) or getattr(model, "base_estimator", None) or model
    if hasattr(model, "calibrated_classifiers_"):
        inner = model.calibrated_classifiers_[0].estimator
    shap_values = shap.TreeExplainer(inner).shap_values(features)[0]
    X = features.values

    factors = []
    for feat_name, shap_val, feat_val in sorted(
        zip(expected_cols, shap_values, X[0]),
        key=lambda x: abs(x[1]),
        reverse=True,
    )[:10]:
        factors.append(Factor(
            feature=feat_name,
            value=round(float(feat_val), 2),
            impact=round(float(abs(shap_val)), 4),
            direction="positive" if shap_val > 0 else "negative",
            label=_feature_label(feat_name),
        ))

    return ExplainResponse(
        customer_id=req.customer_id,
        score=score_100,
        confidence=round(min(prob, 1 - prob) * 2, 3),
        bucket=_score_to_bucket(score_100),
        factors=factors,
        model_version=metadata["model_version"],
    )


#: A crash, said to the person reading the goal card rather than to the person fixing it.
#:
#: Matched on the exception's own text, in order, first hit wins. Substrings rather than
#: exception classes because the ones that matter arrive wrapped: DuckDB reports a lost
#: Postgres connection as `IOException`, and the class alone would not separate it from a
#: bad file.
_FAILURE_MEANINGS = (
    ("server closed the connection",
     "Lost connection to the database while reading this shop's data. "
     "Nothing was changed — try again."),
    ("no buffer space",
     "Lost connection to the database while reading this shop's data. "
     "Nothing was changed — try again."),
    ("too small to be a parquet",
     "A saved copy of this shop's data was damaged. "
     "It will be rebuilt automatically on the next run."),
    ("failed to import",
     "The prediction service is missing a required component. "
     "Your administrator needs to reinstall it on the server."),
    ("no module named",
     "The prediction service is missing a required component. "
     "Your administrator needs to reinstall it on the server."),
    ("out of memory",
     "The server ran out of memory while training this model. "
     "Nothing was changed — your administrator needs to look at the machine."),
    ("permission denied",
     "The prediction service could not read or write a file it needs. "
     "Your administrator needs to check its permissions on the server."),
)


def _plain_failure(exc: Exception) -> str:
    """What a crash should say on the goal card.

    This used to pass the exception's own text through, with a comment claiming it
    avoided leaking internal paths. It did not — the text IS where the path lives, and a
    marketing screen showed
    `InvalidInputException: File '/var/folders/.../ml_cb28b02b.../events.parquet' too
    small to be a Parquet file`. Nobody reading a goal card can act on that, and the
    directory layout of the server is not theirs to see.

    Says what happened, whether anything was damaged, and who fixes it. The full
    traceback is already on its way to the service log at the call site, so the person
    who needs the stack still has every line of it — this decides only what reaches the
    database row the dashboard reads.

    An exception this has never seen gets the last line, which promises nothing it cannot
    know. Pretending to explain an unrecognised failure would be worse than admitting it:
    the whole point of this week's work is that a message which sounds informative and
    is not costs days.
    """
    text = f"{type(exc).__name__}: {exc}".lower()
    for needle, meaning in _FAILURE_MEANINGS:
        if needle in text:
            return meaning
    return ("Training stopped unexpectedly. Nothing was changed — the previous model, if "
            "there is one, is untouched. The details are in the prediction service log "
            f"at {datetime.now().strftime('%H:%M on %d %b')}.")
