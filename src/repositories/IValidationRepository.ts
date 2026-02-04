/**
 * Validation data access interface.
 * Handles persistence of epistemic validations on contributions.
 */

import type { ValidationRow } from '../types/database.js';
import type { ValidationSignal } from '../types/models.js';

export interface UpsertValidationInput {
  contributionId: string;
  agentId: string;
  signal: ValidationSignal;
  context?: string;
}

export interface IValidationRepository {
  /** Insert or update a validation (one per agent per contribution). */
  upsert(input: UpsertValidationInput): Promise<ValidationRow>;

  /** Find all validations for a contribution. */
  findByContribution(contributionId: string): Promise<ValidationRow[]>;

  /** Find all validations by an agent. */
  findByAgent(agentId: string): Promise<ValidationRow[]>;

  /** Get aggregated counts of each signal type for a contribution. */
  getSummary(contributionId: string): Promise<{ confirmed: number; contradicted: number; refined: number }>;

  /** Delete a specific validation (by contribution + agent). */
  delete(contributionId: string, agentId: string): Promise<void>;
}
