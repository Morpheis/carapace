/**
 * Contribution creation, retrieval, update, and deletion.
 * Handles embedding generation, duplicate detection, and ownership enforcement.
 */

import type { IContributionRepository } from '../repositories/IContributionRepository.js';
import type { IAgentRepository } from '../repositories/IAgentRepository.js';
import type { IValidationRepository } from '../repositories/IValidationRepository.js';
import type { IEmbeddingProvider } from '../providers/IEmbeddingProvider.js';
import type {
  CreateContributionRequest,
  UpdateContributionRequest,
  ContributionResponse,
  ValidationSummary,
} from '../types/api.js';
import type { ContributionRow } from '../types/database.js';
import type { PaginationOptions, PaginatedResult } from '../types/common.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from '../errors.js';
import { ContentScanner } from './ContentScanner.js';

const MAX_CLAIM_LENGTH = 2000;
const MAX_REASONING_LENGTH = 5000;
const MAX_APPLICABILITY_LENGTH = 3000;
const MAX_LIMITATIONS_LENGTH = 3000;
const MAX_DOMAIN_TAGS = 20;
const MAX_DOMAIN_TAG_LENGTH = 100;
const DUPLICATE_THRESHOLD = 0.95;

export class ContributionService {
  private readonly scanner = new ContentScanner();

  constructor(
    private readonly contributionRepo: IContributionRepository,
    private readonly agentRepo: IAgentRepository,
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly validationRepo?: IValidationRepository
  ) {}

  async create(
    input: CreateContributionRequest,
    agentId: string
  ): Promise<ContributionResponse> {
    this.validateContribution(input);

    // Security: scan for prompt injection and malicious content
    const scanResult = this.scanner.scan({
      claim: input.claim,
      reasoning: input.reasoning,
      applicability: input.applicability,
      limitations: input.limitations,
    });

    // TODO: Phase 2 — quarantine flagged contributions instead of rejecting
    // For now, reject with details so agents can fix legitimate false positives
    if (scanResult.flagged) {
      throw new ValidationError(
        'Content flagged for security review',
        { reasons: scanResult.reasons }
      );
    }

    const embeddingText = this.buildEmbeddingText(
      input.claim,
      input.reasoning,
      input.applicability
    );
    const embedding = await this.embeddingProvider.generate(embeddingText);

    // Duplicate detection
    const similar = await this.contributionRepo.findSimilar(
      embedding,
      DUPLICATE_THRESHOLD
    );
    if (similar.length > 0) {
      throw new ConflictError(
        'DUPLICATE_CONTRIBUTION',
        'A very similar contribution already exists',
        { existingId: similar[0].id }
      );
    }

    const row = await this.contributionRepo.insert({
      claim: input.claim,
      reasoning: input.reasoning ?? null,
      applicability: input.applicability ?? null,
      limitations: input.limitations ?? null,
      confidence: input.confidence,
      domain_tags: input.domainTags ?? [],
      agent_id: agentId,
      embedding: JSON.stringify(embedding),
    });

    return this.rowToResponse(row, agentId);
  }

  async getById(id: string): Promise<ContributionResponse> {
    const row = await this.contributionRepo.findById(id);
    if (!row) {
      throw new NotFoundError(`Contribution "${id}" not found`);
    }

    return this.rowToResponse(row, row.agent_id);
  }

