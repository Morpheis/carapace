import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionService } from '../../src/services/ConnectionService.js';
import { MockConnectionRepository } from '../mocks/MockConnectionRepository.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';

describe('ConnectionService', () => {
  let service: ConnectionService;
  let connectionRepo: MockConnectionRepository;
  let contributionRepo: MockContributionRepository;
  let sourceId: string;
  let targetId: string;

  beforeEach(async () => {
    connectionRepo = new MockConnectionRepository();
    contributionRepo = new MockContributionRepository();
    service = new ConnectionService(connectionRepo, contributionRepo);

    // Seed two contributions
    const source = await contributionRepo.insert({
      claim: 'Source claim',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.8,
      domain_tags: ['testing'],
      agent_id: 'agent-1',
      embedding: JSON.stringify([1, 0, 0]),
    });
    sourceId = source.id;

    const target = await contributionRepo.insert({
      claim: 'Target claim',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.7,
      domain_tags: ['testing'],
      agent_id: 'agent-2',
      embedding: JSON.stringify([0, 1, 0]),
    });
    targetId = target.id;
  });

  // --- create() ---

  it('should create a connection', async () => {
    const result = await service.create(
      { sourceId, targetId, relationship: 'builds-on' },
      'agent-1'
    );

    expect(result.source_id).toBe(sourceId);
    expect(result.target_id).toBe(targetId);
    expect(result.relationship).toBe('builds-on');
    expect(result.agent_id).toBe('agent-1');
  });

  it('should not connect contribution to itself', async () => {
    await expect(
      service.create(
        { sourceId, targetId: sourceId, relationship: 'builds-on' },
        'agent-1'
      )
    ).rejects.toThrow('Cannot connect a contribution to itself');
  });

  it('should not create duplicate connection (same agent, same pair)', async () => {
    await service.create(
      { sourceId, targetId, relationship: 'builds-on' },
      'agent-1'
    );

    await expect(
      service.create(
        { sourceId, targetId, relationship: 'builds-on' },
        'agent-1'
      )
    ).rejects.toThrow('Connection already exists');
  });

  it('should allow different agents to create same relationship between same pair', async () => {
    await service.create(
      { sourceId, targetId, relationship: 'builds-on' },
      'agent-1'
    );
    const result = await service.create(
      { sourceId, targetId, relationship: 'builds-on' },
      'agent-2'
    );

    expect(result.agent_id).toBe('agent-2');
    expect(connectionRepo.items).toHaveLength(2);
  });

  it('should return connections for a contribution (both directions)', async () => {
    // Create a third contribution
    const third = await contributionRepo.insert({
      claim: 'Third claim',
      reasoning: null,
      applicability: null,
      limitations: null,
      confidence: 0.6,
      domain_tags: ['testing'],
      agent_id: 'agent-3',
      embedding: JSON.stringify([0, 0, 1]),
    });

    // sourceId → targetId
    await service.create(
      { sourceId, targetId, relationship: 'builds-on' },
      'agent-1'
    );
    // third → sourceId
    await service.create(
      { sourceId: third.id, targetId: sourceId, relationship: 'contradicts' },
      'agent-3'
    );

    const connections = await service.getConnections(sourceId);
    expect(connections).toHaveLength(2);
  });

  it('should throw NotFoundError for nonexistent source contribution', async () => {
    await expect(
      service.create(
        { sourceId: 'nonexistent', targetId, relationship: 'builds-on' },
        'agent-1'
      )
    ).rejects.toThrow('not found');
  });

  it('should throw NotFoundError for nonexistent target contribution', async () => {
    await expect(
      service.create(
        { sourceId, targetId: 'nonexistent', relationship: 'builds-on' },
        'agent-1'
      )
    ).rejects.toThrow('not found');
  });

  it('should validate relationship enum', async () => {
    await expect(
      service.create(
        { sourceId, targetId, relationship: 'invalid' as any },
        'agent-1'
      )
    ).rejects.toThrow('Invalid relationship');
  });

  it('should accept all valid relationship types', async () => {
    const relationships = ['builds-on', 'contradicts', 'generalizes', 'applies-to'] as const;
    for (let i = 0; i < relationships.length; i++) {
      // Create unique target for each to avoid duplicate constraint
      const t = await contributionRepo.insert({
        claim: `Target ${i}`,
        reasoning: null,
        applicability: null,
        limitations: null,
        confidence: 0.5,
        domain_tags: [],
        agent_id: 'agent-2',
        embedding: JSON.stringify([i, 0, 0]),
      });
      const result = await service.create(
        { sourceId, targetId: t.id, relationship: relationships[i] },
        'agent-1'
      );
      expect(result.relationship).toBe(relationships[i]);
    }
  });

  it('should delete a connection', async () => {
    const conn = await service.create(
      { sourceId, targetId, relationship: 'builds-on' },
      'agent-1'
    );

    await service.delete(conn.id, 'agent-1');

    const connections = await service.getConnections(sourceId);
    expect(connections).toHaveLength(0);
  });

  it('should not delete connection owned by another agent', async () => {
    const conn = await service.create(
      { sourceId, targetId, relationship: 'builds-on' },
      'agent-1'
    );

    // agent-2 tries to delete agent-1's connection — mock just silently skips non-matching
    await service.delete(conn.id, 'agent-2');

    const connections = await service.getConnections(sourceId);
    expect(connections).toHaveLength(1);
  });
});
