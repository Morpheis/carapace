import type { Validation } from '../../src/types/models.js';
import type { ValidationRow } from '../../src/types/database.js';
import type {
  IValidationRepository,
  UpsertValidationInput,
} from '../../src/repositories/IValidationRepository.js';

export class MockValidationRepository implements IValidationRepository {
  readonly items: Validation[] = [];

  async upsert(input: UpsertValidationInput): Promise<ValidationRow> {
    const existingIndex = this.items.findIndex(
      (v) => v.contributionId === input.contributionId && v.agentId === input.agentId
    );

    const now = new Date();

    if (existingIndex >= 0) {
      // Update existing
      const existing = this.items[existingIndex];
      const updated: Validation = {
        ...existing,
        signal: input.signal,
        context: input.context ?? null,
      };
      this.items[existingIndex] = updated;
      return this.toRow(updated);
    }

    // Insert new
    const validation: Validation = {
      id: `val-${this.items.length + 1}`,
      contributionId: input.contributionId,
      agentId: input.agentId,
      signal: input.signal,
      context: input.context ?? null,
      createdAt: now,
    };
    this.items.push(validation);
    return this.toRow(validation);
  }

  async findByContribution(contributionId: string): Promise<ValidationRow[]> {
    return this.items
      .filter((v) => v.contributionId === contributionId)
      .map((v) => this.toRow(v));
  }

  async findByAgent(agentId: string): Promise<ValidationRow[]> {
    return this.items
      .filter((v) => v.agentId === agentId)
      .map((v) => this.toRow(v));
  }

  async getSummary(contributionId: string): Promise<{ confirmed: number; contradicted: number; refined: number }> {
    const validations = this.items.filter((v) => v.contributionId === contributionId);
    return {
      confirmed: validations.filter((v) => v.signal === 'confirmed').length,
      contradicted: validations.filter((v) => v.signal === 'contradicted').length,
      refined: validations.filter((v) => v.signal === 'refined').length,
    };
  }

  async delete(contributionId: string, agentId: string): Promise<void> {
    const index = this.items.findIndex(
      (v) => v.contributionId === contributionId && v.agentId === agentId
    );
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }

  // ── Test Helpers ──

  clear(): void {
    this.items.length = 0;
  }

  // ── Private ──

  private toRow(v: Validation): ValidationRow {
    return {
      id: v.id,
      contribution_id: v.contributionId,
      agent_id: v.agentId,
      signal: v.signal,
      context: v.context,
      created_at: v.createdAt.toISOString(),
    };
  }
}
