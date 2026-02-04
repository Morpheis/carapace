/**
 * Contribution data access interface.
 */

import type { ContributionRow, ScoredContributionRow } from '../types/database.js';
import type { PaginationOptions } from '../types/common.js';

export interface VectorSearchOptions {
  maxResults: number;
  minConfidence?: number;
  domainTags?: string[];
}

export interface IContributionRepository {
  insert(
    row: Omit<ContributionRow, 'id' | 'created_at' | 'updated_at'>
  ): Promise<ContributionRow>;

  findById(id: string): Promise<ContributionRow | null>;

  findByAgent(
    agentId: string,
    options: PaginationOptions
  ): Promise<ContributionRow[]>;

  countByAgent(agentId: string): Promise<number>;

  update(id: string, data: Partial<ContributionRow>): Promise<ContributionRow>;

  delete(id: string): Promise<void>;

  vectorSearch(
    embedding: number[],
    options: VectorSearchOptions
  ): Promise<ScoredContributionRow[]>;

  findSimilar(
    embedding: number[],
    threshold: number
  ): Promise<ContributionRow[]>;

  /** BM25 full-text search. */
  bm25Search(
    query: string,
    options: VectorSearchOptions
  ): Promise<ScoredContributionRow[]>;

  /** Total number of contributions. */
  count(): Promise<number>;

  /** Number of unique domain tags across all contributions. */
  countDomains(): Promise<number>;

  /** Get aggregated domain statistics across all contributions. */
  getDomainStats(): Promise<Array<{
    domain: string;
    contributionCount: number;
    avgConfidence: number;
    latestContribution: string;
  }>>;
}
