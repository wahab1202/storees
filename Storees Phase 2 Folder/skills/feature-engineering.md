# Skill: Feature Engineering

## When to Use
Invoke this skill when implementing, modifying, or debugging the feature extraction pipeline.

## The 40+ Generic Features

ALL features are computed from generic events. NO domain-specific column names. The word "loan", "product", "subscription", "booking" must NEVER appear in feature computation code.

### Recency (5 features)
```python
days_since_last_event          # Days since most recent event of any type
days_since_last_conversion     # Days since most recent conversion-type interaction
days_since_first_seen          # Days since the user's first_seen_at
days_since_last_session        # Days since the start of the user's last session
hours_since_last_event         # Hours since most recent event (more granular)
```

### Frequency (8 features)
```python
total_events_7d                # Count of all events in last 7 days
total_events_14d               # Count of all events in last 14 days
total_events_30d               # Count of all events in last 30 days
total_events_90d               # Count of all events in last 90 days
unique_event_types_30d         # Count of distinct event names in last 30 days
sessions_per_week_30d          # Average sessions per week over last 30 days
events_per_session_30d         # Average events per session over last 30 days
conversion_events_count_90d    # Count of conversion-type interactions in last 90 days
```

### Intensity (6 features)
```python
avg_events_per_session         # Mean events across all sessions
max_events_single_session      # Peak session event count
event_trend_4w                 # Slope of weekly event counts over 4 weeks
                               # Positive = increasing engagement
                               # Negative = declining engagement
weekend_ratio                  # % of events on Sat/Sun (0.0 to 1.0)
peak_hour_concentration        # % of events in the user's most active 3-hour window
avg_session_duration_seconds   # Mean session duration in seconds
```

### Item Engagement (5 features)
```python
unique_items_viewed_30d        # Count of distinct items in view-type interactions (30d)
unique_items_converted_90d     # Count of distinct items in conversion-type interactions (90d)
item_diversity_entropy         # Shannon entropy of item interaction distribution
                               # High = explores many items equally
                               # Low = focuses on one or two items
top_category_concentration     # % of interactions in the user's top item category
recommendation_click_rate      # Clicked recommendations / shown recommendations (if tracked)
```

### Channel Behaviour (4 features)
```python
primary_device                 # Most common device type (encoded: web=0, mobile=1, tablet=2)
notification_open_rate_30d     # Opened / delivered notifications in last 30 days
email_click_rate_30d           # Clicked / delivered emails in last 30 days
inapp_response_rate_30d        # Engaged / shown in-app messages in last 30 days
```

### Lifecycle (5 features)
```python
days_since_first_conversion    # Days since user's first conversion event
total_conversions              # Lifetime count of conversion events
avg_days_between_conversions   # Mean gap between consecutive conversions
days_since_last_conversion     # Same as recency, but explicitly in lifecycle context
conversion_frequency_trend     # Is the gap between conversions shrinking or growing?
```

### Engagement Trend (4 features)
```python
event_count_7d_vs_30d_ratio    # (events_7d / events_30d) * 4.28
                               # >1.0 = accelerating, <1.0 = decelerating
session_length_trend_4w        # Slope of average session length over 4 weeks
page_breadth_trend_4w          # Slope of unique pages/screens visited per week
engagement_acceleration        # 2nd derivative: is the trend itself changing?
```

### Derived Scores (3 features)
```python
rfm_score                      # Composite RFM score (from existing RFM computation)
engagement_composite_score     # Weighted combination of frequency + recency + intensity
recommendation_interaction_rate # How often does this user engage with recommended items?
```

## Implementation Rules

### cutoff_date Parameter
```python
def extract_features(events_df, interactions_df, cutoff_date):
    """
    ALL features computed using ONLY data before cutoff_date.
    This prevents temporal data leakage.
    """
    events_before = events_df[events_df['created_at'] < cutoff_date]
    interactions_before = interactions_df[interactions_df['created_at'] < cutoff_date]
    # ... compute features using events_before and interactions_before ONLY ...
```

### Session Detection
- A session = a sequence of events from the same user with <30 minute gaps
- Session boundary: if gap between consecutive events > 30 minutes, new session starts
- Session_id is computed, not stored in the DB

### Handling Missing Data
- Users with 0 events: ALL features = NaN (not 0, not -1)
- Users with events but 0 conversions: conversion-related features = NaN
- Users with <7 days of history: 7d features = NaN, 14d/30d/90d may be valid
- NaN handling is the MODEL's responsibility (XGBoost handles NaN natively; for scikit-learn, impute)

### What is a "Conversion Event"?
- NOT hardcoded. Read from `config.prediction_goals[goal_name].target_event`
- For propensity-to-convert: the target event might be "loan_disbursed" (NBFC) or "order_completed" (ecommerce)
- For propensity-to-churn: the target event is the ABSENCE of any event for N days
- The feature pipeline doesn't know what vertical it's running for. It just reads the config.

### Performance
- Feature extraction for 100K users should complete in <60 seconds
- Use vectorised pandas operations, not loops over individual users
- Pre-compute session boundaries once, then aggregate
