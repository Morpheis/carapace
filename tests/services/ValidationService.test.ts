import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from '../../src/services/ValidationService.js';
import { MockValidationRepository } from '../mocks/MockValidationRepository.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';

describe('ValidationService', () => {
  let service: ValidationService;
  let validationRepo: MockValidationRepository;
  let contributionRepo: MockContributionRepository;
  let agentRepo: MockAgentRepository;
  let contributionId: string;

  beforeEach(async () => {
    validationRepo = new MockValidationRepository();
    contributionRepo = new MockContributionRepository();
    agentRepo = new MockAgentRepository();
    service = new ValidationService(validationRepo, contributionRepo, agentRepo);

    // Seed agents
    await agentRepo.insert({
      id: 'agent-owner',
      api_key_hash: 'hash-owner',
      display_name: 'Owner',
      description: null,
      trust_score: 0.5,
    });
    await agentRepo.insert({
      id: 'agent-validator',
      api_key_hash: 'hash-validator',
      display_name: 'Validator',
      description: null,
      trust_score: 0.5,
    });
    await agentRepo.insert({
      id: 'agent-validator-2',
      api_key_hash: 'hash-validator-2',
      display_name: 'Validator2',
      description: null,
      trust_score: 0.5,
    });

    // Seed a contribution
    const row = await contributionRepo.insert({
      claim: 'Test claim for validation',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.8,
      domain_tags: ['testing'],
      agent_id: 'agent-owner',
      embedding: JSON.stringify([1, 0, 0]),
    });
    contributionId = row.id;
  });

  // --- validate() ---

  it('should validate a contribution', async () => {
    const result = await service.validate(
      contributionId,
      { signal: 'confirmed', context: 'I agree with this claim' },
      'agent-validator'
    );

    expect(result.contribution_id).toBe(contributionId);
    expect(result.agent_id).toBe('agent-validator');
    expect(result.signal).toBe('confirmed');
    expect(result.context).toBe('I agree with this claim');
  });

  it('should not allow self-validation', async () => {
    await expect(
      service.validate(contributionId, { signal: 'confirmed' }, 'agent-owner')
    ).rejects.toThrow('Cannot validate your own contribution');
  });

  it('should update existing validation (upsert)', async () => {
    await service.validate(contributionId, { signal: 'confirmed' }, 'agent-validator');
    const updated = await service.validate(
      contributionId,
      { signal: 'contradicted', context: 'Changed my mind' },
      'agent-validator'
    );

    expect(updated.signal).toBe('contradicted');
    expect(updated.context).toBe('Changed my mind');

    // Should still be only one validation
    const all = await service.getValidations(contributionId);
    expect(all).toHaveLength(1);
  });

  it('should return validation summary counts', async () => {
    await service.validate(contributionId, { signal: 'confirmed' }, 'agent-validator');
    await service.validate(contributionId, { signal: 'refined' }, 'agent-validator-2');

    const summary = await service.getSummary(contributionId);
    expect(summary.confirmed).toBe(1);
    expect(summary.contradicted).toBe(0);
    expect(summary.refined).toBe(1);
  });

  it('should throw NotFoundError for nonexistent contribution', async () => {
    await expect(
      service.validate(
        '00000000-0000-0000-0000-000000000000',
        { signal: 'confirmed' },
        'agent-validator'
      )
    ).rejects.toThrow('not found');
  });

  it('should throw ForbiddenError for self-validation', async () => {
    try {
      await service.validate(contributionId, { signal: 'confirmed' }, 'agent-owner');
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ForbiddenError');
    }
  });

  it('should validate signal enum', async () => {
    await expect(
      service.validate(contributionId, { signal: 'invalid' as any }, 'agent-validator')
    ).rejects.toThrow('Invalid signal');
  });

  it('should validate context length', async () => {
    const longContext = 'x'.repeat(2001);
    await expect(
      service.validate(contributionId, { signal: 'confirmed', context: longContext }, 'agent-validator')
    ).rejects.toThrow('Context exceeds maximum length');
  });

  it('should accept context at exactly max length', async () => {
    const maxContext = 'x'.repeat(2000);
    const result = await service.validate(
      contributionId,
      { signal: 'confirmed', context: maxContext },
      'agent-validator'
    );
    expect(result.context).toBe(maxContext);
  });

  it('should remove a validation', async () => {
    await service.validate(contributionId, { signal: 'confirmed' }, 'agent-validator');
    await service.removeValidation(contributionId, 'agent-validator');

    const all = await service.getValidations(contributionId);
    expect(all).toHaveLength(0);
  });

  it('should allow multiple agents to validate same contribution', async () => {
    await service.validate(contributionId, { signal: 'confirmed' }, 'agent-validator');
    await service.validate(contributionId, { signal: 'contradicted' }, 'agent-validator-2');

    const all = await service.getValidations(contributionId);
    expect(all).toHaveLength(2);
  });

  it('should throw NotFoundError when getting validations for nonexistent contribution', async () => {
    await expect(
      service.getValidations('00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow('not found');
  });
});
