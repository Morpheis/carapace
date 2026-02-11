/**
 * Agent data access interface.
 */

import type { AgentRow } from '../types/database.js';

export interface IAgentRepository {
  insert(row: Omit<AgentRow, 'created_at' | 'last_active_at'>): Promise<AgentRow>;

  findById(id: string): Promise<AgentRow | null>;

  findByApiKeyHash(hash: string): Promise<AgentRow | null>;

  update(id: string, data: Partial<AgentRow>): Promise<AgentRow>;

  /** Total number of registered agents. */
  count(): Promise<number>;

  /** Count agents whose ID starts with the given prefix, created within the last `windowSeconds`. */
  countRecentByPrefix(idPrefix: string, windowSeconds: number): Promise<number>;

  /** Update last_active_at timestamp for an agent. */
  touchLastActive(id: string): Promise<void>;
}
