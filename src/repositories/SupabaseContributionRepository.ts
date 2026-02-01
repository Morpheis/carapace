/**
 * Supabase implementation of IContributionRepository.
 * Uses pgvector for semantic similarity search.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IContributionRepository,
  VectorSearchOptions,
} from './IContributionRepository.js';
import type {
  ContributionRow,
  ScoredContributionRow,
} from '../types/database.js';
import type { PaginationOptions } from '../types/common.js';

export class SupabaseContributionRepository
  implements IContributionRepository
{
  constructor(private readonly db: SupabaseClient) {}

  async insert(
    row: Omit<ContributionRow, 'id' | 'created_at' | 'updated_at'>
  ): Promise<ContributionRow> {
    const { data, error } = await this.db
      .from('contributions')
      .insert({
        claim: row.claim,
        reasoning: row.reasoning,
        applicability: row.applicability,
        limitations: row.limitations,
        confidence: row.confidence,
        domain_tags: row.domain_tags,
        agent_id: row.agent_id,
        embedding: row.embedding,
      })
      .select()
      .single();

    if (error)
      throw new Error(`Failed to insert contribution: ${error.message}`);
    return data as ContributionRow;
  }

  async findById(id: string): Promise<ContributionRow | null> {
    const { data, error } = await this.db
      .from('contributions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error)
      throw new Error(`Failed to find contribution: ${error.message}`);
    return data as ContributionRow | null;
  }

  async findByAgent(
    agentId: string,
    options: PaginationOptions
  ): Promise<ContributionRow[]> {
    const { data, error } = await this.db
      .from('contributions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (error)
      throw new Error(`Failed to find contributions: ${error.message}`);
    return (data ?? []) as ContributionRow[];
  }

  async countByAgent(agentId: string): Promise<number> {
    const { count, error } = await this.db
      .from('contributions')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId);

    if (error) throw new Error(`Failed to count contributions: ${error.message}`);
    return count ?? 0;
  }

  async update(
    id: string,
    data: Partial<ContributionRow>
  ): Promise<ContributionRow> {
    const { data: updated, error } = await this.db
      .from('contributions')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error)
      throw new Error(`Failed to update contribution: ${error.message}`);
    return updated as ContributionRow;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from('contributions')
      .delete()
      .eq('id', id);

    if (error)
      throw new Error(`Failed to delete contribution: ${error.message}`);
  }

  /**
   * Vector similarity search using pgvector.
   * Calls a Supabase RPC function that handles the cosine similarity query.
   */
  async vectorSearch(
    embedding: number[],
    options: VectorSearchOptions
  ): Promise<ScoredContributionRow[]> {
    const { data, error } = await this.db.rpc('search_contributions', {
      query_embedding: JSON.stringify(embedding),
      match_count: options.maxResults,
      min_confidence: options.minConfidence ?? 0,
      filter_domain_tags: options.domainTags ?? [],
    });

    if (error)
      throw new Error(`Failed to search contributions: ${error.message}`);
    return (data ?? []) as ScoredContributionRow[];
  }

  /**
   * Find contributions with similarity above threshold.
   * Used for duplicate detection.
   */
  async findSimilar(
    embedding: number[],
    threshold: number
  ): Promise<ContributionRow[]> {
    const { data, error } = await this.db.rpc('find_similar_contributions', {
      query_embedding: JSON.stringify(embedding),
      similarity_threshold: threshold,
      max_results: 5,
    });

    if (error)
      throw new Error(`Failed to find similar contributions: ${error.message}`);
    return (data ?? []) as ContributionRow[];
  }
}
