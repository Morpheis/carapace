import type { Connection } from '../../src/types/models.js';
import type { ConnectionRow } from '../../src/types/database.js';
import type {
  IConnectionRepository,
  CreateConnectionInput,
} from '../../src/repositories/IConnectionRepository.js';

export class MockConnectionRepository implements IConnectionRepository {
  readonly items: Connection[] = [];

  async create(input: CreateConnectionInput): Promise<ConnectionRow> {
    const connection: Connection = {
      id: `conn-${this.items.length + 1}`,
      sourceId: input.sourceId,
      targetId: input.targetId,
      relationship: input.relationship,
      agentId: input.agentId,
      createdAt: new Date(),
    };
    this.items.push(connection);
    return this.toRow(connection);
  }

  async findByContribution(contributionId: string): Promise<ConnectionRow[]> {
    return this.items
      .filter((c) => c.sourceId === contributionId || c.targetId === contributionId)
      .map((c) => this.toRow(c));
  }

  async findByAgent(agentId: string): Promise<ConnectionRow[]> {
    return this.items
      .filter((c) => c.agentId === agentId)
      .map((c) => this.toRow(c));
  }

  async delete(id: string, agentId: string): Promise<void> {
    const index = this.items.findIndex((c) => c.id === id && c.agentId === agentId);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }

  async exists(sourceId: string, targetId: string, agentId: string): Promise<boolean> {
    return this.items.some(
      (c) => c.sourceId === sourceId && c.targetId === targetId && c.agentId === agentId
    );
  }

  // ── Test Helpers ──

  clear(): void {
    this.items.length = 0;
  }

  // ── Private ──

  private toRow(c: Connection): ConnectionRow {
    return {
      id: c.id,
      source_id: c.sourceId,
      target_id: c.targetId,
      relationship: c.relationship,
      agent_id: c.agentId,
      created_at: c.createdAt.toISOString(),
    };
  }
}
