"""EdTech domain — event mappings + domain-specific feature computation.

Base features (~31) are computed generically using event_map.
EdTech extensions add ~20 features for learning progress, enrollment patterns,
completion health, certificate pursuit, and course properties.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..feature_registry import DomainConfig, DomainEventMap


EDTECH_EVENT_MAP = DomainEventMap(
    purchase_events=["course_enrolled", "subscription_created"],
    cart_events=["course_added_to_list"],
    browse_events=["course_viewed", "course_preview_watched"],
    session_events=["session_started", "app_login"],
    email_events=["email_opened"],
    pageview_events=["page_viewed", "course_viewed"],
    channel_events={
        "email_open": ["email_opened"],
        "push": ["push_opened"],
    },
    custom_groups={
        "lesson": ["lesson_completed"],
        "quiz": ["quiz_attempted"],
        "certificate": ["certificate_earned"],
        "course_complete": ["course_completed"],
        "course_drop": ["course_dropped"],
        "preview": ["course_preview_watched"],
    },
)


EDTECH_FEATURE_LABELS = {
    # Base features
    "days_since_last_event": "Days since last activity",
    "days_since_last_purchase": "Days since last enrollment",
    "days_since_last_session": "Days since last session",
    "days_since_last_email_open": "Days since last email open",
    "days_since_last_pageview": "Days since last page view",
    "total_events": "Total events",
    "total_sessions": "Total sessions",
    "total_purchases": "Total enrollments",
    "total_emails_opened": "Emails opened",
    "distinct_active_days": "Active days",
    "events_per_week": "Events per week",
    "purchases_per_week": "Enrollments per week",
    "avg_events_per_session": "Events per session",
    "total_spent": "Total spent on courses",
    "avg_order_value": "Avg course price",
    "max_order_value": "Max course price",
    "total_orders": "Total enrollment count",
    "has_purchased": "Has enrolled",
    "purchase_ratio": "Enrollment event ratio",
    "total_carts": "Courses added to list",
    "cart_to_purchase_ratio": "List-to-enrollment ratio",
    "days_since_first_seen": "Learner age (days)",
    "tenure_weeks": "Tenure (weeks)",
    # EdTech extensions
    "total_lessons_completed": "Lessons completed",
    "lessons_per_week": "Lessons per week",
    "total_quizzes_attempted": "Quizzes attempted",
    "quiz_pass_rate": "Quiz pass rate",
    "avg_quiz_score": "Avg quiz score",
    "total_courses_completed": "Courses completed",
    "course_completion_rate": "Course completion rate",
    "avg_completion_pct": "Avg course progress",
    "days_since_last_lesson": "Days since last lesson",
    "lesson_trend_7d": "7-day lesson trend",
    "total_certificates_earned": "Certificates earned",
    "certificate_rate": "Certificate earn rate",
    "days_since_last_certificate": "Days since last certificate",
    "total_courses_dropped": "Courses dropped",
    "drop_rate": "Course drop rate",
    "distinct_courses_enrolled": "Distinct courses enrolled",
    "distinct_categories": "Course categories explored",
    "preview_to_enroll_ratio": "Preview-to-enroll ratio",
    "avg_course_difficulty": "Avg course difficulty",
    "has_certificate": "Has earned certificate",
}


def compute_edtech_features(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_start_ts: pd.Timestamp,
) -> pd.DataFrame:
    """Compute edtech-specific extension features on top of base features."""
    obs_days = max((cutoff_ts - obs_start_ts).days, 1)

    features = _compute_learning_progress(features, events_df, cutoff_ts, obs_days)
    features = _compute_enrollment_patterns(features, events_df)
    features = _compute_completion_health(features, events_df, cutoff_ts, obs_days)
    features = _compute_certificate_pursuit(features, events_df, cutoff_ts, obs_days)
    features = _compute_course_properties(features, events_df)

    return features


def _compute_learning_progress(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """Learning progress: lessons completed, quizzes, scores."""
    lessons = events_df[events_df["event_name"] == "lesson_completed"]
    quizzes = events_df[events_df["event_name"] == "quiz_attempted"]

    weeks = max(obs_days / 7, 1)

    # Lessons
    if not lessons.empty:
        lesson_grouped = lessons.groupby("customer_id")
        features["total_lessons_completed"] = lesson_grouped.size().reindex(features.index).fillna(0)
        features["lessons_per_week"] = features["total_lessons_completed"] / weeks

        last_lesson = lesson_grouped["timestamp"].max()
        features["days_since_last_lesson"] = (
            (cutoff_ts - last_lesson).dt.days.reindex(features.index).fillna(obs_days)
        )

        # Lesson trend: last 7d vs prev 7d
        cutoff_7d = cutoff_ts - pd.Timedelta(days=7)
        cutoff_14d = cutoff_ts - pd.Timedelta(days=14)
        recent = lessons[lessons["timestamp"] >= cutoff_7d].groupby("customer_id").size()
        prev = lessons[(lessons["timestamp"] >= cutoff_14d) & (lessons["timestamp"] < cutoff_7d)].groupby("customer_id").size()
        features["lesson_trend_7d"] = (
            recent.reindex(features.index).fillna(0) - prev.reindex(features.index).fillna(0)
        )
    else:
        features["total_lessons_completed"] = 0
        features["lessons_per_week"] = 0
        features["days_since_last_lesson"] = obs_days
        features["lesson_trend_7d"] = 0

    # Quizzes
    if not quizzes.empty:
        quiz_grouped = quizzes.groupby("customer_id")
        features["total_quizzes_attempted"] = quiz_grouped.size().reindex(features.index).fillna(0)

        def _extract_score(props):
            if isinstance(props, dict):
                return float(props.get("score", 0) or props.get("quiz_score", 0) or 0)
            return 0.0

        def _extract_passed(props):
            if isinstance(props, dict):
                return 1.0 if props.get("passed") or props.get("result") == "pass" else 0.0
            return 0.0

        quizzes_copy = quizzes.copy()
        quizzes_copy["score"] = quizzes_copy["properties"].apply(_extract_score)
        quizzes_copy["passed"] = quizzes_copy["properties"].apply(_extract_passed)

        features["avg_quiz_score"] = (
            quizzes_copy.groupby("customer_id")["score"].mean()
            .reindex(features.index).fillna(0)
        )
        features["quiz_pass_rate"] = (
            quizzes_copy.groupby("customer_id")["passed"].mean()
            .reindex(features.index).fillna(0)
        )
    else:
        features["total_quizzes_attempted"] = 0
        features["avg_quiz_score"] = 0
        features["quiz_pass_rate"] = 0

    return features


def _compute_enrollment_patterns(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """Enrollment patterns: distinct courses, categories, preview-to-enroll ratio."""
    enrollments = events_df[events_df["event_name"] == "course_enrolled"]
    previews = events_df[events_df["event_name"] == "course_preview_watched"]

    if not enrollments.empty:
        def _count_distinct_courses(props_series):
            courses = set()
            for props in props_series:
                if isinstance(props, dict):
                    cid = props.get("course_id") or props.get("courseId")
                    if cid:
                        courses.add(str(cid))
            return len(courses)

        def _count_distinct_categories(props_series):
            cats = set()
            for props in props_series:
                if isinstance(props, dict):
                    cat = props.get("category") or props.get("course_category")
                    if cat:
                        cats.add(str(cat))
            return len(cats)

        enroll_grouped = enrollments.groupby("customer_id")
        features["distinct_courses_enrolled"] = (
            enroll_grouped["properties"].apply(_count_distinct_courses)
            .reindex(features.index).fillna(0)
        )
        features["distinct_categories"] = (
            enroll_grouped["properties"].apply(_count_distinct_categories)
            .reindex(features.index).fillna(0)
        )
    else:
        features["distinct_courses_enrolled"] = 0
        features["distinct_categories"] = 0

    # Preview-to-enroll ratio
    if not previews.empty:
        preview_count = previews.groupby("customer_id").size().reindex(features.index).fillna(0)
        features["preview_to_enroll_ratio"] = np.where(
            preview_count > 0,
            features["total_purchases"] / preview_count,
            0,
        )
    else:
        features["preview_to_enroll_ratio"] = 0

    return features


def _compute_completion_health(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """Completion health: courses completed, drop rate, avg progress."""
    completions = events_df[events_df["event_name"] == "course_completed"]
    drops = events_df[events_df["event_name"] == "course_dropped"]

    # Courses completed
    if not completions.empty:
        features["total_courses_completed"] = (
            completions.groupby("customer_id").size().reindex(features.index).fillna(0)
        )
    else:
        features["total_courses_completed"] = 0

    # Completion rate (completed / enrolled)
    features["course_completion_rate"] = np.where(
        features["total_purchases"] > 0,
        features["total_courses_completed"] / features["total_purchases"],
        0,
    )

    # Courses dropped
    if not drops.empty:
        features["total_courses_dropped"] = (
            drops.groupby("customer_id").size().reindex(features.index).fillna(0)
        )
    else:
        features["total_courses_dropped"] = 0

    # Drop rate (dropped / enrolled)
    features["drop_rate"] = np.where(
        features["total_purchases"] > 0,
        features["total_courses_dropped"] / features["total_purchases"],
        0,
    )

    # Average completion percentage from lesson events
    # Approximate: lessons completed / (distinct_courses * avg_lessons_per_course)
    # Simplified: use progress property if available, otherwise lessons / enrollments ratio
    all_progress = events_df[events_df["event_name"].isin(["lesson_completed", "course_completed"])]
    if not all_progress.empty:
        def _extract_progress(props):
            if isinstance(props, dict):
                return float(props.get("progress", 0) or props.get("completion_pct", 0) or 0)
            return 0.0

        progress_copy = all_progress.copy()
        progress_copy["progress"] = progress_copy["properties"].apply(_extract_progress)
        has_progress = progress_copy[progress_copy["progress"] > 0]

        if not has_progress.empty:
            features["avg_completion_pct"] = (
                has_progress.groupby("customer_id")["progress"].mean()
                .reindex(features.index).fillna(0)
            )
        else:
            # Fallback: lessons / (enrollments * 10) as rough proxy
            features["avg_completion_pct"] = np.where(
                features["total_purchases"] > 0,
                np.minimum(features["total_lessons_completed"] / (features["total_purchases"] * 10), 1.0),
                0,
            )
    else:
        features["avg_completion_pct"] = 0

    return features


def _compute_certificate_pursuit(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
    cutoff_ts: pd.Timestamp,
    obs_days: int,
) -> pd.DataFrame:
    """Certificate pursuit: certificates earned, rate, recency."""
    certificates = events_df[events_df["event_name"] == "certificate_earned"]

    if not certificates.empty:
        cert_grouped = certificates.groupby("customer_id")
        features["total_certificates_earned"] = cert_grouped.size().reindex(features.index).fillna(0)

        # Certificate rate (certificates / completed courses)
        features["certificate_rate"] = np.where(
            features["total_courses_completed"] > 0,
            features["total_certificates_earned"] / features["total_courses_completed"],
            0,
        )

        last_cert = cert_grouped["timestamp"].max()
        features["days_since_last_certificate"] = (
            (cutoff_ts - last_cert).dt.days.reindex(features.index).fillna(obs_days)
        )

        features["has_certificate"] = (features["total_certificates_earned"] > 0).astype(int)
    else:
        features["total_certificates_earned"] = 0
        features["certificate_rate"] = 0
        features["days_since_last_certificate"] = obs_days
        features["has_certificate"] = 0

    return features


def _compute_course_properties(
    features: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    """Course properties: average difficulty from enrollment event properties."""
    enrollments = events_df[events_df["event_name"] == "course_enrolled"]

    if not enrollments.empty:
        def _extract_difficulty(props):
            if isinstance(props, dict):
                diff = props.get("difficulty") or props.get("level")
                if isinstance(diff, (int, float)):
                    return float(diff)
                diff_map = {"beginner": 1, "intermediate": 2, "advanced": 3}
                return float(diff_map.get(str(diff).lower(), 0))
            return 0.0

        enroll_copy = enrollments.copy()
        enroll_copy["difficulty"] = enroll_copy["properties"].apply(_extract_difficulty)
        has_diff = enroll_copy[enroll_copy["difficulty"] > 0]

        if not has_diff.empty:
            features["avg_course_difficulty"] = (
                has_diff.groupby("customer_id")["difficulty"].mean()
                .reindex(features.index).fillna(0)
            )
        else:
            features["avg_course_difficulty"] = 0
    else:
        features["avg_course_difficulty"] = 0

    return features


EDTECH_CONFIG = DomainConfig(
    domain="edtech",
    event_map=EDTECH_EVENT_MAP,
    feature_groups=[
        "recency", "frequency", "monetary", "conversion_signals", "cart_engagement",
        "lifecycle", "trend", "velocity", "temporal", "consistency",
        "learning_progress", "enrollment_patterns", "completion_health",
        "certificate_pursuit", "course_properties",
    ],
    label_overrides={
        "dormancy": "no_events_in_window",
        "churn": "no_events_in_window",
        "course_dropped": "standard_event",
        "completion_risk": "no_lesson_in_window",
    },
    feature_labels=EDTECH_FEATURE_LABELS,
)
