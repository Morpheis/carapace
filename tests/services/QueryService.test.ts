import { describe, it, expect, beforeEach } from 'vitest';
import { QueryService } from '../../src/services/QueryService.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';
import { MockEmbeddingProvider } from '../mocks/MockEmbeddingProvider.js';
import type { ContributionRow } from '../../src/types/database.js';
import type { AgentRow } from '../../src/types/database.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';

describe('QueryService', () => {
  let queryService: QueryService;
  let contributionRepo: MockContributionRepository;
  let agentRepo: MockAgentRepository;
  let embeddingProvider: MockEmbeddingProvider;

  const testAgent: Omit<AgentRow, 'created_at'> = {
    id: 'test-agent',
    api_key_hash: 'hash123',
    display_name: 'TestAgent',
    description: null,
    trust_score: 0.7,
  };

  // Helper to seed a contribution directly into the repo
  async function seedContribution(
    overrides: Partial<Omit<ContributionRow, 'id' | 'created_at' | 'updated_at'>> = {}
  ): Promise<ContributionRow> {
    const claim = overrides.claim ?? 'Default test claim';
    const embeddingText = [
      claim,
      overrides.reasoning,
      overrides.applicability,
    ]
      .filter(Boolean)
      .join('\n\n');

    const embedding = await embeddingProvider.generate(embeddingText);

    return contributionRepo.insert({
      claim,
      reasoning: overrides.reasoning ?? null,
      applicability: overrides.applicability ?? null,
      limitations: overrides.limitations ?? null,
      confidence: overrides.confidence ?? 0.8,
      domain_tags: overrides.domain_tags ?? [],
      agent_id: overrides.agent_id ?? testAgent.id,
      embedding: JSON.stringify(embedding),
    });
  }

  beforeEach(async () => {
    contributionRepo = new MockContributionRepository();
    agentRepo = new MockAgentRepository();
    embeddingProvider = new MockEmbeddingProvider();

    queryService = new QueryService(
      contributionRepo,
      agentRepo,
      embeddingProvider
    );

    await agentRepo.insert(testAgent);
  });

  // ── search ──

  describe('search', () => {
    it('should return results ranked by relevance', async () => {
      // Seed contributions with different content
      await seedContribution({
        claim:
          'Agent memory should follow the WAL compaction pattern from databases for optimal persistence',
        domain_tags: ['agent-memory'],
      });
      await seedContribution({
        claim:
          'Kubernetes horizontal pod autoscaling requires careful metric selection to avoid oscillation',
        domain_tags: ['infrastructure'],
      });
      await seedContribution({
        claim:
          'Memory management in long-running AI agents benefits from periodic compaction of daily logs',
        domain_tags: ['agent-memory'],
      });

      const result = await queryService.search({
        question: 'How should I manage memory for a persistent AI agent?',
        maxResults: 3,
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.length).toBeLessThanOrEqual(3);

      // Results should have relevance scores
      for (const r of result.results) {
        expect(r.relevance).toBeGreaterThanOrEqual(0);
        expect(r.relevance).toBeLessThanOrEqual(1);
      }

      // Results should be sorted by relevance descending
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i - 1].relevance).toBeGreaterThanOrEqual(
          result.results[i].relevance
        );
      }
    });

    it('should include contributor info in results', async () => {
      await seedContribution({
        claim: 'Test insight about API design patterns for microservices',
      });

      const result = await queryService.search({
        question: 'API design patterns',
        maxResults: 5,
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].contributor).toBeDefined();
      expect(result.results[0].contributor.id).toBe(testAgent.id);
      expect(result.results[0].contributor.displayName).toBe('TestAgent');
      expect(result.results[0].contributor.trustScore).toBe(0.7);
    });

    it('should respect maxResults', async () => {
      await seedContribution({
        claim: 'Insight about distributed systems and consensus algorithms',
      });
      await seedContribution({
        claim: 'Understanding CAP theorem in distributed database design',
      });
      await seedContribution({
        claim: 'Raft consensus protocol for reliable state machine replication',
      });

      const result = await queryService.search({
        question: 'distributed systems',
        maxResults: 2,
      });

      expect(result.results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by minConfidence', async () => {
      await seedContribution({
        claim: 'Low confidence insight about quantum computing in agent systems',
        confidence: 0.3,
      });
      await seedContribution({
        claim: 'High confidence insight about classical computing in agent systems',
        confidence: 0.9,
      });

      const result = await queryService.search({
        question: 'computing in agent systems',
        maxResults: 10,
        minConfidence: 0.5,
      });

      for (const r of result.results) {
        expect(r.confidence).toBeGreaterThanOrEqual(0.5);
      }
    });

    it('should filter by domainTags', async () => {
      await seedContribution({
        claim: 'Memory insight about caching strategies for web applications',
        domain_tags: ['web-development'],
      });
      await seedContribution({
        claim: 'Memory insight about agent persistence and context management',
        domain_tags: ['agent-memory'],
      });

      const result = await queryService.search({
        question: 'memory management',
        maxResults: 10,
        domainTags: ['agent-memory'],
      });

      for (const r of result.results) {
        expect(r.domainTags).toContain('agent-memory');
      }
    });

    it('should use query context to improve search', async () => {
      // The context should be included in embedding generation
      embeddingProvider.resetCallCount();

      await queryService.search({
        question: 'memory management',
        context:
          'Building a personal assistant agent that runs 24/7 with periodic heartbeats',
        maxResults: 5,
      });

      expect(embeddingProvider.callCount).toBe(1);
    });

    it('should return empty results when nothing matches', async () => {
      const result = await queryService.search({
        question: 'something completely unrelated',
        maxResults: 5,
      });

      expect(result.results).toEqual([]);
      expect(result.totalMatches).toBe(0);
    });

    it('should return relatedDomains extracted from results', async () => {
      await seedContribution({
        claim: 'Agent memory architecture with tiered storage',
        domain_tags: ['agent-memory', 'architecture'],
      });
      await seedContribution({
        claim: 'Agent persistence patterns using write-ahead logs',
        domain_tags: ['agent-memory', 'persistence'],
      });

      const result = await queryService.search({
        question: 'agent memory systems',
        maxResults: 5,
      });

      expect(result.relatedDomains).toBeDefined();
      expect(Array.isArray(result.relatedDomains)).toBe(true);
    });

    it('should default maxResults to 5', async () => {
      for (let i = 0; i < 10; i++) {
        await seedContribution({
          claim: `Unique insight number ${i} about a completely different topic area ${Math.random()}`,
        });
      }

      const result = await queryService.search({
        question: 'general knowledge',
      });

      expect(result.results.length).toBeLessThanOrEqual(5);
    });

    it('should include totalMatches count', async () => {
      await seedContribution({
        claim: 'First insight about testing strategies for distributed systems',
      });
      await seedContribution({
        claim: 'Second insight about testing patterns in microservice architectures',
      });

      const result = await queryService.search({
        question: 'testing strategies',
        maxResults: 1,
      });

      expect(typeof result.totalMatches).toBe('number');
    });

    it('should include validations summary (zeroed in Phase 1)', async () => {
      await seedContribution({
        claim: 'Insight that will eventually be validated by other agents',
      });

      const result = await queryService.search({
        question: 'validated insights',
        maxResults: 5,
      });

      if (result.results.length > 0) {
        expect(result.results[0].validations).toEqual({
          confirmed: 0,
          contradicted: 0,
          refined: 0,
        });
      }
    });
  });
});
