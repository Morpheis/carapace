/**
 * Domain service.
 * Provides aggregated domain statistics across contributions.
 */

import type { IContributionRepository } from '../repositories/IContributionRepository.js';

export interface DomainStat {
  domain: string;
  contributionCount: number;
  avgConfidence: number;
  latestContribution: string;
}

export class DomainService {
  constructor(
    private readonly contributionRepo: IContributionRepository
  ) {}

  async getDomains(): Promise<DomainStat[]> {
    return this.contributionRepo.getDomainStats();
  }
}
