/**
 * Connection data access interface.
 * Handles persistence of knowledge graph connections between contributions.
 */

import type { ConnectionRow } from '../types/database.js';
import type { ConnectionRelationship } from '../types/models.js';

export interface CreateConnectionInput {
  sourceId: string;
  targetId: string;
  relationship: ConnectionRelationship;
  agentId: string;
}

export interface IConnectionRepository {
  /** Create a new connection between two contributions. */
  create(input: CreateConnectionInput): Promise<ConnectionRow>;

  /** Find all connections where contributionId is source OR target. */
  findByContribution(contributionId: string): Promise<ConnectionRow[]>;

  /** Find all connections created by an agent. */
  findByAgent(agentId: string): Promise<ConnectionRow[]>;

  /** Delete a connection by ID. Only succeeds if agentId matches (owner only). */
  delete(id: string, agentId: string): Promise<void>;

  /** Check if a connection already exists for a given source, target, and agent. */
  exists(sourceId: string, targetId: string, agentId: string): Promise<boolean>;
}
