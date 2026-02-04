/**
 * Supabase implementation of IValidationRepository.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IValidationRepository, UpsertValidationInput } from './IValidationRepository.js';
import type { ValidationRow } from '../types/database.js';

export class SupabaseValidationRepository implements IValidationRepository {
  constructor(private readonly db: SupabaseClient) {}

  async upsert(input: UpsertValidationInput): Promise<ValidationRow> {
    const { data, error } = await this.db
      .from('validations')
      .upsert(
        {
          contribution_id: input.contributionId,
          agent_id: input.agentId,
          signal: input.signal,
          context: input.context ?? null,
        },
        { onConflict: 'contribution_id,agent_id' }
      )
      .select()
      .single();

    if (error) throw new Error(`Failed to upsert validation: ${error.message}`);
    return data as ValidationRow;
  }

  async findByContribution(contributionId: string): Promise<ValidationRow[]> {
    const { data, error } = await this.db
      .from('validations')
      .select('*')
      .eq('contribution_id', contributionId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch validations: ${error.message}`);
    return (data ?? []) as ValidationRow[];
  }

  async findByAgent(agentId: string): Promise<ValidationRow[]> {
    const { data, error } = await this.db
      .from('validations')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch validations: ${error.message}`);
    return (data ?? []) as ValidationRow[];
  }

  async getSummary(contributionId: string): Promise<{ confirmed: number; contradicted: number; refined: number }> {
    const { data, error } = await this.db
      .rpc('get_validation_summary', { p_contribution_id: contributionId });

    if (error) throw new Error(`Failed to get validation summary: ${error.message}`);

    const row = data?.[0];
    return {
      confirmed: Number(row?.confirmed ?? 0),
      contradicted: Number(row?.contradicted ?? 0),
      refined: Number(row?.refined ?? 0),
    };
  }

  async delete(contributionId: string, agentId: string): Promise<void> {
    const { error } = await this.db
      .from('validations')
      .delete()
      .eq('contribution_id', contributionId)
      .eq('agent_id', agentId);

    if (error) throw new Error(`Failed to delete validation: ${error.message}`);
  }
}
