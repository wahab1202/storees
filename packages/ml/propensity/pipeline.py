"""Train one goal for one project, end to end.

This is what `/propensity/train` calls. It replaces the old flow, where a person
typed an observation and prediction window into a form and the model used a fixed
feature set. Nothing is typed in now:

    measure the project's rhythm and when each signal started
        -> derive the forecast horizon from what the goal MEANS
        -> search the look-back on held-out rounds the calendar can afford
        -> select this model's own features
        -> fit, calibrate, and read the sealed test exactly once

The caller supplies only a project and a goal. Everything else is measured.

WHY THE LOOK-BACK IS SEARCHED BUT THE HORIZON IS NOT: the horizon is the QUESTION
("will they buy in the next 14 days?"). Tuning a question until it scores well just
finds the easiest question. The look-back is how much evidence the model may read to
answer it, which is a fair thing to optimise.
"""

from __future__ import annotations

import datetime as dt
import time
from dataclasses import dataclass, replace
from pathlib import Path

from shared.cart_xy import cache_enabled as _day_cache_on, day_cache_stats, reset_day_cache
from shared.dataset import ProjectDataset
from shared.sources import DatasetSignalSource
from shared.windows import DEFAULT_POLICY, DerivedWindows, derive, event_goal_target
from propensity.select_features import select_features
from propensity.trainer import train as fit_model


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] [pipeline] {msg}", flush=True)


@dataclass
class Windows:
    """What the stages below need from a derivation, plus the one distinction the
    derivation itself does not make: the look-back used for FEATURES can differ from
    the one that decides WHO is eligible.

    They differ only for goals whose window defines their own population — carts.
    Letting a single number do both jobs means a longer window quietly scores a
    different, easier crowd, and the comparison between two windows becomes
    meaningless. Pinning eligibility and varying only the feature history keeps every
    candidate judged on the same people.
    """
    eligibility_days: int
    feature_days: int
    predict_days: int
    checkpoints: dict

    @classmethod
    def from_derived(cls, d: DerivedWindows, feature_days: int | None = None,
                     checkpoints: dict | None = None) -> "Windows":
        return cls(eligibility_days=d.eligibility_days,
                   feature_days=feature_days or d.observe_days,
                   predict_days=d.predict_days,
                   checkpoints=checkpoints or d.checkpoints)


#: goals whose look-back also decides who is in the population
POPULATION_DEFINED_BY_WINDOW = {"cart_abandoned"}


