/**
 * Trust computation service.
 * Computes trust scores for contributions and agents based on
 * epistemic validation signals from the community.
 */

import type { IValidationRepository } from '../repositories/IValidationRepository.js';
import type { IContributionRepository } from '../repositories/IContributionRepository.js';
import type { IAgentRepository } from '../repositories/IAgentRepository.js';

export interface ContributionTrustBreakdown {
  base: number;
  validationBoost: number;
  confirmed: number;
  contradicted: number;
  refined: number;
}

export interface ContributionTrustResult {
  score: number;
  breakdown: ContributionTrustBreakdown;
}

export class TrustService {
  constructor(
    private readonly validationRepo: IValidationRepository,
    private readonly contributionRepo: IContributionRepository,
    private readonly agentRepo: IAgentRepository
  ) {}

  async computeContributionTrust(contributionId: string): Promise<ContributionTrustResult> {
    // Get contribution for confidence and agent info
    const contribution = await this.contributionRepo.findById(contributionId);
    const confidence = contribution?.confidence ?? 0.5;
    const agentId = contribution?.agent_id;

    // Get contributor's trust score
    const agent = agentId ? await this.agentRepo.findById(agentId) : null;
    const agentTrust = agent?.trust_score ?? 0.5;

    // Get validation summary
    const summary = await this.validationRepo.getSummary(contributionId);

    // Formula: base = agentTrust * confidence
    const base = agentTrust * confidence;

    // Boosts from validations
    const validationBoost =
      0.1 * summary.confirmed -
      0.15 * summary.contradicted +
      0.05 * summary.refined;

    // Clamp to [0, 1]
    const score = Math.max(0, Math.min(1, base + validationBoost));

    return {
      score,
      breakdown: {
        base,
        validationBoost,
        confirmed: summary.confirmed,
        contradicted: summary.contradicted,
        refined: summary.refined,
      },
    };
  }

  async computeAgentTrust(agentId: string): Promise<number> {
    // Get all contributions by this agent
    const contributions = await this.contributionRepo.findByAgent(agentId, {
      limit: 1000,
      offset: 0,
    });

    // Base trust: 0.5
    let trust = 0.5;

    // For each contribution, check net validation effect
    for (const contribution of contributions) {
      const summary = await this.validationRepo.getSummary(contribution.id);
      const net = summary.confirmed - summary.contradicted;
      if (net > 0) {
        trust += 0.02;
      } else if (net < 0) {
        trust -= 0.03;
      }
    }

    // Clamp to [0.1, 1.0]
    return Math.max(0.1, Math.min(1.0, trust));
  }

  async updateAgentTrust(agentId: string): Promise<number> {
    const newTrust = await this.computeAgentTrust(agentId);
    await this.agentRepo.update(agentId, { trust_score: newTrust });
    return newTrust;
  }
}
