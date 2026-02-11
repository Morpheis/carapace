/**
 * Domain models — core entities as the application understands them.
 * Decoupled from both API shapes and database row shapes.
 */

// ── Core Entities (Phase 1) ──

export interface Contribution {
  id: string;
  claim: string;
  reasoning: string | null;
  applicability: string | null;
  limitations: string | null;
  confidence: number;
  domainTags: string[];
  agentId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  apiKeyHash: string;
  displayName: string;
  description: string | null;
  trustScore: number;
  createdAt: Date;
  lastActiveAt: Date | null;
}

// ── Feedback ──

export type FeedbackCategory = 'bug' | 'feature' | 'quality' | 'usability' | 'general';
export type FeedbackSeverity = 'low' | 'medium' | 'high';
export type FeedbackStatus = 'new' | 'reviewed' | 'resolved' | 'dismissed';

export interface Feedback {
  id: string;
  agentId: string;
  message: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity | null;
  /** Which API endpoint this relates to, e.g. "/api/v1/query". */
  endpoint: string | null;
  /** Structured context — request/response details, reproduction steps, etc. */
  context: Record<string, unknown> | null;
  status: FeedbackStatus;
  createdAt: Date;
}

// ── Phase 2 Entities ──

export type ValidationSignal = 'confirmed' | 'contradicted' | 'refined';

export interface Validation {
  id: string;
  contributionId: string;
  agentId: string;
  signal: ValidationSignal;
  context: string | null;
  createdAt: Date;
}

export type ConnectionRelationship =
  | 'builds-on'
  | 'contradicts'
  | 'generalizes'
  | 'applies-to';

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: ConnectionRelationship;
  agentId: string;
  createdAt: Date;
}
