/**
 * Supabase implementation of IConnectionRepository.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IConnectionRepository, CreateConnectionInput } from './IConnectionRepository.js';
import type { ConnectionRow } from '../types/database.js';

export class SupabaseConnectionRepository implements IConnectionRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(input: CreateConnectionInput): Promise<ConnectionRow> {
    const { data, error } = await this.db
      .from('connections')
      .insert({
        source_id: input.sourceId,
        target_id: input.targetId,
        relationship: input.relationship,
        agent_id: input.agentId,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create connection: ${error.message}`);
    return data as ConnectionRow;
  }

  async findByContribution(contributionId: string): Promise<ConnectionRow[]> {
    const { data, error } = await this.db
      .from('connections')
      .select('*')
      .or(`source_id.eq.${contributionId},target_id.eq.${contributionId}`)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch connections: ${error.message}`);
    return (data ?? []) as ConnectionRow[];
  }

  async findByAgent(agentId: string): Promise<ConnectionRow[]> {
    const { data, error } = await this.db
      .from('connections')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch connections: ${error.message}`);
    return (data ?? []) as ConnectionRow[];
  }

  async delete(id: string, agentId: string): Promise<void> {
    const { error } = await this.db
      .from('connections')
      .delete()
      .eq('id', id)
      .eq('agent_id', agentId);

    if (error) throw new Error(`Failed to delete connection: ${error.message}`);
  }

  async exists(sourceId: string, targetId: string, agentId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('target_id', targetId)
      .eq('agent_id', agentId);

    if (error) throw new Error(`Failed to check connection existence: ${error.message}`);
    return (count ?? 0) > 0;
  }
}
