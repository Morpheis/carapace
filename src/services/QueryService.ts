/**
 * Semantic search over contributions.
 * Generates query embeddings, performs vector similarity search,
 * and assembles structured results with contributor info and value signals.
 */

import type { IContributionRepository } from '../repositories/IContributionRepository.js';
import type { IAgentRepository } from '../repositories/IAgentRepository.js';
import type { IEmbeddingProvider } from '../providers/IEmbeddingProvider.js';
import type {
  QueryRequest,
  QueryResponse,
  ScoredContribution,
  ValueSignal,
  ValidationSummary,
} from '../types/api.js';
import type { ScoredContributionRow } from '../types/database.js';

const DEFAULT_MAX_RESULTS = 5;
const MAX_MAX_RESULTS = 20;

export class QueryService {
  constructor(
    private readonly contributionRepo: IContributionRepository,
    private readonly agentRepo: IAgentRepository,
    private readonly embeddingProvider: IEmbeddingProvider
  ) {}

  async search(input: QueryRequest): Promise<QueryResponse> {
    const maxResults = Math.min(
      input.maxResults ?? DEFAULT_MAX_RESULTS,
      MAX_MAX_RESULTS
    );

    // Build query embedding from question + context
    const queryText = this.buildQueryText(input.question, input.context);
    const embedding = await this.embeddingProvider.generate(queryText);

    // Vector similarity search with filters
    const scoredRows = await this.contributionRepo.vectorSearch(embedding, {
      maxResults,
      minConfidence: input.minConfidence,
      domainTags: input.domainTags,
    });

    // Assemble full responses with contributor info
    const results = await this.assembleResults(scoredRows);

    // Extract related domains from results
    const relatedDomains = this.extractRelatedDomains(results);

    // Compute value signal
    const valueSignal = this.computeValueSignal(results);

    return {
      results,
      relatedDomains,
      totalMatches: scoredRows.length,
      valueSignal,
    };
  }

  // ── Private ──

  /**
   * Build text for query embedding.
   * Includes context when provided — richer context finds more specific matches.
   */
  private buildQueryText(question: string, context?: string): string {
    if (context) {
      return `${question}\n\n${context}`;
    }
    return question;
  }

  private async assembleResults(
    rows: ScoredContributionRow[]
  ): Promise<ScoredContribution[]> {
    const zeroValidations: ValidationSummary = {
      confirmed: 0,
      contradicted: 0,
      refined: 0,
    };

    return Promise.all(
      rows.map(async (row) => {
        const agentRow = await this.agentRepo.findById(row.agent_id);

        return {
          id: row.id,
          claim: row.claim,
          reasoning: row.reasoning,
          applicability: row.applicability,
          limitations: row.limitations,
          confidence: row.confidence,
          domainTags: row.domain_tags,
          contributor: {
            id: row.agent_id,
            displayName: agentRow?.display_name ?? 'Unknown',
            trustScore: agentRow?.trust_score ?? 0,
          },
          validations: zeroValidations,
          relevance: row.similarity,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      })
    );
  }

  /**
   * Extract unique domains from result set, deduplicated and sorted by frequency.
   */
  private extractRelatedDomains(results: ScoredContribution[]): string[] {
    const domainCounts = new Map<string, number>();

    for (const result of results) {
      for (const tag of result.domainTags) {
        domainCounts.set(tag, (domainCounts.get(tag) ?? 0) + 1);
      }
    }

    return [...domainCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([domain]) => domain);
  }

  /**
   * Compute a value signal based on result quality.
   * Phase 1: basic signal based on relevance scores.
   * Phase 2: will incorporate validation counts and trust scores.
   */
  private computeValueSignal(
    results: ScoredContribution[]
  ): ValueSignal | null {
    if (results.length === 0) return null;

    const topRelevance = results[0].relevance;
    const highRelevanceCount = results.filter(
      (r) => r.relevance > 0.8
    ).length;

    if (highRelevanceCount >= 3) {
      return {
        type: 'strong_match',
        message: `${highRelevanceCount} highly relevant insights found on this topic.`,
        mentionWorthy: true,
      };
    }

    if (topRelevance > 0.9) {
      return {
        type: 'strong_match',
        message: 'Found a very closely related insight.',
        mentionWorthy: true,
      };
    }

    return null;
  }
}
