"""Main FastAPI app that combines all ML service endpoints."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from propensity.serve import app as propensity_app
from recommendations.serve import app as recommendations_app

app = FastAPI(title="Storees ML Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount sub-services
app.mount("/propensity", propensity_app)
app.mount("/recommendations", recommendations_app)


@app.get("/health")
def health():
    from datetime import datetime
    return {"status": "ok", "service": "storees-ml", "timestamp": datetime.utcnow().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
