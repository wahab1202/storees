"""Tenant configuration loader."""

from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    database_url: str
    model_dir: str
    domain: str = "ecommerce"
    min_positive_labels: int = 200
    max_auc_threshold: float = 0.995  # Hard fail — near-certain leakage
    min_coverage: float = 0.20
    max_brier: float = 0.25
    default_observation_days: int = 90
    default_prediction_days: int = 14


def load_config() -> Config:
    return Config(
        database_url=os.environ["DATABASE_URL"],
        model_dir=os.environ.get("MODEL_DIR", "models"),
        domain=os.environ.get("DOMAIN", "ecommerce"),
        min_positive_labels=int(os.environ.get("MIN_POSITIVE_LABELS", "200")),
    )
