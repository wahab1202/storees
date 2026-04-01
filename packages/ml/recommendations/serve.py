"""Unified Recommendation API — FIXED (not autoresearch-editable).

Endpoint: GET /v1/recommend
Model selection logic based on user context and interaction history.

Model selection:
- Anonymous, no item context → Trending
- Anonymous, viewing item → Attribute + Co-occurrence
- Identified, <5 interactions → Attribute + Trending
- Identified, 5-50 interactions → Co-occurrence + Attribute
- Identified, 50+ interactions → Collaborative Filtering
- Post-conversion → Co-occurrence (co-purchase)
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query
from pydantic import BaseModel

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from shared.config import load_config

app = FastAPI(title="Storees Recommendations", version="0.1.0")

# Model caches
_cooccurrence: dict | None = None
_attribute: dict | None = None
_trending: list | None = None
_collaborative: dict | None = None


def _load_model(name: str) -> dict | list | None:
    """Load a recommendation model from disk."""
    config = load_config()
    model_path = Path(config.model_dir) / "recommendations" / name / "model.json"
    if not model_path.exists():
        return None
    with open(model_path) as f:
        return json.load(f)


def _get_cooccurrence() -> dict:
    global _cooccurrence
    if _cooccurrence is None:
        _cooccurrence = _load_model("cooccurrence") or {}
    return _cooccurrence


def _get_attribute() -> dict:
    global _attribute
    if _attribute is None:
        _attribute = _load_model("attribute") or {}
    return _attribute


def _get_trending() -> list:
    global _trending
    if _trending is None:
        _trending = _load_model("trending") or []
    return _trending


def _get_collaborative() -> dict:
    global _collaborative
    if _collaborative is None:
        _collaborative = _load_model("collaborative") or {}
    return _collaborative


class RecommendationItem(BaseModel):
    id: str
    score: float
    model_source: str
    explanation: str


class RecommendResponse(BaseModel):
    items: list[RecommendationItem]
    model_used: str
    fallback_used: bool


def _recs_from_cooccurrence(item_id: str, limit: int) -> list[RecommendationItem]:
    model = _get_cooccurrence()
    recs = model.get(item_id, [])[:limit]
    return [
        RecommendationItem(
            id=r["item_id"],
            score=r["score"],
            model_source="cooccurrence",
            explanation="Customers who viewed this also viewed",
        )
        for r in recs
    ]


def _recs_from_attribute(item_id: str, limit: int) -> list[RecommendationItem]:
    model = _get_attribute()
    recs = model.get(item_id, [])[:limit]
    return [
        RecommendationItem(
            id=r["item_id"],
            score=r["score"],
            model_source="attribute",
            explanation="Similar product attributes",
        )
        for r in recs
    ]


def _recs_from_trending(limit: int) -> list[RecommendationItem]:
    model = _get_trending()
    recs = model[:limit]
    return [
        RecommendationItem(
            id=r["item_id"],
            score=r["score"],
            model_source="trending",
            explanation="Trending right now",
        )
        for r in recs
    ]


def _recs_from_collaborative(user_id: str, limit: int) -> list[RecommendationItem]:
    model = _get_collaborative()
    recs = model.get(user_id, [])[:limit]
    return [
        RecommendationItem(
            id=r["item_id"],
            score=r["score"],
            model_source="collaborative",
            explanation="Recommended for you",
        )
        for r in recs
    ]


def _merge_and_dedupe(
    *rec_lists: list[RecommendationItem],
    limit: int = 10,
) -> list[RecommendationItem]:
    """Merge multiple recommendation lists, deduplicate by item ID, keep highest score."""
    seen: dict[str, RecommendationItem] = {}
    for recs in rec_lists:
        for r in recs:
            if r.id not in seen or r.score > seen[r.id].score:
                seen[r.id] = r
    merged = sorted(seen.values(), key=lambda x: x.score, reverse=True)
    return merged[:limit]


@app.get("/v1/recommend", response_model=RecommendResponse)
def recommend(
    user_id: Optional[str] = Query(None, description="Customer ID (optional for anonymous)"),
    item_id: Optional[str] = Query(None, description="Current item being viewed"),
    context: str = Query("homepage", description="homepage|item_page|post_conversion"),
    limit: int = Query(10, ge=1, le=50),
):
    """Get recommendations based on context and user state."""

    # Determine user interaction count (from collaborative model presence)
    collab_model = _get_collaborative()
    user_interaction_level = "none"
    if user_id and user_id in collab_model:
        recs = collab_model[user_id]
        if len(recs) > 0:
            user_interaction_level = "high"  # has collaborative recs
    elif user_id:
        user_interaction_level = "low"

    model_used = "trending"
    fallback_used = False
    items: list[RecommendationItem] = []

    # Post-conversion context
    if context == "post_conversion" and item_id:
        items = _recs_from_cooccurrence(item_id, limit)
        model_used = "cooccurrence"
        if len(items) < limit:
            items = _merge_and_dedupe(items, _recs_from_attribute(item_id, limit), limit=limit)
            fallback_used = True

    # Anonymous, viewing an item
    elif not user_id and item_id:
        attr_recs = _recs_from_attribute(item_id, limit)
        cooc_recs = _recs_from_cooccurrence(item_id, limit)
        items = _merge_and_dedupe(cooc_recs, attr_recs, limit=limit)
        model_used = "attribute+cooccurrence"

    # Anonymous, no item context (homepage)
    elif not user_id:
        items = _recs_from_trending(limit)
        model_used = "trending"

    # Identified user with lots of interactions → collaborative
    elif user_interaction_level == "high":
        collab_recs = _recs_from_collaborative(user_id, limit)
        items = collab_recs
        model_used = "collaborative"
        if len(items) < limit:
            if item_id:
                items = _merge_and_dedupe(items, _recs_from_cooccurrence(item_id, limit), limit=limit)
            else:
                items = _merge_and_dedupe(items, _recs_from_trending(limit), limit=limit)
            fallback_used = True

    # Identified user with few interactions → attribute + trending
    else:
        if item_id:
            attr_recs = _recs_from_attribute(item_id, limit)
            trend_recs = _recs_from_trending(limit)
            items = _merge_and_dedupe(attr_recs, trend_recs, limit=limit)
            model_used = "attribute+trending"
        else:
            items = _recs_from_trending(limit)
            model_used = "trending"

    # Final fallback: trending
    if not items:
        items = _recs_from_trending(limit)
        model_used = "trending"
        fallback_used = True

    return RecommendResponse(
        items=items,
        model_used=model_used,
        fallback_used=fallback_used,
    )


@app.get("/health")
def health():
    from datetime import datetime
    models_available = []
    config = load_config()
    reco_dir = Path(config.model_dir) / "recommendations"
    if reco_dir.exists():
        for d in reco_dir.iterdir():
            if d.is_dir() and (d / "model.json").exists():
                models_available.append(d.name)
    return {
        "status": "ok",
        "models_available": models_available,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/reload")
def reload_models():
    """Force reload all model caches."""
    global _cooccurrence, _attribute, _trending, _collaborative
    _cooccurrence = None
    _attribute = None
    _trending = None
    _collaborative = None
    return {"status": "reloaded"}
