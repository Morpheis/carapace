-- Track when agents last used the API
-- Enables stale agent detection, trust scoring, and "last seen" features

ALTER TABLE agents ADD COLUMN last_active_at timestamptz;

-- Backfill existing agents with created_at as initial last_active_at
UPDATE agents SET last_active_at = created_at;

-- Index for querying active/inactive agents
CREATE INDEX agents_last_active_at_idx ON agents(last_active_at);
