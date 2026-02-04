/**
 * Connection service.
 * Manages knowledge graph connections between contributions —
 * builds-on, contradicts, generalizes, applies-to.
 */

import type { IConnectionRepository } from '../repositories/IConnectionRepository.js';
import type { IContributionRepository } from '../repositories/IContributionRepository.js';
import type { CreateConnectionRequest } from '../types/api.js';
import type { ConnectionRow } from '../types/database.js';
import type { ConnectionRelationship } from '../types/models.js';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../errors.js';

const VALID_RELATIONSHIPS: ConnectionRelationship[] = [
  'builds-on',
  'contradicts',
  'generalizes',
  'applies-to',
];

export class ConnectionService {
  constructor(
    private readonly connectionRepo: IConnectionRepository,
    private readonly contributionRepo: IContributionRepository
  ) {}

  async create(
    input: CreateConnectionRequest,
    agentId: string
  ): Promise<ConnectionRow> {
    // Validate relationship enum
    if (!VALID_RELATIONSHIPS.includes(input.relationship)) {
      throw new ValidationError(
        `Invalid relationship: "${input.relationship}". Must be one of: ${VALID_RELATIONSHIPS.join(', ')}`
      );
    }

    // Cannot connect to self
    if (input.sourceId === input.targetId) {
      throw new ValidationError('Cannot connect a contribution to itself');
    }

    // Verify both contributions exist
    const [source, target] = await Promise.all([
      this.contributionRepo.findById(input.sourceId),
      this.contributionRepo.findById(input.targetId),
    ]);

    if (!source) {
      throw new NotFoundError(`Source contribution "${input.sourceId}" not found`);
    }
    if (!target) {
      throw new NotFoundError(`Target contribution "${input.targetId}" not found`);
    }

    // Check for duplicate
    const alreadyExists = await this.connectionRepo.exists(
      input.sourceId,
      input.targetId,
      agentId
    );
    if (alreadyExists) {
      throw new ConflictError(
        'CONFLICT',
        'Connection already exists between these contributions for this agent'
      );
    }

    return this.connectionRepo.create({
      sourceId: input.sourceId,
      targetId: input.targetId,
      relationship: input.relationship,
      agentId,
    });
  }

  async getConnections(contributionId: string): Promise<ConnectionRow[]> {
    return this.connectionRepo.findByContribution(contributionId);
  }

  async delete(connectionId: string, agentId: string): Promise<void> {
    await this.connectionRepo.delete(connectionId, agentId);
  }
}
