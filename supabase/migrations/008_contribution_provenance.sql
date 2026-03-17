-- Add provenance field to contributions
-- Tracks how the knowledge was originally authored
ALTER TABLE contributions ADD COLUMN provenance TEXT;

-- Valid values: directive, observation, social, correction, reflection, external
-- NULL is allowed for backward compatibility with existing contributions

-- Update search_contributions to return provenance
CREATE OR REPLACE FUNCTION search_contributions(
  query_embedding text,
  match_count int default 5,
  min_confidence real default 0,
  filter_domain_tags text[] default '{}'
)
RETURNS TABLE (
  id uuid,
  claim text,
  reasoning text,
  applicability text,
  limitations text,
  confidence real,
  domain_tags text[],
  agent_id text,
  embedding vector(1536),
  created_at timestamptz,
  updated_at timestamptz,
  similarity real,
  provenance text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id, c.claim, c.reasoning, c.applicability, c.limitations,
    c.confidence, c.domain_tags, c.agent_id, c.embedding,
    c.created_at, c.updated_at,
    1 - (c.embedding <=> query_embedding::vector) as similarity,
    c.provenance
  FROM contributions c
  WHERE c.confidence >= min_confidence
    AND (cardinality(filter_domain_tags) = 0 OR c.domain_tags && filter_domain_tags)
  ORDER BY c.embedding <=> query_embedding::vector
  LIMIT match_count;
$$;

-- Update find_similar_contributions to return provenance
CREATE OR REPLACE FUNCTION find_similar_contributions(
  query_embedding text,
  similarity_threshold real default 0.95,
  max_results int default 5
)
RETURNS TABLE (
  id uuid,
  claim text,
  reasoning text,
  applicability text,
  limitations text,
  confidence real,
  domain_tags text[],
  agent_id text,
  embedding vector(1536),
  created_at timestamptz,
  updated_at timestamptz,
  provenance text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id, c.claim, c.reasoning, c.applicability, c.limitations,
    c.confidence, c.domain_tags, c.agent_id, c.embedding,
    c.created_at, c.updated_at, c.provenance
  FROM contributions c
  WHERE 1 - (c.embedding <=> query_embedding::vector) >= similarity_threshold
  ORDER BY c.embedding <=> query_embedding::vector
  LIMIT max_results;
$$;

-- Update bm25_search to return provenance
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
  rank REAL,
  provenance TEXT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id, c.claim, c.reasoning, c.applicability, c.limitations,
    c.confidence, c.domain_tags, c.agent_id, c.created_at, c.updated_at,
    ts_rank(c.search_vector, plainto_tsquery('english', query_text)) AS rank,
    c.provenance
  FROM contributions c
  WHERE
    c.search_vector @@ plainto_tsquery('english', query_text)
    AND c.confidence >= min_confidence
    AND (cardinality(filter_domain_tags) = 0 OR c.domain_tags && filter_domain_tags)
  ORDER BY rank DESC
  LIMIT match_count;
$$;