  async update(
    id: string,
    input: UpdateContributionRequest,
    agentId: string
  ): Promise<ContributionResponse> {
    const existing = await this.contributionRepo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Contribution "${id}" not found`);
    }

    if (existing.agent_id !== agentId) {
      throw new ForbiddenError('You can only update your own contributions');
    }

    if (input.claim !== undefined) {
      this.validateContribution({
        claim: input.claim,
        confidence: input.confidence ?? existing.confidence,
        reasoning: input.reasoning,
        applicability: input.applicability,
        limitations: input.limitations,
      });
    }

    // Security: scan updated fields for prompt injection
    const scanResult = this.scanner.scan({
      claim: input.claim,
      reasoning: input.reasoning,
      applicability: input.applicability,
      limitations: input.limitations,
    });
    if (scanResult.flagged) {
      throw new ValidationError(
        'Content flagged for security review',
        { reasons: scanResult.reasons }
      );
    }

    // Determine if we need to regenerate the embedding
    const embeddingFieldsChanged =
      input.claim !== undefined ||
      input.reasoning !== undefined ||
      input.applicability !== undefined;

    const updateData: Partial<ContributionRow> = {};

    if (input.claim !== undefined) updateData.claim = input.claim;
    if (input.reasoning !== undefined) updateData.reasoning = input.reasoning;
    if (input.applicability !== undefined)
      updateData.applicability = input.applicability;
    if (input.limitations !== undefined)
      updateData.limitations = input.limitations;
    if (input.confidence !== undefined) updateData.confidence = input.confidence;
    if (input.domainTags !== undefined)
      updateData.domain_tags = input.domainTags;

    if (embeddingFieldsChanged) {
      const claim = input.claim ?? existing.claim;
      const reasoning =
        input.reasoning !== undefined ? input.reasoning : existing.reasoning;
      const applicability =
        input.applicability !== undefined
          ? input.applicability
          : existing.applicability;

      const embeddingText = this.buildEmbeddingText(
        claim,
        reasoning ?? undefined,
        applicability ?? undefined
      );
      const embedding = await this.embeddingProvider.generate(embeddingText);
      updateData.embedding = JSON.stringify(embedding);
    }

    const updated = await this.contributionRepo.update(id, updateData);
    return this.rowToResponse(updated, agentId);
  }

  async delete(id: string, agentId: string): Promise<void> {
    const existing = await this.contributionRepo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Contribution "${id}" not found`);
    }

    if (existing.agent_id !== agentId) {
      throw new ForbiddenError('You can only delete your own contributions');
    }

    await this.contributionRepo.delete(id);
  }

  async getByAgent(
    agentId: string,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ContributionResponse>> {
    const [rows, total] = await Promise.all([
      this.contributionRepo.findByAgent(agentId, pagination),
      this.contributionRepo.countByAgent(agentId),
    ]);

    const data = await Promise.all(
      rows.map((row) => this.rowToResponse(row, row.agent_id))
    );

    return {
      data,
      total,
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }

  // ── Private ──

  private validateContribution(
    input: Partial<CreateContributionRequest> & { claim: string; confidence: number }
  ): void {
    if (!input.claim || input.claim.trim().length === 0) {
      throw new ValidationError('claim is required');
    }
    if (input.claim.length > MAX_CLAIM_LENGTH) {
      throw new ValidationError(
        `claim must be ${MAX_CLAIM_LENGTH} characters or less`
      );
    }
    if (input.confidence < 0 || input.confidence > 1) {
      throw new ValidationError('confidence must be between 0 and 1');
    }
    if (input.reasoning && input.reasoning.length > MAX_REASONING_LENGTH) {
      throw new ValidationError(
        `reasoning must be ${MAX_REASONING_LENGTH} characters or less`
      );
    }
    if (
      input.applicability &&
      input.applicability.length > MAX_APPLICABILITY_LENGTH
    ) {
      throw new ValidationError(
        `applicability must be ${MAX_APPLICABILITY_LENGTH} characters or less`
      );
    }
    if (
      input.limitations &&
      input.limitations.length > MAX_LIMITATIONS_LENGTH
    ) {
      throw new ValidationError(
        `limitations must be ${MAX_LIMITATIONS_LENGTH} characters or less`
      );
    }

    // Validate domainTags
    if (input.domainTags) {
      if (input.domainTags.length > MAX_DOMAIN_TAGS) {
        throw new ValidationError(
          `Too many domain tags (max ${MAX_DOMAIN_TAGS})`
        );
      }
      for (const tag of input.domainTags) {
        if (typeof tag !== 'string' || tag.length > MAX_DOMAIN_TAG_LENGTH) {
          throw new ValidationError(
            `Each domain tag must be a string of ${MAX_DOMAIN_TAG_LENGTH} characters or less`
          );
        }
      }
    }
  }

  /**
   * Build text for embedding generation.
   * Intentionally excludes `limitations` — it describes when the insight
   * does NOT apply, which would pollute semantic search with negative matches.
   */
  private buildEmbeddingText(
    claim: string,
    reasoning?: string,
    applicability?: string
  ): string {
    const parts = [claim];
    if (reasoning) parts.push(reasoning);
    if (applicability) parts.push(applicability);
    return parts.join('\n\n');
  }

  private async rowToResponse(
    row: ContributionRow,
    agentId: string
  ): Promise<ContributionResponse> {
    const agentRow = await this.agentRepo.findById(agentId);

    let validations: ValidationSummary;
    if (this.validationRepo) {
      validations = await this.validationRepo.getSummary(row.id);
    } else {
      validations = { confirmed: 0, contradicted: 0, refined: 0 };
    }

    return {
      id: row.id,
      claim: row.claim,
      reasoning: row.reasoning,
      applicability: row.applicability,
      limitations: row.limitations,
      confidence: row.confidence,
      domainTags: row.domain_tags,
      contributor: {
        id: agentId,
        displayName: agentRow?.display_name ?? 'Unknown',
        trustScore: agentRow?.trust_score ?? 0,
      },
      validations,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
