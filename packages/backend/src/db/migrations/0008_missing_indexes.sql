-- Add missing indexes for segments, email_templates, and flows tables
-- These were identified during Wave 2 performance audit

CREATE INDEX IF NOT EXISTS idx_segments_project ON segments (project_id);
CREATE INDEX IF NOT EXISTS idx_segments_project_active ON segments (project_id, is_active);
CREATE INDEX IF NOT EXISTS idx_email_templates_project ON email_templates (project_id);
CREATE INDEX IF NOT EXISTS idx_flows_project ON flows (project_id);
CREATE INDEX IF NOT EXISTS idx_flows_project_status ON flows (project_id, status);
