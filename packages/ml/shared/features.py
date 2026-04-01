"""Generic feature extraction — base features + domain-specific extensions.
FROZEN infrastructure — do not modify without hash update.

Base features (~31) are computed from the observation window only using
domain event mappings. Domain-specific extensions add 14-18 more features.

cutoff_date is strictly enforced to prevent data leakage.

Base feature groups:
- Recency (5): days since last event, last purchase, last session, last email open, last pageview
- Frequency (8): total events, sessions, purchases, emails opened, distinct days active, events per week, purchases per week, avg events per session
- Intensity (4): total spent, avg order value, max order value, total orders
- Conversion Signals (3): has_purchased, purchase_ratio, cart_to_purchase_ratio
- Cart Engagement (2): total carts, total abandoned
- Lifecycle (2): days since first seen, tenure weeks
- Engagement Trend (6): events 7d/prev/trend, events 30d/prev/trend
- Purchase Velocity (5): avg days between purchases, regularity, days since expected order, acceleration, is repeat buyer
- Temporal Rhythm (3): weekend ratio, business hours ratio, preferred day of week
- Engagement Consistency (2): avg events per active day, longest inactive streak

Domain extensions:
- Ecommerce (+21): browse intent, session quality, wishlist, channel, checkout friction, post-purchase
- Fintech (+18): transaction behavior, EMI health, loan engagement, app activity, risk signals
- SaaS (+16): feature adoption, subscription, team, trial, pricing intent
- EdTech (+20): learning progress, enrollment patterns, completion health, certificates, course properties
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text

from .config import Config
from .feature_registry import get_domain_config, DomainEventMap


def _compute_velocity_features(
    features: pd.DataFrame,
    purchase_events: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """Purchase velocity: inter-purchase intervals, regularity, overdue signal."""
    if purchase_events.empty:
        features["avg_days_between_purchases"] = float(obs_days)
        features["purchase_regularity"] = 0.0
        features["days_since_expected_order"] = 0.0
        features["purchase_acceleration"] = 1.0
        features["is_repeat_buyer"] = 0
        return features

    # Per-customer sorted purchase timestamps
    purchase_times = (
        purchase_events.sort_values("timestamp")
        .groupby("customer_id")["timestamp"]
        .apply(list)
    )

    records = []
    for cid in features.index:
        if cid not in purchase_times.index:
            records.append({
                "customer_id": cid,
                "avg_days_between_purchases": float(obs_days),
                "purchase_regularity": 0.0,
                "days_since_expected_order": 0.0,
                "purchase_acceleration": 1.0,
                "is_repeat_buyer": 0,
            })
            continue

        times = purchase_times[cid]
        n = len(times)

        if n < 2:
            records.append({
                "customer_id": cid,
                "avg_days_between_purchases": float(obs_days),
                "purchase_regularity": 0.0,
                "days_since_expected_order": 0.0,
                "purchase_acceleration": 1.0,
                "is_repeat_buyer": 0,
            })
            continue

        # Compute inter-purchase intervals in days
        intervals = [(times[i + 1] - times[i]).total_seconds() / 86400.0 for i in range(n - 1)]
        avg_interval = np.mean(intervals)
        std_interval = np.std(intervals) if len(intervals) > 1 else 0.0
        last_interval = intervals[-1]
        days_since_last = (cutoff_ts - times[-1]).total_seconds() / 86400.0
        expected_gap = days_since_last - avg_interval  # positive = overdue

        records.append({
            "customer_id": cid,
            "avg_days_between_purchases": avg_interval,
            "purchase_regularity": std_interval,
            "days_since_expected_order": max(expected_gap, 0.0),
            "purchase_acceleration": last_interval / max(avg_interval, 0.1),
            "is_repeat_buyer": 1,
        })

    vel_df = pd.DataFrame(records).set_index("customer_id")
    for col in vel_df.columns:
        features[col] = vel_df[col].reindex(features.index).fillna(0)
    return features


def _compute_temporal_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """Temporal rhythm: day-of-week, business hours, weekend patterns."""
    if events_df.empty:
        features["weekend_ratio"] = 0.0
        features["business_hours_ratio"] = 0.0
        features["preferred_day_of_week"] = 0
        return features

    events_df = events_df.copy()
    events_df["dow"] = events_df["timestamp"].dt.dayofweek  # 0=Mon, 6=Sun
    events_df["hour"] = events_df["timestamp"].dt.hour
    events_df["is_weekend"] = events_df["dow"].isin([5, 6]).astype(int)
    events_df["is_business_hours"] = ((events_df["hour"] >= 9) & (events_df["hour"] < 18)).astype(int)

    grouped = events_df.groupby("customer_id")
    features["weekend_ratio"] = grouped["is_weekend"].mean().reindex(features.index).fillna(0)
    features["business_hours_ratio"] = grouped["is_business_hours"].mean().reindex(features.index).fillna(0)
    features["preferred_day_of_week"] = (
        grouped["dow"]
        .agg(lambda x: x.mode().iloc[0] if len(x) > 0 else 0)
        .reindex(features.index)
        .fillna(0)
    )
    return features


def _compute_consistency_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    obs_start_ts: pd.Timestamp,
    cutoff_ts: pd.Timestamp,
) -> pd.DataFrame:
    """Engagement consistency: depth per active day, longest inactive streak."""
    # avg_events_per_active_day (reuses existing features)
    features["avg_events_per_active_day"] = np.where(
        features["distinct_active_days"] > 0,
        features["total_events"] / features["distinct_active_days"],
        0,
    )

    if events_df.empty:
        features["longest_inactive_streak"] = (cutoff_ts - obs_start_ts).days
        return features

    # Compute longest inactive streak per customer
    obs_days = (cutoff_ts - obs_start_ts).days
    all_dates = pd.date_range(obs_start_ts.date(), periods=max(obs_days, 1), freq="D")

    # Build a set of active dates per customer
    events_copy = events_df.copy()
    events_copy["date"] = events_copy["timestamp"].dt.date

    active_dates = events_copy.groupby("customer_id")["date"].apply(set)

    streaks = {}
    for cid in features.index:
        if cid not in active_dates.index:
            streaks[cid] = obs_days
            continue
        cust_dates = active_dates[cid]
        max_streak = 0
        current_streak = 0
        for d in all_dates:
            if d.date() in cust_dates:
                current_streak = 0
            else:
                current_streak += 1
                max_streak = max(max_streak, current_streak)
        streaks[cid] = max_streak

    features["longest_inactive_streak"] = pd.Series(streaks).reindex(features.index).fillna(obs_days)
    return features


def compute_features(
    config: Config,
    project_id: str,
    customer_ids: list[str],
    obs_start: datetime,
    cutoff_date: datetime,
    domain: str = "ecommerce",
) -> pd.DataFrame:
    """Compute all feature groups for given customers within observation window.

    Args:
        domain: Domain type ("ecommerce", "fintech", "saas"). Determines which
                event mappings and domain-specific extensions to use.
    """
    domain_config = get_domain_config(domain)
    event_map = domain_config.event_map

    engine = create_engine(config.database_url)

    with engine.connect() as conn:
        # Fetch all events in observation window for these customers
        events_query = text("""
            SELECT
                customer_id,
                event_name,
                timestamp,
                properties
            FROM events
            WHERE project_id = :project_id
              AND customer_id = ANY(CAST(:customer_ids AS uuid[]))
              AND timestamp >= :obs_start
              AND timestamp < :cutoff
            ORDER BY customer_id, timestamp
        """)

        events_df = pd.read_sql(
            events_query,
            conn,
            params={
                "project_id": project_id,
                "customer_ids": customer_ids,
                "obs_start": obs_start,
                "cutoff": cutoff_date,
            },
        )

        # Fetch customer metadata (only lifecycle fields — monetary comes from events)
        customers_query = text("""
            SELECT
                id AS customer_id,
                first_seen,
                last_seen
            FROM customers
            WHERE project_id = :project_id
              AND id = ANY(CAST(:customer_ids AS uuid[]))
        """)

        customers_df = pd.read_sql(
            customers_query,
            conn,
            params={
                "project_id": project_id,
                "customer_ids": customer_ids,
            },
        )

    customers_df = customers_df.set_index("customer_id")

    if events_df.empty:
        # Return empty feature frame with correct index
        return pd.DataFrame(index=customers_df.index)

    # Convert timestamps
    events_df["timestamp"] = pd.to_datetime(events_df["timestamp"], utc=True)
    cutoff_ts = pd.Timestamp(cutoff_date).tz_localize("UTC") if pd.Timestamp(cutoff_date).tz is None else pd.Timestamp(cutoff_date)
    obs_start_ts = pd.Timestamp(obs_start).tz_localize("UTC") if pd.Timestamp(obs_start).tz is None else pd.Timestamp(obs_start)
    obs_days = max((cutoff_ts - obs_start_ts).days, 1)

    features = pd.DataFrame(index=customers_df.index)

    # Group events by customer
    grouped = events_df.groupby("customer_id")

    # ---- RECENCY FEATURES (using domain event_map) ----
    last_event = grouped["timestamp"].max()
    features["days_since_last_event"] = (cutoff_ts - last_event).dt.days.reindex(features.index).fillna(obs_days)

    purchase_events = events_df[events_df["event_name"].isin(event_map.purchase_events)]
    if not purchase_events.empty:
        last_purchase = purchase_events.groupby("customer_id")["timestamp"].max()
        features["days_since_last_purchase"] = (cutoff_ts - last_purchase).dt.days.reindex(features.index).fillna(obs_days)
    else:
        features["days_since_last_purchase"] = obs_days

    session_events = events_df[events_df["event_name"].isin(event_map.session_events)]
    if not session_events.empty:
        last_session = session_events.groupby("customer_id")["timestamp"].max()
        features["days_since_last_session"] = (cutoff_ts - last_session).dt.days.reindex(features.index).fillna(obs_days)
    else:
        features["days_since_last_session"] = obs_days

    email_events = events_df[events_df["event_name"].isin(event_map.email_events)]
    if not email_events.empty:
        last_email = email_events.groupby("customer_id")["timestamp"].max()
        features["days_since_last_email_open"] = (cutoff_ts - last_email).dt.days.reindex(features.index).fillna(obs_days)
    else:
        features["days_since_last_email_open"] = obs_days

    pageview_events = events_df[events_df["event_name"].isin(event_map.pageview_events)]
    if not pageview_events.empty:
        last_pageview = pageview_events.groupby("customer_id")["timestamp"].max()
        features["days_since_last_pageview"] = (cutoff_ts - last_pageview).dt.days.reindex(features.index).fillna(obs_days)
    else:
        features["days_since_last_pageview"] = obs_days

    # ---- FREQUENCY FEATURES ----
    features["total_events"] = grouped.size().reindex(features.index).fillna(0)
    features["total_sessions"] = session_events.groupby("customer_id").size().reindex(features.index).fillna(0) if not session_events.empty else 0
    features["total_purchases"] = purchase_events.groupby("customer_id").size().reindex(features.index).fillna(0) if not purchase_events.empty else 0
    features["total_emails_opened"] = email_events.groupby("customer_id").size().reindex(features.index).fillna(0) if not email_events.empty else 0

    distinct_days = grouped["timestamp"].apply(lambda x: x.dt.date.nunique())
    features["distinct_active_days"] = distinct_days.reindex(features.index).fillna(0)

    weeks = max(obs_days / 7, 1)
    features["events_per_week"] = features["total_events"] / weeks
    features["purchases_per_week"] = features["total_purchases"] / weeks
    features["avg_events_per_session"] = np.where(
        features["total_sessions"] > 0,
        features["total_events"] / features["total_sessions"],
        0,
    )

    # ---- INTENSITY / MONETARY FEATURES (from observation window events only) ----
    # Extract order totals from event properties to avoid leakage from cumulative customer fields
    if not purchase_events.empty:
        def _extract_order_total(props):
            if isinstance(props, dict):
                return float(props.get("order_total", 0) or props.get("total", 0) or props.get("amount", 0) or 0)
            return 0.0

        purchase_events = purchase_events.copy()
        purchase_events["order_total"] = purchase_events["properties"].apply(_extract_order_total)
        obs_purchase_stats = purchase_events.groupby("customer_id").agg(
            obs_total_spent=("order_total", "sum"),
            obs_avg_order_value=("order_total", "mean"),
            obs_max_order_value=("order_total", "max"),
            obs_order_count=("order_total", "count"),
        )
        features["total_spent"] = obs_purchase_stats["obs_total_spent"].reindex(features.index).fillna(0)
        features["avg_order_value"] = obs_purchase_stats["obs_avg_order_value"].reindex(features.index).fillna(0)
        features["max_order_value"] = obs_purchase_stats["obs_max_order_value"].reindex(features.index).fillna(0)
        features["total_orders"] = obs_purchase_stats["obs_order_count"].reindex(features.index).fillna(0)
    else:
        features["total_spent"] = 0
        features["avg_order_value"] = 0
        features["max_order_value"] = 0
        features["total_orders"] = 0

    # ---- CONVERSION SIGNAL FEATURES ----
    features["has_purchased"] = (features["total_orders"] > 0).astype(int)
    features["purchase_ratio"] = np.where(
        features["total_events"] > 0,
        features["total_purchases"] / features["total_events"],
        0,
    )

    # Cart/intent engagement
    cart_events = events_df[events_df["event_name"].isin(event_map.cart_events)]
    features["total_carts"] = cart_events.groupby("customer_id").size().reindex(features.index).fillna(0) if not cart_events.empty else 0
    features["cart_to_purchase_ratio"] = np.where(
        features["total_carts"] > 0,
        features["total_orders"] / features["total_carts"],
        0,
    )

    # ---- LIFECYCLE FEATURES ----
    first_seen = pd.to_datetime(customers_df["first_seen"], utc=True)
    features["days_since_first_seen"] = (cutoff_ts - first_seen).dt.days.reindex(features.index).fillna(0)
    features["tenure_weeks"] = features["days_since_first_seen"] / 7

    # ---- ENGAGEMENT TREND FEATURES ----
    cutoff_7d = cutoff_ts - pd.Timedelta(days=7)
    cutoff_14d = cutoff_ts - pd.Timedelta(days=14)
    cutoff_30d = cutoff_ts - pd.Timedelta(days=30)
    cutoff_60d = cutoff_ts - pd.Timedelta(days=60)

    recent_7d = events_df[events_df["timestamp"] >= cutoff_7d].groupby("customer_id").size()
    prev_7d = events_df[(events_df["timestamp"] >= cutoff_14d) & (events_df["timestamp"] < cutoff_7d)].groupby("customer_id").size()
    features["events_7d"] = recent_7d.reindex(features.index).fillna(0)
    features["events_prev_7d"] = prev_7d.reindex(features.index).fillna(0)
    features["event_trend_7d"] = features["events_7d"] - features["events_prev_7d"]

    recent_30d = events_df[events_df["timestamp"] >= cutoff_30d].groupby("customer_id").size()
    prev_30d = events_df[(events_df["timestamp"] >= cutoff_60d) & (events_df["timestamp"] < cutoff_30d)].groupby("customer_id").size()
    features["events_30d"] = recent_30d.reindex(features.index).fillna(0)
    features["events_prev_30d"] = prev_30d.reindex(features.index).fillna(0)
    features["event_trend_30d"] = features["events_30d"] - features["events_prev_30d"]

    # ---- PURCHASE VELOCITY FEATURES ----
    features = _compute_velocity_features(features, purchase_events, cutoff_ts, obs_days)

    # ---- TEMPORAL RHYTHM FEATURES ----
    features = _compute_temporal_features(features, events_df)

    # ---- ENGAGEMENT CONSISTENCY FEATURES ----
    features = _compute_consistency_features(features, events_df, obs_start_ts, cutoff_ts)

    # ---- DOMAIN-SPECIFIC EXTENSION FEATURES ----
    if domain == "ecommerce":
        from .domains.ecommerce import compute_ecommerce_features
        features = compute_ecommerce_features(features, events_df, cutoff_ts, obs_start_ts)
    elif domain == "fintech":
        from .domains.fintech import compute_fintech_features
        features = compute_fintech_features(features, events_df, cutoff_ts, obs_start_ts)
    elif domain == "saas":
        from .domains.saas import compute_saas_features
        features = compute_saas_features(features, events_df, cutoff_ts, obs_start_ts)
    elif domain == "edtech":
        from .domains.edtech import compute_edtech_features
        features = compute_edtech_features(features, events_df, cutoff_ts, obs_start_ts)

    # Fill any remaining NaNs
    features = features.fillna(0)

    return features
