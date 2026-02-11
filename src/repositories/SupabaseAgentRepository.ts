/**
 * Supabase implementation of IAgentRepository.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IAgentRepository } from './IAgentRepository.js';
import type { AgentRow } from '../types/database.js';

export class SupabaseAgentRepository implements IAgentRepository {
  constructor(private readonly db: SupabaseClient) {}

  async insert(row: Omit<AgentRow, 'created_at' | 'last_active_at'>): Promise<AgentRow> {
    const { data, error } = await this.db
      .from('agents')
      .insert({
        id: row.id,
        api_key_hash: row.api_key_hash,
        display_name: row.display_name,
        description: row.description,
        trust_score: row.trust_score,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to insert agent: ${error.message}`);
    return data as AgentRow;
  }

  async findById(id: string): Promise<AgentRow | null> {
    const { data, error } = await this.db
      .from('agents')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to find agent: ${error.message}`);
    return data as AgentRow | null;
  }

  async findByApiKeyHash(hash: string): Promise<AgentRow | null> {
    const { data, error } = await this.db
      .from('agents')
      .select('*')
      .eq('api_key_hash', hash)
      .maybeSingle();

    if (error) throw new Error(`Failed to find agent by key: ${error.message}`);
    return data as AgentRow | null;
  }

  async update(id: string, data: Partial<AgentRow>): Promise<AgentRow> {
    const { data: updated, error } = await this.db
      .from('agents')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update agent: ${error.message}`);
    return updated as AgentRow;
  }

  async count(): Promise<number> {
    const { count, error } = await this.db
      .from('agents')
      .select('*', { count: 'exact', head: true });

    if (error) throw new Error(`Failed to count agents: ${error.message}`);
    return count ?? 0;
  }

  async countRecentByPrefix(idPrefix: string, windowSeconds: number): Promise<number> {
    const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const { count, error } = await this.db
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .like('id', `${idPrefix}%`)
      .gte('created_at', cutoff);

    if (error) throw new Error(`Failed to count recent agents: ${error.message}`);
    return count ?? 0;
  }

  async touchLastActive(id: string): Promise<void> {
    const { error } = await this.db
      .from('agents')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(`Failed to touch last_active_at: ${error.message}`);
  }
}
