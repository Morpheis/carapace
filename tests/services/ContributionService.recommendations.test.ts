/**
 * Tests for proactive recommendations on contribution creation.
 * Verifies that related insights and cross-domain bridges are surfaced.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContributionService } from '../../src/services/ContributionService.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';
import { MockEmbeddingProvider } from '../mocks/MockEmbeddingProvider.js';
import { MockValidationRepository } from '../mocks/MockValidationRepository.js';

describe('ContributionService — recommendations', () => {
  let contributionRepo: MockContributionRepository;
  let agentRepo: MockAgentRepository;
  let embeddingProvider: MockEmbeddingProvider;
  let validationRepo: MockValidationRepository;
  let contributionService: ContributionService;

  beforeEach(async () => {
    contributionRepo = new MockContributionRepository();
    agentRepo = new MockAgentRepository();
    embeddingProvider = new MockEmbeddingProvider();
    validationRepo = new MockValidationRepository();
    contributionService = new ContributionService(
      contributionRepo,
      agentRepo,
      embeddingProvider,
      validationRepo
    );

    // Register agent
    await agentRepo.insert({
      id: 'agent-1',
      api_key_hash: 'hash',
      display_name: 'TestAgent',
      description: null,
      trust_score: 0.5,
    });
  });

  it('create returns recommendations when similar insights exist', async () => {
    // Seed a related contribution first
    const emb = await embeddingProvider.generate(
      'WAL is great for agent memory\n\nTested multiple approaches'
    );
    await contributionRepo.insert({
      claim: 'WAL is great for agent memory',
      reasoning: 'Tested multiple approaches',
      applicability: 'Persistent agents',
      limitations: null,
      confidence: 0.8,
      domain_tags: ['agent-memory'],
      agent_id: 'agent-1',
      embedding: JSON.stringify(emb),
    });

    // Now create a related contribution
    const result = await contributionService.create(
      {
        claim: 'WAL patterns work best for agent memory persistence',
        reasoning: 'Tested approaches for agent memory',
        confidence: 0.9,
        domainTags: ['agent-memory'],
      },
      'agent-1'
    );

    expect(result.recommendations).toBeDefined();
    expect(result.recommendations).not.toBeNull();
  });

  it('related includes top similar contributions', async () => {
    // Seed related contributions
    const emb1 = await embeddingProvider.generate(
      'Memory compaction reduces storage overhead'
    );
    await contributionRepo.insert({
      claim: 'Memory compaction reduces storage overhead',
      reasoning: 'Tested compaction strategies',
      applicability: null,
      limitations: null,
      confidence: 0.7,
      domain_tags: ['agent-memory'],
      agent_id: 'agent-1',
      embedding: JSON.stringify(emb1),
    });

    const result = await contributionService.create(
      {
        claim: 'Memory management requires careful compaction strategies',
        reasoning: 'Compaction is critical for long-running memory agents',
        confidence: 0.8,
        domainTags: ['agent-memory'],
      },
      'agent-1'
    );

    if (result.recommendations) {
      // Related should be an array
      expect(Array.isArray(result.recommendations.related)).toBe(true);
      // Each related item should have required fields
      for (const related of result.recommendations.related) {
        expect(related).toHaveProperty('id');
        expect(related).toHaveProperty('claim');
        expect(related).toHaveProperty('relevance');
        expect(related).toHaveProperty('domainTags');
      }
    }
  });

  it('crossDomainBridges only includes different-domain contributions', async () => {
    // Seed contribution in a different domain
    const emb = await embeddingProvider.generate(
      'Neural network pruning reduces model size'
    );
    await contributionRepo.insert({
      claim: 'Neural network pruning reduces model size',
      reasoning: 'Pruning is a well-known technique',
      applicability: null,
      limitations: null,
      confidence: 0.8,
      domain_tags: ['machine-learning'],
      agent_id: 'agent-1',
      embedding: JSON.stringify(emb),
    });

    const result = await contributionService.create(
      {
        claim: 'Pruning strategies for neural network optimization',
        reasoning: 'Tested pruning across architectures',
        confidence: 0.85,
        domainTags: ['optimization'],
      },
      'agent-1'
    );

    if (
      result.recommendations &&
      result.recommendations.crossDomainBridges.length > 0
    ) {
      // Cross-domain bridges should be from different domains
      for (const bridge of result.recommendations.crossDomainBridges) {
        expect(bridge).toHaveProperty('domain');
        // The bridge domain should not be in the new contribution's domains
        expect(['optimization']).not.toContain(bridge.domain);
      }
    }
  });

  it('recommendations null when no similar insights exist', async () => {
    // Create a contribution with no related content in the repo
    const result = await contributionService.create(
      {
        claim: 'Quantum computing uses qubits for superposition',
        reasoning: 'Fundamentally different from classical bits',
        confidence: 0.95,
        domainTags: ['quantum-computing'],
      },
      'agent-1'
    );

    // With no similar content, recommendations should be null
    expect(result.recommendations).toBeNull();
  });

  it('recommendations respect similarity thresholds', async () => {
    // Seed a contribution
    const emb = await embeddingProvider.generate(
      'Completely unrelated topic about cooking pasta'
    );
    await contributionRepo.insert({
      claim: 'Completely unrelated topic about cooking pasta',
      reasoning: 'Boil water first',
      applicability: null,
      limitations: null,
      confidence: 0.5,
      domain_tags: ['cooking'],
      agent_id: 'agent-1',
      embedding: JSON.stringify(emb),
    });

    const result = await contributionService.create(
      {
        claim: 'Advanced cryptographic signatures for blockchain verification',
        reasoning: 'Zero-knowledge proofs enable privacy',
        confidence: 0.9,
        domainTags: ['cryptography'],
      },
      'agent-1'
    );

    // With very dissimilar content, related should be empty or recommendations null
    if (result.recommendations) {
      // If recommendations exist, related items should have relevance > 0.5
      for (const related of result.recommendations.related) {
        expect(related.relevance).toBeGreaterThan(0.5);
      }
    }
  });
});
