"""Ecommerce domain — event mappings + domain-specific feature computation.

Base features (~31) are computed generically using event_map.
Ecommerce extensions add ~14 features for browse intent, session quality,
wishlist, channel engagement, checkout friction, and post-purchase behavior.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..feature_registry import DomainConfig, DomainEventMap


ECOMMERCE_EVENT_MAP = DomainEventMap(
    purchase_events=["order_completed", "checkout_completed"],
    cart_events=["add_to_cart"],
    browse_events=["product_viewed", "collection_viewed"],
    session_events=["session_started"],
    email_events=["email_opened"],
    pageview_events=["page_viewed", "product_viewed"],
    channel_events={
        "email_open": ["email_opened"],
        "email_click": ["email_clicked"],
        "push": ["push_opened", "push_clicked"],
    },
    custom_groups={
        "search": ["search_performed"],
        "wishlist": ["added_to_wishlist"],
        "checkout_start": ["checkout_started"],
        "review": ["product_reviewed"],
        "return": ["return_initiated"],
        "session_end": ["session_ended"],
        "share": ["product_shared"],
    },
)


ECOMMERCE_FEATURE_LABELS = {
    # Base features (computed by features.py)
    "days_since_last_event": "Days since last activity",
    "days_since_last_purchase": "Days since last purchase",
    "days_since_last_session": "Days since last session",
    "days_since_last_email_open": "Days since last email open",
    "days_since_last_pageview": "Days since last page view",
    "total_events": "Total events",
    "total_sessions": "Total sessions",
    "total_purchases": "Total purchases",
    "total_emails_opened": "Emails opened",
    "distinct_active_days": "Active days",
    "events_per_week": "Events per week",
    "purchases_per_week": "Purchases per week",
    "avg_events_per_session": "Events per session",
    "total_spent": "Total spent",
    "avg_order_value": "Average order value",
    "max_order_value": "Max order value",
    "total_orders": "Total orders",
    "has_purchased": "Has purchased",
    "purchase_ratio": "Purchase event ratio",
    "total_carts": "Cart additions",
    "cart_to_purchase_ratio": "Cart-to-purchase ratio",
    "days_since_first_seen": "Customer age (days)",
    "tenure_weeks": "Tenure (weeks)",
    "events_7d": "Events last 7 days",
    "events_prev_7d": "Events prev 7 days",
    "event_trend_7d": "7-day event trend",
    "events_30d": "Events last 30 days",
    "events_prev_30d": "Events prev 30 days",
    "event_trend_30d": "30-day event trend",
    "avg_days_between_purchases": "Avg days between purchases",
    "purchase_regularity": "Purchase regularity",
    "days_since_expected_order": "Days past expected order",
    "purchase_acceleration": "Purchase acceleration",
    "is_repeat_buyer": "Is repeat buyer",
    "weekend_ratio": "Weekend activity ratio",
    "business_hours_ratio": "Business hours ratio",
    "preferred_day_of_week": "Preferred day of week",
    "avg_events_per_active_day": "Events per active day",
    "longest_inactive_streak": "Longest inactive streak",
    # Ecommerce extensions
    "total_product_views": "Product views",
    "distinct_products_viewed": "Distinct products viewed",
    "distinct_categories_viewed": "Categories browsed",
    "view_to_cart_ratio": "View-to-cart ratio",
    "browse_without_buy_ratio": "Browse-without-buy ratio",
    "search_frequency": "Searches performed",
    "avg_session_duration_mins": "Avg session duration (min)",
    "avg_pages_per_session": "Pages per session",
    "session_frequency": "Sessions per week",
    "bounce_rate": "Bounce rate",
    "wishlist_adds": "Wishlist additions",
    "wishlist_to_purchase_ratio": "Wishlist-to-purchase ratio",
    "days_since_last_wishlist": "Days since last wishlist add",
    "email_open_rate": "Email open rate",
    "email_click_rate": "Email click rate",
    "push_response_rate": "Push response rate",
    "multi_channel_engaged": "Multi-channel engaged",
    "checkout_abandon_rate": "Checkout abandon rate",
    "checkout_starts_per_purchase": "Checkout starts per purchase",
    "review_rate": "Review rate",
    "return_rate": "Return rate",
    "product_shares": "Products shared",
}


def compute_ecommerce_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_start_ts: pd.Timestamp,
) -> pd.DataFrame:
    """Compute ecommerce-specific extension features on top of base features."""
    obs_days = max((cutoff_ts - obs_start_ts).days, 1)

    features = _compute_browse_features(features, events_df, obs_days)
    features = _compute_session_quality_features(features, events_df, obs_days)
    features = _compute_wishlist_features(features, events_df, cutoff_ts, obs_days)
    features = _compute_channel_features(features, events_df)
    features = _compute_checkout_friction_features(features, events_df)
    features = _compute_post_purchase_features(features, events_df)

    return features


def _compute_browse_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    obs_days: int,
) -> pd.DataFrame:
    """Browse intent: product views, category exploration, search behavior."""
    product_views = events_df[events_df["event_name"] == "product_viewed"]
    collection_views = events_df[events_df["event_name"] == "collection_viewed"]
    searches = events_df[events_df["event_name"] == "search_performed"]

    if not product_views.empty:
        pv_grouped = product_views.groupby("customer_id")
        features["total_product_views"] = pv_grouped.size().reindex(features.index).fillna(0)

        def _count_distinct_products(props_series):
            ids = set()
            for props in props_series:
                if isinstance(props, dict):
                    pid = props.get("product_id") or props.get("productId")
                    if pid:
                        ids.add(str(pid))
            return len(ids)

        features["distinct_products_viewed"] = (
            pv_grouped["properties"]
            .apply(_count_distinct_products)
            .reindex(features.index)
            .fillna(0)
        )
    else:
        features["total_product_views"] = 0
        features["distinct_products_viewed"] = 0

    # Distinct categories from both product_viewed and collection_viewed
    browse_events = pd.concat([product_views, collection_views]) if not collection_views.empty else product_views
    if not browse_events.empty:
        def _count_distinct_categories(props_series):
            cats = set()
            for props in props_series:
                if isinstance(props, dict):
                    cat = props.get("category") or props.get("collection") or props.get("collection_title")
                    if cat:
                        cats.add(str(cat))
            return len(cats)

        features["distinct_categories_viewed"] = (
            browse_events.groupby("customer_id")["properties"]
            .apply(_count_distinct_categories)
            .reindex(features.index)
            .fillna(0)
        )
    else:
        features["distinct_categories_viewed"] = 0

    # View-to-cart ratio
    features["view_to_cart_ratio"] = np.where(
        features["total_product_views"] > 0,
        features["total_carts"] / features["total_product_views"],
        0,
    )

    # Browse without buy: customers who viewed but didn't purchase
    features["browse_without_buy_ratio"] = np.where(
        features["total_product_views"] > 0,
        1 - np.minimum(features["total_orders"] / features["total_product_views"], 1),
        0,
    )

    # Search frequency
    if not searches.empty:
        features["search_frequency"] = searches.groupby("customer_id").size().reindex(features.index).fillna(0)
    else:
        features["search_frequency"] = 0

    # Product shares (social intent signal)
    shares = events_df[events_df["event_name"] == "product_shared"]
    if not shares.empty:
        features["product_shares"] = shares.groupby("customer_id").size().reindex(features.index).fillna(0)
    else:
        features["product_shares"] = 0

    return features


def _compute_session_quality_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    obs_days: int,
) -> pd.DataFrame:
    """Session quality: duration, pages per session, frequency, bounce rate."""
    session_starts = events_df[events_df["event_name"] == "session_started"]
    session_ends = events_df[events_df["event_name"] == "session_ended"]
    page_events = events_df[events_df["event_name"].isin(["page_viewed", "product_viewed"])]

    # Session duration (from session_started → session_ended pairs)
    if not session_starts.empty and not session_ends.empty:
        starts = session_starts.sort_values("timestamp").groupby("customer_id")["timestamp"].apply(list)
        ends = session_ends.sort_values("timestamp").groupby("customer_id")["timestamp"].apply(list)

        durations = {}
        for cid in features.index:
            if cid in starts.index and cid in ends.index:
                s_list = starts[cid]
                e_list = ends[cid]
                # Pair each start with next end
                session_durs = []
                ei = 0
                for s in s_list:
                    while ei < len(e_list) and e_list[ei] <= s:
                        ei += 1
                    if ei < len(e_list):
                        dur = (e_list[ei] - s).total_seconds() / 60.0
                        if 0 < dur < 480:  # Ignore sessions > 8 hours (likely tab left open)
                            session_durs.append(dur)
                        ei += 1
                durations[cid] = np.mean(session_durs) if session_durs else 0.0
            else:
                durations[cid] = 0.0

        features["avg_session_duration_mins"] = pd.Series(durations).reindex(features.index).fillna(0)
    else:
        features["avg_session_duration_mins"] = 0

    # Pages per session
    if not page_events.empty and features["total_sessions"].sum() > 0:
        total_pages = page_events.groupby("customer_id").size().reindex(features.index).fillna(0)
        features["avg_pages_per_session"] = np.where(
            features["total_sessions"] > 0,
            total_pages / features["total_sessions"],
            0,
        )
    else:
        features["avg_pages_per_session"] = 0

    # Session frequency (sessions per week)
    weeks = max(obs_days / 7, 1)
    features["session_frequency"] = features["total_sessions"] / weeks

    # Bounce rate (sessions with only 1 event = bounce)
    if not session_starts.empty:
        # Approximate: sessions where customer had <=1 page view event near session start
        # Simplified: if pages_per_session < 1.5, likely high bounce
        features["bounce_rate"] = np.where(
            features["total_sessions"] > 0,
            np.maximum(1 - (features["avg_pages_per_session"] / 2), 0),
            0,
        )
    else:
        features["bounce_rate"] = 0

    return features


def _compute_wishlist_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """Wishlist engagement: additions, conversion, recency."""
    wishlist_events = events_df[events_df["event_name"] == "added_to_wishlist"]

    if not wishlist_events.empty:
        wl_grouped = wishlist_events.groupby("customer_id")
        features["wishlist_adds"] = wl_grouped.size().reindex(features.index).fillna(0)

        features["wishlist_to_purchase_ratio"] = np.where(
            features["wishlist_adds"] > 0,
            features["total_orders"] / features["wishlist_adds"],
            0,
        )

        last_wishlist = wl_grouped["timestamp"].max()
        features["days_since_last_wishlist"] = (
            (cutoff_ts - last_wishlist).dt.days.reindex(features.index).fillna(obs_days)
        )
    else:
        features["wishlist_adds"] = 0
        features["wishlist_to_purchase_ratio"] = 0
        features["days_since_last_wishlist"] = obs_days

    return features


def _compute_channel_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """Channel engagement: email, push, multi-channel."""
    email_opens = events_df[events_df["event_name"] == "email_opened"]
    email_clicks = events_df[events_df["event_name"] == "email_clicked"]
    push_events = events_df[events_df["event_name"].isin(["push_opened", "push_clicked"])]

    # Email open rate (opens / total email events sent — approximate with opens as proxy)
    if not email_opens.empty:
        opens = email_opens.groupby("customer_id").size().reindex(features.index).fillna(0)
        if not email_clicks.empty:
            clicks = email_clicks.groupby("customer_id").size().reindex(features.index).fillna(0)
            features["email_click_rate"] = np.where(opens > 0, clicks / opens, 0)
        else:
            features["email_click_rate"] = 0
        # Normalize open rate as proportion of total engagement
        features["email_open_rate"] = np.where(
            features["total_events"] > 0,
            opens / features["total_events"],
            0,
        )
    else:
        features["email_open_rate"] = 0
        features["email_click_rate"] = 0

    # Push response rate
    if not push_events.empty:
        push_count = push_events.groupby("customer_id").size().reindex(features.index).fillna(0)
        features["push_response_rate"] = np.where(
            features["total_events"] > 0,
            push_count / features["total_events"],
            0,
        )
    else:
        features["push_response_rate"] = 0

    # Multi-channel engaged (engaged via 2+ channels: web + email + push)
    has_sessions = (features["total_sessions"] > 0).astype(int)
    has_email = (features["total_emails_opened"] > 0).astype(int)
    has_push = 0
    if not push_events.empty:
        has_push = (push_events.groupby("customer_id").size().reindex(features.index).fillna(0) > 0).astype(int)
    features["multi_channel_engaged"] = (has_sessions + has_email + has_push >= 2).astype(int)

    return features


def _compute_checkout_friction_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """Checkout friction: abandon rate, starts per purchase."""
    checkout_starts = events_df[events_df["event_name"] == "checkout_started"]

    if not checkout_starts.empty:
        starts_count = checkout_starts.groupby("customer_id").size().reindex(features.index).fillna(0)
        features["checkout_starts_per_purchase"] = np.where(
            features["total_orders"] > 0,
            starts_count / features["total_orders"],
            0,
        )
        # Abandon rate = 1 - (completions / starts)
        features["checkout_abandon_rate"] = np.where(
            starts_count > 0,
            1 - np.minimum(features["total_orders"] / starts_count, 1),
            0,
        )
    else:
        features["checkout_starts_per_purchase"] = 0
        features["checkout_abandon_rate"] = 0

    return features


def _compute_post_purchase_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """Post-purchase: review rate, return rate."""
    reviews = events_df[events_df["event_name"] == "product_reviewed"]
    returns = events_df[events_df["event_name"] == "return_initiated"]

    if not reviews.empty:
        review_count = reviews.groupby("customer_id").size().reindex(features.index).fillna(0)
        features["review_rate"] = np.where(
            features["total_orders"] > 0,
            review_count / features["total_orders"],
            0,
        )
    else:
        features["review_rate"] = 0

    if not returns.empty:
        return_count = returns.groupby("customer_id").size().reindex(features.index).fillna(0)
        features["return_rate"] = np.where(
            features["total_orders"] > 0,
            return_count / features["total_orders"],
            0,
        )
    else:
        features["return_rate"] = 0

    return features


ECOMMERCE_CONFIG = DomainConfig(
    domain="ecommerce",
    event_map=ECOMMERCE_EVENT_MAP,
    feature_groups=[
        "recency", "frequency", "monetary", "conversion_signals", "cart_engagement",
        "lifecycle", "trend", "velocity", "temporal", "consistency",
        "browse_intent", "session_quality", "wishlist", "channel", "checkout_friction", "post_purchase",
    ],
    label_overrides={
        "dormancy": "no_events_in_window",
        "cart_abandoned": "cart_without_checkout",
        "cart_abandonment": "cart_without_checkout",
        "churn": "no_events_in_window",
    },
    feature_labels=ECOMMERCE_FEATURE_LABELS,
)
