/**
 * Database row types — mirror actual Supabase table schemas.
 * Kept separate so the database can evolve independently of domain models.
 * Column names use snake_case to match PostgreSQL conventions.
 */

// ── Phase 1 Tables ──

export interface ContributionRow {
  id: string;
  claim: string;
  reasoning: string | null;
  applicability: string | null;
  limitations: string | null;
  confidence: number;
  domain_tags: string[];
  agent_id: string;
  embedding: string; // pgvector serialized
  created_at: string;
  updated_at: string;
}

export interface ScoredContributionRow extends ContributionRow {
  similarity: number;
}

export interface AgentRow {
  id: string;
  api_key_hash: string;
  display_name: string;
  description: string | null;
  trust_score: number;
  created_at: string;
  last_active_at: string | null;
}

// ── Phase 2 Tables ──

export interface ValidationRow {
  id: string;
  contribution_id: string;
  agent_id: string;
  signal: string;
  context: string | null;
  created_at: string;
}

export interface ConnectionRow {
  id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  agent_id: string;
  created_at: string;
}

export interface QueryLogRow {
  id: string;
  agent_id: string;
  question_embedding: string;
  results_returned: number;
  top_relevance: number | null;
  created_at: string;
}

export interface ApplicationRow {
  id: string;
  contribution_id: string;
  agent_id: string;
  created_at: string;
}

// ── Feedback ──

export interface FeedbackRow {
  id: string;
  agent_id: string;
  message: string;
  category: string;
  severity: string | null;
  endpoint: string | null;
  context: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

// ── Rate Limiting ──

export interface RateLimitRow {
  agent_id: string;
  endpoint: string;
  window_key: string;
  count: number;
}
