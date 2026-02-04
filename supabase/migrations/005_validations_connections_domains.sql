-- Validations table
CREATE TABLE validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  signal TEXT NOT NULL CHECK (signal IN ('confirmed', 'contradicted', 'refined')),
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contribution_id, agent_id)  -- one validation per agent per contribution
);

CREATE INDEX validations_contribution_id_idx ON validations(contribution_id);
CREATE INDEX validations_agent_id_idx ON validations(agent_id);

-- Connections table
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('builds-on', 'contradicts', 'generalizes', 'applies-to')),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, target_id, agent_id)  -- one connection per agent per pair
);

CREATE INDEX connections_source_id_idx ON connections(source_id);
CREATE INDEX connections_target_id_idx ON connections(target_id);

-- RPC: get validation summary for a contribution
CREATE OR REPLACE FUNCTION get_validation_summary(p_contribution_id UUID)
RETURNS TABLE (
  confirmed BIGINT,
  contradicted BIGINT,
  refined BIGINT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE signal = 'confirmed') AS confirmed,
    COUNT(*) FILTER (WHERE signal = 'contradicted') AS contradicted,
    COUNT(*) FILTER (WHERE signal = 'refined') AS refined
  FROM validations
  WHERE contribution_id = p_contribution_id;
$$;

-- RPC: get domain stats
CREATE OR REPLACE FUNCTION get_domain_stats()
RETURNS TABLE (
  domain TEXT,
  contribution_count BIGINT,
  avg_confidence REAL,
  latest_contribution TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT
    unnest(domain_tags) AS domain,
    COUNT(*) AS contribution_count,
    AVG(confidence)::REAL AS avg_confidence,
    MAX(created_at) AS latest_contribution
  FROM contributions
  GROUP BY domain
  ORDER BY contribution_count DESC;
$$;

-- RLS
ALTER TABLE validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "validations_read" ON validations FOR SELECT USING (true);
CREATE POLICY "validations_insert" ON validations FOR INSERT WITH CHECK (true);
CREATE POLICY "validations_update" ON validations FOR UPDATE USING (true);
CREATE POLICY "validations_delete" ON validations FOR DELETE USING (true);
CREATE POLICY "connections_read" ON connections FOR SELECT USING (true);
CREATE POLICY "connections_insert" ON connections FOR INSERT WITH CHECK (true);
CREATE POLICY "connections_delete" ON connections FOR DELETE USING (true);
