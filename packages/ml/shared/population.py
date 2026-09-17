"""The shape of a project's customer base, recorded once and looked up many times.

Eight of the ~190 features are a customer's RANK among everyone else (see
`POPULATION_RANKS`). Computing them the direct way needs the whole population, which
is why scoring a single shopper measured all 3,413 customers: eight features dragged
the other 3,405 in with them, on every cart event.

A rank does not need the population rebuilt, though — it needs the population's SHAPE.
Record the value at each percentile once, and a customer's rank becomes a lookup:

    spent Rs22,000 -> sits above the 90th percentile mark -> 0.90

The shape moves slowly. It is a comparison against thousands of people, so a single
day of trading barely shifts it — somebody at the 82nd percentile this morning is at
about the 82nd tonight. A snapshot a few hours old is a rounding error next to
rebuilding it on every click.

WRITTEN AS A SIDE EFFECT OF WORK THAT ALREADY HAPPENS. Any full-population build — the
daily scoring sweep, a training run — saves it on the way past. There is no scheduler
to forget and no onboarding step: a new project's first full build creates the file.

NEVER REQUIRED. Missing, stale or unreadable, the caller measures the whole population
as before: slower, and correct. That direction matters — the failure this replaces was
a stale cache returning a WRONG answer silently, which is the expensive kind.
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from shared.feature_builder import POPULATION_RANKS

#: How many points describe each column. 101 gives every whole percentile, which is
#: finer than the ranks are used at and still only a few kilobytes per project.
GRID = 101

#: Past this, the snapshot is not trusted and the caller rebuilds. A project that has
#: not been trained or swept in a week is one whose population may genuinely have moved.
MAX_AGE_DAYS = 7

#: Below this the shape is not worth recording — percentiles over a handful of
#: customers describe the handful, not the business.
MIN_CUSTOMERS = 50


def path_for(project_id: str, root: str | Path = "models") -> Path:
    return Path(root) / f"population_{project_id}.json"


def save(df: pd.DataFrame, project_id: str, root: str | Path = "models") -> Path | None:
    """Record the population's shape from a FULL feature matrix.

    Callers must only pass a matrix built for the whole customer base. A partial one
    would produce boundaries describing those few customers, and every percentile in
    the project would then be measured against the wrong yardstick — wrong numbers
    that look entirely reasonable. `_build_feature_matrix` enforces this by calling
    here only when nothing narrowed the build.
    """
    if df is None or len(df) < MIN_CUSTOMERS:
        return None
    qs = np.linspace(0.0, 1.0, GRID)
    shape: dict[str, list[float]] = {}
    for feat, (src, invert) in POPULATION_RANKS.items():
        if src not in df.columns:
            continue
        col = pd.to_numeric(df[src], errors="coerce").dropna()
        if col.empty:
            continue
        # Stored in the SAME orientation the rank is taken in, so the lookup is a
        # plain "how far along this sorted list" and the inversion cannot be applied
        # twice or forgotten.
        values = (-col) if invert else col
        shape[feat] = [float(v) for v in np.quantile(values.to_numpy(), qs)]
    if not shape:
        return None

    out = path_for(project_id, root)
    out.parent.mkdir(parents=True, exist_ok=True)
    body = {
        "project_id": project_id,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "n": int(len(df)),
        "grid": GRID,
        "columns": shape,
    }
    # Written to a sibling and renamed, so a reader mid-lookup never sees half a file.
    fd, tmp = tempfile.mkstemp(dir=str(out.parent), prefix=".pop-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as fh:
            json.dump(body, fh)
        os.replace(tmp, out)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise
    return out


def load(project_id: str, root: str | Path = "models") -> dict | None:
    """The snapshot, or None when there is none worth trusting."""
    p = path_for(project_id, root)
    if not p.exists():
        return None
    try:
        body = json.loads(p.read_text())
    except Exception:
        return None
    try:
        as_of = datetime.fromisoformat(body["as_of"])
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=timezone.utc)
    except Exception:
        return None
    age_days = (datetime.now(timezone.utc) - as_of).total_seconds() / 86400
    if age_days > MAX_AGE_DAYS:
        return None
    if not body.get("columns"):
        return None
    body["age_days"] = age_days
    return body


def apply_ranks(df: pd.DataFrame, snapshot: dict) -> list[str]:
    """Fill the eight rank features on a PARTIAL matrix, from the recorded shape.

    Returns the features it could not fill, so the caller can decide rather than
    discover a silently-defaulted column later.
    """
    missing: list[str] = []
    cols = snapshot.get("columns", {})
    for feat, (src, invert) in POPULATION_RANKS.items():
        grid = cols.get(feat)
        if grid is None or src not in df.columns:
            missing.append(feat)
            continue
        boundaries = np.asarray(grid, dtype=float)
        values = pd.to_numeric(df[src], errors="coerce")
        values = (-values) if invert else values
        v = values.to_numpy(dtype=float)
        # THE MIDDLE OF THE TIE, because that is what `rank(pct=True)` reports.
        #
        # Taking `side="left"` alone was out by as much as 0.31 on real data. Columns
        # like `total_orders` are mostly ties — a third of customers have never
        # ordered — and pandas gives every one of them the AVERAGE rank of that block
        # while a left-hand search gives them the bottom of it. Averaging the two
        # bounds reproduces the same midpoint.
        lo = np.searchsorted(boundaries, v, side="left")
        hi = np.searchsorted(boundaries, v, side="right")
        df[feat] = np.clip(((lo + hi) / 2.0) / (len(boundaries) - 1), 0.0, 1.0)
    return missing