def _choose_look_back(scored: list[tuple[int, float]],
                      held_out: list[tuple[int, int]], log) -> int:
    """The winning look-back, with ties judged against the measurement's own error.

    WHAT WAS HERE BEFORE: `max(scored, key=lambda r: (round(r[1], 4), -r[0]))`. Rounding
    to four places is a tie-break bar of 0.0001, and it was never chosen — it is what
    rounding happened to leave behind. Measured on GoWelmart, a candidate's score moves
    by 0.013 to 0.040 between rehearsals, so the bar sat a hundred times below the noise
    and every comparison produced a "clear" winner. Repeat purchase picked 35d, 77d and
    105d on three runs of the same data; dormancy picked 28d one day and 21d the next
    with nothing changed at all. A longer look-back is not free either — it reads more
    history per build — so the coin toss was also spending time.

    The bar here is the Hanley-McNeil standard error of the score being compared, taken
    from the held-out counts the rehearsals actually scored on, floored at the same
    K_TOLERANCE_FLOOR the k-sweep uses. Among every candidate inside it, the SMALLEST
    look-back wins: equal accuracy on the evidence available, less history to read, and
    the same answer next run.

    NOT A NEW IDEA — `select_features` hit this exact failure choosing the feature
    count ("k was effectively chosen at random"), fixed it this way, and wrote it down.
    The window search never got the same treatment because it had no named tolerance to
    find, only a rounding call.

    A tie is still decided at a boundary, and a candidate can sit a hair either side of
    it. What changes is the size of the thing being decided by a hair: a window that is
    genuinely equivalent, rather than one that is genuinely better.
    """
    from propensity.select_features import K_TOLERANCE_FLOOR, _auc_se

    best = max(s for _lb, s in scored)
    tol = K_TOLERANCE_FLOOR
    if held_out:
        n_pos = sorted(p for p, _n in held_out)[len(held_out) // 2]
        n_neg = sorted(n for _p, n in held_out)[len(held_out) // 2]
        if n_pos and n_neg:
            tol = max(K_TOLERANCE_FLOOR, _auc_se(best, n_pos, n_neg))

    tied = sorted(lb for lb, s in scored if s >= best - tol)
    winner = max(scored, key=lambda r: r[1])[0]
    if len(tied) > 1:
        log(f"    within one standard error ({tol:.4f}) of the best: "
            f"{tied} — taking the smallest")
    if tied and min(tied) != winner:
        log(f"    (top score was {winner}d; it is not separable from {min(tied)}d here)")
    return min(tied) if tied else winner


def _candidate_lookbacks(derived: DerivedWindows, earliest_snapshot: dt.date,
                         floor: int, cap: int | None = None) -> list[int]:
    """Whole-week look-backs to try, bounded by what the history actually holds.

    Capped so the oldest snapshot's look-back still starts after this signal began —
    a window reaching into months with no data looks perfectly valid and is silently
    half empty.
    """
    # The ceiling is the one the derivation already worked out from this project's
    # rhythm, not a constant of this function's own -- a 90-day cap here would put back
    # the retail assumption the policy just removed, and silently: the grid would stop
    # at 90 while the derivation was willing to look further.
    cap = cap if cap is not None else derived.max_observe
    fits = (earliest_snapshot - derived.onset).days
    top = max(floor, min(cap, fits))
    if top <= floor:
        return [floor]
    step = (top - floor) / 5.0
    grid = sorted({max(floor, int(round((floor + i * step) / 7)) * 7) for i in range(6)})
    return [d for d in grid if d <= fits]


def _shift(checkpoints: dict, days: int) -> dict:
    """The same checkpoint layout, moved earlier — one held-out rehearsal."""
    def back(d: str) -> str:
        return (dt.date.fromisoformat(d) - dt.timedelta(days=days)).isoformat()
    return {"snapshots": [back(d) for d in checkpoints["snapshots"]],
            "validation": back(checkpoints["validation"]),
            "test": back(checkpoints["test"])}


def _checkpoints_for(data_end: dt.date, derived: DerivedWindows,
                     predict_days: int) -> dict:
    """The leak-safe layout again, for a prediction window nobody derived.

    The checkpoints are measured backwards from the last day of data, so the forecast
    horizon decides where they land — test one window from the end, validation one
    window before that. Reusing the derived layout with a different horizon would put
    the test's answer period partly outside the data, or overlap it with validation's,
    and the model would be graded on outcomes it had trained through.

    Rebuilt through `shared.windows` rather than reimplemented here, so the pinned path
    and the derived path cannot drift apart on the one rule that keeps the test honest.
    """
    from shared.windows import _checkpoints
    return _checkpoints(data_end, predict_days, derived.scaffold)


def run_goal(dataset: ProjectDataset, goal: str, data_end: dt.date, model_dir: Path,
             source=None, search: bool = True,
             pinned_observe_days: int | None = None,
             pinned_predict_days: int | None = None) -> dict:
    """Derive, select, train and test one goal. Returns the training-run record.

    PINNED WINDOWS. When both `pinned_*` arguments arrive, this goal's owner has said
    what the windows are and the look-back search is skipped: the candidates exist only
    to CHOOSE a look-back, and there is nothing left to choose. Everything after that —
    feature selection, fitting, tuning, the single sealed read of the test set — is
    unchanged, so the model is built no differently. What changes is the standing of
    the result: a derived look-back won a comparison on held-out rounds, a pinned one
    was asserted, and the prediction window also moves the test checkpoint (it is
    measured back from the end of the data). Two goals on different windows are
    therefore graded on different periods and their AUCs do not line up. Callers must
    surface `windows_pinned` wherever they show the score.

    Still per goal. Nothing here reaches another goal's windows, model directory or
    result — pinning one leaves the rest deriving and searching as they always did.
    """
    source = source or DatasetSignalSource(dataset)

    # Per-goal lifetime, deliberately. Held across goals it would outlive a reseed or a
    # mapping change and serve rows built from data that no longer exists.
    reset_day_cache()
    if _day_cache_on():
        log("  per-day feature reuse ON (ML_CART_DAY_CACHE=1)")

    # A goal asking about an event this project has never sent cannot be answered, and
    # says so here rather than several minutes later. Left to run it does not crash: the
    # onset detector falls back to the combined activity curve, windows derive from a
    # signal unrelated to the question, every label comes out zero, and the failure
    # finally surfaces as a generic "insufficient data" with nothing pointing at the
    # cause. Configuring a goal for an event you do not yet emit is an ordinary mistake
    # -- the packs offer six goals and a new project rarely sends all six events.
    target_event = event_goal_target(goal)
    if target_event and not source.has_signal(f"event:{target_event}"):
        log(f"{goal}: this project has never sent `{target_event}` — nothing to predict")
        return {"project_id": dataset.project_id, "goal": goal, "status": "INSUFFICIENT_DATA",
                "reason": f"no `{target_event}` events have ever been received for this "
                          f"project, so the goal has no answer to learn from"}

    # The same refusal, for the one goal whose event is a MAPPING rather than a name in
    # the goal itself. `DatasetSignalSource` used to assume an unmapped project called
    # its cart event `add_to_cart`; without that guess an unmapped project now produces
    # no cart rows at all, and the honest report is "you have not told us what your cart
    # event is called" rather than the "not enough history yet" that an empty signal
    # would otherwise be mistaken for. Onboarding fixes one of those and cannot fix the
    # other, so saying which is the whole point.
    if goal == "cart_abandoned" and not dataset.events.cart_add:
        log(f"{goal}: no cart event is mapped for this project — nothing to predict")
        return {"project_id": dataset.project_id, "goal": goal, "status": "INSUFFICIENT_DATA",
                "reason": "this project has no add-to-cart event mapped, so there are no "
                          "carts to predict against — set it on the Event Mapping screen "
                          "and re-train"}

    # this project's own clock, from its saved config -- `order` unless it said otherwise
    policy = replace(DEFAULT_POLICY, cadence_signal=dataset.events.cadence_signal)

    # A PROJECT WITH TOO LITTLE DATA IS NOT A FAULT.
    #
    # `derive` raises when it cannot find a start date — the honest response to a project
    # that has barely any events. Unguarded, that reached the caller as a bare exception
    # and the goal was recorded as `error`, so the very first Re-train a new client
    # presses turned their card red with a Python message on it. Waiting for data is the
    # normal state of a project on day one, and `insufficient_data` is the word for it:
    # the same state the "Re-train all" button watches for, so the goal is picked up
    # automatically once enough history exists.
    try:
        derived = derive(source, goal, data_end, policy)
    except ValueError as exc:
        log(f"{goal}: {exc}")
        return {"project_id": dataset.project_id, "goal": goal, "status": "INSUFFICIENT_DATA",
                "reason": f"not enough history yet to work out this goal's windows ({exc}) "
                          f"— it will train once more data has arrived"}
    log(f"{goal}: signal starts {derived.onset} ({derived.history_days}d), "
        f"forecast {derived.predict_days}d, {derived.scaffold.describe()}")
    for note in derived.notes:
        log(f"  note: {note}")

    if not derived.ready:
        return {"project_id": dataset.project_id, "goal": goal, "status": "NOT_READY",
                "reason": f"needs about {derived.shortfall_days} more days of history",
                "windows": derived.as_row()}

    windows_pinned = bool(pinned_observe_days and pinned_predict_days)

    # A window the history cannot cover is refused rather than trained on.
    #
    # The derivation cannot produce one — its candidates are bounded by the data. A
    # text box can, and the failure is otherwise mute: every label comes out of a
    # period that does not exist, the run ends "insufficient data", and nothing points
    # at the number somebody typed.
    if windows_pinned:
        need = pinned_observe_days + pinned_predict_days
        if need > derived.history_days:
            return {"project_id": dataset.project_id, "goal": goal,
                    "status": "INSUFFICIENT_DATA",
                    "reason": f"windows set by hand need {need} days "
                              f"({pinned_observe_days}d observation + "
                              f"{pinned_predict_days}d prediction) but this project has "
                              f"{derived.history_days} days of history",
                    "windows": derived.as_row()}

    real = (_checkpoints_for(data_end, derived, pinned_predict_days) if windows_pinned
            else derived.checkpoints)
    floor = max(derived.predict_days, derived.min_observe)
    pinned = goal in POPULATION_DEFINED_BY_WINDOW

    chosen = pinned_observe_days if windows_pinned else derived.observe_days
    predict_days = pinned_predict_days if windows_pinned else derived.predict_days
    if windows_pinned:
        log(f"  windows set by hand — {chosen}d observation / {predict_days}d "
            f"prediction, look-back search skipped")
    if search and not windows_pinned and derived.scaffold.rounds >= 1:
        # Rehearsals sit strictly earlier than the real test, which is never touched.
        # The shift is `round_step`, not `gap`: a round moved back less than the
        # forecast still has its own answer window running into the real test's, so
        # the look-back would be chosen partly on outcomes the sealed test grades.
        step = derived.scaffold.round_step or derived.scaffold.gap
        rounds = [_shift(real, step * k)
                  for k in range(1, derived.scaffold.rounds + 1)]
        earliest = min(dt.date.fromisoformat(r["snapshots"][0]) for r in rounds)
        grid = _candidate_lookbacks(derived, earliest, floor)
        log(f"  look-back candidates {grid} over {len(rounds)} held-out round(s)")

        # THE SEARCH IS A COMPARISON, NOT EIGHTEEN MODEL BUILDS.
        #
        # It ran the whole development cycle inside every rehearsal — a fresh feature
        # selection and a fresh 20-config hyperparameter search, ~91 fits each, 18 deep
        # — to produce one number. Three things follow from the search's actual job:
        #
        #   HYPERPARAMETERS ARE TUNED ONCE and shared by every candidate. Tuning each
        #   separately confounded the result: a window could win on luckier settings
        #   rather than on its length, and nothing told the two apart. Tuned on the
        #   DERIVED look-back, so the numbers come from this project's own data rather
        #   than from a constant somebody chose.
        #
        #   FEATURES ARE SELECTED ONCE PER CANDIDATE, not once per rehearsal. The
        #   columns depend on the WINDOW — a 42d look-back is sliced into 5/10/21d
        #   sub-windows, a 91d one into 11/23/46d — and not on which rehearsal is
        #   being run, so re-selecting per rehearsal re-answered the same question.
        #   Done on the OLDEST rehearsal, whose data ends before every rehearsal's
        #   test, so no comparison is scored with features chosen after it.
        #
        #   REHEARSALS LEARN FROM THE SNAPSHOTS ALONE. Validation's rows overlap the
        #   snapshots' look-back by about two thirds, so they cost a third of the stage
        #   and shift no ranking. The final fit still uses every date.
        #
        # The final fit below is deliberately untouched: full search, full selection,
        # all dates. Only the throwaway work shrinks.
        oldest = rounds[-1]
        tune_win = Windows(
            eligibility_days=derived.eligibility_days if pinned else derived.observe_days,
            feature_days=derived.observe_days, predict_days=derived.predict_days,
            checkpoints=oldest)
        tune_sel = select_features(dataset, goal, tune_win)
        shared_params = None
        if tune_sel.get("selected_features"):
            log("  tuning hyperparameters ONCE, shared by every candidate "
                f"(on the derived {derived.observe_days}d look-back)")
            tuned = fit_model(dataset, goal, tune_win, tune_sel["selected_features"],
                              model_dir, learn_from_validation=False)
            shared_params = tuned.get("best_params")
        if shared_params is None:
            log("  could not tune up front — each candidate will tune itself")

        scored: list[tuple[int, float]] = []
        held_out: list[tuple[int, int]] = []
        for look_back in grid:
            marks = []
            # selected once for this candidate, on the oldest rehearsal
            cand_win = Windows(
                eligibility_days=derived.eligibility_days if pinned else look_back,
                feature_days=look_back, predict_days=derived.predict_days,
                checkpoints=oldest)
            cand_sel = select_features(dataset, goal, cand_win)
            if cand_sel.get("status") == "INSUFFICIENT_DATA" or not cand_sel.get("selected_features"):
                continue
            for cuts in rounds:
                win = Windows(
                    eligibility_days=derived.eligibility_days if pinned else look_back,
                    feature_days=look_back, predict_days=derived.predict_days,
                    checkpoints=cuts)
                m = fit_model(dataset, goal, win, cand_sel["selected_features"], model_dir,
                              params=shared_params, learn_from_validation=False)
                overall = m.get("test_auc_global")
                active = m.get("test_auc_active_segment")
                if overall is None:
                    continue
                # judged on both numbers together: overall alone rewards a model that
                # is merely good at telling dormant customers from live ones
                marks.append(overall if active is None else 0.5 * overall + 0.5 * active)
                if m.get("n_test"):
                    held_out.append((m["n_pos_test"], m["n_test"] - m["n_pos_test"]))
            if marks:
                scored.append((look_back, sum(marks) / len(marks)))
                log(f"    look-back {look_back:>3}d  score {scored[-1][1]:.4f}")
        if scored:
            chosen = _choose_look_back(scored, held_out, log)
        log(f"  chose look-back {chosen}d")

    win = Windows(eligibility_days=derived.eligibility_days if pinned else chosen,
                  feature_days=chosen, predict_days=predict_days,
                  checkpoints=real)
    log(f"  final fit — test checkpoint {real['test']} read once")
    sel = select_features(dataset, goal, win)
    if sel.get("status") == "INSUFFICIENT_DATA" or not sel.get("selected_features"):
        return {"project_id": dataset.project_id, "goal": goal, "status": "INSUFFICIENT_DATA",
                "reason": sel.get("reason", "no eligible population"),
                "windows": derived.as_row()}

    result = fit_model(dataset, goal, win, sel["selected_features"], model_dir)
    result["windows"] = {**derived.as_row(),
                         "observation_window_days": chosen,
                         "feature_window_days": chosen,
                         "prediction_window_days": predict_days,
                         "eligibility_window_days": win.eligibility_days}
    # Carried all the way out so the score is never read without it. A pinned AUC was
    # not selected on held-out rounds, and its test period is not the one the other
    # goals were graded on.
    result["windows_pinned"] = windows_pinned
    result["selection"] = {k: sel.get(k) for k in
                           ("chosen_k", "n_candidates", "n_clusters", "n_stable_clusters")}
    if _day_cache_on():
        st = day_cache_stats()
        total = st["hits"] + st["misses"]
        if total:
            log(f"  per-day feature reuse: {st['hits']:,} reused / {total:,} asked "
                f"({st['hits']/total*100:.1f}%), {st['distinct']:,} days held, "
                f"{st['mb']} MB" + (" (budget reached)" if st["capped"] else ""))
        result["day_cache"] = st
    reset_day_cache()
    return result
