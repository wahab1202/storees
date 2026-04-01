"""SaaS domain — event mappings + domain-specific feature computation.

Base features (~31) are computed generically using event_map.
SaaS extensions add ~16 features for feature adoption, subscription health,
team activity, trial behavior, and pricing intent.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..feature_registry import DomainConfig, DomainEventMap


SAAS_EVENT_MAP = DomainEventMap(
    purchase_events=["subscription_created", "subscription_renewed"],
    cart_events=["trial_started"],
    browse_events=["pricing_page_viewed", "feature_page_viewed"],
    session_events=["session_started", "app_login"],
    email_events=["email_opened"],
    pageview_events=["page_viewed", "dashboard_viewed"],
    channel_events={
        "email_open": ["email_opened"],
        "in_app": ["in_app_notification_clicked"],
    },
    custom_groups={
        "feature_used": ["feature_used"],
        "subscription_upgraded": ["subscription_upgraded"],
        "subscription_downgraded": ["subscription_downgraded"],
        "subscription_cancelled": ["subscription_cancelled"],
        "invite_sent": ["invite_sent"],
        "api_key_created": ["api_key_created"],
        "trial_started": ["trial_started"],
        "trial_expiring": ["trial_expiring"],
        "pricing_viewed": ["pricing_page_viewed"],
        "plan_compared": ["plan_compared"],
    },
)


SAAS_FEATURE_LABELS = {
    # Base features
    "days_since_last_event": "Days since last activity",
    "days_since_last_purchase": "Days since last subscription event",
    "days_since_last_session": "Days since last login",
    "days_since_last_email_open": "Days since last email open",
    "days_since_last_pageview": "Days since last page view",
    "total_events": "Total events",
    "total_sessions": "Total sessions",
    "total_purchases": "Subscription events",
    "total_emails_opened": "Emails opened",
    "distinct_active_days": "Active days",
    "events_per_week": "Events per week",
    "purchases_per_week": "Subscription events per week",
    "avg_events_per_session": "Events per session",
    "total_spent": "Total subscription value",
    "avg_order_value": "Avg subscription value",
    "max_order_value": "Max subscription value",
    "total_orders": "Total subscription count",
    "has_purchased": "Has subscribed",
    "purchase_ratio": "Subscription event ratio",
    "total_carts": "Trials started",
    "cart_to_purchase_ratio": "Trial-to-paid ratio",
    "days_since_first_seen": "Customer age (days)",
    "tenure_weeks": "Tenure (weeks)",
    # SaaS extensions
    "distinct_features_used": "Distinct features used",
    "feature_use_frequency": "Feature use frequency",
    "power_feature_ratio": "Power feature ratio",
    "days_since_last_feature_use": "Days since last feature use",
    "current_plan_tier": "Current plan tier",
    "days_on_current_plan": "Days on current plan",
    "upgrade_count": "Plan upgrades",
    "downgrade_count": "Plan downgrades",
    "invites_sent": "Team invites sent",
    "active_team_members": "Active team members",
    "api_keys_created": "API keys created",
    "is_in_trial": "In trial",
    "days_remaining_trial": "Trial days remaining",
    "trial_engagement_score": "Trial engagement score",
    "pricing_page_views": "Pricing page views",
    "plan_comparisons": "Plan comparisons",
}


def compute_saas_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_start_ts: pd.Timestamp,
) -> pd.DataFrame:
    """Compute SaaS-specific extension features on top of base features."""
    obs_days = max((cutoff_ts - obs_start_ts).days, 1)

    features = _compute_feature_adoption(features, events_df, cutoff_ts, obs_days)
    features = _compute_subscription_features(features, events_df, cutoff_ts, obs_days)
    features = _compute_team_features(features, events_df)
    features = _compute_trial_features(features, events_df, cutoff_ts, obs_days)
    features = _compute_pricing_intent_features(features, events_df)

    return features


def _compute_feature_adoption(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """Feature adoption: breadth, depth, recency of product feature usage."""
    feature_events = events_df[events_df["event_name"] == "feature_used"]

    if not feature_events.empty:
        grouped = feature_events.groupby("customer_id")
        weeks = max(obs_days / 7, 1)

        # Distinct features used
        def _count_distinct_features(props_series):
            feats = set()
            for props in props_series:
                if isinstance(props, dict):
                    fname = props.get("feature_name") or props.get("feature") or props.get("name")
                    if fname:
                        feats.add(str(fname))
            return len(feats)

        features["distinct_features_used"] = (
            grouped["properties"].apply(_count_distinct_features)
            .reindex(features.index).fillna(0)
        )

        features["feature_use_frequency"] = grouped.size().reindex(features.index).fillna(0) / weeks

        # Power feature ratio (features used > 3 times / total distinct features)
        def _power_ratio(props_series):
            from collections import Counter
            counts = Counter()
            for props in props_series:
                if isinstance(props, dict):
                    fname = props.get("feature_name") or props.get("feature") or props.get("name")
                    if fname:
                        counts[str(fname)] += 1
            total = len(counts)
            power = sum(1 for c in counts.values() if c > 3)
            return power / total if total > 0 else 0

        features["power_feature_ratio"] = (
            grouped["properties"].apply(_power_ratio)
            .reindex(features.index).fillna(0)
        )

        last_use = grouped["timestamp"].max()
        features["days_since_last_feature_use"] = (
            (cutoff_ts - last_use).dt.days.reindex(features.index).fillna(obs_days)
        )
    else:
        features["distinct_features_used"] = 0
        features["feature_use_frequency"] = 0
        features["power_feature_ratio"] = 0
        features["days_since_last_feature_use"] = obs_days

    return features


def _compute_subscription_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """Subscription: plan tier, tenure on plan, upgrades, downgrades."""
    sub_created = events_df[events_df["event_name"].isin(["subscription_created", "subscription_renewed"])]
    upgrades = events_df[events_df["event_name"] == "subscription_upgraded"]
    downgrades = events_df[events_df["event_name"] == "subscription_downgraded"]

    # Plan tier from most recent subscription event
    all_sub_events = pd.concat([
        sub_created,
        upgrades,
        downgrades,
    ]) if any(not df.empty for df in [sub_created, upgrades, downgrades]) else pd.DataFrame()

    if not all_sub_events.empty:
        # Get most recent subscription event per customer
        latest = all_sub_events.sort_values("timestamp").groupby("customer_id").last()

        def _extract_plan_tier(props):
            if isinstance(props, dict):
                plan = str(props.get("plan", "") or props.get("plan_name", "") or props.get("tier", "")).lower()
                tier_map = {"free": 0, "starter": 1, "basic": 1, "pro": 2, "professional": 2,
                            "business": 3, "enterprise": 4, "team": 2, "growth": 3}
                return tier_map.get(plan, 1)
            return 0

        features["current_plan_tier"] = (
            latest["properties"].apply(_extract_plan_tier)
            .reindex(features.index).fillna(0)
        )

        # Days on current plan
        features["days_on_current_plan"] = (
            (cutoff_ts - latest["timestamp"]).dt.days
            .reindex(features.index).fillna(obs_days)
        )
    else:
        features["current_plan_tier"] = 0
        features["days_on_current_plan"] = obs_days

    # Upgrade/downgrade counts
    features["upgrade_count"] = (
        upgrades.groupby("customer_id").size().reindex(features.index).fillna(0)
        if not upgrades.empty else 0
    )
    features["downgrade_count"] = (
        downgrades.groupby("customer_id").size().reindex(features.index).fillna(0)
        if not downgrades.empty else 0
    )

    return features


def _compute_team_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """Team activity: invites, members, API keys."""
    for event_name, feature_name in [
        ("invite_sent", "invites_sent"),
        ("api_key_created", "api_keys_created"),
    ]:
        filtered = events_df[events_df["event_name"] == event_name]
        if not filtered.empty:
            features[feature_name] = filtered.groupby("customer_id").size().reindex(features.index).fillna(0)
        else:
            features[feature_name] = 0

    # Active team members (from invite/member events properties)
    invite_events = events_df[events_df["event_name"] == "invite_sent"]
    if not invite_events.empty:
        def _count_members(props_series):
            members = set()
            for props in props_series:
                if isinstance(props, dict):
                    email = props.get("invitee_email") or props.get("email")
                    if email:
                        members.add(str(email))
            return len(members)

        features["active_team_members"] = (
            invite_events.groupby("customer_id")["properties"]
            .apply(_count_members)
            .reindex(features.index).fillna(0)
        )
    else:
        features["active_team_members"] = 0

    return features


def _compute_trial_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """Trial: status, days remaining, engagement during trial."""
    trial_starts = events_df[events_df["event_name"] == "trial_started"]
    trial_expiring = events_df[events_df["event_name"] == "trial_expiring"]
    sub_created = events_df[events_df["event_name"].isin(["subscription_created"])]

    if not trial_starts.empty:
        last_trial = trial_starts.sort_values("timestamp").groupby("customer_id").last()
        converted_cids = set(sub_created["customer_id"].unique()) if not sub_created.empty else set()

        trial_status = {}
        days_remaining = {}
        for cid in features.index:
            if cid in last_trial.index:
                trial_ts = last_trial.loc[cid, "timestamp"]
                # Default trial = 14 days
                props = last_trial.loc[cid, "properties"]
                trial_days = 14
                if isinstance(props, dict):
                    trial_days = int(props.get("trial_days", 14) or 14)
                trial_end = trial_ts + pd.Timedelta(days=trial_days)

                if cid in converted_cids:
                    trial_status[cid] = 0  # Converted
                    days_remaining[cid] = 0
                elif cutoff_ts < trial_end:
                    trial_status[cid] = 1  # In trial
                    days_remaining[cid] = max((trial_end - cutoff_ts).days, 0)
                else:
                    trial_status[cid] = 0  # Trial expired
                    days_remaining[cid] = 0
            else:
                trial_status[cid] = 0
                days_remaining[cid] = 0

        features["is_in_trial"] = pd.Series(trial_status).reindex(features.index).fillna(0)
        features["days_remaining_trial"] = pd.Series(days_remaining).reindex(features.index).fillna(0)

        # Trial engagement score: events during trial period / trial_days
        trial_engagement = {}
        for cid in features.index:
            if cid in last_trial.index:
                trial_ts = last_trial.loc[cid, "timestamp"]
                props = last_trial.loc[cid, "properties"]
                trial_days = 14
                if isinstance(props, dict):
                    trial_days = int(props.get("trial_days", 14) or 14)
                trial_end = min(trial_ts + pd.Timedelta(days=trial_days), cutoff_ts)
                trial_events = events_df[
                    (events_df["customer_id"] == cid)
                    & (events_df["timestamp"] >= trial_ts)
                    & (events_df["timestamp"] < trial_end)
                ]
                trial_engagement[cid] = len(trial_events) / max(trial_days, 1)
            else:
                trial_engagement[cid] = 0

        features["trial_engagement_score"] = pd.Series(trial_engagement).reindex(features.index).fillna(0)
    else:
        features["is_in_trial"] = 0
        features["days_remaining_trial"] = 0
        features["trial_engagement_score"] = 0

    return features


def _compute_pricing_intent_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """Pricing intent: page views, plan comparisons."""
    for event_name, feature_name in [
        ("pricing_page_viewed", "pricing_page_views"),
        ("plan_compared", "plan_comparisons"),
    ]:
        filtered = events_df[events_df["event_name"] == event_name]
        if not filtered.empty:
            features[feature_name] = filtered.groupby("customer_id").size().reindex(features.index).fillna(0)
        else:
            features[feature_name] = 0

    return features


SAAS_CONFIG = DomainConfig(
    domain="saas",
    event_map=SAAS_EVENT_MAP,
    feature_groups=[
        "recency", "frequency", "monetary", "conversion_signals", "cart_engagement",
        "lifecycle", "trend", "velocity", "temporal", "consistency",
        "feature_adoption", "subscription", "team", "trial", "pricing_intent",
    ],
    label_overrides={
        "dormancy": "no_events_in_window",
        "churn": "subscription_cancelled",
        "trial_expired": "trial_without_conversion",
    },
    feature_labels=SAAS_FEATURE_LABELS,
)
