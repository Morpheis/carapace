import { describe, it, expect, beforeEach } from 'vitest';
import { DomainService } from '../../src/services/DomainService.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';

describe('DomainService', () => {
  let service: DomainService;
  let contributionRepo: MockContributionRepository;

  beforeEach(() => {
    contributionRepo = new MockContributionRepository();
    service = new DomainService(contributionRepo);
  });

  it('should return domain stats from contributions', async () => {
    await contributionRepo.insert({
      claim: 'Claim A',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.8,
      domain_tags: ['security', 'networking'],
      agent_id: 'agent-1',
      embedding: JSON.stringify([1, 0, 0]),
    });
    await contributionRepo.insert({
      claim: 'Claim B',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.6,
      domain_tags: ['security'],
      agent_id: 'agent-2',
      embedding: JSON.stringify([0, 1, 0]),
    });

    const domains = await service.getDomains();

    expect(domains).toHaveLength(2);
    // security has 2 contributions, networking has 1
    expect(domains[0].domain).toBe('security');
    expect(domains[0].contributionCount).toBe(2);
    expect(domains[0].avgConfidence).toBeCloseTo(0.7, 5);
    expect(domains[1].domain).toBe('networking');
    expect(domains[1].contributionCount).toBe(1);
  });

  it('should handle no contributions (empty array)', async () => {
    const domains = await service.getDomains();
    expect(domains).toEqual([]);
  });

  it('should sort by count descending', async () => {
    await contributionRepo.insert({
      claim: 'Claim A',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.5,
      domain_tags: ['rare'],
      agent_id: 'agent-1',
      embedding: JSON.stringify([1, 0, 0]),
    });
    await contributionRepo.insert({
      claim: 'Claim B',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.5,
      domain_tags: ['common'],
      agent_id: 'agent-1',
      embedding: JSON.stringify([0, 1, 0]),
    });
    await contributionRepo.insert({
      claim: 'Claim C',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.5,
      domain_tags: ['common'],
      agent_id: 'agent-2',
      embedding: JSON.stringify([0, 0, 1]),
    });

    const domains = await service.getDomains();
    expect(domains[0].domain).toBe('common');
    expect(domains[0].contributionCount).toBe(2);
    expect(domains[1].domain).toBe('rare');
    expect(domains[1].contributionCount).toBe(1);
  });

  it('should deduplicate across contributions', async () => {
    // Same domain on two different contributions
    await contributionRepo.insert({
      claim: 'Claim A',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.9,
      domain_tags: ['ai', 'ml'],
      agent_id: 'agent-1',
      embedding: JSON.stringify([1, 0, 0]),
    });
    await contributionRepo.insert({
      claim: 'Claim B',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.7,
      domain_tags: ['ai'],
      agent_id: 'agent-2',
      embedding: JSON.stringify([0, 1, 0]),
    });

    const domains = await service.getDomains();
    const aiDomain = domains.find((d) => d.domain === 'ai');
    expect(aiDomain).toBeDefined();
    expect(aiDomain!.contributionCount).toBe(2);
    expect(aiDomain!.avgConfidence).toBeCloseTo(0.8, 5);
  });
});
