# Skill: ML Serving

## When to Use
Invoke this skill when building or modifying any `serve.py` file or the ML proxy service.

## Architecture
```
Storees Frontend → Storees Backend (Node.js) → ML Proxy Service → FastAPI (Python)
                                                                     ↓
                                                               Model Artifacts
                                                               Redis Cache
```

## FastAPI Service Structure
```python
# packages/ml/api.py — main FastAPI app
from fastapi import FastAPI
app = FastAPI(title="Storees ML API", version="1.0")

# Mount each model's router
from recommendations.serve import router as reco_router
from propensity.serve import router as propensity_router
from affinity.serve import router as affinity_router
from bts.serve import router as bts_router
from nba.serve import router as nba_router

app.include_router(reco_router, prefix="/v1")
app.include_router(propensity_router, prefix="/v1")
app.include_router(affinity_router, prefix="/v1")
app.include_router(bts_router, prefix="/v1")
app.include_router(nba_router, prefix="/v1")
```

## Model Loading Pattern
```python
import pickle
from pathlib import Path

MODEL_DIR = Path("models/<model_name>/latest")

# Load once at startup, not per request
_model = None

def get_model():
    global _model
    if _model is None:
        with open(MODEL_DIR / "model.pkl", "rb") as f:
            _model = pickle.load(f)
    return _model

# Reload when new model is promoted
@router.post("/v1/<model>/reload")
async def reload_model():
    global _model
    _model = None  # Force reload on next request
    return {"status": "reloaded"}
```

## Redis Caching Pattern
```python
import redis
import json

r = redis.from_url(os.environ["REDIS_URL"])

# Cache recommendations: TTL 1 hour
def get_cached_recommendations(user_id: str):
    key = f"reco:user:{user_id}"
    cached = r.get(key)
    if cached:
        return json.loads(cached)
    return None

def set_cached_recommendations(user_id: str, items: list):
    key = f"reco:user:{user_id}"
    r.setex(key, 3600, json.dumps(items))  # 1 hour TTL

# Cache propensity scores: TTL 24 hours
# Cache BTS: TTL 7 days (refreshed weekly)
# Cache affinity clusters: TTL 7 days
# NBA state: NO TTL (updated on each outcome)
```

## Response Format Convention
All ML API responses follow this structure:
```python
{
    "success": True,
    "data": { ... },           # Model output
    "metadata": {
        "model": "collaborative_filtering",
        "model_version": "20260325_023412",
        "latency_ms": 23,
        "cache_hit": True
    }
}
```

## Error Handling
```python
from fastapi import HTTPException

# Model not trained yet
if not MODEL_DIR.exists():
    raise HTTPException(status_code=503, detail={
        "error": "model_not_ready",
        "message": "Model has not been trained yet. Insufficient data.",
        "required": "200+ positive labels",
        "current": 87
    })

# Model loading failure
try:
    model = get_model()
except Exception as e:
    raise HTTPException(status_code=500, detail={
        "error": "model_load_failure",
        "message": str(e)
    })
```

## Performance Targets
| Endpoint | Cached | Uncached | Batch (1000 users) |
|---|---|---|---|
| /v1/recommend | <50ms | <200ms | <2s |
| /v1/propensity/score | <50ms | <300ms | <5s |
| /v1/affinity/assign | <30ms | <100ms | <2s |
| /v1/bts/best-time | <20ms | <50ms | <1s |
| /v1/nba/select-action | <30ms | <50ms | n/a (per-request) |

## ML Proxy Service (Node.js side)
```typescript
// packages/backend/src/services/mlProxyService.ts
const ML_API_URL = process.env.ML_API_URL || 'http://localhost:8000';

async function callMLAPI<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
  
  try {
    const res = await fetch(`${ML_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    if (!res.ok) throw new Error(`ML API error: ${res.status}`);
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('ML API timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
```
