import { describe, it, expect, beforeEach } from 'vitest';
import { ContributionService } from '../../src/services/ContributionService.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';
import { MockEmbeddingProvider } from '../mocks/MockEmbeddingProvider.js';
import { MockValidationRepository } from '../mocks/MockValidationRepository.js';

describe('ContributionService — validation integration', () => {
  let service: ContributionService;
  let contributionRepo: MockContributionRepository;
  let agentRepo: MockAgentRepository;
  let validationRepo: MockValidationRepository;

  beforeEach(async () => {
    contributionRepo = new MockContributionRepository();
    agentRepo = new MockAgentRepository();
    validationRepo = new MockValidationRepository();
    const embeddingProvider = new MockEmbeddingProvider();

    service = new ContributionService(
      contributionRepo,
      agentRepo,
      embeddingProvider,
      validationRepo
    );

    await agentRepo.insert({
      id: 'agent-owner',
      api_key_hash: 'hash-owner',
      display_name: 'Owner',
      description: null,
      trust_score: 0.5,
    });
  });

  it('should return real validation summaries when validation repo is provided', async () => {
    const contribution = await service.create(
      { claim: 'Test claim with validations', confidence: 0.8 },
      'agent-owner'
    );

    // Add validations directly
    await validationRepo.upsert({
      contributionId: contribution.id,
      agentId: 'agent-v1',
      signal: 'confirmed',
    });
    await validationRepo.upsert({
      contributionId: contribution.id,
      agentId: 'agent-v2',
      signal: 'confirmed',
    });
    await validationRepo.upsert({
      contributionId: contribution.id,
      agentId: 'agent-v3',
      signal: 'refined',
    });

    const result = await service.getById(contribution.id);
    expect(result.validations.confirmed).toBe(2);
    expect(result.validations.contradicted).toBe(0);
    expect(result.validations.refined).toBe(1);
  });

  it('should return zero summaries when no validations exist', async () => {
    const contribution = await service.create(
      { claim: 'Test claim without validations', confidence: 0.5 },
      'agent-owner'
    );

    const result = await service.getById(contribution.id);
    expect(result.validations.confirmed).toBe(0);
    expect(result.validations.contradicted).toBe(0);
    expect(result.validations.refined).toBe(0);
  });
});
