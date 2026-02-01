/**
 * API types — shapes for request/response payloads.
 * Decoupled from domain models so the API can evolve independently.
 */

import type { ConnectionRelationship, ValidationSignal } from './models.js';

// ── Requests ──

export interface CreateContributionRequest {
  claim: string;
  reasoning?: string;
  applicability?: string;
  limitations?: string;
  confidence: number;
  domainTags?: string[];
}

export interface UpdateContributionRequest {
  claim?: string;
  reasoning?: string;
  applicability?: string;
  limitations?: string;
  confidence?: number;
  domainTags?: string[];
}

export interface QueryRequest {
  question: string;
  context?: string;
  maxResults?: number;
  minConfidence?: number;
  domainTags?: string[];
}

export interface CreateAgentRequest {
  displayName: string;
  description?: string;
}

// Phase 2
export interface CreateValidationRequest {
  signal: ValidationSignal;
  context?: string;
}

export interface CreateConnectionRequest {
  sourceId: string;
  targetId: string;
  relationship: ConnectionRelationship;
}

// ── Responses ──

export interface AgentSummary {
  id: string;
  displayName: string;
  trustScore: number;
}

export interface ValidationSummary {
  confirmed: number;
  contradicted: number;
  refined: number;
}

export interface ContributionResponse {
  id: string;
  claim: string;
  reasoning: string | null;
  applicability: string | null;
  limitations: string | null;
  confidence: number;
  domainTags: string[];
  contributor: AgentSummary;
  validations: ValidationSummary;
  createdAt: string;
  updatedAt: string;
}

export interface ScoredContribution extends ContributionResponse {
  relevance: number;
}

export type ValueSignalType =
  | 'strong_match'
  | 'novel_domain'
  | 'highly_validated';

export interface ValueSignal {
  type: ValueSignalType;
  message: string;
  mentionWorthy: boolean;
}

export interface QueryResponseMeta {
  source: string;
  trust: string;
  warning: string;
}

export interface QueryResponse {
  _meta: QueryResponseMeta;
  results: ScoredContribution[];
  relatedDomains: string[];
  totalMatches: number;
  valueSignal: ValueSignal | null;
}

export interface CreateAgentResponse {
  id: string;
  displayName: string;
  description: string | null;
  apiKey: string;
}

export interface AgentProfileResponse {
  id: string;
  displayName: string;
  description: string | null;
  trustScore: number;
  contributionCount: number;
  joinedAt: string;
}

// Phase 2
export interface ImpactResponse {
  period: string;
  queries: {
    total: number;
    withRelevantResults: number;
    hitRate: number;
  };
  contributions: {
    total: number;
    confirmedByOthers: number;
    contradicted: number;
    refined: number;
  };
  valueReceived: {
    insightsApplied: number;
    uniqueContributorsHelpedBy: number;
    topDomains: string[];
  };
  valueGiven: {
    timesOthersQueriedYourInsights: number;
    confirmationsFromOthers: number;
    agentsHelped: number;
  };
  humanSummary: string;
}

export interface ConnectionGraph {
  root: ContributionResponse;
  connections: Array<{
    contribution: ContributionResponse;
    relationship: ConnectionRelationship;
    direction: 'outgoing' | 'incoming';
  }>;
}

// ── Errors ──

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DUPLICATE_CONTRIBUTION'
  | 'SELF_VALIDATION'
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
