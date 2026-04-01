"""Data extraction and temporal train/val split.
FROZEN infrastructure — do not modify without hash update."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
from sqlalchemy import create_engine, text

from .config import Config
from .feature_registry import get_domain_config


def extract_training_data(
    config: Config,
    project_id: str,
    target_event: str,
    observation_days: int = 90,
    prediction_days: int = 14,
    cutoff_date: Optional[datetime] = None,
    domain: str = "ecommerce",
) -> tuple[pd.DataFrame, pd.Series]:
    """Extract features and labels for propensity modeling.

    Timeline:
    |--- observation window ---|--- prediction window ---|
    ^                         ^                         ^
    obs_start              cutoff                    label_end

    Features computed from observation window only (no leakage).
    Labels: did the customer perform target_event in prediction window?

    Args:
        domain: Domain type for feature computation and label logic.
    """
    if cutoff_date is None:
        cutoff_date = datetime.utcnow() - timedelta(days=prediction_days)

    obs_start = cutoff_date - timedelta(days=observation_days)
    label_end = cutoff_date + timedelta(days=prediction_days)

    engine = create_engine(config.database_url)

    # Get all customers active in observation window
    customers_query = text("""
        SELECT DISTINCT c.id AS customer_id
        FROM customers c
        JOIN events e ON e.customer_id = c.id
        WHERE c.project_id = :project_id
          AND e.timestamp >= :obs_start
          AND e.timestamp < :cutoff
    """)

    with engine.connect() as conn:
        customers_df = pd.read_sql(
            customers_query,
            conn,
            params={
                "project_id": project_id,
                "obs_start": obs_start,
                "cutoff": cutoff_date,
            },
        )

    if customers_df.empty:
        return pd.DataFrame(), pd.Series(dtype=int)

    customer_ids = customers_df["customer_id"].tolist()

    # Extract features from observation window
    from .features import compute_features
    features_df = compute_features(config, project_id, customer_ids, obs_start, cutoff_date, domain=domain)

    # Compute labels — use domain label overrides for behavioral predictions
    domain_config = get_domain_config(domain)
    label_overrides = domain_config.label_overrides

    # Determine label strategy
    target_lower = target_event.lower()
    label_strategy = None
    for key, strategy in label_overrides.items():
        if key in target_lower or target_lower in key:
            label_strategy = strategy
            break

    # Also check the original hardcoded behavioral targets for backward compat
    is_behavioral_abandon = target_event in ("cart_abandoned", "cart_abandonment")
    is_dormancy = target_event in ("dormancy", "dormant", "inactive")

    if label_strategy == "no_events_in_window" or is_dormancy:
        # No events in prediction window = positive (dormancy/churn)
        positive_ids = _label_no_events_in_window(engine, project_id, customer_ids, cutoff_date, label_end, features_df)

    elif label_strategy == "cart_without_checkout" or is_behavioral_abandon:
        # Cart without checkout = positive (abandonment)
        positive_ids = _label_cart_without_checkout(engine, project_id, customer_ids, cutoff_date, label_end)

    elif label_strategy == "no_login_in_window":
        # No login in prediction window = positive (fintech churn)
        positive_ids = _label_no_login_in_window(engine, project_id, customer_ids, cutoff_date, label_end, features_df)

    elif label_strategy == "subscription_cancelled":
        # Subscription cancelled in prediction window = positive (SaaS churn)
        positive_ids = _label_standard_event(engine, project_id, customer_ids, "subscription_cancelled", cutoff_date, label_end)

    elif label_strategy == "trial_without_conversion":
        # Trial started but no subscription created = positive
        positive_ids = _label_trial_without_conversion(engine, project_id, customer_ids, cutoff_date, label_end)

    elif label_strategy == "standard_event":
        # Standard event lookup
        positive_ids = _label_standard_event(engine, project_id, customer_ids, target_event, cutoff_date, label_end)

    else:
        # Default: standard event lookup
        positive_ids = _label_standard_event(engine, project_id, customer_ids, target_event, cutoff_date, label_end)

    labels = features_df.index.map(lambda cid: 1 if cid in positive_ids else 0)

    return features_df, pd.Series(labels, index=features_df.index, name="label")


def _label_no_events_in_window(engine, project_id, customer_ids, cutoff_date, label_end, features_df):
    """Dormancy/churn: was active in observation window but had NO events in prediction window."""
    with engine.connect() as conn:
        active_in_pred_df = pd.read_sql(
            text("""
                SELECT DISTINCT customer_id
                FROM events
                WHERE project_id = :project_id
                  AND customer_id = ANY(CAST(:customer_ids AS uuid[]))
                  AND timestamp >= :cutoff
                  AND timestamp < :label_end
            """),
            conn,
            params={
                "project_id": project_id,
                "customer_ids": customer_ids,
                "cutoff": cutoff_date,
                "label_end": label_end,
            },
        )
    active_ids = set(active_in_pred_df["customer_id"].tolist())
    return set(features_df.index) - active_ids


def _label_cart_without_checkout(engine, project_id, customer_ids, cutoff_date, label_end):
    """Cart abandonment: added to cart but didn't complete checkout."""
    with engine.connect() as conn:
        carted_df = pd.read_sql(
            text("""
                SELECT DISTINCT customer_id
                FROM events
                WHERE project_id = :project_id
                  AND customer_id = ANY(CAST(:customer_ids AS uuid[]))
                  AND event_name = 'add_to_cart'
                  AND timestamp >= :cutoff
                  AND timestamp < :label_end
            """),
            conn,
            params={
                "project_id": project_id,
                "customer_ids": customer_ids,
                "cutoff": cutoff_date,
                "label_end": label_end,
            },
        )
        completed_df = pd.read_sql(
            text("""
                SELECT DISTINCT customer_id
                FROM events
                WHERE project_id = :project_id
                  AND customer_id = ANY(CAST(:customer_ids AS uuid[]))
                  AND event_name IN ('checkout_completed', 'order_completed')
                  AND timestamp >= :cutoff
                  AND timestamp < :label_end
            """),
            conn,
            params={
                "project_id": project_id,
                "customer_ids": customer_ids,
                "cutoff": cutoff_date,
                "label_end": label_end,
            },
        )
    carted_ids = set(carted_df["customer_id"].tolist())
    completed_ids = set(completed_df["customer_id"].tolist())
    return carted_ids - completed_ids


