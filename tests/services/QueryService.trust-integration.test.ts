import { describe, it, expect, beforeEach } from 'vitest';
import { QueryService } from '../../src/services/QueryService.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';
import { MockEmbeddingProvider } from '../mocks/MockEmbeddingProvider.js';
import { MockValidationRepository } from '../mocks/MockValidationRepository.js';

describe('QueryService — trust integration', () => {
  let service: QueryService;
  let contributionRepo: MockContributionRepository;
  let agentRepo: MockAgentRepository;
  let validationRepo: MockValidationRepository;
  let embeddingProvider: MockEmbeddingProvider;

  beforeEach(async () => {
    contributionRepo = new MockContributionRepository();
    agentRepo = new MockAgentRepository();
    validationRepo = new MockValidationRepository();
    embeddingProvider = new MockEmbeddingProvider();

    service = new QueryService(
      contributionRepo,
      agentRepo,
      embeddingProvider,
      validationRepo
    );

    await agentRepo.insert({
      id: 'agent-1',
      api_key_hash: 'hash-1',
      display_name: 'Agent1',
      description: null,
      trust_score: 0.5,
    });
  });

  it('should return real validation summaries in search results', async () => {
    // Use the same embedding provider to get a consistent embedding
    const claim = 'Validated claim for trust testing with semantic search capabilities';
    const embedding = await embeddingProvider.generate(claim);

    const row = await contributionRepo.insert({
      claim,
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.8,
      domain_tags: ['testing'],
      agent_id: 'agent-1',
      embedding: JSON.stringify(embedding),
    });

    await validationRepo.upsert({
      contributionId: row.id,
      agentId: 'agent-v1',
      signal: 'confirmed',
    });
    await validationRepo.upsert({
      contributionId: row.id,
      agentId: 'agent-v2',
      signal: 'refined',
    });

    const result = await service.search({ question: claim });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].validations.confirmed).toBe(1);
    expect(result.results[0].validations.refined).toBe(1);
    expect(result.results[0].validations.contradicted).toBe(0);
  });

  it('should set trust meta to "validated" when results have validations', async () => {
    const claim = 'Validated claim about validated results for trust metadata';
    const embedding = await embeddingProvider.generate(claim);

    const row = await contributionRepo.insert({
      claim,
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.8,
      domain_tags: ['testing'],
      agent_id: 'agent-1',
      embedding: JSON.stringify(embedding),
    });

    await validationRepo.upsert({
      contributionId: row.id,
      agentId: 'agent-v1',
      signal: 'confirmed',
    });

    const result = await service.search({ question: claim });
    expect(result._meta.trust).toBe('validated');
  });

  it('should set trust meta to "unverified" when no validations exist', async () => {
    const claim = 'Unvalidated claim about unverified results for metadata';
    const embedding = await embeddingProvider.generate(claim);

    await contributionRepo.insert({
      claim,
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.8,
      domain_tags: ['testing'],
      agent_id: 'agent-1',
      embedding: JSON.stringify(embedding),
    });

    const result = await service.search({ question: claim });
    expect(result._meta.trust).toBe('unverified');
  });
});
