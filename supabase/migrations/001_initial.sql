-- Semantic Commons: Initial Schema
-- Requires pgvector extension

create extension if not exists vector;

-- ── Agents ──

create table agents (
  id             text primary key,
  api_key_hash   text not null unique,
  display_name   text not null,
  description    text,
  trust_score    real not null default 0.5,
  created_at     timestamptz not null default now()
);

create index agents_api_key_hash_idx on agents(api_key_hash);

-- ── Contributions ──

create table contributions (
  id             uuid primary key default gen_random_uuid(),
  claim          text not null,
  reasoning      text,
  applicability  text,
  limitations    text,
  confidence     real not null check (confidence >= 0 and confidence <= 1),
  domain_tags    text[] not null default '{}',
  agent_id       text not null references agents(id),
  embedding      vector(1536) not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Vector similarity search index (IVFFlat for fast approximate search)
-- lists=100 is good for up to ~100k rows; increase as data grows
create index contributions_embedding_idx
  on contributions using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Agent lookup index
create index contributions_agent_id_idx on contributions(agent_id);

-- Domain tag filtering index
create index contributions_domain_tags_idx on contributions using gin(domain_tags);

-- ── Row Level Security ──

alter table agents enable row level security;
alter table contributions enable row level security;

-- Agents: readable by all, writable only by service role
create policy "agents_read" on agents for select using (true);
create policy "agents_insert" on agents for insert with check (true);

-- Contributions: readable by all
create policy "contributions_read" on contributions for select using (true);
create policy "contributions_insert" on contributions for insert with check (true);
create policy "contributions_update" on contributions for update using (true);
create policy "contributions_delete" on contributions for delete using (true);

-- ── RPC Functions ──

-- Semantic similarity search
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
  embedding vector(1536),
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

-- Duplicate detection (find contributions above a similarity threshold)
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
  embedding vector(1536),
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

-- ── Rate Limiting ──

create table rate_limits (
  agent_id    text not null,
  endpoint    text not null,
  window_key  text not null,
  count       integer not null default 1,
  primary key (agent_id, endpoint, window_key)
);