def _label_no_login_in_window(engine, project_id, customer_ids, cutoff_date, label_end, features_df):
    """Fintech churn: no app_login in prediction window."""
    with engine.connect() as conn:
        logged_in_df = pd.read_sql(
            text("""
                SELECT DISTINCT customer_id
                FROM events
                WHERE project_id = :project_id
                  AND customer_id = ANY(CAST(:customer_ids AS uuid[]))
                  AND event_name = 'app_login'
                  AND timestamp >= :cutoff
                  AND timestamp < :label_end
            """),
            conn,
            params={
                "project_id": project_id,
                "customer_ids": customer_ids,
                "cutoff": cutoff_date,
                "label_end": label_end,
            },
        )
    logged_in_ids = set(logged_in_df["customer_id"].tolist())
    return set(features_df.index) - logged_in_ids


def _label_trial_without_conversion(engine, project_id, customer_ids, cutoff_date, label_end):
    """SaaS trial churn: trial_started but no subscription_created."""
    with engine.connect() as conn:
        trialed_df = pd.read_sql(
            text("""
                SELECT DISTINCT customer_id
                FROM events
                WHERE project_id = :project_id
                  AND customer_id = ANY(CAST(:customer_ids AS uuid[]))
                  AND event_name = 'trial_started'
                  AND timestamp >= :cutoff
                  AND timestamp < :label_end
            """),
            conn,
            params={
                "project_id": project_id,
                "customer_ids": customer_ids,
                "cutoff": cutoff_date,
                "label_end": label_end,
            },
        )
        subscribed_df = pd.read_sql(
            text("""
                SELECT DISTINCT customer_id
                FROM events
                WHERE project_id = :project_id
                  AND customer_id = ANY(CAST(:customer_ids AS uuid[]))
                  AND event_name = 'subscription_created'
                  AND timestamp >= :cutoff
                  AND timestamp < :label_end
            """),
            conn,
            params={
                "project_id": project_id,
                "customer_ids": customer_ids,
                "cutoff": cutoff_date,
                "label_end": label_end,
            },
        )
    trialed_ids = set(trialed_df["customer_id"].tolist())
    subscribed_ids = set(subscribed_df["customer_id"].tolist())
    return trialed_ids - subscribed_ids


def _label_standard_event(engine, project_id, customer_ids, target_event, cutoff_date, label_end):
    """Standard: customer performed target_event in prediction window."""
    with engine.connect() as conn:
        positive_df = pd.read_sql(
            text("""
                SELECT DISTINCT customer_id
                FROM events
                WHERE project_id = :project_id
                  AND customer_id = ANY(CAST(:customer_ids AS uuid[]))
                  AND event_name = :target_event
                  AND timestamp >= :cutoff
                  AND timestamp < :label_end
            """),
            conn,
            params={
                "project_id": project_id,
                "customer_ids": customer_ids,
                "target_event": target_event,
                "cutoff": cutoff_date,
                "label_end": label_end,
            },
        )
    return set(positive_df["customer_id"].tolist())


def temporal_split(
    features: pd.DataFrame,
    labels: pd.Series,
    val_ratio: float = 0.2,
) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series]:
    """Fallback random split — only used when walk-forward validation has insufficient data.

    The primary validation strategy is walk-forward (out-of-time) in train_propensity.py.
    This random split is kept as a fallback when the validation time window has too few
    positive labels to evaluate reliably.
    """
    from sklearn.model_selection import train_test_split

    X_train, X_val, y_train, y_val = train_test_split(
        features, labels, test_size=val_ratio, random_state=42, stratify=labels
    )
    return X_train, y_train, X_val, y_val
