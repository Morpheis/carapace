import { describe, it, expect, beforeEach } from 'vitest';
import { TrustService } from '../../src/services/TrustService.js';
import { MockValidationRepository } from '../mocks/MockValidationRepository.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';

describe('TrustService', () => {
  let service: TrustService;
  let validationRepo: MockValidationRepository;
  let contributionRepo: MockContributionRepository;
  let agentRepo: MockAgentRepository;
  let contributionId: string;

  beforeEach(async () => {
    validationRepo = new MockValidationRepository();
    contributionRepo = new MockContributionRepository();
    agentRepo = new MockAgentRepository();
    service = new TrustService(validationRepo, contributionRepo, agentRepo);

    // Seed agents
    await agentRepo.insert({
      id: 'agent-owner',
      api_key_hash: 'hash-owner',
      display_name: 'Owner',
      description: null,
      trust_score: 0.5,
    });
    await agentRepo.insert({
      id: 'agent-v1',
      api_key_hash: 'hash-v1',
      display_name: 'Validator1',
      description: null,
      trust_score: 0.5,
    });
    await agentRepo.insert({
      id: 'agent-v2',
      api_key_hash: 'hash-v2',
      display_name: 'Validator2',
      description: null,
      trust_score: 0.5,
    });

    // Seed a contribution
    const row = await contributionRepo.insert({
      claim: 'Test claim for trust scoring',
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

  // --- computeContributionTrust() ---

  it('should compute contribution trust with no validations (base score)', async () => {
    const result = await service.computeContributionTrust(contributionId);

    // base = agentTrust (0.5) * confidence (0.8) = 0.4
    expect(result.score).toBeCloseTo(0.4, 5);
    expect(result.breakdown.base).toBeCloseTo(0.4, 5);
    expect(result.breakdown.validationBoost).toBe(0);
    expect(result.breakdown.confirmed).toBe(0);
    expect(result.breakdown.contradicted).toBe(0);
    expect(result.breakdown.refined).toBe(0);
  });

  it('should increase trust with confirmations', async () => {
    await validationRepo.upsert({
      contributionId,
      agentId: 'agent-v1',
      signal: 'confirmed',
    });
    await validationRepo.upsert({
      contributionId,
      agentId: 'agent-v2',
      signal: 'confirmed',
    });

    const result = await service.computeContributionTrust(contributionId);

    // base = 0.4, boost = 0.1 * 2 = 0.2, total = 0.6
    expect(result.score).toBeCloseTo(0.6, 5);
    expect(result.breakdown.confirmed).toBe(2);
  });

  it('should decrease trust with contradictions', async () => {
    await validationRepo.upsert({
      contributionId,
      agentId: 'agent-v1',
      signal: 'contradicted',
    });

    const result = await service.computeContributionTrust(contributionId);

    // base = 0.4, boost = -0.15, total = 0.25
    expect(result.score).toBeCloseTo(0.25, 5);
    expect(result.breakdown.contradicted).toBe(1);
  });

  it('should never exceed 1.0', async () => {
    // Set agent trust to 1.0 and confidence to 1.0
    await agentRepo.update('agent-owner', { trust_score: 1.0 });
    const highConf = await contributionRepo.insert({
      claim: 'Perfect claim',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 1.0,
      domain_tags: [],
      agent_id: 'agent-owner',
      embedding: JSON.stringify([1, 1, 0]),
    });

    // Add many confirmations
    for (let i = 0; i < 20; i++) {
      await validationRepo.upsert({
        contributionId: highConf.id,
        agentId: `agent-confirmer-${i}`,
        signal: 'confirmed',
      });
    }

    const result = await service.computeContributionTrust(highConf.id);
    expect(result.score).toBe(1.0);
  });

  it('should never go below 0.0', async () => {
    // Add many contradictions
    for (let i = 0; i < 20; i++) {
      await validationRepo.upsert({
        contributionId,
        agentId: `agent-contradictor-${i}`,
        signal: 'contradicted',
      });
    }

    const result = await service.computeContributionTrust(contributionId);
    expect(result.score).toBe(0.0);
  });

  // --- computeAgentTrust() ---

  it('should start agent trust at 0.5 with no contributions', async () => {
    const trust = await service.computeAgentTrust('agent-v1');
    expect(trust).toBe(0.5);
  });

  it('should increase agent trust when contributions are confirmed', async () => {
    // agent-owner has one contribution, which gets confirmed
    await validationRepo.upsert({
      contributionId,
      agentId: 'agent-v1',
      signal: 'confirmed',
    });

    const trust = await service.computeAgentTrust('agent-owner');
    // base 0.5 + 0.02 (one confirmed contribution) = 0.52
    expect(trust).toBeCloseTo(0.52, 5);
  });

  it('should decrease agent trust when contributions are contradicted', async () => {
    await validationRepo.upsert({
      contributionId,
      agentId: 'agent-v1',
      signal: 'contradicted',
    });

    const trust = await service.computeAgentTrust('agent-owner');
    // base 0.5 - 0.03 (one contradicted contribution) = 0.47
    expect(trust).toBeCloseTo(0.47, 5);
  });

  it('should clamp agent trust to [0.1, 1.0]', async () => {
    // Create many contradicted contributions
    for (let i = 0; i < 50; i++) {
      const c = await contributionRepo.insert({
        claim: `Bad claim ${i}`,
        reasoning: null,
        applicability: null,
        limitations: null,
        confidence: 0.5,
        domain_tags: [],
        agent_id: 'agent-owner',
        embedding: JSON.stringify([i, 0, 0]),
      });
      await validationRepo.upsert({
        contributionId: c.id,
        agentId: 'agent-v1',
        signal: 'contradicted',
      });
    }

    const trust = await service.computeAgentTrust('agent-owner');
    expect(trust).toBe(0.1);

    // Create many confirmed contributions for agent-v1
    for (let i = 0; i < 50; i++) {
      const c = await contributionRepo.insert({
        claim: `Good claim ${i}`,
        reasoning: null,
        applicability: null,
        limitations: null,
        confidence: 0.5,
        domain_tags: [],
        agent_id: 'agent-v1',
        embedding: JSON.stringify([0, i, 0]),
      });
      await validationRepo.upsert({
        contributionId: c.id,
        agentId: 'agent-v2',
        signal: 'confirmed',
      });
    }

    const highTrust = await service.computeAgentTrust('agent-v1');
    expect(highTrust).toBe(1.0);
  });

  // --- updateAgentTrust() ---

  it('should persist computed trust score', async () => {
    await validationRepo.upsert({
      contributionId,
      agentId: 'agent-v1',
      signal: 'confirmed',
    });

    const newTrust = await service.updateAgentTrust('agent-owner');
    expect(newTrust).toBeCloseTo(0.52, 5);

    // Verify it was persisted
    const agent = await agentRepo.findById('agent-owner');
    expect(agent!.trust_score).toBeCloseTo(0.52, 5);
  });
});
