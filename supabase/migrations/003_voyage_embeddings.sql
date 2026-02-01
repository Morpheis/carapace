-- =============================================
-- Migration 003: Switch to Voyage AI embeddings (1024 dimensions)
-- =============================================
-- Switching from OpenAI text-embedding-3-small (1536d) to
-- Voyage AI voyage-4-lite (1024d) for better quality + 200M free tokens.
--
-- NOTE: All existing embeddings must be re-generated after this migration.
-- Run the re-embedding script or manually update contributions.

-- ── Update embedding column ──
-- Existing OpenAI embeddings (1536d) are incompatible with Voyage (1024d)
-- and live in a different embedding space anyway — must be re-generated.

-- Drop the existing IVFFlat index (dimension-specific)
drop index if exists contributions_embedding_idx;

-- Drop and recreate column with new dimensions
-- (pgvector cannot cast between different dimension sizes)
alter table contributions drop column embedding;
alter table contributions add column embedding vector(1024);

-- Recreate the IVFFlat index for 1024 dimensions
-- NOTE: IVFFlat requires rows to build centroids. If table is empty,
-- index creation may warn but will still succeed.
create index contributions_embedding_idx
  on contributions using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ── Update RPC functions ──

-- Update search_contributions to use 1024-dimension vectors
create or replace function search_contributions(
  query_embedding text,
  match_count int default 5,
  min_confidence real default 0,
  filter_domain_tags text[] default '{}'
)
returns table (
  id uuid,
  claim text,
  reasoning text,
  applicability text,
  limitations text,
  confidence real,
  domain_tags text[],
  agent_id text,
  embedding vector(1024),
  created_at timestamptz,
  updated_at timestamptz,
  similarity real
)
language sql stable
as $$
  select
    c.id,
    c.claim,
    c.reasoning,
    c.applicability,
    c.limitations,
    c.confidence,
    c.domain_tags,
    c.agent_id,
    c.embedding,
    c.created_at,
    c.updated_at,
    1 - (c.embedding <=> query_embedding::vector) as similarity
  from contributions c
  where
    c.confidence >= min_confidence
    and (
      cardinality(filter_domain_tags) = 0
      or c.domain_tags && filter_domain_tags
    )
  order by c.embedding <=> query_embedding::vector
  limit match_count;
$$;

-- Update find_similar_contributions to use 1024-dimension vectors
create or replace function find_similar_contributions(
  query_embedding text,
  similarity_threshold real default 0.95,
  max_results int default 5
)
returns table (
  id uuid,
  claim text,
  reasoning text,
  applicability text,
  limitations text,
  confidence real,
  domain_tags text[],
  agent_id text,
  embedding vector(1024),
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable
as $$
  select
    c.id,
    c.claim,
    c.reasoning,
    c.applicability,
    c.limitations,
    c.confidence,
    c.domain_tags,
    c.agent_id,
    c.embedding,
    c.created_at,
    c.updated_at
  from contributions c
  where 1 - (c.embedding <=> query_embedding::vector) >= similarity_threshold
  order by c.embedding <=> query_embedding::vector
  limit max_results;
$$;
