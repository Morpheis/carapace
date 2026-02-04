/**
 * In-memory mock for IContributionRepository.
 * Stores contributions in a Map, simulates vector search with cosine similarity.
 */

import type {
  IContributionRepository,
  VectorSearchOptions,
} from '../../src/repositories/IContributionRepository.js';
import type {
  ContributionRow,
  ScoredContributionRow,
} from '../../src/types/database.js';
import type { PaginationOptions } from '../../src/types/common.js';

export class MockContributionRepository implements IContributionRepository {
  private contributions = new Map<string, ContributionRow>();
  private nextId = 1;

  async insert(
    row: Omit<ContributionRow, 'id' | 'created_at' | 'updated_at'>
  ): Promise<ContributionRow> {
    const id = `test-${this.nextId++}`;
    const now = new Date().toISOString();

    const full: ContributionRow = {
      ...row,
      id,
      created_at: now,
      updated_at: now,
    };
    this.contributions.set(id, full);
    return full;
  }

  async findById(id: string): Promise<ContributionRow | null> {
    return this.contributions.get(id) ?? null;
  }

  async findByAgent(
    agentId: string,
    options: PaginationOptions
  ): Promise<ContributionRow[]> {
    const all = [...this.contributions.values()]
      .filter((c) => c.agent_id === agentId)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    return all.slice(options.offset, options.offset + options.limit);
  }

  async countByAgent(agentId: string): Promise<number> {
    return [...this.contributions.values()].filter(
      (c) => c.agent_id === agentId
    ).length;
  }

  async update(
    id: string,
    data: Partial<ContributionRow>
  ): Promise<ContributionRow> {
    const existing = this.contributions.get(id);
    if (!existing) {
      throw new Error(`Contribution with id "${id}" not found`);
    }

    const updated: ContributionRow = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString(),
    };
    this.contributions.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.contributions.delete(id);
  }

  async vectorSearch(
    embedding: number[],
    options: VectorSearchOptions
  ): Promise<ScoredContributionRow[]> {
    let results = [...this.contributions.values()];

    // Apply confidence filter
    if (options.minConfidence !== undefined) {
      results = results.filter((c) => c.confidence >= options.minConfidence!);
    }

    // Apply domain tag filter
    if (options.domainTags && options.domainTags.length > 0) {
      results = results.filter((c) =>
        options.domainTags!.some((tag) => c.domain_tags.includes(tag))
      );
    }

    // Simulate cosine similarity scoring
    const scored: ScoredContributionRow[] = results.map((c) => ({
      ...c,
      similarity: this.cosineSimilarity(
        embedding,
        JSON.parse(c.embedding) as number[]
      ),
    }));

    // Sort by similarity descending, take top N
    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.maxResults);
  }

  async findSimilar(
    embedding: number[],
    threshold: number
  ): Promise<ContributionRow[]> {
    return [...this.contributions.values()].filter((c) => {
      const sim = this.cosineSimilarity(
        embedding,
        JSON.parse(c.embedding) as number[]
      );
      return sim >= threshold;
    });
  }

  async count(): Promise<number> {
    return this.contributions.size;
  }

  async countDomains(): Promise<number> {
    const domains = new Set<string>();
    for (const c of this.contributions.values()) {
      for (const tag of c.domain_tags) {
        domains.add(tag);
      }
    }
    return domains.size;
  }

  async getDomainStats(): Promise<Array<{
    domain: string;
    contributionCount: number;
    avgConfidence: number;
    latestContribution: string;
  }>> {
    const domainMap = new Map<string, { count: number; totalConfidence: number; latest: string }>();

    for (const c of this.contributions.values()) {
      for (const tag of c.domain_tags) {
        const existing = domainMap.get(tag);
        if (existing) {
          existing.count++;
          existing.totalConfidence += c.confidence;
          if (c.created_at > existing.latest) {
            existing.latest = c.created_at;
          }
        } else {
          domainMap.set(tag, {
            count: 1,
            totalConfidence: c.confidence,
            latest: c.created_at,
          });
        }
      }
    }

    return [...domainMap.entries()]
      .map(([domain, stats]) => ({
        domain,
        contributionCount: stats.count,
        avgConfidence: stats.totalConfidence / stats.count,
        latestContribution: stats.latest,
      }))
      .sort((a, b) => b.contributionCount - a.contributionCount);
  }

  // ── Test Helpers ──

  clear(): void {
    this.contributions.clear();
    this.nextId = 1;
  }

  getAll(): ContributionRow[] {
    return [...this.contributions.values()];
  }

  // ── Private ──

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}
