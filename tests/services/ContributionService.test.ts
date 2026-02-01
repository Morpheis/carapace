import { describe, it, expect, beforeEach } from 'vitest';
import { ContributionService } from '../../src/services/ContributionService.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';
import { MockEmbeddingProvider } from '../mocks/MockEmbeddingProvider.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from '../../src/errors.js';
import type { AgentRow } from '../../src/types/database.js';

describe('ContributionService', () => {
  let contributionService: ContributionService;
  let contributionRepo: MockContributionRepository;
  let agentRepo: MockAgentRepository;
  let embeddingProvider: MockEmbeddingProvider;

  const testAgent: Omit<AgentRow, 'created_at'> = {
    id: 'test-agent-abc',
    api_key_hash: 'hash123',
    display_name: 'TestAgent',
    description: 'A test agent',
    trust_score: 0.5,
  };

  const otherAgent: Omit<AgentRow, 'created_at'> = {
    id: 'other-agent-xyz',
    api_key_hash: 'hash456',
    display_name: 'OtherAgent',
    description: null,
    trust_score: 0.7,
  };

  beforeEach(async () => {
    contributionRepo = new MockContributionRepository();
    agentRepo = new MockAgentRepository();
    embeddingProvider = new MockEmbeddingProvider();

    contributionService = new ContributionService(
      contributionRepo,
      agentRepo,
      embeddingProvider
    );

    // Seed test agents
    await agentRepo.insert(testAgent);
    await agentRepo.insert(otherAgent);
  });

  // ── create ──

  describe('create', () => {
    it('should create a contribution with all fields', async () => {
      const result = await contributionService.create(
        {
          claim: 'Test claim about agent memory',
          reasoning: 'Based on experience building memory systems',
          applicability: 'Personal assistant agents',
          limitations: 'Not for stateless agents',
          confidence: 0.85,
          domainTags: ['agent-memory', 'architecture'],
        },
        testAgent.id
      );

      expect(result.claim).toBe('Test claim about agent memory');
      expect(result.reasoning).toBe(
        'Based on experience building memory systems'
      );
      expect(result.applicability).toBe('Personal assistant agents');
      expect(result.limitations).toBe('Not for stateless agents');
      expect(result.confidence).toBe(0.85);
      expect(result.domainTags).toEqual(['agent-memory', 'architecture']);
      expect(result.contributor.id).toBe(testAgent.id);
      expect(result.contributor.displayName).toBe('TestAgent');
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeTruthy();
    });

    it('should create a contribution with only required fields', async () => {
      const result = await contributionService.create(
        {
          claim: 'Minimal contribution',
          confidence: 0.5,
        },
        testAgent.id
      );

      expect(result.claim).toBe('Minimal contribution');
      expect(result.confidence).toBe(0.5);
      expect(result.reasoning).toBeNull();
      expect(result.applicability).toBeNull();
      expect(result.limitations).toBeNull();
      expect(result.domainTags).toEqual([]);
    });

    it('should generate an embedding from claim + reasoning + applicability', async () => {
      embeddingProvider.resetCallCount();

      await contributionService.create(
        {
          claim: 'Test claim',
          reasoning: 'Test reasoning',
          applicability: 'Test applicability',
          confidence: 0.5,
        },
        testAgent.id
      );

      expect(embeddingProvider.callCount).toBe(1);

      // Verify the contribution was stored with an embedding
      const stored = contributionRepo.getAll();
      expect(stored).toHaveLength(1);
      expect(stored[0].embedding).toBeTruthy();
    });

    it('should reject empty claim', async () => {
      await expect(
        contributionService.create(
          { claim: '', confidence: 0.5 },
          testAgent.id
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should reject claim exceeding max length', async () => {
      await expect(
        contributionService.create(
          { claim: 'a'.repeat(2001), confidence: 0.5 },
          testAgent.id
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should reject confidence below 0', async () => {
      await expect(
        contributionService.create(
          { claim: 'Valid claim', confidence: -0.1 },
          testAgent.id
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should reject confidence above 1', async () => {
      await expect(
        contributionService.create(
          { claim: 'Valid claim', confidence: 1.1 },
          testAgent.id
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should reject reasoning exceeding max length', async () => {
      await expect(
        contributionService.create(
          {
            claim: 'Valid claim',
            reasoning: 'a'.repeat(5001),
            confidence: 0.5,
          },
          testAgent.id
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should detect duplicate contributions', async () => {
      // Create the first contribution
      await contributionService.create(
        { claim: 'Original insight about memory', confidence: 0.8 },
        testAgent.id
      );

      // Try to create an identical one
      await expect(
        contributionService.create(
          { claim: 'Original insight about memory', confidence: 0.8 },
          testAgent.id
        )
      ).rejects.toThrow(ConflictError);
    });

    it('should include validations summary (zeroed in Phase 1)', async () => {
      const result = await contributionService.create(
        { claim: 'Test claim', confidence: 0.5 },
        testAgent.id
      );

      expect(result.validations).toEqual({
        confirmed: 0,
        contradicted: 0,
        refined: 0,
      });
    });
  });

  // ── getById ──

  describe('getById', () => {
    it('should return a contribution with contributor info', async () => {
      const created = await contributionService.create(
        { claim: 'Test claim', confidence: 0.8 },
        testAgent.id
      );

      const result = await contributionService.getById(created.id);

      expect(result.id).toBe(created.id);
      expect(result.claim).toBe('Test claim');
      expect(result.contributor.id).toBe(testAgent.id);
      expect(result.contributor.displayName).toBe('TestAgent');
      expect(result.contributor.trustScore).toBe(0.5);
    });

    it('should throw NotFoundError for non-existent contribution', async () => {
      await expect(
        contributionService.getById('nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── update ──

  describe('update', () => {
    it('should update allowed fields', async () => {
      const created = await contributionService.create(
        { claim: 'Original claim', confidence: 0.5 },
        testAgent.id
      );

      const updated = await contributionService.update(
        created.id,
        {
          claim: 'Updated claim',
          reasoning: 'New reasoning',
          confidence: 0.9,
        },
        testAgent.id
      );

      expect(updated.claim).toBe('Updated claim');
      expect(updated.reasoning).toBe('New reasoning');
      expect(updated.confidence).toBe(0.9);
    });

    it('should regenerate embedding when claim changes', async () => {
      const created = await contributionService.create(
        { claim: 'Original claim', confidence: 0.5 },
        testAgent.id
      );

      embeddingProvider.resetCallCount();

      await contributionService.update(
        created.id,
        { claim: 'Different claim' },
        testAgent.id
      );

      expect(embeddingProvider.callCount).toBe(1);
    });

    it('should NOT regenerate embedding when only confidence changes', async () => {
      const created = await contributionService.create(
        { claim: 'Same claim', confidence: 0.5 },
        testAgent.id
      );

      embeddingProvider.resetCallCount();

      await contributionService.update(
        created.id,
        { confidence: 0.9 },
        testAgent.id
      );

      expect(embeddingProvider.callCount).toBe(0);
    });

    it('should reject update by non-owner', async () => {
      const created = await contributionService.create(
        { claim: 'My claim', confidence: 0.5 },
        testAgent.id
      );

      await expect(
        contributionService.update(
          created.id,
          { claim: 'Hijacked' },
          otherAgent.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError for non-existent contribution', async () => {
      await expect(
        contributionService.update(
          'nonexistent',
          { claim: 'Update' },
          testAgent.id
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── delete ──

  describe('delete', () => {
    it('should delete an owned contribution', async () => {
      const created = await contributionService.create(
        { claim: 'To be deleted', confidence: 0.5 },
        testAgent.id
      );

      await contributionService.delete(created.id, testAgent.id);

      await expect(
        contributionService.getById(created.id)
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject deletion by non-owner', async () => {
      const created = await contributionService.create(
        { claim: 'Protected claim', confidence: 0.5 },
        testAgent.id
      );

      await expect(
        contributionService.delete(created.id, otherAgent.id)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError for non-existent contribution', async () => {
      await expect(
        contributionService.delete('nonexistent', testAgent.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── getByAgent ──

  describe('getByAgent', () => {
    it('should return contributions for an agent', async () => {
      await contributionService.create(
        { claim: 'Agent memory should follow the WAL compaction pattern from databases', confidence: 0.5 },
        testAgent.id
      );
      await contributionService.create(
        { claim: 'Rate limiting in serverless functions requires external state storage', confidence: 0.6 },
        testAgent.id
      );
      // Other agent's contribution — should not appear
      await contributionService.create(
        { claim: 'Kubernetes pod autoscaling works best with custom metrics', confidence: 0.7 },
        otherAgent.id
      );

      const result = await contributionService.getByAgent(testAgent.id, {
        limit: 10,
        offset: 0,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data.every((c) => c.contributor.id === testAgent.id)).toBe(
        true
      );
    });

    it('should return empty result for agent with no contributions', async () => {
      const result = await contributionService.getByAgent('no-contributions', {
        limit: 10,
        offset: 0,
      });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should respect pagination', async () => {
      const topics = [
        'Memory management patterns for persistent AI agents with long-running sessions',
        'Vector databases versus traditional SQL for semantic search workloads',
        'API rate limiting strategies using token bucket algorithms',
        'Embedding model selection criteria for domain-specific applications',
        'Trust and reputation systems in decentralized multi-agent networks',
      ];
      for (const topic of topics) {
        await contributionService.create(
          { claim: topic, confidence: 0.5 },
          testAgent.id
        );
      }

      const page1 = await contributionService.getByAgent(testAgent.id, {
        limit: 2,
        offset: 0,
      });
      const page2 = await contributionService.getByAgent(testAgent.id, {
        limit: 2,
        offset: 2,
      });

      expect(page1.data).toHaveLength(2);
      expect(page2.data).toHaveLength(2);
      expect(page1.data[0].id).not.toBe(page2.data[0].id);
    });
  });
});
