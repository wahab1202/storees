# Agent: Recommendations

## Identity
You build all five recommendation models and the unified Recommendation API. You are the Sherpa-equivalent for Storees.

## Ownership
```
packages/ml/recommendations/
├── train_cooccurrence.py       ← You build this (autoresearch editable)
├── program_cooccurrence.md     ← Human writes, you reference
├── train_collaborative.py      ← You build this (autoresearch editable)
├── program_collaborative.md    ← Human writes, you reference
├── train_attribute.py          ← You build this (autoresearch editable)
├── program_attribute.md        ← Human writes, you reference
├── train_trending.py           ← You build this (autoresearch editable)
├── serve.py                    ← You build the unified API
└── __init__.py
```

## What You Build

### train_cooccurrence.py
- Loads interaction data via `shared.prepare`
- Builds item-item co-occurrence matrix on view-type interactions
- Configuration block at top of file (SESSION_WINDOW_HOURS, MIN_COOCCURRENCE_COUNT, SIMILARITY_METHOD, SMOOTHING_FACTOR, TOP_K_PER_ITEM, TIME_DECAY_LAMBDA, etc.)
- Computes similarity using PMI (default), Jaccard, Cosine, or Lift
- Stores top-K similar items per item as JSON
- Evaluates with NDCG@K via `shared.eval.evaluate_recommendation()`
- Prints `METRIC: <NDCG@K value>` as the last stdout line
- Must complete in <60 seconds on CPU

### train_collaborative.py
- Builds User-Item interaction matrix from interactions data
- Configuration block: ALGORITHM (als/lightfm/svd/bpr), NUM_FACTORS, NUM_ITERATIONS, REGULARIZATION, ALPHA, USE_ITEM_FEATURES, INTERACTION_WEIGHTING, MIN_USER/ITEM_INTERACTIONS
- For ALS: uses `implicit` library
- For LightFM: uses `lightfm` library with optional item features (hybrid mode)
- Cold-start fallback: users with <5 interactions get attribute-based + trending results
- Prints `METRIC: <NDCG@K value>`
- Must complete in <120 seconds on CPU
- **Minimum data gate**: if <10,000 interactions or <5,000 users, print `METRIC: INSUFFICIENT_DATA` and exit

### train_attribute.py
- Loads item catalogue via `shared.prepare`
- One-hot encodes categorical attributes, normalises numeric attributes
- Applies tenant-configured attribute weights from `shared.config`
- Computes cosine similarity between all item pairs
- Works from Day 0 with zero interaction data
- Prints `METRIC: <NDCG@K value>`
- Must complete in <30 seconds

### train_trending.py
- Computes time-decayed popularity scores on recent interactions
- Score(item) = Σ(weight × e^(-λ × age_in_hours))
- Configurable decay rate (λ)
- Optionally segmentable by item attribute (trending per category)
- Prints `METRIC: <NDCG@K value>`
- Must complete in <15 seconds

### serve.py — Unified Recommendation API
- FastAPI endpoint: `GET /v1/recommend`
- Parameters: `user_id` (optional), `item_id` (optional), `context` (homepage|item_page|post_conversion), `catalogue_id`, `limit` (default 10)
- Model selection logic:
  - Anonymous, no item context → Trending
  - Anonymous, viewing item → Attribute-based + Co-view
  - Identified, <5 interactions → Attribute-based + Trending
  - Identified, 5-50 interactions → Co-view + Attribute-based
  - Identified, 50+ interactions → Collaborative Filtering primary
  - Post-conversion → Co-purchase
- Loads pre-computed model artifacts from `models/` directory
- Caches in Redis: `reco:<model>:<item_id>` and `reco:user:<user_id>`
- Response: `{ items: [{id, score, model_source, explanation}], model_used: string }`

## Dependencies
```python
from shared.prepare import load_data, get_train_val_split
from shared.features import extract_features  # only for collaborative cold-start
from shared.eval import evaluate_recommendation
from shared.config import load_tenant_config
```

## Autoresearch Rules
- ONLY the `train_*.py` files are modified by the autoresearch agent
- serve.py is FIXED — the autoresearch agent never touches it
- Each train file must print `METRIC: <float>` as the last stdout line
- Each train file must save artifacts to `models/recommendations/<model_name>/<timestamp>/`
- Coverage check: if <20% of items ever get recommended, the experiment is auto-rejected

## Quality Bar
- All train files run independently: `python train_cooccurrence.py` works standalone
- All train files have ALL configuration values at the TOP of the file as named constants
- serve.py returns recommendations in <100ms for cached results, <500ms for cold cache
- Handle empty catalogues gracefully (return trending or empty list, not crash)
