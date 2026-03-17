/**
 * Tests for the provenance field on contributions.
 * Verifies creation, validation, update, backward compatibility, and response mapping.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContributionService } from '../../src/services/ContributionService.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';
import { MockEmbeddingProvider } from '../mocks/MockEmbeddingProvider.js';
import { MockValidationRepository } from '../mocks/MockValidationRepository.js';
import { ValidationError } from '../../src/errors.js';
import { CONTRIBUTION_PROVENANCE } from '../../src/types/models.js';
import type { AgentRow } from '../../src/types/database.js';

describe('ContributionService — provenance', () => {
  let contributionService: ContributionService;
  let contributionRepo: MockContributionRepository;
  let agentRepo: MockAgentRepository;
  let embeddingProvider: MockEmbeddingProvider;
  let validationRepo: MockValidationRepository;

  const testAgent: Omit<AgentRow, 'created_at' | 'last_active_at'> = {
    id: 'agent-prov',
    api_key_hash: 'hash-prov',
    display_name: 'ProvenanceTestAgent',
    description: 'Tests provenance',
    trust_score: 0.6,
  };

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

    await agentRepo.insert(testAgent);
  });

  // ── create with provenance ──

  describe('create with provenance', () => {
    it('should store provenance when provided', async () => {
      const result = await contributionService.create(
        {
          claim: 'Observation-based insight about session memory',
          confidence: 0.8,
          provenance: 'observation',
        },
        testAgent.id
      );

      expect(result.provenance).toBe('observation');
    });

    it.each(CONTRIBUTION_PROVENANCE)(
      'should accept valid provenance value: %s',
      async (provenance) => {
        const result = await contributionService.create(
          {
            claim: `Insight with provenance ${provenance} about agent behavior ${Math.random()}`,
            confidence: 0.7,
            provenance,
          },
          testAgent.id
        );

        expect(result.provenance).toBe(provenance);
      }
    );

    it('should reject invalid provenance value', async () => {
      await expect(
        contributionService.create(
          {
            claim: 'Insight with invalid provenance origin',
            confidence: 0.7,
            provenance: 'invented',
          },
          testAgent.id
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should reject invalid provenance with descriptive message', async () => {
      await expect(
        contributionService.create(
          {
            claim: 'Insight with bad provenance for error checking',
            confidence: 0.7,
            provenance: 'hallucination',
          },
          testAgent.id
        )
      ).rejects.toThrow(/Invalid provenance.*hallucination.*Valid values/);
    });

    it('should default to null when provenance is omitted', async () => {
      const result = await contributionService.create(
        {
          claim: 'Insight without provenance for backward compatibility',
          confidence: 0.6,
        },
        testAgent.id
      );

      expect(result.provenance).toBeNull();
    });
  });

  // ── backward compatibility ──

  describe('backward compatibility', () => {
    it('should handle legacy contributions without provenance in the store', async () => {
      // Simulate a legacy contribution by inserting directly without provenance
      const emb = await embeddingProvider.generate('Legacy claim without provenance');
      await contributionRepo.insert({
        claim: 'Legacy claim without provenance',
        reasoning: null,
        applicability: null,
        limitations: null,
        confidence: 0.5,
        domain_tags: [],
        agent_id: testAgent.id,
        embedding: JSON.stringify(emb),
        // No provenance field — simulates pre-migration data
      });

      const all = contributionRepo.getAll();
      expect(all).toHaveLength(1);

      const result = await contributionService.getById(all[0].id);
      expect(result.provenance).toBeNull();
    });
  });

  // ── getById includes provenance ──

  describe('getById', () => {
    it('should include provenance in response', async () => {
      const created = await contributionService.create(
        {
          claim: 'Directive-based insight for retrieval test',
          confidence: 0.85,
          provenance: 'directive',
        },
        testAgent.id
      );

      const result = await contributionService.getById(created.id);
      expect(result.provenance).toBe('directive');
    });

    it('should return null provenance for contributions without it', async () => {
      const created = await contributionService.create(
        {
          claim: 'No provenance insight for retrieval nullcheck',
          confidence: 0.5,
        },
        testAgent.id
      );

      const result = await contributionService.getById(created.id);
      expect(result.provenance).toBeNull();
    });
  });

  // ── update provenance ──

  describe('update provenance', () => {
    it('should set provenance on a contribution that had none', async () => {
      const created = await contributionService.create(
        {
          claim: 'Initially unprovenanced insight about memory',
          confidence: 0.7,
        },
        testAgent.id
      );

      expect(created.provenance).toBeNull();

      const updated = await contributionService.update(
        created.id,
        { provenance: 'reflection' },
        testAgent.id
      );

      expect(updated.provenance).toBe('reflection');
    });

    it('should change provenance from one value to another', async () => {
      const created = await contributionService.create(
        {
          claim: 'Insight changing provenance from observation to correction',
          confidence: 0.8,
          provenance: 'observation',
        },
        testAgent.id
      );

      const updated = await contributionService.update(
        created.id,
        { provenance: 'correction' },
        testAgent.id
      );

      expect(updated.provenance).toBe('correction');
    });

    it('should reject invalid provenance on update', async () => {
      const created = await contributionService.create(
        {
          claim: 'Insight that will reject bad provenance update',
          confidence: 0.8,
        },
        testAgent.id
      );

      await expect(
        contributionService.update(
          created.id,
          { provenance: 'guesswork' },
          testAgent.id
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should not change provenance when not included in update', async () => {
      const created = await contributionService.create(
        {
          claim: 'Insight with provenance that should persist through unrelated updates',
          confidence: 0.8,
          provenance: 'social',
        },
        testAgent.id
      );

      const updated = await contributionService.update(
        created.id,
        { confidence: 0.95 },
        testAgent.id
      );

      expect(updated.provenance).toBe('social');
    });

    it('should not regenerate embedding when only provenance changes', async () => {
      const created = await contributionService.create(
        {
          claim: 'Insight testing that provenance change skips embedding regen',
          confidence: 0.8,
        },
        testAgent.id
      );

      embeddingProvider.resetCallCount();

      await contributionService.update(
        created.id,
        { provenance: 'external' },
        testAgent.id
      );

      expect(embeddingProvider.callCount).toBe(0);
    });
  });

  // ── getByAgent includes provenance ──

  describe('getByAgent', () => {
    it('should include provenance in paginated results', async () => {
      await contributionService.create(
        {
          claim: 'First agent insight with directive provenance',
          confidence: 0.7,
          provenance: 'directive',
        },
        testAgent.id
      );
      await contributionService.create(
        {
          claim: 'Second agent insight with observation provenance',
          confidence: 0.8,
          provenance: 'observation',
        },
        testAgent.id
      );
      await contributionService.create(
        {
          claim: 'Third agent insight with no provenance at all',
          confidence: 0.6,
        },
        testAgent.id
      );

      const result = await contributionService.getByAgent(testAgent.id, {
        limit: 10,
        offset: 0,
      });

      expect(result.data).toHaveLength(3);

      const provenances = result.data.map((c) => c.provenance);
      expect(provenances).toContain('directive');
      expect(provenances).toContain('observation');
      expect(provenances).toContain(null);
    });
  });

  // ── provenance stored in repository ──

  describe('repository storage', () => {
    it('should persist provenance in the contribution row', async () => {
      await contributionService.create(
        {
          claim: 'Insight checking raw storage of provenance in repo',
          confidence: 0.9,
          provenance: 'external',
        },
        testAgent.id
      );

      const rows = contributionRepo.getAll();
      expect(rows).toHaveLength(1);
      expect(rows[0].provenance).toBe('external');
    });

    it('should persist null provenance when omitted', async () => {
      await contributionService.create(
        {
          claim: 'Insight checking null storage when provenance omitted',
          confidence: 0.5,
        },
        testAgent.id
      );

      const rows = contributionRepo.getAll();
      expect(rows).toHaveLength(1);
      expect(rows[0].provenance).toBeNull();
    });
  });
});
