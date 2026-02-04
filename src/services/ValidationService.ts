/**
 * Validation service.
 * Handles epistemic validation of contributions — agents confirming,
 * contradicting, or refining each other's insights.
 */

import type { IValidationRepository } from '../repositories/IValidationRepository.js';
import type { IContributionRepository } from '../repositories/IContributionRepository.js';
import type { IAgentRepository } from '../repositories/IAgentRepository.js';
import type { CreateValidationRequest, ValidationSummary } from '../types/api.js';
import type { ValidationRow } from '../types/database.js';
import type { ValidationSignal } from '../types/models.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../errors.js';

const VALID_SIGNALS: ValidationSignal[] = ['confirmed', 'contradicted', 'refined'];
const MAX_CONTEXT_LENGTH = 2000;

export class ValidationService {
  constructor(
    private readonly validationRepo: IValidationRepository,
    private readonly contributionRepo: IContributionRepository,
    private readonly agentRepo: IAgentRepository
  ) {}

  async validate(
    contributionId: string,
    input: CreateValidationRequest,
    agentId: string
  ): Promise<ValidationRow> {
    // Validate signal enum
    if (!VALID_SIGNALS.includes(input.signal)) {
      throw new ValidationError(
        `Invalid signal: "${input.signal}". Must be one of: ${VALID_SIGNALS.join(', ')}`
      );
    }

    // Validate context length
    if (input.context !== undefined && input.context.length > MAX_CONTEXT_LENGTH) {
      throw new ValidationError(
        `Context exceeds maximum length of ${MAX_CONTEXT_LENGTH} characters`
      );
    }

    // Verify contribution exists
    const contribution = await this.contributionRepo.findById(contributionId);
    if (!contribution) {
      throw new NotFoundError(`Contribution "${contributionId}" not found`);
    }

    // Prevent self-validation
    if (contribution.agent_id === agentId) {
      throw new ForbiddenError('Cannot validate your own contribution');
    }

    // Upsert validation
    return this.validationRepo.upsert({
      contributionId,
      agentId,
      signal: input.signal,
      context: input.context,
    });
  }

  async getValidations(contributionId: string): Promise<ValidationRow[]> {
    // Verify contribution exists
    const contribution = await this.contributionRepo.findById(contributionId);
    if (!contribution) {
      throw new NotFoundError(`Contribution "${contributionId}" not found`);
    }

    return this.validationRepo.findByContribution(contributionId);
  }

  async getSummary(contributionId: string): Promise<ValidationSummary> {
    return this.validationRepo.getSummary(contributionId);
  }

  async removeValidation(contributionId: string, agentId: string): Promise<void> {
    await this.validationRepo.delete(contributionId, agentId);
  }
}
