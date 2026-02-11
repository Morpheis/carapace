/**
 * In-memory mock for IAgentRepository.
 * Stores agents in a Map, simulates database behavior.
 */

import type { IAgentRepository } from '../../src/repositories/IAgentRepository.js';
import type { AgentRow } from '../../src/types/database.js';

export class MockAgentRepository implements IAgentRepository {
  private agents = new Map<string, AgentRow>();

  async insert(row: Omit<AgentRow, 'created_at' | 'last_active_at'>): Promise<AgentRow> {
    const existing = this.agents.get(row.id);
    if (existing) {
      throw new Error(`Agent with id "${row.id}" already exists`);
    }

    const full: AgentRow = {
      ...row,
      created_at: new Date().toISOString(),
      last_active_at: null,
    };
    this.agents.set(row.id, full);
    return full;
  }

  async findById(id: string): Promise<AgentRow | null> {
    return this.agents.get(id) ?? null;
  }

  async findByApiKeyHash(hash: string): Promise<AgentRow | null> {
    for (const agent of this.agents.values()) {
      if (agent.api_key_hash === hash) {
        return agent;
      }
    }
    return null;
  }

  async update(id: string, data: Partial<AgentRow>): Promise<AgentRow> {
    const existing = this.agents.get(id);
    if (!existing) {
      throw new Error(`Agent with id "${id}" not found`);
    }

    const updated: AgentRow = { ...existing, ...data };
    this.agents.set(id, updated);
    return updated;
  }

  async count(): Promise<number> {
    return this.agents.size;
  }

  async countRecentByPrefix(idPrefix: string, windowSeconds: number): Promise<number> {
    const cutoff = Date.now() - windowSeconds * 1000;
    let count = 0;
    for (const agent of this.agents.values()) {
      if (agent.id.startsWith(idPrefix) && new Date(agent.created_at).getTime() >= cutoff) {
        count++;
      }
    }
    return count;
  }

  async touchLastActive(id: string): Promise<void> {
    const existing = this.agents.get(id);
    if (!existing) {
      throw new Error(`Agent with id "${id}" not found`);
    }
    existing.last_active_at = new Date().toISOString();
  }

  // ── Test Helpers ──

  clear(): void {
    this.agents.clear();
  }

  getAll(): AgentRow[] {
    return [...this.agents.values()];
  }
}
