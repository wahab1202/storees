"""Fintech (NBFC/lending) domain — event mappings + domain-specific feature computation.

Base features (~31) are computed generically using event_map.
Fintech extensions add ~18 features for transaction behavior, EMI health,
loan engagement, app activity, and risk signals.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..feature_registry import DomainConfig, DomainEventMap


FINTECH_EVENT_MAP = DomainEventMap(
    purchase_events=["loan_disbursed", "transaction_completed"],
    cart_events=["loan_application_started"],
    browse_events=["loan_page_viewed", "product_page_viewed"],
    session_events=["app_login"],
    email_events=["email_opened"],
    pageview_events=["page_viewed", "loan_page_viewed"],
    channel_events={
        "email_open": ["email_opened"],
        "push": ["push_opened"],
        "sms": ["sms_clicked"],
    },
    custom_groups={
        "emi_paid": ["emi_paid"],
        "emi_overdue": ["emi_overdue"],
        "emi_missed": ["emi_missed"],
        "loan_app": ["loan_application_started"],
        "documents": ["documents_uploaded"],
        "kyc": ["kyc_verified", "kyc_expired"],
        "emi_calculator": ["emi_calculator_used"],
        "transaction": ["transaction_completed"],
        "pre_approved": ["pre_approved_viewed"],
        "top_up": ["top_up_inquiry"],
    },
)


FINTECH_FEATURE_LABELS = {
    # Base features
    "days_since_last_event": "Days since last activity",
    "days_since_last_purchase": "Days since last transaction",
    "days_since_last_session": "Days since last login",
    "days_since_last_email_open": "Days since last email open",
    "days_since_last_pageview": "Days since last page view",
    "total_events": "Total events",
    "total_sessions": "Total logins",
    "total_purchases": "Total transactions",
    "total_emails_opened": "Emails opened",
    "distinct_active_days": "Active days",
    "events_per_week": "Events per week",
    "purchases_per_week": "Transactions per week",
    "avg_events_per_session": "Events per login session",
    "total_spent": "Total transaction value",
    "avg_order_value": "Avg transaction value",
    "max_order_value": "Max transaction value",
    "total_orders": "Total transaction count",
    "has_purchased": "Has transacted",
    "purchase_ratio": "Transaction event ratio",
    "total_carts": "Loan applications started",
    "cart_to_purchase_ratio": "Application-to-disbursement ratio",
    "days_since_first_seen": "Customer age (days)",
    "tenure_weeks": "Tenure (weeks)",
    # Fintech extensions
    "avg_transaction_value": "Avg transaction value",
    "transaction_frequency": "Transactions per week",
    "debit_credit_ratio": "Debit/credit ratio",
    "distinct_channels": "Distinct transaction channels",
    "preferred_channel": "Preferred transaction channel",
    "emi_paid_on_time_ratio": "EMI on-time ratio",
    "emi_overdue_count": "EMI overdue count",
    "avg_days_late": "Avg days EMI late",
    "emi_streak": "Consecutive on-time EMIs",
    "loan_applications_started": "Loan applications",
    "documents_uploaded": "Documents uploaded",
    "loan_page_views": "Loan page views",
    "emi_calculator_uses": "EMI calculator uses",
    "app_login_frequency": "App login frequency",
    "days_since_last_login": "Days since last login",
    "login_trend_7d": "7-day login trend",
    "kyc_status_numeric": "KYC status",
    "days_since_kyc": "Days since KYC",
    "pre_approved_views": "Pre-approved offer views",
    "top_up_inquiries": "Top-up inquiries",
}


def compute_fintech_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_start_ts: pd.Timestamp,
) -> pd.DataFrame:
    """Compute fintech-specific extension features on top of base features."""
    obs_days = max((cutoff_ts - obs_start_ts).days, 1)

    features = _compute_transaction_features(features, events_df, obs_days)
    features = _compute_emi_features(features, events_df)
    features = _compute_loan_engagement_features(features, events_df)
    features = _compute_app_engagement_features(features, events_df, cutoff_ts, obs_days)
    features = _compute_risk_signal_features(features, events_df, cutoff_ts, obs_days)

    return features


def _compute_transaction_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    obs_days: int,
) -> pd.DataFrame:
    """Transaction behavior: value, frequency, channel diversity."""
    txn_events = events_df[events_df["event_name"] == "transaction_completed"]

    if not txn_events.empty:
        txn_events = txn_events.copy()

        def _extract_amount(props):
            if isinstance(props, dict):
                return float(props.get("amount", 0) or props.get("transaction_amount", 0) or 0)
            return 0.0

        def _extract_type(props):
            if isinstance(props, dict):
                return str(props.get("type", "unknown") or props.get("transaction_type", "unknown"))
            return "unknown"

        def _extract_channel(props):
            if isinstance(props, dict):
                return str(props.get("channel", "unknown") or props.get("payment_channel", "unknown"))
            return "unknown"

        txn_events["amount"] = txn_events["properties"].apply(_extract_amount)
        txn_events["txn_type"] = txn_events["properties"].apply(_extract_type)
        txn_events["channel"] = txn_events["properties"].apply(_extract_channel)

        grouped = txn_events.groupby("customer_id")
        features["avg_transaction_value"] = grouped["amount"].mean().reindex(features.index).fillna(0)

        weeks = max(obs_days / 7, 1)
        features["transaction_frequency"] = grouped.size().reindex(features.index).fillna(0) / weeks

        # Debit/credit ratio
        debit_counts = txn_events[txn_events["txn_type"].str.contains("debit", case=False, na=False)].groupby("customer_id").size()
        credit_counts = txn_events[txn_events["txn_type"].str.contains("credit", case=False, na=False)].groupby("customer_id").size()
        d = debit_counts.reindex(features.index).fillna(0)
        c = credit_counts.reindex(features.index).fillna(0)
        features["debit_credit_ratio"] = np.where(c > 0, d / c, d)

        # Channel diversity
        features["distinct_channels"] = (
            grouped["channel"].nunique().reindex(features.index).fillna(0)
        )

        # Preferred channel (mode) — encoded as category index
        def _mode_channel(x):
            mode = x.mode()
            return mode.iloc[0] if len(mode) > 0 else "unknown"

        channel_mode = grouped["channel"].agg(_mode_channel)
        all_channels = sorted(txn_events["channel"].unique())
        channel_map = {ch: i for i, ch in enumerate(all_channels)}
        features["preferred_channel"] = (
            channel_mode.map(channel_map).reindex(features.index).fillna(0)
        )
    else:
        features["avg_transaction_value"] = 0
        features["transaction_frequency"] = 0
        features["debit_credit_ratio"] = 0
        features["distinct_channels"] = 0
        features["preferred_channel"] = 0

    return features


def _compute_emi_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """EMI health: on-time ratio, overdue count, payment streaks."""
    emi_paid = events_df[events_df["event_name"] == "emi_paid"]
    emi_overdue = events_df[events_df["event_name"] == "emi_overdue"]
    emi_missed = events_df[events_df["event_name"] == "emi_missed"]

    total_emi = pd.concat([emi_paid, emi_overdue, emi_missed]) if any(
        not df.empty for df in [emi_paid, emi_overdue, emi_missed]
    ) else pd.DataFrame()

    if not total_emi.empty:
        total_per_cust = total_emi.groupby("customer_id").size().reindex(features.index).fillna(0)
        paid_per_cust = emi_paid.groupby("customer_id").size().reindex(features.index).fillna(0) if not emi_paid.empty else 0

        features["emi_paid_on_time_ratio"] = np.where(
            total_per_cust > 0,
            paid_per_cust / total_per_cust,
            0,
        )
        features["emi_overdue_count"] = (
            emi_overdue.groupby("customer_id").size().reindex(features.index).fillna(0)
            if not emi_overdue.empty else 0
        )

        # Avg days late (from overdue event properties)
        if not emi_overdue.empty:
            def _extract_days_late(props):
                if isinstance(props, dict):
                    return float(props.get("days_late", 0) or props.get("days_overdue", 0) or 0)
                return 0.0

            emi_overdue = emi_overdue.copy()
            emi_overdue["days_late"] = emi_overdue["properties"].apply(_extract_days_late)
            features["avg_days_late"] = (
                emi_overdue.groupby("customer_id")["days_late"].mean()
                .reindex(features.index).fillna(0)
            )
        else:
            features["avg_days_late"] = 0

        # EMI streak: consecutive on-time payments (from most recent)
        if not emi_paid.empty:
            emi_all = total_emi.sort_values("timestamp")
            streaks = {}
            for cid in features.index:
                cust_emis = emi_all[emi_all["customer_id"] == cid]
                if cust_emis.empty:
                    streaks[cid] = 0
                    continue
                streak = 0
                for _, row in cust_emis.iloc[::-1].iterrows():
                    if row["event_name"] == "emi_paid":
                        streak += 1
                    else:
                        break
                streaks[cid] = streak
            features["emi_streak"] = pd.Series(streaks).reindex(features.index).fillna(0)
        else:
            features["emi_streak"] = 0
    else:
        features["emi_paid_on_time_ratio"] = 0
        features["emi_overdue_count"] = 0
        features["avg_days_late"] = 0
        features["emi_streak"] = 0

    return features


def _compute_loan_engagement_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """Loan engagement: applications, documents, page views, calculator usage."""
    for event_name, feature_name in [
        ("loan_application_started", "loan_applications_started"),
        ("documents_uploaded", "documents_uploaded"),
        ("loan_page_viewed", "loan_page_views"),
        ("emi_calculator_used", "emi_calculator_uses"),
        ("pre_approved_viewed", "pre_approved_views"),
        ("top_up_inquiry", "top_up_inquiries"),
    ]:
        filtered = events_df[events_df["event_name"] == event_name]
        if not filtered.empty:
            features[feature_name] = filtered.groupby("customer_id").size().reindex(features.index).fillna(0)
        else:
            features[feature_name] = 0

    return features


def _compute_app_engagement_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """App engagement: login frequency, recency, trend."""
    logins = events_df[events_df["event_name"] == "app_login"]

    if not logins.empty:
        weeks = max(obs_days / 7, 1)
        login_counts = logins.groupby("customer_id").size().reindex(features.index).fillna(0)
        features["app_login_frequency"] = login_counts / weeks

        last_login = logins.groupby("customer_id")["timestamp"].max()
        features["days_since_last_login"] = (
            (cutoff_ts - last_login).dt.days.reindex(features.index).fillna(obs_days)
        )

        # Login trend: last 7d vs prev 7d
        cutoff_7d = cutoff_ts - pd.Timedelta(days=7)
        cutoff_14d = cutoff_ts - pd.Timedelta(days=14)
        recent = logins[logins["timestamp"] >= cutoff_7d].groupby("customer_id").size()
        prev = logins[(logins["timestamp"] >= cutoff_14d) & (logins["timestamp"] < cutoff_7d)].groupby("customer_id").size()
        features["login_trend_7d"] = (
            recent.reindex(features.index).fillna(0) - prev.reindex(features.index).fillna(0)
        )
    else:
        features["app_login_frequency"] = 0
        features["days_since_last_login"] = obs_days
        features["login_trend_7d"] = 0

    return features


def _compute_risk_signal_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """Risk signals: KYC status, recency."""
    kyc_verified = events_df[events_df["event_name"] == "kyc_verified"]
    kyc_expired = events_df[events_df["event_name"] == "kyc_expired"]

    # KYC status: 2=verified, 1=expired, 0=unknown
    kyc_status = pd.Series(0, index=features.index, dtype=float)
    if not kyc_verified.empty:
        verified_cids = set(kyc_verified["customer_id"].unique())
        kyc_status = kyc_status.where(~features.index.isin(verified_cids), 2)
    if not kyc_expired.empty:
        expired_cids = set(kyc_expired["customer_id"].unique())
        # If both verified and expired, take the most recent
        if not kyc_verified.empty:
            for cid in expired_cids:
                if cid in verified_cids:
                    last_v = kyc_verified[kyc_verified["customer_id"] == cid]["timestamp"].max()
                    last_e = kyc_expired[kyc_expired["customer_id"] == cid]["timestamp"].max()
                    kyc_status[cid] = 2 if last_v > last_e else 1
                else:
                    kyc_status[cid] = 1
        else:
            kyc_status = kyc_status.where(~features.index.isin(expired_cids), 1)

    features["kyc_status_numeric"] = kyc_status

    # Days since KYC event
    all_kyc = pd.concat([kyc_verified, kyc_expired]) if not kyc_verified.empty or not kyc_expired.empty else pd.DataFrame()
    if not all_kyc.empty:
        last_kyc = all_kyc.groupby("customer_id")["timestamp"].max()
        features["days_since_kyc"] = (cutoff_ts - last_kyc).dt.days.reindex(features.index).fillna(obs_days)
    else:
        features["days_since_kyc"] = obs_days

    return features


FINTECH_CONFIG = DomainConfig(
    domain="fintech",
    event_map=FINTECH_EVENT_MAP,
    feature_groups=[
        "recency", "frequency", "monetary", "conversion_signals", "cart_engagement",
        "lifecycle", "trend", "velocity", "temporal", "consistency",
        "transaction", "emi", "loan_engagement", "app_engagement", "risk_signals",
    ],
    label_overrides={
        "dormancy": "no_events_in_window",
        "emi_missed": "standard_event",
        "churn": "no_login_in_window",
    },
    feature_labels=FINTECH_FEATURE_LABELS,
)
