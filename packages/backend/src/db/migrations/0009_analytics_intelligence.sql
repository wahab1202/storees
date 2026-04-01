-- Phase 2: Analytics Intelligence Layer
-- Tables: saved_analyses, segment_snapshots, prediction_scores

-- ============ SAVED ANALYSES ============

CREATE TABLE IF NOT EXISTS saved_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(30) NOT NULL, -- 'funnel' | 'timeseries' | 'time_to_event' | 'product' | 'cohort'
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saved_analyses_project ON saved_analyses(project_id, type);

-- ============ SEGMENT SNAPSHOTS ============

CREATE TABLE IF NOT EXISTS segment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  segment_id UUID NOT NULL REFERENCES segments(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  snapshot_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segment_snapshots_lookup ON segment_snapshots(project_id, snapshot_date);
CREATE INDEX idx_segment_snapshots_segment ON segment_snapshots(segment_id, snapshot_date);

-- ============ PREDICTION SCORES ============

CREATE TABLE IF NOT EXISTS prediction_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  goal_id UUID NOT NULL REFERENCES prediction_goals(id),
  score DECIMAL(5,2) NOT NULL, -- 0-100
  confidence DECIMAL(4,3) NOT NULL, -- 0-1
  bucket VARCHAR(10) NOT NULL, -- 'High' | 'Medium' | 'Low'
  factors JSONB NOT NULL DEFAULT '[]',
  model_version VARCHAR(50),
  computed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prediction_scores_customer ON prediction_scores(project_id, customer_id);
CREATE INDEX idx_prediction_scores_goal ON prediction_scores(goal_id, computed_at);
