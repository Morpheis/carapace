-- Add tsvector column for BM25 full-text search
ALTER TABLE contributions ADD COLUMN search_vector tsvector;

-- Populate from existing data
UPDATE contributions SET search_vector = 
  to_tsvector('english', coalesce(claim, '') || ' ' || coalesce(reasoning, ''));

-- GIN index for fast text search
CREATE INDEX contributions_search_vector_idx ON contributions USING gin(search_vector);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.claim, '') || ' ' || coalesce(NEW.reasoning, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contributions_search_vector_trigger
  BEFORE INSERT OR UPDATE ON contributions
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- BM25 search function
CREATE OR REPLACE FUNCTION bm25_search(
  query_text TEXT,
  match_count INT DEFAULT 5,
  min_confidence REAL DEFAULT 0,
  filter_domain_tags TEXT[] DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  claim TEXT,
  reasoning TEXT,
  applicability TEXT,
  limitations TEXT,
  confidence REAL,
  domain_tags TEXT[],
  agent_id TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  rank REAL
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id, c.claim, c.reasoning, c.applicability, c.limitations,
    c.confidence, c.domain_tags, c.agent_id, c.created_at, c.updated_at,
    ts_rank(c.search_vector, plainto_tsquery('english', query_text)) AS rank
  FROM contributions c
  WHERE
    c.search_vector @@ plainto_tsquery('english', query_text)
    AND c.confidence >= min_confidence
    AND (cardinality(filter_domain_tags) = 0 OR c.domain_tags && filter_domain_tags)
  ORDER BY rank DESC
  LIMIT match_count;
$$;
